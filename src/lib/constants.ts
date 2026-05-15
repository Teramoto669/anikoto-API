export const BASE_URL = 'https://anikototv.to';

export const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  Referer: 'https://anikototv.to/',
};

/** Cache TTL in seconds */
export const CACHE_TTL = {
  HOME: 60 * 5,       // 5 minutes
  ANIME: 60 * 30,     // 30 minutes
  EPISODE: 60 * 10,   // 10 minutes
  SEARCH: 60 * 2,     // 2 minutes
  FILTER: 60 * 5,     // 5 minutes
  SCHEDULE: 60 * 60,  // 1 hour
};
