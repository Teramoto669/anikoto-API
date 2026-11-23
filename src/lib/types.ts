// ─── Shared ─────────────────────────────────────────────────────────────────

export interface EpisodeStatus {
  sub?: number | null;
  dub?: number | null;
  total?: number | null;
}

export interface AnimeCard {
  id: string;
  slug: string;
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
  slug: string;
  title: string;
  titleJp?: string;
  rank?: number;
  rating?: string;
  quality?: string;
  type?: string;
  episodes?: string;
  hasDub?: boolean;
  hasSub?: boolean;
  date?: string;
  synopsis?: string;
  watchUrl: string;
  href: string;
  image: string;
}

export interface LatestEpisodeItem {
  id: string;
  slug: string;
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
  slug: string;
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
  slug: string;
  title: string;
  titleJp?: string;
  image: string;
  href: string;
  type?: string;
  episodes: EpisodeStatus;
}

export interface LatestWidgetComment {
  id: string;
  user: string;
  badge?: string;
  avatar?: string;
  time?: string;
  episode?: string;
  text?: string;
  showTitle?: string;
  slug?: string;
  watchHref?: string;
}

export interface HomeWidgetResult {
  results: LatestEpisodeItem[];
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  maxPage?: number;
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

export interface RelatedAnime {
  id?: string;
  malId?: string;
  title: string;
  titleJp?: string;
  image: string;
  relation?: string;
  href: string;
  slug?: string;
}

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
  dataIds?: string;
  dataMal?: string;       // MAL ID — used by Kiwi Mapper API
  dataTimestamp?: string; // Episode timestamp — used by Kiwi Mapper API
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
  currentPage?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  maxPage?: number;
  minPage?: number;
  totalResults?: number;
}

export interface FilterParams {
  keyword?: string;
  genre?: string[];
  season?: string[];
  year?: string[];
  type?: string[];
  status?: string[];
  language?: string[];
  rating?: string[];
  sort?: string;
  page?: string;
}

export interface FilterOptions {
  genres: { id: string; name: string; slug: string; }[];
  years: string[];
  types: string[];
  seasons: string[];
  statuses: string[];
  languages: string[];
  ratings: string[];
  sorts: string[];
}

export interface FilterResult {
  results: AnimeCard[];
  topRated?: AnimeCard[];
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  maxPage?: number;
  minPage?: number;
  params: FilterParams;
  options?: FilterOptions;
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

// ─── Tooltip ─────────────────────────────────────────────────────────────────

export interface AnimeTooltip {
  id: string;
  slug: string;
  title: string;
  titleJp?: string;
  rating?: string;
  quality?: string;
  episodes?: EpisodeStatus;
  synopsis?: string;
  otherNames?: string;
  score?: number;
  year?: string;
  duration?: string;
  status?: string;
  genres?: string[];
  watchUrl?: string;
  href?: string;
}


// ─── Listings & discovery ────────────────────────────────────────────────────

export interface ListingResult {
  results: AnimeCard[];
  topRated?: AnimeCard[];
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  minPage?: number;
  maxPage?: number;
}

export interface AzListResult extends ListingResult {
  letter: string;
}

export type RankingWindow = 'day' | 'week' | 'month';

export interface TopTenResult {
  today: TopAnimeItem[];
  week: TopAnimeItem[];
  month: TopAnimeItem[];
}

export interface TrendingSidebarResult {
  day: TopAnimeItem[];
  week: TopAnimeItem[];
  month: TopAnimeItem[];
  latestEpisodes: LatestEpisodeItem[];
}

export interface SuggestionItem {
  id: string;
  slug: string;
  title: string;
  titleJp?: string;
  image: string;
  href: string;
  type?: string;
}

export interface RandomAnime extends AnimeDetail {
  url: string;
}

// ─── Seasons / episode helpers ───────────────────────────────────────────────

export interface SeasonItem {
  title: string;
  slug: string;
  image: string;
  url: string;
  active: boolean;
}

export interface AnimeSeasons {
  animeId: string;
  slug: string | null;
  totalSeasons: number;
  seasons: SeasonItem[];
}

export interface LatestEpisodeResult {
  slug: string;
  animeId: string;
  totalEpisodes: number;
  latest: Episode;
}

export interface EpisodeAjaxItem {
  id: string;
  number: string;
  slug?: string;
  title?: string;
  titleJp?: string;
  malId?: string;
  timestamp?: string;
  dataIds?: string;
  hasSub: boolean;
  hasDub: boolean;
  active: boolean;
}

export interface EpisodeAjaxResult {
  animeId: string;
  filters: { name: string; options: { value: string; label: string }[] }[];
  ranges: string[];
  totalEpisodes: number;
  episodes: EpisodeAjaxItem[];
}
