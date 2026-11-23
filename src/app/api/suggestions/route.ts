import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { getSuggestions } from '@/lib/scrapers/discovery.scraper';
import { validateKeyword } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/suggestions?keyword=<text>
 *
 * Richer suggestions (max 10) as full anime cards, including sub/dub episode counts.
 *
 * @query keyword    Search text (required)
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = validateKeyword(searchParams.get('keyword'));
  if (!keyword) return fail('Missing or invalid keyword parameter', 400);
  return ok(await getSuggestions(keyword, wantsRefresh(req)));
}

export const GET = withApi(handler);
