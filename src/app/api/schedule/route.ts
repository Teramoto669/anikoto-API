import { NextResponse } from 'next/server';
import { scrapeSchedule } from '@/lib/scrapers/schedule.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateTimezone } from '@/lib/validation';

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
    const tz = validateTimezone(searchParams.get('tz'), 0);
    const images = searchParams.get('images') === 'true';

    const key = `schedule:tz${tz}:img:${images}`;
    const data = refresh
      ? await scrapeSchedule(tz, undefined, images)
      : await getOrSet(key, () => scrapeSchedule(tz, undefined, images), CACHE_TTL.SCHEDULE);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/schedule]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
