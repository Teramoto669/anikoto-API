import { ok, wantsRefresh, withApi } from '@/lib/api';
import { getListing } from '@/lib/scrapers/discovery.scraper';
import { validatePage } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/newly-added?page=<n>
 *
 * Newly added anime (site listing `/latest-updated?sort=added`).
 * Returns `results` and, when the page has one, a `topRated` sidebar.
 *
 * @query page     Page number (default 1)
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = validatePage(searchParams.get('page'));
  return ok(await getListing('newly-added', page, wantsRefresh(req)));
}

export const GET = withApi(handler);
