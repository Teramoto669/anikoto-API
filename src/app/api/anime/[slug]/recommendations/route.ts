import { withApi } from '@/lib/api';
import { NextResponse } from 'next/server';
import { scrapeRecommendations } from '@/lib/scrapers/anime.scraper';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]/recommendations
 *
 * Returns list of recommended anime cards for a given anime slug.
 */
async function handler(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const rawParams = await params;
  const slug = validateSlug(rawParams?.slug);
  if (!slug) {
    return NextResponse.json({ ok: false, message: 'Invalid or missing slug parameter' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get('refresh') === '1';

  const cacheKey = `anime:recommendations:api:${slug}`;

  const data = await getOrSet(
    cacheKey,
    () => scrapeRecommendations(slug, refresh),
    CACHE_TTL.ANIME,
    refresh
  );

  return NextResponse.json({ ok: true, data });
}

export const GET = withApi(handler);
