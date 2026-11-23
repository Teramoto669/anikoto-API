import { ok, withApi } from '@/lib/api';
import { getAnilistSeason } from '@/lib/anilist';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anilist/season?season=<WINTER|SPRING|SUMMER|FALL>&year=<yyyy>&page=<n>&perPage=<n>
 *
 * Seasonal anime chart from AniList, ordered by popularity.
 * Defaults to the current season and year. `perPage` is capped at 50.
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  return ok(
    await getAnilistSeason({
      season: sp.get('season') ?? undefined,
      year: sp.get('year') ?? undefined,
      page: sp.get('page') ?? undefined,
      perPage: sp.get('perPage') ?? undefined,
    })
  );
}

export const GET = withApi(handler);
