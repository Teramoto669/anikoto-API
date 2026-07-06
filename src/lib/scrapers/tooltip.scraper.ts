import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { fetchPage } from '../fetcher';
import { AnimeTooltip, EpisodeStatus } from '../types';

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

export async function scrapeAnimeTooltip(id: string): Promise<AnimeTooltip> {
  const $ = await fetchPage(`/ajax/anime/tooltip/${id}`, {
    'X-Requested-With': 'XMLHttpRequest',
  });

  const title = $('.title').text().trim();
  if (!title) {
    throw new Error('Anime tooltip not found');
  }

  const titleJp = $('.title').attr('data-jp')?.trim() || undefined;
  const rating = $('.rating').text().trim() || undefined;
  const quality = $('.quality').text().trim() || undefined;
  const episodes = parseEpisodeStatus($('.meta'));
  const synopsis = $('.synopsis').text().trim() || undefined;

  let otherNames: string | undefined;
  let score: number | undefined;
  let year: string | undefined;
  let duration: string | undefined;
  let status: string | undefined;
  const genres: string[] = [];

  $('.meta-bl > div').each((_, el) => {
    const $div = $(el);
    const label = $div.find('span').first().text().trim().toLowerCase();
    const $valSpan = $div.find('span').last();
    const value = $valSpan.text().trim();

    if (label.startsWith('other names')) {
      otherNames = value || undefined;
    } else if (label.startsWith('scores')) {
      score = value ? parseFloat(value) : undefined;
    } else if (label.startsWith('year')) {
      year = value || undefined;
    } else if (label.startsWith('duration')) {
      duration = value || undefined;
    } else if (label.startsWith('status')) {
      status = value || undefined;
    } else if (label.startsWith('genre')) {
      $valSpan.find('a').each((__, a) => {
        genres.push($(a).text().trim());
      });
    }
  });

  const watchUrl = $('.actions a.watch').attr('href') ?? '';
  let slug = '';
  if (watchUrl) {
    const parts = watchUrl.split('/watch/');
    if (parts.length > 1) {
      slug = parts[parts.length - 1].split('?')[0].replace(/\/$/, '');
    }
  }

  return {
    id,
    slug,
    title,
    titleJp,
    rating,
    quality,
    episodes,
    synopsis,
    otherNames,
    score,
    year,
    duration,
    status,
    genres: genres.length > 0 ? genres : undefined,
    href: slug ? `/api/anime/${slug}` : undefined,
  };
}
