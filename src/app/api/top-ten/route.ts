import { ok, wantsRefresh, withApi } from '@/lib/api';
import { getTopTen } from '@/lib/scrapers/discovery.scraper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/top-ten
 *
 * Top anime today / this week / this month: `{ today, week, month }`.
 * Served from the same cached home-page scrape as GET /api/home.
 *
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  return ok(await getTopTen(wantsRefresh(req)));
}

export const GET = withApi(handler);
