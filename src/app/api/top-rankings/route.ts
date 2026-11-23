import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { getTopRankings } from '@/lib/scrapers/discovery.scraper';
import { validateRankingWindow } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/top-rankings?sort=<day|week|month>
 *
 * Ranked top anime for one time window (default: day), de-duplicated.
 *
 * @query sort       day | week | month
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = validateRankingWindow(searchParams.get('sort'));
  if (!sort) return fail('sort must be one of: day, week, month', 400);
  return ok({ sort, results: await getTopRankings(sort, wantsRefresh(req)) });
}

export const GET = withApi(handler);
