import { ok, wantsRefresh, withApi } from '@/lib/api';
import { getTrendingSidebar } from '@/lib/scrapers/discovery.scraper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trending-sidebar
 *
 * Sidebar bundle: top `day`/`week`/`month` plus `latestEpisodes`.
 * Served from the same cached home-page scrape as GET /api/home.
 *
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  return ok(await getTrendingSidebar(wantsRefresh(req)));
}

export const GET = withApi(handler);
