import { fail, ok, wantsRefresh, withApi, ApiError } from '@/lib/api';
import { scrapeStreamInfo } from '@/lib/scrapers/stream.scraper';
import { validateOpaqueId, validateSlug, validateToken } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stream?id=<linkId>&slug=<slug>&sv=<svId>
 *
 * Embed/player URL and skip ranges (intro/outro) for one server link.
 * `id` is a server `linkId` from /api/servers. For a ready-to-play HLS URL use
 * /api/stream/resolve instead.
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = validateOpaqueId(sp.get('id'));
  if (!id) return fail('Missing or invalid id (link id) parameter', 400);

  const rawSlug = sp.get('slug');
  const slug = rawSlug ? validateSlug(rawSlug) : null;
  if (rawSlug && !slug) return fail('Invalid slug parameter', 400);

  const rawSv = sp.get('sv');
  const sv = rawSv ? validateToken(rawSv) : null;
  if (rawSv && !sv) return fail('Invalid sv parameter', 400);

  const info = await scrapeStreamInfo(id, { slug: slug ?? undefined, svId: sv ?? undefined }, wantsRefresh(req));
  if (!info.url) throw new ApiError(404, 'Stream URL not found for this link ID');
  return ok(info);
}

export const GET = withApi(handler);
