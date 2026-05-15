import { NextResponse } from 'next/server';
import { scrapeSchedule } from '@/lib/scrapers/schedule.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/schedule
 *
 * Returns the weekly anime airing schedule.
 *
 * Query parameters:
 *   refresh=1  – bypass cache
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === '1';

    const key = 'schedule';
    const data = refresh
      ? await scrapeSchedule()
      : await getOrSet(key, scrapeSchedule, CACHE_TTL.SCHEDULE);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/schedule]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
