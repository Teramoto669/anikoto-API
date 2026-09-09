import { NextResponse } from 'next/server';
import { scrapeRelatedAnime } from '@/lib/scrapers/anime.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]/related
 *
 * Returns the related anime (watch order/sequels/prequels/etc.) for a given anime slug.
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

    const cacheKey = `anime:related:api:${slug}`;

    const data = await getOrSet(
      cacheKey,
      () => scrapeRelatedAnime(slug, refresh),
      CACHE_TTL.ANIME,
      refresh
    );

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GET /api/anime/[slug]/related]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
