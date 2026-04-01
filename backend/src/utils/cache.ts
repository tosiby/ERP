// =============================================================
// KJSIS — In-Memory Cache Layer
// Simple TTL cache using Map. For production scale, swap
// the storage backend with Redis (same interface).
// =============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;  // Unix ms
}

const store = new Map<string, CacheEntry<unknown>>();

export const getCache = <T>(key: string): T | null => {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
};

export const setCache = <T>(key: string, value: T, ttlSeconds: number): void => {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

export const deleteCache = (key: string): void => {
  store.delete(key);
};

export const deleteCacheByPrefix = (prefix: string): void => {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};

export const clearCache = (): void => {
  store.clear();
};

// Periodic cleanup — runs every 10 minutes to evict expired keys
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 10 * 60 * 1000);
