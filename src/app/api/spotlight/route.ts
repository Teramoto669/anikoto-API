import { ok, wantsRefresh, withApi } from '@/lib/api';
import { getSpotlight } from '@/lib/scrapers/discovery.scraper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/spotlight
 *
 * Spotlight carousel (featured anime) from the home page.
 * Served from the same cached home-page scrape as GET /api/home.
 *
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  return ok(await getSpotlight(wantsRefresh(req)));
}

export const GET = withApi(handler);
