import { NextResponse } from 'next/server';
import { scrapeListingPage } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validatePage } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/updated?page=<n>
 *
 * Returns paginated latest updated anime listing directly from https://anikoto.net/latest-updated.
 *
 * Query parameters:
 *   page    – page number (default: 1)
 *   refresh – set to 1 to force fresh scrape
 *
 * Example:
 *   /api/updated?page=2
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = validatePage(searchParams.get('page'));
    const refresh = searchParams.get('refresh') === '1';

    const path = '/latest-updated';
    const key = `updated:${page}`;

    const data = await getOrSet(
      key,
      () => scrapeListingPage(path, page, refresh),
      CACHE_TTL.HOME,
      refresh
    );

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/updated]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

