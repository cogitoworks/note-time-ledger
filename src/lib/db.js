/**
 * note Time Ledger - IndexedDB Storage Layer
 *
 * service-worker と popup 双方から利用される。
 * グローバル NTL.db に公開。
 *
 * @typedef {{
 *   id?: number,
 *   articleId: string,
 *   title: string,
 *   url: string,
 *   views: number,
 *   likes: number,
 *   comments: number,
 *   capturedAt: string,
 *   date: string
 * }} Snapshot
 *
 * @typedef {{
 *   articleId: string,
 *   title: string,
 *   url: string,
 *   latest: Snapshot,
 *   previous: Snapshot | null
 * }} ArticleSummary
 */

const NTL = self.NTL || {};
self.NTL = NTL;

NTL.db = (() => {
  const DB_NAME = 'note-time-ledger';
  const DB_VERSION = 1;
  const STORE_NAME = 'snapshots';

  /** @type {IDBDatabase | null} */
  let _db = null;

  /** @returns {Promise<IDBDatabase>} */
  function open() {
    if (_db) return Promise.resolve(_db);
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
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(new Error('IndexedDB open failed'));
    });
  }

  /**
   * 1件 upsert（同日同記事 → 上書き）
   * @param {IDBDatabase} db
   * @param {Snapshot} snap
   * @returns {Promise<void>}
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
   * @param {Snapshot[]} snapshots
   * @returns {Promise<{ saved: number, errors: string[] }>}
   */
  async function saveSnapshots(snapshots) {
    const db = await open();
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
   * 全レコード取得
   * @returns {Promise<Snapshot[]>}
   */
  async function getAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('getAll failed'));
    });
  }

  /**
   * 全記事サマリー（最新値 + 前回差分）
   * @returns {Promise<ArticleSummary[]>}
   */
  async function getArticleSummaries() {
    const all = await getAll();
    /** @type {Map<string, Snapshot[]>} */
    const grouped = new Map();
    for (const s of all) {
      const arr = grouped.get(s.articleId) || [];
      arr.push(s);
      grouped.set(s.articleId, arr);
    }

    /** @type {ArticleSummary[]} */
    const summaries = [];
    for (const [articleId, snaps] of grouped) {
      snaps.sort((a, b) => b.date.localeCompare(a.date));
      summaries.push({
        articleId,
        title: snaps[0].title,
        url: snaps[0].url,
        latest: snaps[0],
        previous: snaps.length > 1 ? snaps[1] : null,
      });
    }
    summaries.sort((a, b) => b.latest.date.localeCompare(a.latest.date));
    return summaries;
  }

  /**
   * 特定記事の全履歴（日付昇順）
   * @param {string} articleId
   * @returns {Promise<Snapshot[]>}
   */
  async function getArticleHistory(articleId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME).index('articleId').getAll(articleId);
      req.onsuccess = () => {
        const results = req.result;
        results.sort((a, b) => a.date.localeCompare(b.date));
        resolve(results);
      };
      req.onerror = () => reject(new Error('getArticleHistory failed'));
    });
  }

  /** @returns {Promise<{ version: number, exportedAt: string, snapshots: Snapshot[] }>} */
  async function exportAll() {
    return {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      snapshots: await getAll(),
    };
  }

  /**
   * @param {{ version: number, snapshots: Snapshot[] }} data
   * @returns {Promise<{ saved: number, errors: string[] }>}
   */
  async function importData(data) {
    if (!data || !Array.isArray(data.snapshots)) {
      throw new Error('Invalid import data format');
    }
    return saveSnapshots(data.snapshots);
  }

  /** @returns {Promise<void>} */
  async function clearAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error('clearAll failed'));
    });
  }

  /** @returns {Promise<number>} */
  async function count() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('count failed'));
    });
  }

  return { open, saveSnapshots, getArticleSummaries, getArticleHistory, exportAll, importData, clearAll, count };
})();
