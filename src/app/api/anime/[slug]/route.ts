import { NextResponse } from 'next/server';
import { scrapeAnimeDetail, scrapeAnimeEpisodes } from '@/lib/scrapers/anime.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]
 *
 * Returns detail info for an anime: title, synopsis, genres, studios,
 * MAL score, episode count, status, etc.
 *
 * Examples:
 *   /api/anime/haibara-s-teenage-new-game-8axzw
 *   /api/anime/one-piece-odmau
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

    const key = `anime:${slug}`;
    const data = refresh
      ? await fetchAndCombine(slug)
      : await getOrSet(key, () => fetchAndCombine(slug), CACHE_TTL.ANIME);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/anime/[slug]]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

async function fetchAndCombine(slug: string) {
  const [detail, episodes] = await Promise.all([
    scrapeAnimeDetail(slug),
    scrapeAnimeEpisodes(slug)
  ]);
  return { ...detail, episodes };
}
