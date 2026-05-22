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
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

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
        default:
          sendResponse({ error: 'Unknown message type: ' + message.type });
      }
    } catch (err) {
      console.error('[note Time Ledger SW] Error:', err);
      sendResponse({ error: err.message });
    }
  })();
  return true; // 非同期レスポンスのため
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[note Time Ledger] Service worker ready.');
});
