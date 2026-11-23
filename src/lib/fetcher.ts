import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { DEFAULT_HEADERS } from './constants';
import cache, { getOrSet } from './cache';
import { proxyPool, getRandomBrowserHeaders, isPrivateUrl } from './proxy-pool';
import { sanitizeUrlForLogging } from './validation';
import {
  getMirrorOrder,
  isKnownMirrorOrigin,
  reportMirrorFailure,
  reportMirrorSuccess,
} from './mirrors';

/**
 * Normalises a caller-supplied path into `/path?query`.
 *
 * Absolute URLs are only accepted when they point at a configured mirror
 * (BASE_URL or MIRROR_DOMAINS) — this fetcher must never be steered at an
 * arbitrary host. The mirror to actually use is chosen per attempt.
 */
function normalizePath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const parsed = new URL(path);
    if (!isKnownMirrorOrigin(parsed.origin)) {
      throw new Error(`Invalid target origin: ${parsed.origin}. Requests must target a configured mirror`);
    }
    return `${parsed.pathname}${parsed.search}`;
  }
  return path.startsWith('/') ? path : `/${path}`;
}

/** Point a Referer that names one mirror at the mirror we're actually calling. */
function alignReferer(
  headers: Record<string, unknown>,
  mirror: string
): Record<string, unknown> {
  const referer = headers['Referer'] ?? headers['referer'];
  if (typeof referer !== 'string') return headers;
  try {
    const parsed = new URL(referer);
    if (parsed.origin !== mirror && isKnownMirrorOrigin(parsed.origin)) {
      return { ...headers, Referer: `${mirror}${parsed.pathname}${parsed.search}` };
    }
  } catch {
    /* leave as-is */
  }
  return headers;
}

/** Cloudflare / bot-wall interstitials come back as HTTP 200 HTML. */
function looksLikeChallenge(data: unknown): boolean {
  return (
    typeof data === 'string' &&
    data.length < 30_000 &&
    /Just a moment\.\.\.|Checking your browser before accessing/i.test(data)
  );
}

/**
 * Execute an axios HTTP request with mirror failover, proxy pool rotation,
 * browser UA/fingerprint rotation, and retry logic.
 * Note: Cloudflare Worker proxy is reserved exclusively for video streaming (in watch.scraper.ts).
 */
async function executeResilientResponse<T>(
  path: string,
  config: AxiosRequestConfig
): Promise<AxiosResponse<T>> {
  const mirrors = getMirrorOrder();
  // 3 attempts like before; more only if the operator configured >3 mirrors.
  const maxAttempts = Math.max(3, mirrors.length);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const mirror = mirrors[(attempt - 1) % mirrors.length];
    const url = `${mirror}${path}`;

    // Direct fetch with proxy pool rotation (if configured) or direct browser fingerprint
    const browserFp = getRandomBrowserHeaders();
    const proxyUrl = proxyPool.getNextProxy();
    const httpsAgent = proxyUrl ? proxyPool.getAgent(proxyUrl) : undefined;

    const mergedHeaders = alignReferer(
      {
        ...DEFAULT_HEADERS,
        'User-Agent': browserFp['User-Agent'],
        'Accept-Language': browserFp['Accept-Language'],
        ...(browserFp['sec-ch-ua'] ? { 'sec-ch-ua': browserFp['sec-ch-ua'] } : {}),
        ...config.headers,
      },
      mirror
    );

    const finalConfig: AxiosRequestConfig = {
      ...config,
      headers: mergedHeaders as AxiosRequestConfig['headers'],
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
      if (looksLikeChallenge(res.data)) {
        throw new Error('Upstream returned a bot-protection challenge page');
      }
      if (proxyUrl) proxyPool.reportSuccess(proxyUrl);
      reportMirrorSuccess(mirror);
      return res;
    } catch (err: unknown) {
      if (proxyUrl) proxyPool.reportFailure(proxyUrl);
      lastError = err instanceof Error ? err : new Error(String(err));
      // A 404 is a statement about the resource, not about the mirror — don't retry.
      if (axios.isAxiosError(err) && err.response?.status === 404) throw err;
      reportMirrorFailure(mirror);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, attempt * 300));
    }
  }

  const safeUrl = sanitizeUrlForLogging(`${mirrors[0]}${path}`);
  throw lastError || new Error(`Request failed after ${maxAttempts} attempts: ${safeUrl}`);
}

async function executeResilientRequest<T>(path: string, config: AxiosRequestConfig): Promise<T> {
  return (await executeResilientResponse<T>(path, config)).data;
}

/**
 * Fetch an HTML page from the upstream site and return a Cheerio instance.
 * Raw HTML is cached in memory to optimize parallel requests to the same page.
 */
export async function fetchPage(
  path: string,
  extraHeaders?: Record<string, string>,
  refresh?: boolean
): Promise<cheerio.CheerioAPI> {
  const targetPath = normalizePath(path);
  // Keyed by path (not full URL) so a mirror switch doesn't invalidate the cache.
  const cacheKey = `html:${targetPath}`;
  if (refresh) {
    cache.del(cacheKey);
  }

  const html = await getOrSet(
    cacheKey,
    async () => {
      let finalPath = targetPath;
      if (refresh) {
        finalPath += finalPath.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
      }
      const data = await executeResilientRequest<string>(finalPath, {
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
 * Fetch a page bypassing the HTML cache and report where redirects ended up.
 * Used by endpoints whose whole point is a redirect (e.g. /random).
 */
export async function fetchPageFresh(
  path: string
): Promise<{ $: cheerio.CheerioAPI; finalUrl: string }> {
  const targetPath = normalizePath(path);
  const res = await executeResilientResponse<string>(targetPath, {
    headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
  });
  const finalUrl: string =
    (res.request as { res?: { responseUrl?: string } } | undefined)?.res?.responseUrl ??
    res.config.url ??
    '';
  return { $: cheerio.load(res.data), finalUrl };
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
  let finalPath = normalizePath(path);
  if (refresh) {
    finalPath += finalPath.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
  }

  return executeResilientRequest<T>(finalPath, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      // Aligned to the mirror actually being called (see alignReferer).
      Referer: `${getMirrorOrder()[0]}/`,
      ...(refresh ? { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' } : {}),
      ...extraHeaders,
    },
  });
}
