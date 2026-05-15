import { NextResponse } from 'next/server';
import { scrapeHome } from '@/lib/scrapers/home.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/home
 *
 * Returns the full home page data including:
 *  - spotlight (featured anime carousel)
 *  - latestEpisodes
 *  - newRelease, newAdded, justCompleted
 *  - topDay, topWeek, topMonth
 *
 * @query refresh=1  Bypass cache and force re-scrape
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === '1';

    const key = 'home';
    const data = refresh
      ? await scrapeHome()
      : await getOrSet(key, scrapeHome, CACHE_TTL.HOME);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/home]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
