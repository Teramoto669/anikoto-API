import * as cheerio from 'cheerio';
import { fetchPage, fetchJson } from '../fetcher';
import { AnimeDetail, Episode, AnimeEpisodes, RelatedAnime } from '../types';
import { BASE_URL } from '../constants';
import { getOrSet } from '../cache';
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

// ─── Anime Detail ────────────────────────────────────────────────────────────

export async function scrapeAnimeDetail(
  slug: string,
  prefetchedEpisodes?: AnimeEpisodes
): Promise<AnimeDetail> {
  const $ = await fetchPage(`/watch/${slug}`);

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

  // Reuse pre-fetched episodes to avoid a redundant scrape
  const episodes = prefetchedEpisodes ?? await scrapeAnimeEpisodes(slug);

  let related: RelatedAnime[] = episodes.related ?? [];
  if (related.length === 0 && animeId) {
    try {
      const ajaxData = await fetchJson<{ status: number; result: string }>(`/api/watch-order/${animeId}`);
      if (ajaxData && ajaxData.status === 200 && ajaxData.result) {
        const relatedDoc = cheerio.load(ajaxData.result);
        related = parseRelated(relatedDoc, slug);
      }
    } catch (err) {
      console.error('Failed to fetch related anime in scrapeAnimeDetail:', err);
    }
  }

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
    episodes,
    related,
  };
}

// ─── Episode List ─────────────────────────────────────────────────────────────

/**
 * Fetches all episodes (unfiltered) from the watch page + AJAX fallback.
 * Result is internally cached by animeId so that subsequent callers
 * (e.g. scrapeWatch) do not re-fetch the same data within the same TTL window.
 */
async function fetchAllEpisodes(slug: string): Promise<AnimeEpisodes> {
  const cacheKey = `anime:episodes:raw:${slug}`;
  return getOrSet(cacheKey, async () => {
    const $ = await fetchPage(`/watch/${slug}`);
    const animeId = $('#watch-main').attr('data-id') ?? '';

    // Kick off both the episode-list AJAX fallback and the watch-order (related)
    // fetch in parallel — they are independent of each other.
    const episodeAjaxPromise = (async () => {
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
    })();

    const watchOrderPromise = animeId
      ? fetchJson<{ status: number; result: string }>(`/api/watch-order/${animeId}`).catch((err) => {
          console.error('Failed to fetch related anime in fetchAllEpisodes:', err);
          return null;
        })
      : Promise.resolve(null);

    // Wait for episode AJAX to finish before parsing (it mutates the cheerio tree)
    await episodeAjaxPromise;

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

    // Resolve the already-in-flight watch-order request
    let related: RelatedAnime[] = [];
    const ajaxData = await watchOrderPromise;
    if (ajaxData && ajaxData.status === 200 && ajaxData.result) {
      const relatedDoc = cheerio.load(ajaxData.result);
      related = parseRelated(relatedDoc, slug);
    }

    return { animeId, slug, episodes: allEpisodes, related };
  }, CACHE_TTL.EPISODE);
}

export async function scrapeAnimeEpisodes(
  slug: string,
  startEpisode?: number,
  endEpisode?: number
): Promise<AnimeEpisodes> {
  const { animeId, episodes: allEpisodes, related } = await fetchAllEpisodes(slug);

  // Apply range filtering if startEpisode and endEpisode are provided
  let filteredEpisodes = allEpisodes;
  if (startEpisode !== undefined && endEpisode !== undefined) {
    filteredEpisodes = allEpisodes.filter((ep) => {
      const num = parseInt(ep.number, 10);
      return num >= startEpisode && num <= endEpisode;
    });
  }

  return { animeId, slug, episodes: filteredEpisodes, related };
}
