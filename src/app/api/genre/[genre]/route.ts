import { withApi } from '@/lib/api';
import { NextResponse } from 'next/server';
import { scrapeListingPage } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateGenre, validatePage } from '@/lib/validation';

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
async function handler(
  req: Request,
  { params }: { params: Promise<{ genre: string }> }
) {
  const rawParams = await params;
  const genre = validateGenre(rawParams?.genre);
  if (!genre) {
    return NextResponse.json({ ok: false, message: 'Invalid or missing genre parameter' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const page = validatePage(searchParams.get('page'));
  const refresh = searchParams.get('refresh') === '1';

  const key = `genre:${genre}:${page}`;
  const path = `/genre/${genre}`;

  const data = await getOrSet(
    key,
    () => scrapeListingPage(path, page, refresh),
    CACHE_TTL.FILTER,
    refresh
  );

  return NextResponse.json({ ok: true, data: { ...data, genre } });
}

export const GET = withApi(handler);
