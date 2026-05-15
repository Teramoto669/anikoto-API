import { NextResponse } from 'next/server';
import { scrapeListingPage } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['tv', 'movie', 'ova', 'ona', 'special', 'music'];

/**
 * GET /api/type/[type]?page=<n>
 *
 * Returns anime by media type.
 *
 * Path params:
 *   type  – tv | movie | ova | ona | special | music
 *
 * Query params:
 *   page  – page number (default: 1)
 *
 * Examples:
 *   /api/type/movie
 *   /api/type/tv?page=3
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    if (!type || !VALID_TYPES.includes(type.toLowerCase())) {
      return NextResponse.json(
        { ok: false, message: `type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const refresh = searchParams.get('refresh') === '1';

    const key = `type:${type}:${page}`;
    const path = `/type/${type.toLowerCase()}`;

    const data = refresh
      ? await scrapeListingPage(path, page)
      : await getOrSet(key, () => scrapeListingPage(path, page), CACHE_TTL.FILTER);

    return NextResponse.json({ ok: true, data: { ...data, mediaType: type } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/type/[type]]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
