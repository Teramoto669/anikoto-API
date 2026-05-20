import { NextResponse } from 'next/server';
import { scrapeAnimeEpisodes } from '@/lib/scrapers/anime.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]/episodes
 *
 * Returns the full episode list for an anime, optionally filtered by episode range.
 *
 * Example:
 *   /api/anime/haibara-s-teenage-new-game-8axzw/episodes
 *   /api/anime/haibara-s-teenage-new-game-8axzw/episodes?start=5&end=10
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ ok: false, message: 'slug is required' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === '1';

    // Handle episode range parameters
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    let startEpisode: number | undefined = undefined;
    let endEpisode: number | undefined = undefined;
    let cacheKey = `anime:episodes:${slug}`;

    if (start && end) {
      const s = parseInt(start, 10);
      const e = parseInt(end, 10);
      if (!isNaN(s) && !isNaN(e) && s > 0 && e > 0 && s <= e) {
        startEpisode = s;
        endEpisode = e;
        cacheKey += `:${s}-${e}`;
      } else {
        return NextResponse.json({ ok: false, message: 'Invalid episode range. Start and End must be positive integers, and Start <= End.' }, { status: 400 });
      }
    }

    const data = refresh
      ? await scrapeAnimeEpisodes(slug, startEpisode, endEpisode)
      : await getOrSet(cacheKey, () => scrapeAnimeEpisodes(slug, startEpisode, endEpisode), CACHE_TTL.EPISODE);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/anime/[slug]/episodes]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
