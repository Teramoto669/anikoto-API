import { NextResponse } from 'next/server';
import { scrapeAnimeDetail, scrapeAnimeEpisodes } from '@/lib/scrapers/anime.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]
 *
 * Returns detail info for an anime: title, synopsis, genres, studios,
 * MAL score, episode count, status, etc.
 *
 * Supports optional episode range filter (same as /episodes endpoint):
 *   ?start=1&end=12
 *
 * Examples:
 *   /api/anime/haibara-s-teenage-new-game-8axzw
 *   /api/anime/one-piece-odmau
 *   /api/anime/one-piece-odmau?start=1&end=50
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const rawParams = await params;
    const slug = validateSlug(rawParams?.slug);
    if (!slug) {
      return NextResponse.json({ ok: false, message: 'Invalid or missing slug parameter' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === '1';

    // Handle optional episode range parameters
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let startEpisode: number | undefined;
    let endEpisode: number | undefined;

    if (start || end) {
      if (!start || !end) {
        return NextResponse.json(
          { ok: false, message: 'Both start and end are required when filtering by episode range.' },
          { status: 400 }
        );
      }
      const s = parseInt(start, 10);
      const e = parseInt(end, 10);
      if (isNaN(s) || isNaN(e) || s <= 0 || e <= 0 || s > e) {
        return NextResponse.json(
          { ok: false, message: 'Invalid episode range. start and end must be positive integers with start <= end.' },
          { status: 400 }
        );
      }
      startEpisode = s;
      endEpisode = e;
    }

    const rangeSuffix = startEpisode !== undefined ? `:ep${startEpisode}-${endEpisode}` : '';
    const key = `anime:${slug}${rangeSuffix}`;

    const data = await getOrSet(
      key,
      () => fetchAndCombine(slug, startEpisode, endEpisode, refresh),
      CACHE_TTL.ANIME,
      refresh
    );

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/anime/[slug]]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/**
 * Fetch anime detail and episodes in parallel.
 */
async function fetchAndCombine(slug: string, startEpisode?: number, endEpisode?: number, refresh?: boolean) {
  const [episodes, detail] = await Promise.all([
    scrapeAnimeEpisodes(slug, startEpisode, endEpisode, refresh),
    scrapeAnimeDetail(slug, refresh),
  ]);
  return { ...detail, episodes };
}
