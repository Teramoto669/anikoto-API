import NodeCache from 'node-cache';

// Singleton cache instance for the entire app
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export default cache;

/**
 * In-flight promise map for stampede protection.
 * When multiple concurrent requests hit a cold cache key simultaneously,
 * only one fetcher() call is made; all waiters share the same promise.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Get-or-set cache helper.
 * Calls `fetcher` only when `key` is missing/expired; stores the result with `ttl` seconds.
 * Concurrent requests for the same cold key share a single in-flight fetch (no thundering herd).
 */
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== undefined) return cached;

  // If there's already an in-flight fetch for this key, wait for it
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().then((fresh) => {
    cache.set(key, fresh, ttl);
    inFlight.delete(key);
    return fresh;
  }).catch((err) => {
    inFlight.delete(key);
    throw err;
  });

  inFlight.set(key, promise);
  return promise;
}

/** Read a value directly from cache without triggering a fetch. Returns undefined on miss. */
export function cacheGet<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

/** Write a value directly into cache. */
export function cacheSet<T>(key: string, value: T, ttl: number): void {
  cache.set(key, value, ttl);
}
