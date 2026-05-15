import { NextResponse } from 'next/server';
import { scrapeListingPage } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/genre/[genre]?page=<n>
 *
 * Returns anime for a specific genre slug.
 *
 * Path params:
 *   genre  – genre slug (e.g. action, romance, isekai, fantasy, etc.)
 *
 * Query params:
 *   page   – page number (default: 1)
 *
 * Examples:
 *   /api/genre/action
 *   /api/genre/romance?page=2
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ genre: string }> }
) {
  try {
    const { genre } = await params;
    if (!genre) {
      return NextResponse.json({ ok: false, message: 'genre is required' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const refresh = searchParams.get('refresh') === '1';

    const key = `genre:${genre}:${page}`;
    const path = `/genre/${genre}`;

    const data = refresh
      ? await scrapeListingPage(path, page)
      : await getOrSet(key, () => scrapeListingPage(path, page), CACHE_TTL.FILTER);

    return NextResponse.json({ ok: true, data: { ...data, genre } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/genre/[genre]]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
