import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { getOrSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';
import { scrapeEpisodesAjax } from '@/lib/scrapers/anime.scraper';
import { validateSlug, validateToken } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anime/[slug]/episodes/ajax?style=<s>&vrf=<v>
 *
 * The raw AJAX episode list: besides episodes it exposes the site's
 * `filters` (dropdowns) and `ranges` (episode range tabs), and per-episode
 * `dataIds`, `malId` and `timestamp`.
 * `[slug]` may be the anime slug or its numeric id.
 *
 * @query style      Optional list style passed through to the site
 * @query vrf        Optional token passed through to the site
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = validateSlug((await params)?.slug);
  if (!slug) return fail('Invalid or missing slug parameter', 400);

  const { searchParams } = new URL(req.url);
  const rawStyle = searchParams.get('style');
  const rawVrf = searchParams.get('vrf');
  const style = rawStyle ? validateToken(rawStyle) : null;
  const vrf = rawVrf ? validateToken(rawVrf) : null;
  if (rawStyle && !style) return fail('Invalid style parameter', 400);
  if (rawVrf && !vrf) return fail('Invalid vrf parameter', 400);

  const refresh = wantsRefresh(req);
  const data = await getOrSet(
    `anime:episodes-ajax:${slug}:${style ?? ''}:${vrf ?? ''}`,
    () => scrapeEpisodesAjax(slug, { style: style ?? undefined, vrf: vrf ?? undefined }, refresh),
    CACHE_TTL.EPISODE,
    refresh
  );
  return ok(data);
}

export const GET = withApi(handler);
