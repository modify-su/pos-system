/**
 * In-Memory Micro Cache with TTL and Realtime Invalidation
 * Dramatically accelerates cloud database response times for repeated and complex queries.
 */
class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlMs = 30000) {
    this.store.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });
    return value;
  }

  del(key) {
    this.store.delete(key);
  }

  clearPrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clearAll() {
    this.store.clear();
  }
}

const memoryCache = new MemoryCache();

module.exports = memoryCache;

