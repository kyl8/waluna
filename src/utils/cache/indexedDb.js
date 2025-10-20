const DB_NAME = 'WalunaDB';
const DB_VERSION = 1;

export const STORES = {
  ANIME: 'anime',
  EPISODES: 'episodes',
  SEARCH_RESULTS: 'searchResults',
  IMAGES: 'images',
};

class IndexedDBCache {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // create stores if missing
        if (!db.objectStoreNames.contains(STORES.ANIME)) {
          db.createObjectStore(STORES.ANIME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.EPISODES)) {
          db.createObjectStore(STORES.EPISODES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SEARCH_RESULTS)) {
          db.createObjectStore(STORES.SEARCH_RESULTS, { keyPath: 'query' });
        }
        if (!db.objectStoreNames.contains(STORES.IMAGES)) {
          db.createObjectStore(STORES.IMAGES, { keyPath: 'url' });
        }
      };
    });
  }

  async set(storeName, key, data, ttl = null) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const item = { ...data, expires: ttl ? Date.now() + ttl : null };
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => {
        const item = request.result;
        if (item && item.expires && item.expires < Date.now()) {
          this.delete(storeName, key);
          resolve(null);
        } else {
          resolve(item || null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const indexedDBCache = new IndexedDBCache();

if (typeof window !== 'undefined' && window.indexedDB) {
  indexedDBCache.init().catch(err => console.warn('IndexedDB init failed:', err));
}

export default indexedDBCache;
