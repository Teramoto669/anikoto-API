import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { scrapeMapperServers } from '@/lib/scrapers/stream.scraper';
import { validateNumericString, validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mapper-servers?malId=<id>&slug=<slug>&timestamp=<ts>
 *
 * Mapper-provided sources per provider (sub/dub) with embed and download URLs.
 * `malId` and `timestamp` come from an episode (see `malId` / `timestamp` in
 * /api/anime/[slug]/episodes/ajax, or `dataMal` / `dataTimestamp` in /episodes).
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const malId = validateNumericString(sp.get('malId'), 10);
  const slug = validateSlug(sp.get('slug'));
  const timestamp = validateNumericString(sp.get('timestamp'), 20);
  if (!malId || !slug || !timestamp) {
    return fail('malId, slug and timestamp are required (malId/timestamp numeric, slug alphanumeric)', 400);
  }
  return ok(await scrapeMapperServers(malId, slug, timestamp, wantsRefresh(req)));
}

export const GET = withApi(handler);
