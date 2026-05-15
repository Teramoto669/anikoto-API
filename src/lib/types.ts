// ─── Shared ─────────────────────────────────────────────────────────────────

export interface EpisodeStatus {
  sub?: number | null;
  dub?: number | null;
  total?: number | null;
}

export interface AnimeCard {
  id: string;
  title: string;
  titleJp?: string;
  image: string;
  href: string;
  type?: string;
  episodes?: EpisodeStatus;
  date?: string;
  score?: number;
  totalEpisodes?: number;
}

// ─── Home ────────────────────────────────────────────────────────────────────

export interface SpotlightAnime {
  title: string;
  titleJp?: string;
  rating?: string;
  quality?: string;
  hasDub?: boolean;
  hasSub?: boolean;
  date?: string;
  synopsis?: string;
  watchUrl: string;
  image: string;
}

export interface LatestEpisodeItem {
  id: string;
  title: string;
  titleJp?: string;
  image: string;
  href: string;
  watchHref: string;
  type?: string;
  episodes: EpisodeStatus;
}

export interface TopTableItem {
  id: string;
  title: string;
  titleJp?: string;
  image: string;
  href: string;
  type?: string;
  episodes: EpisodeStatus;
  date?: string;
}

export interface TopAnimeItem {
  rank: number;
  id: string;
  title: string;
  titleJp?: string;
  image: string;
  href: string;
  type?: string;
  episodes: EpisodeStatus;
}

export interface HomeData {
  spotlight: SpotlightAnime[];
  latestEpisodes: LatestEpisodeItem[];
  newRelease: TopTableItem[];
  newAdded: TopTableItem[];
  justCompleted: TopTableItem[];
  topDay: TopAnimeItem[];
  topWeek: TopAnimeItem[];
  topMonth: TopAnimeItem[];
}

// ─── Anime Detail ────────────────────────────────────────────────────────────

export interface AnimeDetail {
  id: string;
  slug: string;
  title: string;
  titleJp?: string;
  alternativeTitles: string[];
  image: string;
  rating?: string;
  quality?: string;
  hasDub?: boolean;
  hasSub?: boolean;
  synopsis?: string;
  type?: string;
  premiered?: string;
  aired?: string;
  status?: string;
  genres: string[];
  malScore?: number;
  duration?: string;
  episodeCount?: number;
  studios: string[];
  producers: string[];
  watchUrl: string;
}

// ─── Episode List ────────────────────────────────────────────────────────────

export interface Episode {
  number: string;
  title?: string;
  href: string;
  id?: string;
  hasDub?: boolean;
  hasSub?: boolean;
}

export interface AnimeEpisodes {
  animeId: string;
  slug: string;
  episodes: Episode[];
}

// ─── Search / Filter ─────────────────────────────────────────────────────────

export interface SearchResult {
  results: AnimeCard[];
  keyword: string;
  totalResults?: number;
}

export interface FilterParams {
  keyword?: string;
  genre?: string[];
  season?: string[];
  year?: string[];
  type?: string[];
  status?: string[];
  sort?: string;
  page?: string;
}

export interface FilterResult {
  results: AnimeCard[];
  currentPage: number;
  hasNextPage: boolean;
  params: FilterParams;
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export interface ScheduleDay {
  day: string;
  animes: AnimeCard[];
}

// ─── API Response ────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  cached?: boolean;
}

export interface ApiError {
  ok: false;
  message: string;
  status?: number;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
