/* IndexedDB vault — used for offline mode and as a cache fallback. */
import { CONFIG } from '../config.js';

let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('This browser has no IndexedDB.')); return; }
    const req = indexedDB.open(CONFIG.localDb, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('happened_on', 'happened_on');
      }
      if (!db.objectStoreNames.contains('threads')) db.createObjectStore('threads', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('گنجینهٔ محلی باز نشد.'));
    req.onblocked = () => reject(new Error('گنجینهٔ محلی در زبانهٔ دیگری باز است.'));
  });
  return opening;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let result;
    try { result = fn(os); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(result?.__req ? result.__req.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Local write aborted'));
  });
}

const wrap = (req) => ({ __req: req });

export const idb = {
  put: (store, value) => run(store, 'readwrite', (os) => wrap(os.put(value))),
  putMany: (store, values) => run(store, 'readwrite', (os) => { values.forEach((v) => os.put(v)); return values.length; }),
  get: (store, key) => run(store, 'readonly', (os) => wrap(os.get(key))),
  all: (store) => run(store, 'readonly', (os) => wrap(os.getAll())),
  del: (store, key) => run(store, 'readwrite', (os) => wrap(os.delete(key))),
  clear: (store) => run(store, 'readwrite', (os) => wrap(os.clear())),
  async kvGet(key, fallback = null) {
    const row = await this.get('kv', key);
    return row ? row.value : fallback;
  },
  kvSet(key, value) { return this.put('kv', { key, value }); },
  async estimate() {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota };
    } catch { return { usage: 0, quota: 0 }; }
  },
};
