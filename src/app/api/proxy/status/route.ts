import { ok, withApi } from '@/lib/api';
import { proxyPool } from '@/lib/proxy-pool';

export const dynamic = 'force-dynamic';

/**
 * GET /api/proxy/status
 *
 * Outbound proxy pool health (PROXIES / PROXY_LIST) and Cloudflare Worker
 * configuration. Proxy credentials are masked.
 */
async function handler() {
  const pool = proxyPool.status();
  return ok(
    {
      ...pool,
      cloudflareWorker: {
        configured: Boolean(process.env.CF_WORKER_URL || process.env.NEXT_PUBLIC_CF_WORKER_URL),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export const GET = withApi(handler);
