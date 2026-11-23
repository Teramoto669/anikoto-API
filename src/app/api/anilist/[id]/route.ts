import { fail, ok, withApi } from '@/lib/api';
import { getAnilistMedia } from '@/lib/anilist';
import { validateNumericString } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anilist/[id]
 *
 * AniList metadata for a numeric AniList id. See GET /api/anilist for lookup by MAL id.
 */
async function handler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = validateNumericString((await params)?.id, 10);
  if (!id) return fail('Invalid AniList ID', 400);
  return ok(await getAnilistMedia(Number.parseInt(id, 10)));
}

export const GET = withApi(handler);
