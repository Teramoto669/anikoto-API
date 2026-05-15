import { NextResponse } from 'next/server';
import { scrapeListingPage } from '@/lib/scrapers/search.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type StatusType = 'currently-airing' | 'finished-airing' | 'not-yet-aired';

const STATUS_PATHS: Record<StatusType, string> = {
  'currently-airing': '/status/currently-airing',
  'finished-airing': '/status/finished-airing',
  'not-yet-aired': '/status/not-yet-aired',
};

/**
 * GET /api/status?type=<type>&page=<n>
 *
 * Returns anime by airing status.
 *
 * Query parameters:
 *   type  – currently-airing | finished-airing | not-yet-aired  (default: currently-airing)
 *   page  – page number (default: 1)
 *
 * Example:
 *   /api/status?type=currently-airing&page=1
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') ?? 'currently-airing') as StatusType;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const refresh = searchParams.get('refresh') === '1';

    if (!STATUS_PATHS[type]) {
      return NextResponse.json(
        { ok: false, message: `type must be one of: ${Object.keys(STATUS_PATHS).join(', ')}` },
        { status: 400 }
      );
    }

    const key = `status:${type}:${page}`;
    const path = STATUS_PATHS[type];

    const data = refresh
      ? await scrapeListingPage(path, page)
      : await getOrSet(key, () => scrapeListingPage(path, page), CACHE_TTL.FILTER);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/status]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
