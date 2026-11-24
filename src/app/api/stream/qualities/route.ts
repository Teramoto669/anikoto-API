import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { isAllowedStreamDomain } from '@/lib/proxy-pool';
import { parseM3u8Qualities } from '@/lib/scrapers/stream.scraper';
import { validateHttpUrl } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stream/qualities?url=<m3u8>&referer=<url>
 *
 * Lists the quality variants (resolution, bandwidth, direct + proxied URL) of
 * an HLS master playlist, best first.
 *
 * The playlist is fetched server-side, so `url` is restricted to the same
 * authorised streaming domains as /api/proxy and may never point at a private
 * or local network address.
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const url = validateHttpUrl(sp.get('url'));
  if (!url) return fail('Missing or invalid url parameter', 400);

  const rawReferer = sp.get('referer');
  const referer = rawReferer ? validateHttpUrl(rawReferer) : null;
  if (rawReferer && !referer) return fail('Invalid referer parameter', 400);

  if (!isAllowedStreamDomain(url, referer ?? undefined)) {
    return fail('Forbidden: only authorised media domains can be inspected', 403);
  }

  const refresh = wantsRefresh(req);
  const qualities = await getOrSet(
    `qualities:${url}:${referer ?? ''}`,
    () => parseM3u8Qualities(url, referer ?? undefined, { enforceAllowlist: true }),
    CACHE_TTL.STREAM,
    refresh
  );
  return ok({ url, totalQualities: qualities.length, qualities });
}

export const GET = withApi(handler);
