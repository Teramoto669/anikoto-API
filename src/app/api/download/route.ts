import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { scrapeDownloadLinks } from '@/lib/scrapers/stream.scraper';
import { validateEpisodeNumber, validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/download?slug=<slug>&ep=<n>
 *
 * Download links for one episode, grouped by server and audio type.
 * Links are returned exactly as the site publishes them (third-party file
 * hosts); this API does not follow or resolve them.
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const slug = validateSlug(sp.get('slug'));
  const ep = validateEpisodeNumber(sp.get('ep'));
  if (!slug || !ep) return fail('Both slug and ep parameters are required (ep must be a number)', 400);
  return ok(await scrapeDownloadLinks(slug, ep, wantsRefresh(req)));
}

export const GET = withApi(handler);
