import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { BASE_URL, DEFAULT_HEADERS } from './constants';
import cache, { getOrSet } from './cache';
import { proxyPool, getRandomBrowserHeaders } from './proxy-pool';

/**
 * Execute an axios HTTP request with proxy pool rotation, browser UA/fingerprint rotation, and retry logic.
 * Note: Cloudflare Worker proxy is reserved exclusively for video streaming (in watch.scraper.ts).
 */
async function executeResilientRequest<T>(
  url: string,
  config: AxiosRequestConfig
): Promise<T> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Direct fetch with proxy pool rotation (if configured) or direct browser fingerprint
    const browserFp = getRandomBrowserHeaders();
    const proxyUrl = proxyPool.getNextProxy();
    const httpsAgent = proxyUrl ? proxyPool.getAgent(proxyUrl) : undefined;

    const mergedHeaders = {
      ...DEFAULT_HEADERS,
      'User-Agent': browserFp['User-Agent'],
      'Accept-Language': browserFp['Accept-Language'],
      ...(browserFp['sec-ch-ua'] ? { 'sec-ch-ua': browserFp['sec-ch-ua'] } : {}),
      ...config.headers,
    };

    const finalConfig: AxiosRequestConfig = {
      ...config,
      headers: mergedHeaders,
      timeout: 15_000,
      ...(httpsAgent ? { httpsAgent, httpAgent: httpsAgent } : {}),
    };

    try {
      const res = await axios.get<T>(url, finalConfig);
      if (proxyUrl) proxyPool.reportSuccess(proxyUrl);
      return res.data;
    } catch (err: unknown) {
      if (proxyUrl) proxyPool.reportFailure(proxyUrl);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (axios.isAxiosError(err) && err.response?.status === 404) throw err;
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, attempt * 300));
    }
  }

  throw lastError || new Error(`Request failed after ${maxAttempts} attempts: ${url}`);
}

/**
 * Fetch an HTML page from anikototv.to and return a Cheerio instance.
 * Raw HTML is cached in memory to optimize parallel requests to the same page.
 */
export async function fetchPage(
  path: string,
  extraHeaders?: Record<string, string>,
  refresh?: boolean
): Promise<cheerio.CheerioAPI> {
  const cacheKey = `html:${path}`;
  if (refresh) {
    cache.del(cacheKey);
  }

  const html = await getOrSet(
    cacheKey,
    async () => {
      let url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
      if (refresh) {
        url += url.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
      }
      const data = await executeResilientRequest<string>(url, {
        headers: {
          ...(refresh ? { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' } : {}),
          ...extraHeaders,
        },
      });
      return data;
    },
    300,
    refresh
  );

  return cheerio.load(html);
}

/**
 * Fetch JSON from the site's internal AJAX endpoints.
 * @param extraHeaders - Optional additional headers to merge (e.g. a per-request Referer).
 */
export async function fetchJson<T = unknown>(
  path: string,
  extraHeaders?: Record<string, string>,
  refresh?: boolean
): Promise<T> {
  let url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  if (refresh) {
    url += url.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
  }
  const data = await executeResilientRequest<T>(url, {
    headers: {
      Accept: 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(refresh ? { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' } : {}),
      ...extraHeaders,
    },
  });
  return data;
}
