import { ok, wantsRefresh, withApi } from '@/lib/api';
import { getCompleted } from '@/lib/scrapers/discovery.scraper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/completed
 *
 * Recently completed anime from the home page.
 * Served from the same cached home-page scrape as GET /api/home.
 *
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  return ok(await getCompleted(wantsRefresh(req)));
}

export const GET = withApi(handler);
