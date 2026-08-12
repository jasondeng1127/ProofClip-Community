// Archive record persistence (v0.7): evidence cards and screenshots live in
// IndexedDB so local capacity is not capped by chrome.storage.local (10 MB).
// The record itself is unchanged; the store wraps it with an internal `seq`
// field only to preserve insertion order. Node offline tests inject the memory
// driver; the browser runtime uses IndexedDB.

const DB_NAME = 'proofclip-archive';
const DB_VERSION = 2;
const STORE_NAME = 'evidence';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Archive store request failed.'));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('seq')) store.createIndex('seq', 'seq', { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
  });
}

async function withDatabase(action) {
  const db = await openDatabase();
  try {
    return await action(db);
  } finally {
    db.close();
  }
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => Number(left.seq) - Number(right.seq));
}

export function createIndexedDbArchiveStore() {
  return {
    async list() {
      return withDatabase(async (db) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const entries = await requestResult(tx.objectStore(STORE_NAME).getAll());
        return sortEntries(entries).map((entry) => entry.record);
      });
    },
    async put(record) {
      return withDatabase(async (db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const count = await requestResult(store.count());
        await requestResult(store.put({ id: record.id, record, seq: count }));
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error('Archive store write failed.'));
        });
      });
    },
    async replaceAll(records) {
      for (const record of records) {
        if (!record || !record.id) throw new Error('Archive record is missing an id.');
      }
      return withDatabase(async (db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await requestResult(store.clear());
        for (let index = 0; index < records.length; index += 1) {
          await requestResult(store.put({ id: records[index].id, record: records[index], seq: index }));
        }
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error || new Error('Archive store write failed.'));
          tx.onerror = () => reject(tx.error || new Error('Archive store write failed.'));
        });
      });
    },
    async remove(id) {
      return withDatabase(async (db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        await requestResult(tx.objectStore(STORE_NAME).delete(id));
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error('Archive store delete failed.'));
        });
      });
    },
    async clear() {
      return withDatabase(async (db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        await requestResult(tx.objectStore(STORE_NAME).clear());
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error('Archive store clear failed.'));
        });
      });
    },
    async count() {
      return withDatabase(async (db) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        return requestResult(tx.objectStore(STORE_NAME).count());
      });
    },
    async latest() {
      return withDatabase(async (db) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const cursor = await requestResult(tx.objectStore(STORE_NAME).index('seq').openCursor(null, 'prev'));
        return cursor?.value?.record || null;
      });
    }
  };
}

export function createMemoryArchiveStore() {
  const entries = new Map();
  return {
    async list() {
      return sortEntries([...entries.values()]).map((entry) => entry.record);
    },
    async put(record) {
      entries.set(record.id, { id: record.id, record, seq: entries.size });
    },
    async replaceAll(records) {
      const next = new Map();
      for (let index = 0; index < records.length; index += 1) {
        if (!records[index] || !records[index].id) throw new Error('Archive record is missing an id.');
        next.set(records[index].id, { id: records[index].id, record: records[index], seq: index });
      }
      entries.clear();
      for (const [key, value] of next) entries.set(key, value);
    },
    async remove(id) {
      entries.delete(id);
    },
    async clear() {
      entries.clear();
    },
    async count() {
      return entries.size;
    },
    async latest() {
      return sortEntries([...entries.values()]).at(-1)?.record || null;
    }
  };
}

export function createDefaultArchiveStore() {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB
    ? createIndexedDbArchiveStore()
    : createMemoryArchiveStore();
}
