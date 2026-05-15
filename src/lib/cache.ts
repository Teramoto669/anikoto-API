import NodeCache from 'node-cache';

// Singleton cache instance for the entire app
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export default cache;

/**
 * Get-or-set cache helper.
 * Calls `fetcher` only when `key` is missing/expired; stores the result with `ttl` seconds.
 */
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== undefined) return cached;

  const fresh = await fetcher();
  cache.set(key, fresh, ttl);
  return fresh;
}
