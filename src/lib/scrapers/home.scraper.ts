import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { fetchPage, fetchJson } from '../fetcher';
import {
  HomeData,
  SpotlightAnime,
  LatestEpisodeItem,
  TopTableItem,
  TopAnimeItem,
  EpisodeStatus,
  LatestWidgetComment,
  HomeWidgetResult,
} from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEpisodeStatus($el: cheerio.Cheerio<AnyNode>): EpisodeStatus {
  const status: EpisodeStatus = {};
  const subText = $el.find('.ep-status.sub span').first().text().trim();
  const dubText = $el.find('.ep-status.dub span').first().text().trim();
  const totalText = $el.find('.ep-status.total span').first().text().trim();
  if (subText) status.sub = parseInt(subText, 10) || null;
  if (dubText) status.dub = parseInt(dubText, 10) || null;
  if (totalText) status.total = parseInt(totalText, 10) || null;
  return status;
}

// ─── Section Parsers ─────────────────────────────────────────────────────────

function parseSpotlight($: cheerio.CheerioAPI): SpotlightAnime[] {
  const results: SpotlightAnime[] = [];
  $('#hotest .swiper-slide, .hotest .swiper-slide').each((_, el) => {
    const $el = $(el);

    // Image: .cover img (new layout), img tag, or background-image in .image div / .cover (old layout)
    let image = $el.find('.cover img').attr('src')
      || $el.find('img').first().attr('src')
      || '';

    if (!image) {
      const bgStyle = $el.find('.cover, .image div, .cover div').attr('style') ?? $el.attr('style') ?? '';
      const imageMatch = bgStyle.match(/url\(['"]?(.+?)['"]?\)/);
      if (imageMatch) image = imageMatch[1];
    }
    image = image.replace(/^[\["']+|[\]"']+$/g, '').trim();

    // Watch URL & Slug
    const rawWatchUrl = $el.find('.ak-btns a').attr('href')
      || $el.find('.actions a.play, a.btn').attr('href')
      || $el.find('a[href*="/watch/"]').attr('href')
      || '';
    const watchUrl = rawWatchUrl.replace(/^[\["']+|[\]"']+$/g, '').trim();
    const slug = watchUrl
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/watch\//, '')
      .replace(/\/ep-\d+$/, '')
      .replace(/\/$/, '');

    // Title & Japanese title
    const $titleEl = $el.find('.ak-title, .title, h2').first();
    const title = $titleEl.text().trim();
    if (!title && !slug) return;

    const titleJp = $titleEl.attr('data-jp')?.trim() || undefined;

    // Rank from .ak-sub (e.g., "#1 Spotlight")
    const subText = $el.find('.ak-sub').text().trim();
    const rankMatch = subText.match(/#(\d+)/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : undefined;

    // Details: type, date, rating, quality, episodes
    let type: string | undefined = undefined;
    let date: string | undefined = $el.find('.meta .date').text().trim() || undefined;
    let rating: string | undefined = $el.find('.meta .rating').text().trim() || undefined;
    const quality: string | undefined = $el.find('.meta .quality').text().trim() || undefined;
    let episodes: string | undefined = undefined;

    // Parse .ak-detail (new format)
    $el.find('.ak-detail .it').each((_, itEl) => {
      const $it = $(itEl);
      const text = $it.text().trim();
      if (!text) return;

      if ($it.find('.fa-play-circle, .fa-circle-play, .fa-play').length > 0) {
        type = text;
      } else if ($it.find('.fa-calendar, .fa-calendar-days').length > 0) {
        date = text;
      } else if ($it.find('.fa-star').length > 0) {
        rating = text;
      } else if ($it.find('.fa-film').length > 0) {
        episodes = text;
      } else if (!type && /^(TV|Movie|OVA|ONA|Special|TV_SHORT|TV Special)$/i.test(text)) {
        type = text;
      }
    });

    const hasDub = $el.find('.meta .dub, .ep-status.dub, span.dub').length > 0;
    const hasSub = $el.find('.meta .sub, .ep-status.sub, span.sub').length > 0;
    const synopsis = $el.find('.ak-desc, .synopsis').text().trim() || undefined;

    results.push({
      rank,
      slug,
      title,
      titleJp,
      rating,
      quality,
      type,
      episodes,
      hasDub,
      hasSub,
      date,
      synopsis,
      watchUrl,
      href: `/api/anime/${slug}`,
      image,
    });
  });
  return results;
}

function parseLatestEpisodes($: cheerio.CheerioAPI): LatestEpisodeItem[] {
  const results: LatestEpisodeItem[] = [];
  $('#recent-update .ani.items .item').each((_, el) => {
    const $el = $(el);
    const $poster = $el.find('.ani.poster');
    const $link = $poster.find('a');
    const href = $link.attr('href') ?? '';
    const watchHref = href; // already includes ep-N
    const slug = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\/watch\//, '').replace(/\/ep-\d+$/, '');

    results.push({
      id: $poster.attr('data-tip') ?? slug,
      slug,
      title: $el.find('.info a.name').text().trim(),
      titleJp: $el.find('.info a.name').attr('data-jp')?.trim(),
      image: $poster.find('img').attr('src') ?? '',
      href: `/api/anime/${slug}`,
      watchHref,
      type: $poster.find('.meta .right').text().trim() || undefined,
      episodes: parseEpisodeStatus($poster),
    });
  });
  return results;
}

function parseTopTable($: cheerio.CheerioAPI, section: string): TopTableItem[] {
  const results: TopTableItem[] = [];
  $(`section[data-name="${section}"] .scaff.items .item`).each((_, el) => {
    const $el = $(el);
    const $poster = $el.find('.poster');
    const href = $el.attr('href') ?? '';
    const slug = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\/watch\//, '').replace(/\/ep-\d+$/, '');

    results.push({
      id: $poster.attr('data-tip') ?? slug,
      slug,
      title: $el.find('.name').text().trim(),
      titleJp: $el.find('.name').attr('data-jp')?.trim(),
      image: $poster.find('img').attr('src') ?? '',
      href: `/api/anime/${slug}`,
      type: $el.find('.meta .dot:not(.ep-wrap)').first().text().trim() || undefined,
      episodes: parseEpisodeStatus($el),
      date: $el.find('.meta .dot:last-child').text().trim() || undefined,
    });
  });
  return results;
}

function parseTopAnime($: cheerio.CheerioAPI, tabName: string): TopAnimeItem[] {
  const results: TopAnimeItem[] = [];
  $(`#top-anime .tab-content[data-name="${tabName}"] .scaff.items .item`).each((_, el) => {
    const $el = $(el);
    const rankClass = [...($el.attr('class')?.split(' ') ?? [])].find((c) => c.startsWith('rank'));
    const rank = rankClass ? parseInt(rankClass.replace('rank', ''), 10) : 0;
    const $poster = $el.find('.poster');
    const href = $el.attr('href') ?? '';
    const slug = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\/watch\//, '').replace(/\/ep-\d+$/, '');

    results.push({
      rank,
      id: $poster.attr('data-tip') ?? slug,
      slug,
      title: $el.find('.name').text().trim(),
      titleJp: $el.find('.name').attr('data-jp')?.trim(),
      image: $poster.find('img').attr('src') ?? '',
      href: `/api/anime/${slug}`,
      type: $el.find('.meta .dot:not(.ep-wrap)').first().text().trim() || undefined,
      episodes: parseEpisodeStatus($el),
    });
  });
  return results;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function scrapeHome(refresh?: boolean): Promise<HomeData> {
  const $ = await fetchPage('/home', undefined, refresh);

  return {
    spotlight: parseSpotlight($),
    latestEpisodes: parseLatestEpisodes($),
    newRelease: parseTopTable($, 'new-release'),
    newAdded: parseTopTable($, 'new-added'),
    justCompleted: parseTopTable($, 'completed'),
    topDay: parseTopAnime($, 'day'),
    topWeek: parseTopAnime($, 'week'),
    topMonth: parseTopAnime($, 'month'),
  };
}

export async function scrapeHomeWidget(
  name: string,
  page = 1
): Promise<HomeWidgetResult> {
  const json = await fetchJson<{ status?: boolean; result?: string; html?: string }>(
    `/ajax/home/widget/${encodeURIComponent(name)}?page=${page}`
  );

  const html = json?.result || json?.html || '';
  if (!html) {
    return {
      results: [],
      currentPage: page,
      hasNextPage: false,
      hasPreviousPage: page > 1,
    };
  }

  const $ = cheerio.load(html);
  const results: LatestEpisodeItem[] = [];

  $('.ani.items .item, .items .item, .item').each((_, el) => {
    const $el = $(el);
    const $poster = $el.find('.ani.poster, .poster');
    const href =
      $poster.find('a').attr('href') ?? $el.find('a.name').attr('href') ?? '';
    const slug = href
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/watch\//, '')
      .replace(/\/ep-\d+.*$/, '');

    results.push({
      id: $poster.attr('data-tip') ?? slug,
      slug,
      title: $el.find('.info a.name, a.name').text().trim(),
      titleJp: $el.find('.info a.name, a.name').attr('data-jp')?.trim(),
      image: $poster.find('img').attr('src') ?? '',
      href: `/api/anime/${slug}`,
      watchHref: href,
      type: $poster.find('.meta .right').text().trim() || undefined,
      episodes: parseEpisodeStatus($poster.length ? $poster : $el),
    });
  });

  const currentPage = page;
  const pagingExists = $('.paging, .pagination').length > 0;
  let hasNextPage = false;
  let hasPreviousPage = currentPage > 1;

  if (pagingExists) {
    hasNextPage =
      $('.paging .next:not(.disabled), .pagination .next:not(.disabled), span.next:not(.disabled), a.next:not(.disabled)').length > 0 ||
      $('.pagination a[rel="next"], .paging a[rel="next"], a[rel="next"]').length > 0;

    hasPreviousPage =
      currentPage > 1 ||
      $('.paging .prev:not(.disabled), .pagination .prev:not(.disabled), span.prev:not(.disabled), a.prev:not(.disabled)').length > 0;
  } else {
    // Anikoto AJAX widget response contains only items without .paging HTML wrapper.
    // If full items page returned (>= 10 items), next page is available.
    hasNextPage = results.length >= 10;
  }

  let maxPage: number | undefined = undefined;

  $('[data-original-title*="Page"], [title*="Page"]').each((_, el) => {
    const titleAttr = $(el).attr('data-original-title') || $(el).attr('title') || '';
    const match = titleAttr.match(/Page\s*(\d+)/i);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (!isNaN(pageNum) && (!maxPage || pageNum > maxPage)) {
        maxPage = pageNum;
      }
    }
  });

  const lastPageHref = $('.pagination a[title="Last"], .paging a[title="Last"], a[title="Last"]').attr('href');
  if (lastPageHref) {
    const match = lastPageHref.match(/page=(\d+)/);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (!isNaN(pageNum) && (!maxPage || pageNum > maxPage)) {
        maxPage = pageNum;
      }
    }
  }

  $('.pagination a.page-link, .paging a.page-link, .pagination a.page-numbers, .paging a.page-numbers').each((_, el) => {
    const pageText = $(el).text().trim();
    const pageNum = parseInt(pageText, 10);
    if (!isNaN(pageNum) && (!maxPage || pageNum > maxPage)) {
      maxPage = pageNum;
    }
  });

  if (hasNextPage && (!maxPage || maxPage <= currentPage)) {
    maxPage = currentPage + 1;
  }

  return {
    results,
    currentPage,
    hasNextPage,
    hasPreviousPage,
    maxPage,
  };
}

export async function scrapeLatestWidgetComments(
  sort = 'newest',
  limit = 10
): Promise<LatestWidgetComment[]> {
  const json = await fetchJson<{ status?: boolean; html?: string }>(
    `/ajax/comment/home-widget?sort=${encodeURIComponent(sort)}&limit=${limit}`
  );

  if (!json?.html) return [];

  const $ = cheerio.load(json.html);
  const comments: LatestWidgetComment[] = [];

  $('.hd-row').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('data-id') ?? '';
    const href = $el.attr('href') ?? '';
    const watchHref = href;
    const slug = href
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/watch\//, '')
      .replace(/\/ep-\d+.*$/, '')
      .replace(/\/$/, '');

    const avatar = $el.find('.hd-row-avatar img').attr('src') ?? '';
    const user = $el.find('.hd-row-user').text().trim();
    const badge = $el.find('.hd-row-badge').text().trim() || undefined;
    const time = $el.find('.hd-row-time').text().trim() || undefined;
    const episode = $el.find('.hd-row-ep').text().trim() || undefined;
    const text = $el.find('.hd-row-text').text().trim() || undefined;
    const showTitle = $el.find('.hd-row-show').text().trim() || undefined;

    comments.push({
      id,
      user,
      badge,
      avatar: avatar || undefined,
      time,
      episode,
      text,
      showTitle,
      slug: slug || undefined,
      watchHref: watchHref || undefined,
    });
  });

  return comments;
}

