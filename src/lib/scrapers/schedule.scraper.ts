import * as cheerio from 'cheerio';
import { fetchJson } from '../fetcher';
import { ScheduleDay, AnimeCard } from '../types';

const SECONDS_PER_DAY = 86_400;

/** Parse `.item` `<a>` elements from a container into AnimeCard[]. */
function parseItems(
  $container: ReturnType<ReturnType<typeof cheerio.load>>,
  $: ReturnType<typeof cheerio.load>
): AnimeCard[] {
  const cards: AnimeCard[] = [];

  $container.find('.item').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') ?? $el.find('a').first().attr('href') ?? '') as string;
    const slug = href
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/watch\//, '')
      .replace(/\/ep-\d+.*$/, '')
      .replace(/\/$/, '');

    const $titleEl = $el.find('.title.d-title').length
      ? $el.find('.title.d-title')
      : $el.find('.title, .d-title').first();

    const title = $titleEl.text().trim();
    const titleJp = $titleEl.attr('data-jp')?.trim();
    const epText = $el.find('.ep span').text().trim();
    const timeText = $el.find('.time').text().trim();

    if (!title && !slug) return;

    cards.push({
      id: slug || href,
      slug,
      title,
      titleJp: titleJp || undefined,
      image: '',
      href: slug ? `/api/anime/${slug}` : href,
      type: epText || undefined,
      date: timeText || undefined,
    });
  });

  return cards;
}

/**
 * Compute the UTC-midnight Unix timestamp for today (or a given Date).
 * The site's timestamps are always UTC midnight, incrementing by 86400 per day.
 */
function utcMidnight(date = new Date()): number {
  const ts = Math.floor(date.getTime() / 1000);
  return ts - (ts % SECONDS_PER_DAY);
}

/**
 * Derive a human-readable day label from a UTC-midnight timestamp.
 * e.g. 1783036800 → "Fri Jul 03"
 */
function labelFromTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const wday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${wday} ${month} ${day}`;
}

/**
 * Scrape the full 7-day schedule.
 *
 * Timestamps are UTC-midnight values, spaced exactly 86400 s apart.
 * We compute them from today's date so no extra HTTP call is needed for the tab list.
 * Each day is fetched in parallel via /ajax/schedule/date?tz={tz}&time={ts}.
 *
 * @param tzOffset - UTC offset in hours (e.g. 7 for UTC+7). Defaults to 0.
 * @param startDate - Override the start date (defaults to today UTC).
 */
export async function scrapeSchedule(tzOffset = 0, startDate?: Date): Promise<ScheduleDay[]> {
  const start = utcMidnight(startDate);

  const days = Array.from({ length: 7 }, (_, i) => ({
    timestamp: start + i * SECONDS_PER_DAY,
    day: labelFromTimestamp(start + i * SECONDS_PER_DAY),
  }));

  const results = await Promise.all(
    days.map(({ timestamp, day }) =>
      fetchJson<{ status: number; result: string }>(
        `/ajax/schedule/date?tz=${tzOffset}&time=${timestamp}`
      )
        .then(({ result }) => {
          if (!result) return { day, animes: [] as AnimeCard[] };
          const $ = cheerio.load(result);
          return { day, animes: parseItems($('body'), $) };
        })
        .catch(() => ({ day, animes: [] as AnimeCard[] }))
    )
  );

  return results;
}
