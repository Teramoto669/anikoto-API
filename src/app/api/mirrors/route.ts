import { ok, withApi } from '@/lib/api';
import { getOrSet } from '@/lib/cache';
import { getMirrorStatus } from '@/lib/mirrors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mirrors
 *
 * Health of every configured upstream mirror (BASE_URL first, then
 * MIRROR_DOMAINS): online/offline, latency and which one is currently in use.
 * Results are cached for 30 s so this endpoint can't be used to hammer the
 * upstream sites.
 */
async function handler() {
  return ok(await getOrSet('mirrors:status', getMirrorStatus, 30));
}

export const GET = withApi(handler);
