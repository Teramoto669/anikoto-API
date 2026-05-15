import { NextResponse } from 'next/server';
import { scrapeListingPage } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type Listing = 'latest-updated' | 'new-release' | 'most-viewed';

const LISTING_PATHS: Record<Listing, string> = {
  'latest-updated': '/latest-updated',
  'new-release': '/new-release',
  'most-viewed': '/most-viewed',
};

/**
 * GET /api/latest?type=<type>&page=<n>
 *
 * Returns paginated anime listing pages.
 *
 * Query parameters:
 *   type  – latest-updated | new-release | most-viewed  (default: latest-updated)
 *   page  – page number (default: 1)
 *
 * Example:
 *   /api/latest?type=most-viewed&page=2
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') ?? 'latest-updated') as Listing;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const refresh = searchParams.get('refresh') === '1';

    if (!LISTING_PATHS[type]) {
      return NextResponse.json(
        { ok: false, message: `type must be one of: ${Object.keys(LISTING_PATHS).join(', ')}` },
        { status: 400 }
      );
    }

    const key = `listing:${type}:${page}`;
    const path = LISTING_PATHS[type];

    const data = refresh
      ? await scrapeListingPage(path, page)
      : await getOrSet(key, () => scrapeListingPage(path, page), CACHE_TTL.HOME);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/latest]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
