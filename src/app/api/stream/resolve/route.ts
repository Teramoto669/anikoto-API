import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { resolveStream } from '@/lib/scrapers/stream.scraper';
import { validateOpaqueId, validateSlug, validateToken } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stream/resolve?id=<linkId>&slug=<slug>&sv=<svId>&type=<sub|dub|...>
 *
 * Resolves a server link all the way to a playable HLS stream: m3u8 URL,
 * proxied URL, quality variants, subtitle tracks and intro/outro skip ranges.
 * If the embed is reachable but nothing can be extracted, `m3u8` is null and
 * `error` explains why (HTTP 200, like /api/watch sources).
 *
 * @query type  Audio track hint some players need (sub | dub | softsub | hsub | raw)
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = validateOpaqueId(sp.get('id'));
  if (!id) return fail('Missing or invalid id (link id) parameter', 400);

  const rawSlug = sp.get('slug');
  const slug = rawSlug ? validateSlug(rawSlug) : null;
  if (rawSlug && !slug) return fail('Invalid slug parameter', 400);

  const rawSv = sp.get('sv');
  const sv = rawSv ? validateToken(rawSv) : null;
  if (rawSv && !sv) return fail('Invalid sv parameter', 400);

  const rawType = sp.get('type');
  const type = rawType && /^[a-z]{2,8}$/i.test(rawType) ? rawType.toLowerCase() : null;
  if (rawType && !type) return fail('Invalid type parameter', 400);

  return ok(
    await resolveStream(id, { slug: slug ?? undefined, svId: sv ?? undefined, type: type ?? undefined }, wantsRefresh(req))
  );
}

export const GET = withApi(handler);
