/**
 * AniList GraphQL helpers (metadata enrichment, seasonal charts, MAL → AniList id mapping).
 * Talks only to the AniList GraphQL endpoint: `ANILIST_URL` (default https://graphql.anilist.co).
 */
import axios from 'axios';
import { ApiError } from './api';
import { getOrSet } from './cache';
import { CACHE_TTL } from './constants';

const DEFAULT_ANILIST_URL = 'https://graphql.anilist.co';

/** GraphQL endpoint, overridable with ANILIST_URL (http/https only; invalid values fall back to the default). */
export function getAnilistUrl(): string {
  const raw = (process.env.ANILIST_URL ?? '').trim();
  if (!raw) return DEFAULT_ANILIST_URL;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    /* fall through */
  }
  console.warn('[anilist] ANILIST_URL is not a valid http(s) URL; using the default');
  return DEFAULT_ANILIST_URL;
}

export const ANILIST_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export type AnilistSeason = (typeof ANILIST_SEASONS)[number];

const MAL_TO_ANILIST_QUERY = `query ($idMal: Int!) { Media(idMal: $idMal, type: ANIME) { id idMal } }`;

const MEDIA_QUERY = `query ($id: Int!) {
  Media(id: $id, type: ANIME) {
    id idMal format status episodes duration season seasonYear
    description(asHtml: false) genres synonyms meanScore averageScore popularity favourites
    startDate { year month day }
    endDate { year month day }
    bannerImage
    coverImage { extraLarge large medium color }
    countryOfOrigin isAdult source
    studios(isMain: true) { nodes { id name } }
    nextAiringEpisode { episode airingAt }
    characters(page: 1, perPage: 12, sort: [ROLE, RELEVANCE, ID]) {
      edges { role node { id name { full native } image { large } } }
    }
    relations { edges { relationType node { id idMal format type title { romaji english } coverImage { large } averageScore episodes } } }
    recommendations(page: 1, perPage: 8) { nodes { media { id idMal title { romaji english } coverImage { large } averageScore episodes } } }
  }
}`;

const SEASON_QUERY = `query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage total }
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
      id idMal format status episodes averageScore popularity
      title { romaji english native }
      coverImage { large color }
      bannerImage genres startDate { year month day }
    }
  }
}`;

interface GraphQlResponse<T> {
  data?: T;
  errors?: { message?: string; status?: number }[];
}

async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  cacheKey: string,
  ttl: number
): Promise<T> {
  return getOrSet(cacheKey, async () => {
    let body: GraphQlResponse<T>;
    try {
      const res = await axios.post<GraphQlResponse<T>>(
        getAnilistUrl(),
        { query, variables },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: 10_000,
          // AniList reports "not found" as HTTP 404 with a GraphQL error body.
          validateStatus: () => true,
        }
      );
      body = res.data;
      if (res.status === 404) throw new ApiError(404, 'Not found on AniList');
      if (res.status === 429) throw new ApiError(429, 'AniList rate limit hit, retry shortly');
      if (res.status >= 500) throw new ApiError(502, `AniList is unavailable (HTTP ${res.status})`);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(502, `AniList request failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }

    if (body?.errors?.length) {
      const first = body.errors[0];
      if (first.status === 404 || /not found/i.test(first.message ?? '')) {
        throw new ApiError(404, 'Not found on AniList');
      }
      throw new ApiError(502, `AniList error: ${first.message ?? 'unknown'}`);
    }
    if (!body?.data) throw new ApiError(502, 'AniList returned an empty payload');
    return body.data;
  }, ttl);
}

/** MAL id → AniList id. Returns null when AniList has no match. */
export async function resolveAnilistIdFromMal(malId: string | number): Promise<number | null> {
  const idMal = Number.parseInt(String(malId), 10);
  if (!Number.isInteger(idMal) || idMal < 1) return null;
  try {
    const data = await anilistQuery<{ Media?: { id?: number } | null }>(
      MAL_TO_ANILIST_QUERY,
      { idMal },
      `anilist:from-mal:${idMal}`,
      CACHE_TTL.IDS
    );
    return data.Media?.id ?? null;
  } catch {
    return null;
  }
}

export async function getAnilistMedia(id: number): Promise<unknown> {
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'Invalid AniList ID');
  const data = await anilistQuery<{ Media?: unknown }>(
    MEDIA_QUERY,
    { id },
    `anilist:media:${id}`,
    CACHE_TTL.ANILIST
  );
  if (!data.Media) throw new ApiError(404, 'Anime not found on AniList');
  return data.Media;
}

export interface SeasonChartParams {
  season?: string;
  year?: string;
  page?: string;
  perPage?: string;
}

export async function getAnilistSeason(params: SeasonChartParams = {}) {
  const now = new Date();
  const currentSeason = ANILIST_SEASONS[Math.floor(now.getMonth() / 3)];

  const season = String(params.season || currentSeason).toUpperCase();
  if (!(ANILIST_SEASONS as readonly string[]).includes(season)) {
    throw new ApiError(400, `Invalid season (expected one of ${ANILIST_SEASONS.join(', ')})`);
  }

  const year = params.year ? Number.parseInt(params.year, 10) : now.getFullYear();
  if (!Number.isInteger(year) || year < 1940 || year > 2100) {
    throw new ApiError(400, 'Invalid year (expected an integer between 1940 and 2100)');
  }

  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const perPage = Math.min(50, Math.max(1, Number.parseInt(params.perPage ?? '25', 10) || 25));

  const data = await anilistQuery<{
    Page?: { pageInfo?: unknown; media?: unknown[] };
  }>(
    SEASON_QUERY,
    { season, year, page, perPage },
    `anilist:season:${season}:${year}:${page}:${perPage}`,
    CACHE_TTL.ANILIST_SEASON
  );

  return {
    season,
    year,
    page,
    perPage,
    pageInfo: data.Page?.pageInfo ?? null,
    media: data.Page?.media ?? [],
  };
}
