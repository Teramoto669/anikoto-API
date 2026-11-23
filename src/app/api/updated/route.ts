import { withApi } from '@/lib/api';
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
async function handler(req: Request) {
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
}

export const GET = withApi(handler);
