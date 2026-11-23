import { withApi } from '@/lib/api';
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
async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';
  const tz = validateTimezone(searchParams.get('tz'), 0);
  const images = searchParams.get('images') === 'true';

  const key = `schedule:tz${tz}:img:${images}`;
  const data = refresh
    ? await scrapeSchedule(tz, undefined, images)
    : await getOrSet(key, () => scrapeSchedule(tz, undefined, images), CACHE_TTL.SCHEDULE);

  return NextResponse.json({ ok: true, data });
}

export const GET = withApi(handler);
