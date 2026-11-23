import { ok, withApi } from '@/lib/api';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { getTrending } from '@/lib/scrapers/discovery.scraper';
import { validatePage } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trending?page=<n>
 *
 * Trending anime from the home page's AJAX "trending" widget (paginated).
 * Equivalent to GET /api/widget?name=trending, exposed at a stable path.
 *
 * @query page       Page number (default 1)
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = validatePage(searchParams.get('page'));
  const refresh = searchParams.get('refresh') === '1';

  const data = refresh
    ? await getTrending(page)
    : await getOrSet(`widget:trending:${page}`, () => getTrending(page), CACHE_TTL.HOME);
  return ok(data);
}

export const GET = withApi(handler);
