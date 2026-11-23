import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { scrapeSeasons } from '@/lib/scrapers/anime.scraper';
import { validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]/seasons
 *
 * Seasons (the site's season switcher) for an anime.
 * `[slug]` may be the anime slug or its numeric id.
 *
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = validateSlug((await params)?.slug);
  if (!slug) return fail('Invalid or missing slug parameter', 400);
  return ok(await scrapeSeasons(slug, wantsRefresh(req)));
}

export const GET = withApi(handler);
