import { NextResponse } from 'next/server';
import { scrapeHomeWidget } from '@/lib/scrapers/home.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateWidgetName, validatePage } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/widget?name=<name>&page=<n>
 *
 * Returns data from Anikoto home widgets.
 *
 * Query parameters:
 *   name    – widget name ("updated-all", "updated-sub", "updated-dub", "trending", "random". Default: "updated-all")
 *   page    – page number (default: 1)
 *   refresh – set to 1 to force fresh scrape
 *
 * Examples:
 *   /api/widget?name=updated-all
 *   /api/widget?name=updated-sub
 *   /api/widget?name=trending
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawName = searchParams.get('name')?.trim() || searchParams.get('type')?.trim() || 'updated-all';
    const name = validateWidgetName(rawName) || 'updated-all';
    const page = validatePage(searchParams.get('page'));
    const refresh = searchParams.get('refresh') === '1';

    const key = `widget:${name}:${page}`;
    const data = refresh
      ? await scrapeHomeWidget(name, page)
      : await getOrSet(key, () => scrapeHomeWidget(name, page), CACHE_TTL.HOME);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/widget]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
