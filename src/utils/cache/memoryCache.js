// simple cache system with TTL and LRU eviction
// supports basic operations like set, get, has, delete, and clear
// uses a Map to store items with their expiration time and access order 
import React from 'react';

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Max items per cache

class CacheStore {
  constructor(ttl = DEFAULT_TTL, maxSize = MAX_CACHE_SIZE) {
    this.store = new Map();
    this.ttl = ttl;
    this.maxSize = maxSize;
    this.accessOrder = [];
  }

  set(key, value) {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldestKey = this.accessOrder.shift();
      this.store.delete(oldestKey);
    }

    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) this.accessOrder.splice(idx, 1);

    this.store.set(key, {
      value,
      expires: Date.now() + this.ttl,
    });

    this.accessOrder.push(key);
  }

  get(key) {
    const item = this.store.get(key);
    
    if (!item) return null;

    if (item.expires < Date.now()) {
      this.store.delete(key);
      const idx = this.accessOrder.indexOf(key);
      if (idx > -1) this.accessOrder.splice(idx, 1);
      return null;
    }
    // move to end of access order
    // to mark it as recently used
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.store.clear();
    this.accessOrder = [];
  }

  delete(key) {
    this.store.delete(key);
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) this.accessOrder.splice(idx, 1);
  }

  size() {
    return this.store.size;
  }
}

// global cache instances for different data types
export const imageCache = new CacheStore(10 * 60 * 1000, 200); // 10 min, 200 items
export const dataCache = new CacheStore(5 * 60 * 1000, 100); // 5 min, 100 items
export const searchCache = new CacheStore(10 * 60 * 1000, 50); // 10 min, 50 items

// custom hook to use cached data with a fetch function
export function useCachedData(key, fetchFn) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;

    const fetch = async () => {
      // Check cache first
      const cached = dataCache.get(key);
      if (cached !== null) {
        setData(cached);
        return;
      }

      setLoading(true);
      try {
        const result = await fetchFn();
        if (mounted) {
          dataCache.set(key, result);
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err);
          setData(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetch();
    return () => { mounted = false; };
  }, [key, fetchFn]);

  return { data, loading, error };
}

export default {
  imageCache,
  dataCache,
  searchCache,
  CacheStore,
  useCachedData,
};
