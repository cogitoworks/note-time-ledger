/**
 * note Time Ledger - Service Worker
 *
 * content script からの保存リクエストを受け、
 * 拡張コンテキストの IndexedDB に書き込む。
 *
 * importScripts の問題を避けるため、必要最小限のDB操作をインラインで持つ。
 * 読み取り系は popup が db.js を直接読み込んで処理する。
 */

const DB_NAME = 'note-time-ledger';
const DB_VERSION = 2;
const STORE_NAME = 'snapshots';
const DOMAIN_STORE = 'domains';

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('articleId', 'articleId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('articleId_date', ['articleId', 'date'], { unique: false });
      }
      if (!db.objectStoreNames.contains(DOMAIN_STORE)) {
        db.createObjectStore(DOMAIN_STORE, { keyPath: 'domain' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(new Error('IndexedDB open failed'));
  });
}

/**
 * 1件 upsert
 */
function upsertOne(db, snap) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('articleId_date');
    const req = idx.openCursor(IDBKeyRange.only([snap.articleId, snap.date]));

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.update({ ...cursor.value, ...snap, id: cursor.value.id });
      } else {
        const { id, ...rest } = snap;
        store.add(rest);
      }
      resolve();
    };
    req.onerror = () => reject(new Error('upsert failed'));
    tx.onerror = () => reject(new Error('tx failed'));
  });
}

/**
 * スナップショット配列を保存
 */
async function saveSnapshots(snapshots) {
  const db = await openDB();
  const result = { saved: 0, errors: [] };
  for (const snap of snapshots) {
    try {
      await upsertOne(db, snap);
      result.saved++;
    } catch (e) {
      result.errors.push(`${snap.articleId}: ${e.message}`);
    }
  }
  return result;
}

/**
 * レコード数
 */
async function getCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('count failed'));
  });
}

// ============================================================
// Domain management
// ============================================================

function domainToScriptId(domain) {
  return 'ntl-custom-' + domain.replace(/[^a-zA-Z0-9]/g, '_');
}

async function saveDomain(domain) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOMAIN_STORE, 'readwrite');
    tx.objectStore(DOMAIN_STORE).put({ domain });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Failed to save domain'));
  });
}

async function deleteDomain(domain) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOMAIN_STORE, 'readwrite');
    tx.objectStore(DOMAIN_STORE).delete(domain);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Failed to delete domain'));
  });
}

async function getAllDomains() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(DOMAIN_STORE, 'readonly')
      .objectStore(DOMAIN_STORE).getAll();
    req.onsuccess = () => resolve(req.result.map(r => r.domain));
    req.onerror = () => reject(new Error('Failed to get domains'));
  });
}

async function registerDomainScript(domain) {
  const id = domainToScriptId(domain);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch (_) { /* may not exist yet */ }
  await chrome.scripting.registerContentScripts([{
    id,
    matches: ['https://' + domain + '/sitesettings/stats*'],
    js: ['src/adapter/note-dom-parser.js', 'src/content/content.js'],
    css: ['src/content/content.css'],
    runAt: 'document_idle',
  }]);
}

async function unregisterDomainScript(domain) {
  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [domainToScriptId(domain)],
    });
  } catch (_) { /* already unregistered */ }
}

// ============================================================
// Message handler
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'saveSnapshots': {
          const result = await saveSnapshots(message.snapshots);
          const count = await getCount();
          sendResponse({ saved: result.saved, errors: result.errors, count });
          break;
        }
        case 'ping': {
          sendResponse({ status: 'ok' });
          break;
        }
        case 'addDomain': {
          await saveDomain(message.domain);
          await registerDomainScript(message.domain);
          sendResponse({ success: true });
          break;
        }
        case 'removeDomain': {
          await unregisterDomainScript(message.domain);
          await deleteDomain(message.domain);
          sendResponse({ success: true });
          break;
        }
        case 'getDomains': {
          const domains = await getAllDomains();
          sendResponse({ domains });
          break;
        }
        default:
          sendResponse({ error: 'Unknown message type: ' + message.type });
      }
    } catch (err) {
      console.error('[note Time Ledger SW] Error:', err);
      sendResponse({ error: err.message });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[note Time Ledger] Service worker ready.');
});
