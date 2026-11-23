import pkg from '../../../../package.json';
import { ok, withApi } from '@/lib/api';
import { getMetrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Liveness probe: status, version, uptime and memory of this server instance.
 * Cheap and dependency-free — it never touches the upstream site.
 */
async function handler() {
  const { startTime } = getMetrics();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const mem = process.memoryUsage();

  return ok(
    {
      status: 'healthy',
      version: pkg.version,
      uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      node: process.version,
      memory: {
        used: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export const GET = withApi(handler);
