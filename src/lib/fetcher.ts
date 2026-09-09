import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { BASE_URL, DEFAULT_HEADERS } from './constants';
import cache, { getOrSet } from './cache';
import { proxyPool, getRandomBrowserHeaders, isPrivateUrl } from './proxy-pool';
import { sanitizeUrlForLogging } from './validation';

/**
 * Validates and constructs target URL, ensuring it only targets the configured BASE_URL.
 */
function buildTargetUrl(path: string): string {
  const base = new URL(BASE_URL);
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const parsed = new URL(path);
    if (parsed.origin !== base.origin) {
      throw new Error(`Invalid target origin: ${parsed.origin}. Requests must target ${base.origin}`);
    }
    return parsed.toString();
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base.origin}${cleanPath}`;
}

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
      maxRedirects: 3,
      beforeRedirect: (options) => {
        if (options.href && isPrivateUrl(options.href)) {
          throw new Error(`SSRF blocked redirect to private address: ${options.href}`);
        }
      },
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

  const safeUrl = sanitizeUrlForLogging(url);
  throw lastError || new Error(`Request failed after ${maxAttempts} attempts: ${safeUrl}`);
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
  const targetUrl = buildTargetUrl(path);
  const cacheKey = `html:${targetUrl}`;
  if (refresh) {
    cache.del(cacheKey);
  }

  const html = await getOrSet(
    cacheKey,
    async () => {
      let finalUrl = targetUrl;
      if (refresh) {
        finalUrl += finalUrl.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
      }
      const data = await executeResilientRequest<string>(finalUrl, {
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
  const targetUrl = buildTargetUrl(path);
  let finalUrl = targetUrl;
  if (refresh) {
    finalUrl += finalUrl.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
  }

  return executeResilientRequest<T>(finalUrl, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: `${BASE_URL}/`,
      ...(refresh ? { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' } : {}),
      ...extraHeaders,
    },
  });
}
