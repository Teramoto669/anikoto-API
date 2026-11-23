import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { scrapeLatestEpisode } from '@/lib/scrapers/anime.scraper';
import { validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]/episodes/latest
 *
 * The newest released episode (highest episode number) plus the episode count.
 * Handy for "is there a new episode?" polling.
 *
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = validateSlug((await params)?.slug);
  if (!slug) return fail('Invalid or missing slug parameter', 400);
  return ok(await scrapeLatestEpisode(slug, wantsRefresh(req)));
}

export const GET = withApi(handler);
