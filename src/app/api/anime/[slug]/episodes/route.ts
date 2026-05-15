import { NextResponse } from 'next/server';
import { scrapeAnimeEpisodes } from '@/lib/scrapers/anime.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]/episodes
 *
 * Returns the full episode list for an anime.
 *
 * Example:
 *   /api/anime/haibara-s-teenage-new-game-8axzw/episodes
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

    const key = `anime:episodes:${slug}`;
    const data = refresh
      ? await scrapeAnimeEpisodes(slug)
      : await getOrSet(key, () => scrapeAnimeEpisodes(slug), CACHE_TTL.EPISODE);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/anime/[slug]/episodes]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
