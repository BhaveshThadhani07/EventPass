/**
 * EventPass - IndexedDB Promise Wrapper (db.js)
 * Compliant with PRD Section 9 & 18 (Async Promise Wrapper for client-side storage)
 */

const DB_NAME = 'EventpassDB';
const DB_VERSION = 2;

class EventPassDB {
  constructor() {
    this.db = null;
    this.ready = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tickets')) {
          const store = db.createObjectStore('tickets', { keyPath: 'ticketId' });
          store.createIndex('email', 'email', { unique: true });
          store.createIndex('gateCheckedIn', 'gateCheckedIn', { unique: false });
          store.createIndex('mealClaimed', 'mealClaimed', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        reject(new Error(`IndexedDB open failed: ${e.target.error}`));
      };
    });
  }

  async get(storeName, key) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, value) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(storeName) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async findByIndex(storeName, indexName, queryValue) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.get(queryValue);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(storeName) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}

// Export for ES modules, CommonJS, or browser window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EventPassDB };
} else {
  window.EventPassDB = EventPassDB;
}
