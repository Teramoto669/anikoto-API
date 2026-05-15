import { NextResponse } from 'next/server';
import { scrapeFilter } from '@/lib/scrapers/search.scraper';
import { FilterParams } from '@/lib/types';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL, FILTER_OPTIONS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/filter
 *
 * Advanced filter for anime with multiple parameters.
 *
 * Query parameters (all optional):
 *   keyword   – search keyword
 *   genre[]   – genre slugs (e.g. action, romance, isekai)
 *   season[]  – season (spring | summer | fall | winter)
 *   year[]    – year (e.g. 2024, 2025)
 *   type[]    – type (tv | movie | ova | ona | special | music)
 *   status[]  – status (currently-airing | finished-airing | not-yet-aired)
 *   sort      – sort order (default | recently-added | recently-updated | score | name-a-z | released-date | most-watched)
 *   page      – page number (default: 1)
 *
 * Example:
 *   /api/filter?genre[]=action&genre[]=romance&year[]=2026&sort=score
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const params: FilterParams = {
      keyword: searchParams.get('keyword') ?? undefined,
      genre: searchParams.getAll('genre[]'),
      season: searchParams.getAll('season[]'),
      year: searchParams.getAll('year[]'),
      type: [...searchParams.getAll('type[]'), ...searchParams.getAll('term_type[]')],
      status: searchParams.getAll('status[]'),
      language: searchParams.getAll('language[]'),
      rating: searchParams.getAll('rating[]'),
      sort: searchParams.get('sort') ?? undefined,
      page: searchParams.get('page') ?? '1',
    };

    // Remove empty arrays
    (Object.keys(params) as (keyof FilterParams)[]).forEach((k) => {
      const val = params[k];
      if (Array.isArray(val) && val.length === 0) {
        delete params[k];
      }
    });

    const cacheKey = `filter:${JSON.stringify(params)}`;
    const refresh = searchParams.get('refresh') === '1';

    const data = refresh
      ? await scrapeFilter(params)
      : await getOrSet(cacheKey, () => scrapeFilter(params), CACHE_TTL.FILTER);

    data.options = FILTER_OPTIONS;

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/filter]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
