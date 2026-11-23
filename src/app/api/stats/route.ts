import cache from '@/lib/cache';
import { ok, withApi } from '@/lib/api';
import { getCompressionConfig } from '@/lib/compression';
import { getMetrics } from '@/lib/metrics';
import { getMirrors } from '@/lib/mirrors';
import spec from '@/lib/openapi-spec';
import { proxyPool } from '@/lib/proxy-pool';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 *
 * Request counters, cache usage and feature configuration for this server
 * instance. On serverless platforms counters are per warm instance, not global.
 */
async function handler() {
  const m = getMetrics();
  const uptimeSeconds = Math.floor((Date.now() - m.startTime) / 1000);
  const errors = m.serverErrors;
  const c = getCompressionConfig();
  const cs = cache.getStats();

  return ok(
    {
      uptimeSeconds,
      requests: {
        total: m.total,
        serverErrors: m.serverErrors,
        clientErrors: m.clientErrors,
        successRate: m.total > 0 ? `${((1 - errors / m.total) * 100).toFixed(1)}%` : '100%',
      },
      cache: {
        type: 'in-memory (node-cache)',
        keys: cache.keys().length,
        hits: cs.hits,
        misses: cs.misses,
      },
      endpoints: Object.keys(spec.paths).length,
      features: {
        brotli: c.brotli,
        mirrors: getMirrors().length,
        outboundProxies: proxyPool.count,
      },
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export const GET = withApi(handler);
