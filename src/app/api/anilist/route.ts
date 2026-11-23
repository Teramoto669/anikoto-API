import { fail, ok, withApi } from '@/lib/api';
import { getAnilistMedia, resolveAnilistIdFromMal } from '@/lib/anilist';
import { validateNumericString } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anilist?id=<anilistId>   or   GET /api/anilist?mal=<malId>
 *
 * AniList metadata (banner, cover, scores, studios, characters, relations,
 * recommendations, next airing episode). Look up by AniList id, or by MAL id —
 * handy since this API's episodes expose `malId`.
 * (`GET /api/anilist/[id]` is the path-style equivalent.)
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const rawId = sp.get('id');
  const rawMal = sp.get('mal');

  let anilistId: number | null = null;
  if (rawId !== null) {
    const id = validateNumericString(rawId, 10);
    if (!id) return fail('Invalid AniList ID', 400);
    anilistId = Number.parseInt(id, 10);
  } else if (rawMal !== null) {
    const mal = validateNumericString(rawMal, 10);
    if (!mal) return fail('Invalid MAL ID parameter', 400);
    anilistId = await resolveAnilistIdFromMal(mal);
    if (!anilistId) return fail('No AniList entry found for this MAL ID', 404);
  } else {
    return fail('Provide ?id=<anilistId> or ?mal=<malId>', 400);
  }

  return ok(await getAnilistMedia(anilistId));
}

export const GET = withApi(handler);
