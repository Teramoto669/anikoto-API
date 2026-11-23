import { ok, withApi } from '@/lib/api';
import { scrapeRandomAnime } from '@/lib/scrapers/discovery.scraper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/random
 *
 * A random anime: follows the site's `/random` redirect and returns the same
 * detail object as GET /api/anime/[slug] (minus episodes) plus the resolved
 * `url`. Never cached — every call is a new pick.
 */
async function handler() {
  const data = await scrapeRandomAnime();
  return ok(data, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApi(handler);
