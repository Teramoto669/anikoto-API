import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { buildEpisodeEmbeds, EMBED_PROVIDER_IDS } from '@/lib/scrapers/stream.scraper';
import { validateNumericString, validateSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stream/embeds?slug=<slug>&ep=<n>&lang=<sub|dub>&provider=<a,b>
 *
 * Ready-to-iframe third-party player URLs for an episode.
 * Identify the anime with `slug` (MAL/AniList ids are resolved automatically)
 * or pass `mal` / `anilist` ids directly.
 *
 * @query slug      Anime slug
 * @query mal       MAL id (alternative to slug)
 * @query anilist   AniList id (alternative to slug)
 * @query ep        Episode number (default 1)
 * @query lang      sub | dub (default sub)
 * @query provider  Comma-separated subset of: megaplay, anixo, megavid
 */
async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;

  const rawEp = sp.get('ep') ?? sp.get('episode');
  if (rawEp !== null && !/^\d{1,5}$/.test(rawEp)) {
    return fail(`Invalid ep: ${rawEp} (expected a positive integer)`, 400);
  }
  const episode = Math.max(1, Number.parseInt(rawEp ?? '1', 10) || 1);

  const lang = (sp.get('lang') ?? 'sub').toLowerCase();
  if (lang !== 'sub' && lang !== 'dub') return fail(`Invalid lang: ${lang} (expected sub or dub)`, 400);

  const rawProvider = sp.get('provider');
  const providers = rawProvider
    ? rawProvider.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)
    : null;
  if (providers) {
    const unknown = providers.filter((p) => !EMBED_PROVIDER_IDS.includes(p));
    if (unknown.length) {
      return fail(`Unknown provider(s): ${unknown.join(', ')}. Valid: ${EMBED_PROVIDER_IDS.join(', ')}`, 400);
    }
  }

  const rawSlug = sp.get('slug');
  const slug = rawSlug ? validateSlug(rawSlug) : null;
  if (rawSlug && !slug) return fail('Invalid slug parameter', 400);

  const rawMal = sp.get('mal');
  const mal = rawMal ? validateNumericString(rawMal, 10) : null;
  if (rawMal && !mal) return fail(`Invalid mal: ${rawMal} (expected a numeric MAL ID)`, 400);

  const rawAnilist = sp.get('anilist');
  const anilist = rawAnilist ? validateNumericString(rawAnilist, 10) : null;
  if (rawAnilist && !anilist) return fail(`Invalid anilist: ${rawAnilist} (expected a numeric AniList ID)`, 400);

  if (!slug && !mal && !anilist) {
    return fail("Provide 'slug', 'mal' or 'anilist' (plus optional 'ep' and 'lang')", 400);
  }

  const refresh = wantsRefresh(req);
  const key = `embeds:${slug ?? ''}:${mal ?? ''}:${anilist ?? ''}:${episode}:${lang}:${(providers ?? []).join('-')}`;
  const data = await getOrSet(
    key,
    () => buildEpisodeEmbeds({ slug, episode, lang, providers, malId: mal, anilistId: anilist }),
    CACHE_TTL.IDS,
    refresh
  );
  return ok(data);
}

export const GET = withApi(handler);
