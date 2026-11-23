import { fail, ok, wantsRefresh, withApi, ApiError } from '@/lib/api';
import { scrapeServerList } from '@/lib/scrapers/stream.scraper';
import { validateOpaqueId, validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/servers?ids=<dataIds>&slug=<slug>
 *
 * Video servers (sub/dub/softsub) for one episode.
 * `ids` is the episode's `dataIds` as returned by /api/anime/[slug]/episodes.
 * `slug` is optional and only improves the Referer sent upstream.
 * Each server's `linkId` feeds /api/stream and /api/stream/resolve.
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ids = validateOpaqueId(sp.get('ids'));
  if (!ids) return fail('Missing or invalid ids parameter', 400);

  const rawSlug = sp.get('slug');
  const slug = rawSlug ? validateSlug(rawSlug) : null;
  if (rawSlug && !slug) return fail('Invalid slug parameter', 400);

  const servers = await scrapeServerList(ids, slug ?? undefined, wantsRefresh(req));
  if (servers.length === 0) throw new ApiError(404, 'No servers found for the given episode IDs');
  return ok(servers);
}

export const GET = withApi(handler);
