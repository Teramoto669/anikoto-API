import { ok, wantsRefresh, withApi } from '@/lib/api';
import { getListing } from '@/lib/scrapers/discovery.scraper';
import { validatePage } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/upcoming?page=<n>
 *
 * Not-yet-aired anime (site listing `/status/not-yet-aired`).
 * Returns `results` and, when the page has one, a `topRated` sidebar.
 *
 * @query page     Page number (default 1)
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = validatePage(searchParams.get('page'));
  return ok(await getListing('upcoming', page, wantsRefresh(req)));
}

export const GET = withApi(handler);
