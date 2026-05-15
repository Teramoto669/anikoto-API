import { NextResponse } from 'next/server';
import { scrapeSearch } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search?keyword=<query>
 *
 * Search anime by keyword.
 *
 * Query parameters:
 *   keyword  (required) – search term
 *   refresh=1           – bypass cache
 *
 * Example:
 *   /api/search?keyword=one+piece
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword')?.trim();
    const refresh = searchParams.get('refresh') === '1';

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: 'keyword query parameter is required' },
        { status: 400 }
      );
    }

    const key = `search:${keyword.toLowerCase()}`;
    const data = refresh
      ? await scrapeSearch(keyword)
      : await getOrSet(key, () => scrapeSearch(keyword), CACHE_TTL.SEARCH);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/search]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
