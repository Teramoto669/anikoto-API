import { NextResponse } from 'next/server';
import { scrapeAnimeTooltip } from '@/lib/scrapers/tooltip.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/tooltip/[id]
 *
 * Returns preview info for an anime by its ID.
 *
 * Examples:
 *   /api/anime/tooltip/4127
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawParams = await params;
    const id = validateId(rawParams?.id);
    if (!id) {
      return NextResponse.json({ ok: false, message: 'Invalid or missing numeric id parameter' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === '1';

    const key = `anime:tooltip:${id}`;

    const data = await getOrSet(
      key,
      () => scrapeAnimeTooltip(id),
      CACHE_TTL.ANIME,
      refresh
    );

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/anime/tooltip/[id]]', message);

    if (message === 'Anime tooltip not found') {
      return NextResponse.json({ ok: false, message }, { status: 404 });
    }

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
