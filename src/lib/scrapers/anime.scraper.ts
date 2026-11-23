import * as cheerio from 'cheerio';
import { fetchPage, fetchJson } from '../fetcher';
import {
  AnimeDetail,
  Episode,
  AnimeEpisodes,
  RelatedAnime,
  AnimeCard,
  AnimeSeasons,
  SeasonItem,
  LatestEpisodeResult,
  EpisodeAjaxResult,
  EpisodeAjaxItem,
} from '../types';
import { ApiError } from '../api';
import { BASE_URL } from '../constants';
import cache, { getOrSet } from '../cache';
import { CACHE_TTL } from '../constants';

// Helper to parse related anime from watch page
function parseRelated($: cheerio.CheerioAPI, currentSlug?: string): RelatedAnime[] {
  const relatedList: RelatedAnime[] = [];
  const seenKeys = new Set<string>();

  $('#w-related .item.flexserieslist').each((_, el) => {
    const $el = $(el);
    const malId = $el.attr('data-id') ?? undefined;
    const id = $el.find('.poster').attr('data-tip') ?? undefined;

    const $posterLink = $el.find('.poster a');
    const href = $posterLink.attr('href') ?? '';
    const image = $posterLink.find('img').attr('src') ?? '';

    const $nameLink = $el.find('.name.d-title');
    const title = $nameLink.text().trim();
    const titleJp = $nameLink.attr('data-jp')?.trim() || undefined;

    let slug: string | undefined;
    if (href.includes('/watch/')) {
      const parts = href.split('/watch/');
      const rawSlug = parts[parts.length - 1];
      slug = rawSlug.split('?')[0].replace(/\/$/, '');
    }

    const $relation = $el.find('.relation');
    const relationType = $relation.attr('id') || undefined;
    const relationText = $relation.text().trim() || undefined;

    // Skip current anime itself
    if (currentSlug && slug === currentSlug) {
      return;
    }

    // Skip duplicates
    const key = slug || href || title;
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);

    relatedList.push({
      id,
      malId,
      title,
      titleJp,
      image,
      href,
      slug,
      relation: relationText || relationType,
    });
  });

  return relatedList;
}

// Helper to parse recommended anime from watch page
function parseRecommendations($: cheerio.CheerioAPI): AnimeCard[] {
  const recommendations: AnimeCard[] = [];
  const seenKeys = new Set<string>();

  $('.w-side-section').each((_, section) => {
    const $section = $(section);
    const titleText = $section.find('.head .title').text().trim();
    if (titleText.toLowerCase() !== 'recommended') {
      return;
    }

    $section.find('.body .items .item').each((__, el) => {
      const $el = $(el);
      const href = $el.attr('href') ?? '';

      const $posterDiv = $el.find('.poster');
      const id = $posterDiv.attr('data-tip') ?? '';
      const image = $posterDiv.find('img').attr('src') ?? '';

      const $nameDiv = $el.find('.info .name.d-title');
      const title = $nameDiv.text().trim();
      const titleJp = $nameDiv.attr('data-jp')?.trim() || undefined;

      let slug = '';
      if (href.includes('/watch/')) {
        const parts = href.split('/watch/');
        const rawSlug = parts[parts.length - 1];
        slug = rawSlug.split('?')[0].replace(/\/$/, '');
      }

      let type: string | undefined;
      let totalEpisodes: number | undefined;
      let date: string | undefined;

      $el.find('.info .meta .dot').each((___, dotEl) => {
        const text = $(dotEl).text().trim();
        if (!text) return;

        if (text.endsWith('Eps')) {
          const epVal = text.replace('Eps', '').trim();
          totalEpisodes = epVal === '?' ? undefined : parseInt(epVal, 10);
        } else if (/^\d{4}$/.test(text) || text.toLowerCase() === 'unknown') {
          date = text;
        } else {
          type = text;
        }
      });

      const key = slug || href || title;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      recommendations.push({
        id,
        slug,
        title,
        titleJp,
        image,
        href,
        type,
        totalEpisodes,
        date,
      });
    });
  });

  return recommendations;
}

// ─── Anime Detail ────────────────────────────────────────────────────────────

export async function scrapeAnimeDetail(
  slug: string,
  refresh?: boolean
): Promise<AnimeDetail> {
  const $ = await fetchPage(`/watch/${slug}`, undefined, refresh);
  return parseAnimeDetail($, slug);
}

/** Pure parser for an already-loaded `/watch/<slug>` page (also used by /api/random). */
export function parseAnimeDetail($: cheerio.CheerioAPI, slug: string): AnimeDetail {
  const $main = $('#watch-main');
  const animeId = $main.attr('data-id') ?? '';
  const animeUrl = $main.attr('data-url') ?? '';

  const $binfo = $('.binfo');
  const $poster = $binfo.find('.poster img');
  const $info = $binfo.find('.info');

  // Alternative titles
  const altRaw = $info.find('.names').text().trim();
  const alternativeTitles = altRaw
    ? Array.from(
        new Set(
          altRaw
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      )
    : [];

  // Genres
  const genres: string[] = [];
  $info.find('.bmeta .meta div').each((_, el) => {
    const $el = $(el);
    const label = $el.clone().children().remove().end().text().trim();
    if (label.toLowerCase().startsWith('genre')) {
      $el.find('a').each((__, a) => {
        genres.push($(a).text().trim());
      });
    }
  });

  // Studios & Producers
  const studios: string[] = [];
  const producers: string[] = [];
  $info.find('.bmeta .meta div').each((_, el) => {
    const $el = $(el);
    const label = $el.clone().children().remove().end().text().trim().toLowerCase();
    if (label.startsWith('studio')) {
      $el.find('a').each((__, a) => { studios.push($(a).text().trim()); });
    }
    if (label.startsWith('producer')) {
      $el.find('a').each((__, a) => { producers.push($(a).text().trim()); });
    }
  });

  // Meta helper
  function getMeta(labelPrefix: string): string | undefined {
    let result: string | undefined;
    $info.find('.bmeta .meta div').each((_, el) => {
      const $el = $(el);
      const labelText = $el.clone().children().remove().end().text().trim();
      if (labelText.toLowerCase().startsWith(labelPrefix.toLowerCase())) {
        result = $el.find('span, a').first().text().trim() || $el.find('span').text().trim();
      }
    });
    return result || undefined;
  }

  const malScoreRaw = $info.find('.bmeta .meta div').filter((_, el) => {
    return $(el).clone().children().remove().end().text().trim().toLowerCase().startsWith('mal');
  }).find('span').text().trim();

  const epCountRaw = $info.find('.bmeta .meta div').filter((_, el) => {
    return $(el).clone().children().remove().end().text().trim().toLowerCase().startsWith('episode');
  }).find('span').text().trim();

  return {
    id: animeId,
    slug,
    title: $info.find('h1.title').text().trim(),
    titleJp: $info.find('h1.title').attr('data-jp')?.trim(),
    alternativeTitles,
    image: $poster.attr('src') ?? '',
    rating: $info.find('.meta.icons .rating').text().trim() || undefined,
    quality: $info.find('.meta.icons .quality').text().trim() || undefined,
    hasDub: $info.find('.meta.icons .dub').length > 0,
    hasSub: $info.find('.meta.icons .sub').length > 0,
    synopsis: $info.find('.synopsis .content').text().trim() || $info.find('.synopsis').text().trim() || undefined,
    type: getMeta('type'),
    premiered: getMeta('premiered'),
    aired: getMeta('aired'),
    status: getMeta('status'),
    genres,
    malScore: malScoreRaw ? parseFloat(malScoreRaw) : undefined,
    duration: getMeta('duration'),
    episodeCount: epCountRaw ? parseInt(epCountRaw, 10) : undefined,
    studios,
    producers,
    watchUrl: animeUrl || `${BASE_URL}/watch/${slug}`,
  };
}

// ─── Episode List ─────────────────────────────────────────────────────────────

/**
 * Fetches all episodes (unfiltered) from the watch page + AJAX fallback.
 * Result is internally cached by animeId so that subsequent callers
 * (e.g. scrapeWatch) do not re-fetch the same data within the same TTL window.
 */
async function fetchAllEpisodes(slug: string, refresh?: boolean): Promise<AnimeEpisodes> {
  const cacheKey = `anime:episodes:raw:${slug}`;
  if (refresh) {
    cache.del(cacheKey);
  }

  return getOrSet(cacheKey, async () => {
    const $ = await fetchPage(`/watch/${slug}`, undefined, refresh);
    const animeId = $('#watch-main').attr('data-id') ?? '';

    if (animeId && $('#w-episodes a').length === 0) {
      try {
        const data = await fetchJson<{ status: boolean; result: string }>(`/ajax/episode/list/${animeId}`);
        if (data && data.result) {
          const ajaxDoc = cheerio.load(data.result);
          $('#w-episodes').html(ajaxDoc.html());
        }
      } catch (err) {
        console.error('Failed to fetch episodes via AJAX:', err);
      }
    }

    const allEpisodes: Episode[] = [];

    // Episodes rendered as <li> inside #w-episodes
    $('#w-episodes ul.ep-range li a, #w-episodes a[href], #w-episodes a[data-num]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') ?? '';
      // Sometimes it's an anchor without href but with data-num on the watch page
      if (!href.includes('/watch/') && !$el.attr('data-num')) return;

      const epNum = $el.attr('data-num')
        || $el.find('.number, .d-title, span').first().text().trim()
        || href.split('/ep-')[1]
        || '';

      allEpisodes.push({
        number: epNum || String(allEpisodes.length + 1),
        title: $el.attr('title')?.trim() || undefined,
        href,
        id: $el.attr('data-id') ?? undefined,
        dataIds: $el.attr('data-ids') ?? $el.attr('data-id') ?? undefined,
        dataMal: $el.attr('data-mal') ?? undefined,
        dataTimestamp: $el.attr('data-timestamp') ?? undefined,
        hasDub: $el.find('.ep-status.dub').length > 0 || $el.text().toLowerCase().includes('dub') || $el.attr('data-dub') === '1',
        hasSub: $el.find('.ep-status.sub').length > 0 || $el.text().toLowerCase().includes('sub') || $el.attr('data-sub') === '1',
      });
    });

    return { animeId, slug, episodes: allEpisodes };
  }, CACHE_TTL.EPISODE);
}

export async function scrapeAnimeEpisodes(
  slug: string,
  startEpisode?: number,
  endEpisode?: number,
  refresh?: boolean
): Promise<AnimeEpisodes> {
  const { animeId, episodes: allEpisodes } = await fetchAllEpisodes(slug, refresh);

  // Apply range filtering if startEpisode and endEpisode are provided
  let filteredEpisodes = allEpisodes;
  if (startEpisode !== undefined && endEpisode !== undefined) {
    filteredEpisodes = allEpisodes.filter((ep) => {
      const num = parseInt(ep.number, 10);
      return num >= startEpisode && num <= endEpisode;
    });
  }

  return { animeId, slug, episodes: filteredEpisodes };
}

// ─── Related Anime & Recommendations ──────────────────────────────────────────

export async function scrapeRelatedAnime(slug: string, refresh?: boolean): Promise<RelatedAnime[]> {
  const cacheKey = `anime:related:${slug}`;
  if (refresh) {
    cache.del(cacheKey);
  }

  return getOrSet(cacheKey, async () => {
    const $ = await fetchPage(`/watch/${slug}`, undefined, refresh);
    const animeId = $('#watch-main').attr('data-id') ?? '';
    if (!animeId) return [];

    try {
      const ajaxData = await fetchJson<{ status: number; result: string }>(`/api/watch-order/${animeId}`);
      if (ajaxData && ajaxData.status === 200 && ajaxData.result) {
        const relatedDoc = cheerio.load(ajaxData.result);
        return parseRelated(relatedDoc, slug);
      }
    } catch (err) {
      console.error('Failed to fetch related anime:', err);
    }
    return [];
  }, CACHE_TTL.ANIME);
}

export async function scrapeRecommendations(slug: string, refresh?: boolean): Promise<AnimeCard[]> {
  const cacheKey = `anime:recommendations:${slug}`;
  if (refresh) {
    cache.del(cacheKey);
  }

  return getOrSet(cacheKey, async () => {
    const $ = await fetchPage(`/watch/${slug}`, undefined, refresh);
    return parseRecommendations($);
  }, CACHE_TTL.ANIME);
}

// ─── Id resolution ────────────────────────────────────────────────────────────

/**
 * Accepts either a numeric anime id or a slug and returns the numeric id.
 * Slugs are resolved through the (cached) watch page.
 */
export async function resolveAnimeId(
  slugOrId: string,
  refresh?: boolean
): Promise<{ animeId: string; slug: string | null }> {
  if (/^\d+$/.test(slugOrId)) return { animeId: slugOrId, slug: null };

  const $ = await fetchPage(`/watch/${slugOrId}`, undefined, refresh);
  const animeId = $('#watch-main').attr('data-id') ?? '';
  if (!animeId) throw new ApiError(404, `Anime not found: ${slugOrId}`);
  return { animeId, slug: slugOrId };
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

export async function scrapeSeasons(slugOrId: string, refresh?: boolean): Promise<AnimeSeasons> {
  const cacheKey = `anime:seasons:${slugOrId}`;
  if (refresh) cache.del(cacheKey);

  return getOrSet(cacheKey, async () => {
    const { animeId, slug } = await resolveAnimeId(slugOrId, refresh);

    const payload = await fetchJson<{ status?: number | boolean; result?: string }>(
      `/api/seasons/${animeId}`
    );
    const fragment =
      payload && Number(payload.status) === 200 && typeof payload.result === 'string'
        ? payload.result
        : '';

    const $ = cheerio.load(fragment);
    const seasons: SeasonItem[] = [];
    const seen = new Set<string>();

    $('#w-seasons .swiper-slide.season, .seasons .swiper-slide.season, #w-seasons .item').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a').first();
      const href = $link.attr('href') ?? '';
      const title = $el.find('.name, .title').first().text().trim() || $link.text().trim();
      const style = $link.attr('style') ?? $el.attr('style') ?? '';
      const image =
        style.match(/url\((['"]?)([^'")]+)\1\)/)?.[2] ?? $el.find('img').attr('src') ?? '';
      const seasonSlug = (href.split('/watch/').pop() ?? '').split(/[?#]/)[0].replace(/\/$/, '');

      if (title && seasonSlug && !seen.has(seasonSlug)) {
        seen.add(seasonSlug);
        seasons.push({ title, slug: seasonSlug, image, url: href, active: $el.hasClass('active') });
      }
    });

    return { animeId, slug, totalSeasons: seasons.length, seasons };
  }, CACHE_TTL.ANIME);
}

// ─── Latest episode ───────────────────────────────────────────────────────────

export async function scrapeLatestEpisode(
  slug: string,
  refresh?: boolean
): Promise<LatestEpisodeResult> {
  const { animeId, episodes } = await scrapeAnimeEpisodes(slug, undefined, undefined, refresh);
  if (episodes.length === 0) throw new ApiError(404, 'No episodes found for this anime');

  // Episode numbers can be decimals ("12.5"); compare numerically, fall back to list order.
  let latest = episodes[episodes.length - 1];
  let best = Number.NEGATIVE_INFINITY;
  for (const ep of episodes) {
    const n = Number.parseFloat(ep.number);
    if (!Number.isNaN(n) && n >= best) {
      best = n;
      latest = ep;
    }
  }

  return { slug, animeId, totalEpisodes: episodes.length, latest };
}

// ─── Episode list (raw AJAX view with filters / ranges) ───────────────────────

export async function scrapeEpisodesAjax(
  slugOrId: string,
  opts: { style?: string; vrf?: string } = {},
  refresh?: boolean
): Promise<EpisodeAjaxResult> {
  const { animeId } = await resolveAnimeId(slugOrId, refresh);

  const qs = new URLSearchParams();
  if (opts.style) qs.set('style', opts.style);
  if (opts.vrf) qs.set('vrf', opts.vrf);
  const query = qs.toString();

  const payload = await fetchJson<{ status?: boolean | number; result?: string }>(
    `/ajax/episode/list/${animeId}${query ? `?${query}` : ''}`,
    undefined,
    refresh
  );
  const $ = cheerio.load(payload?.result ?? '');

  const filters: EpisodeAjaxResult['filters'] = [];
  $('.dropdown.filter').each((_, el) => {
    const options: { value: string; label: string }[] = [];
    $(el)
      .find('.dropdown-item')
      .each((__, item) => {
        options.push({ value: $(item).attr('data-value') ?? '', label: $(item).text().trim() });
      });
    filters.push({ name: $(el).find('button').text().trim(), options });
  });

  const ranges: string[] = [];
  $('.ep-range').each((_, el) => {
    ranges.push($(el).attr('data-range') ?? '');
  });

  const episodes: EpisodeAjaxItem[] = [];
  $('li[data-html]').each((_, li) => {
    const $a = $(li).find('a').first();
    if (!$a.length) return;
    episodes.push({
      id: $a.attr('data-id') ?? '',
      number: $a.attr('data-num') ?? String(episodes.length + 1),
      slug: $a.attr('data-slug') || undefined,
      title: $(li).attr('title')?.trim() || undefined,
      titleJp: $a.find('.d-title').attr('data-jp')?.trim() || undefined,
      malId: $a.attr('data-mal') || undefined,
      timestamp: $a.attr('data-timestamp') || undefined,
      dataIds: ($a.attr('data-ids') ?? '').replace(/^\\?["']|\\?["']$/g, '') || undefined,
      hasSub: $a.attr('data-sub') === '1',
      hasDub: $a.attr('data-dub') === '1',
      active: $a.hasClass('active'),
    });
  });

  return { animeId, filters, ranges, totalEpisodes: episodes.length, episodes };
}
