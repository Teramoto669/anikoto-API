import { fail, ok, withApi } from '@/lib/api';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { getRecentlyUpdated } from '@/lib/scrapers/discovery.scraper';
import { validatePage, validateUpdatedTab } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recently-updated?tab=<all|sub|dub>&page=<n>
 *
 * Recently updated episodes, split by audio track. Backed by the home page's
 * AJAX "updated-*" widgets, so it is paginated.
 *
 * @query tab        all | sub | dub  (default all)
 * @query page       Page number (default 1)
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const tab = validateUpdatedTab(searchParams.get('tab'));
  if (!tab) return fail('tab must be one of: all, sub, dub', 400);
  const page = validatePage(searchParams.get('page'));
  const refresh = searchParams.get('refresh') === '1';

  const data = refresh
    ? await getRecentlyUpdated(tab, page)
    : await getOrSet(`widget:updated-${tab}:${page}`, () => getRecentlyUpdated(tab, page), CACHE_TTL.HOME);
  return ok({ tab, ...data });
}

export const GET = withApi(handler);
