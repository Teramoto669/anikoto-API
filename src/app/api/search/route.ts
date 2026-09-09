import { NextResponse } from 'next/server';
import { scrapeSearch } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateKeyword, validatePage } from '@/lib/validation';

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
    const keyword = validateKeyword(searchParams.get('keyword'));
    const refresh = searchParams.get('refresh') === '1';
    const page = validatePage(searchParams.get('page'));

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: 'Invalid or missing keyword query parameter' },
        { status: 400 }
      );
    }

    const key = `search:${keyword.toLowerCase()}:page:${page}`;
    const data = await getOrSet(
      key,
      () => scrapeSearch(keyword, page, refresh),
      CACHE_TTL.SEARCH,
      refresh
    );

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/search]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
