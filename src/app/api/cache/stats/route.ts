import cache from '@/lib/cache';
import { ok, withApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cache/stats
 *
 * In-memory cache statistics: entry count, hit/miss counters and hit rate.
 */
async function handler() {
  const s = cache.getStats();
  const lookups = s.hits + s.misses;
  return ok(
    {
      keys: cache.keys().length,
      hits: s.hits,
      misses: s.misses,
      hitRate: lookups > 0 ? `${((s.hits / lookups) * 100).toFixed(1)}%` : null,
      approxKeyBytes: s.ksize,
      approxValueBytes: s.vsize,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export const GET = withApi(handler);
