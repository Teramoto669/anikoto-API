/**
 * Discovery / list endpoints.
 *
 * Most of these are views over the home page (which `scrapeHome` already
 * parses) or over the site's paginated listing pages (`scrapeListingPage`), so
 * they inherit those parsers' selectors instead of introducing new ones.
 */
import { fetchPageFresh } from '../fetcher';
import { getOrSet } from '../cache';
import { CACHE_TTL } from '../constants';
import { ApiError } from '../api';
import { scrapeHome, scrapeHomeWidget } from './home.scraper';
import { scrapeListingPage, scrapeSearch } from './search.scraper';
import { parseAnimeDetail } from './anime.scraper';
import type {
  AnimeCard,
  AzListResult,
  HomeData,
  HomeWidgetResult,
  ListingResult,
  RandomAnime,
  RankingWindow,
  SpotlightAnime,
  SuggestionItem,
  TopAnimeItem,
  TopTableItem,
  TopTenResult,
  TrendingSidebarResult,
} from '../types';

// ─── Home-derived views ───────────────────────────────────────────────────────

/** Same cache key + TTL as GET /api/home, so the two share one scrape. */
export function getHomeCached(refresh = false): Promise<HomeData> {
  return getOrSet('home', () => scrapeHome(refresh), CACHE_TTL.HOME, refresh);
}

export async function getSpotlight(refresh = false): Promise<SpotlightAnime[]> {
  return (await getHomeCached(refresh)).spotlight;
}

export async function getTopTen(refresh = false): Promise<TopTenResult> {
  const home = await getHomeCached(refresh);
  return { today: home.topDay, week: home.topWeek, month: home.topMonth };
}

export async function getTrendingSidebar(refresh = false): Promise<TrendingSidebarResult> {
  const home = await getHomeCached(refresh);
  return {
    day: home.topDay,
    week: home.topWeek,
    month: home.topMonth,
    latestEpisodes: home.latestEpisodes,
  };
}

export async function getCompleted(refresh = false): Promise<TopTableItem[]> {
  return (await getHomeCached(refresh)).justCompleted;
}

export async function getTopRankings(
  window: RankingWindow,
  refresh = false
): Promise<TopAnimeItem[]> {
  const home = await getHomeCached(refresh);
  const map: Record<RankingWindow, TopAnimeItem[]> = {
    day: home.topDay,
    week: home.topWeek,
    month: home.topMonth,
  };
  // The site occasionally repeats an entry across a tab; keep the first.
  const seen = new Set<string>();
  return map[window].filter((i) => (seen.has(i.slug) ? false : (seen.add(i.slug), true)));
}

// ─── Widget-backed (AJAX, paginated) ──────────────────────────────────────────

export function getRecentlyUpdated(
  tab: 'all' | 'sub' | 'dub',
  page: number,
  refresh = false
): Promise<HomeWidgetResult> {
  return scrapeHomeWidget(`updated-${tab}`, page, refresh);
}

export function getTrending(page: number, refresh = false): Promise<HomeWidgetResult> {
  return scrapeHomeWidget('trending', page, refresh);
}

// ─── Listing pages ────────────────────────────────────────────────────────────

const LISTING_PATHS = {
  'most-popular': '/most-viewed',
  'new-release': '/new-release',
  'newly-added': '/latest-updated?sort=added',
  upcoming: '/status/not-yet-aired',
} as const;

export type ListingName = keyof typeof LISTING_PATHS;

export function getListing(name: ListingName, page: number, refresh = false): Promise<ListingResult> {
  return getOrSet(
    `listing:${name}:${page}`,
    () => scrapeListingPage(LISTING_PATHS[name], page, refresh),
    CACHE_TTL.LISTING,
    refresh
  );
}

export function getAzList(letter: string, page: number, refresh = false): Promise<AzListResult> {
  return getOrSet(
    `az-list:${letter}:${page}`,
    async () => ({
      ...(await scrapeListingPage(`/az-list/${letter}`, page, refresh)),
      letter,
    }),
    CACHE_TTL.LISTING,
    refresh
  );
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 10;

/** Full cards (with sub/dub counts) for the first page of results, capped at 10. */
export async function getSuggestions(keyword: string, refresh = false): Promise<AnimeCard[]> {
  const { results } = await scrapeSearch(keyword, 1, refresh);
  return results.slice(0, MAX_SUGGESTIONS);
}

/** Lightweight autocomplete projection of the same data. */
export async function getSearchSuggest(keyword: string, refresh = false): Promise<SuggestionItem[]> {
  const cards = await getSuggestions(keyword, refresh);
  return cards.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    titleJp: c.titleJp,
    image: c.image,
    href: c.href,
    type: c.type,
  }));
}

// ─── Random ───────────────────────────────────────────────────────────────────

/** Follows the site's /random redirect and parses the resulting watch page. Never cached. */
export async function scrapeRandomAnime(): Promise<RandomAnime> {
  const { $, finalUrl } = await fetchPageFresh('/random');

  let slug = '';
  try {
    const path = new URL(finalUrl).pathname;
    const m = path.match(/^\/watch\/([^/]+)/);
    slug = m ? m[1] : '';
  } catch {
    slug = '';
  }
  if (!slug) {
    throw new ApiError(502, 'Upstream /random did not redirect to an anime page');
  }

  return { ...parseAnimeDetail($, slug), url: finalUrl };
}
