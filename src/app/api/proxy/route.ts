import { NextResponse } from 'next/server';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Readable } from 'stream';
import {
  proxyPool,
  getRandomBrowserHeaders,
  isPrivateUrlAsync,
  isAllowedStreamDomain,
} from '@/lib/proxy-pool';
import { sanitizeUrlForLogging } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Hop-by-hop headers to strip when proxying responses
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'cf-ray',
  'cf-connecting-ip',
  'x-forwarded-for',
  'x-real-ip',
]);

/**
 * Normalizes dead, stale, or rate-limited upstream CDN mirror hosts to the active high-capacity cdn.imgnex.top origin.
 */
function remapMirrorUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if (host === 'bb.akirax.buzz' && pathname.startsWith('/anime/')) {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }

    if (host === 'ncdn.imgnex.top' && !pathname.endsWith('master.m3u8')) {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }

    if (host.endsWith('.snapcdn.top') && pathname.startsWith('/anime/')) {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }

    const isDeadBuzz = host.includes('zaplume.buzz') || host.includes('mewstream.buzz');
    if (isDeadBuzz || (host.endsWith('.click') && !host.includes('akirax.buzz'))) {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return urlStr;
  }
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const rawTargetUrl = searchParams.get('url');
  const referer = searchParams.get('referer');
  const customProxy = searchParams.get('proxy') || req.headers.get('x-proxy-target');

  if (!rawTargetUrl) {
    return NextResponse.json({ ok: false, message: 'Missing url parameter' }, { status: 400 });
  }

  const targetUrl = remapMirrorUrl(rawTargetUrl);

  // ── SSRF & Domain Allowlist Guard ──────────────────────────────────────────
  if (!isAllowedStreamDomain(targetUrl)) {
    return NextResponse.json(
      { ok: false, message: 'Forbidden: Streaming proxy is restricted to authorized media domains' },
      { status: 403 }
    );
  }

  if (await isPrivateUrlAsync(targetUrl)) {
    return NextResponse.json(
      { ok: false, message: 'Forbidden: Access to private or local network addresses is restricted' },
      { status: 403 }
    );
  }

  // ── Outbound Proxy Authorization ───────────────────────────────────────────
  let authorizedProxy: string | null = null;
  if (customProxy) {
    if (!proxyPool.isValidProxy(customProxy)) {
      return NextResponse.json(
        { ok: false, message: 'Forbidden: Specified outbound proxy is not in authorized pool' },
        { status: 403 }
      );
    }
    if (await isPrivateUrlAsync(customProxy)) {
      return NextResponse.json(
        { ok: false, message: 'Forbidden: Outbound proxy points to a private network address' },
        { status: 403 }
      );
    }
    authorizedProxy = customProxy;
  }

  // ── Build Base Headers ─────────────────────────────────────────────────────
  const clientUserAgent = req.headers.get('user-agent');
  const clientSecChUa = req.headers.get('sec-ch-ua');
  const clientSecChUaMobile = req.headers.get('sec-ch-ua-mobile');
  const clientSecChUaPlatform = req.headers.get('sec-ch-ua-platform');
  const clientAcceptLanguage = req.headers.get('accept-language');

  const browserHeaders = getRandomBrowserHeaders();
  const reqHeaders: Record<string, string> = {
    'User-Agent': clientUserAgent || browserHeaders['User-Agent'],
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': clientAcceptLanguage || browserHeaders['Accept-Language'],
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };

  if (clientSecChUa || browserHeaders['sec-ch-ua']) reqHeaders['sec-ch-ua'] = clientSecChUa || browserHeaders['sec-ch-ua']!;
  if (clientSecChUaMobile || browserHeaders['sec-ch-ua-mobile']) reqHeaders['sec-ch-ua-mobile'] = clientSecChUaMobile || browserHeaders['sec-ch-ua-mobile']!;
  if (clientSecChUaPlatform || browserHeaders['sec-ch-ua-platform']) reqHeaders['sec-ch-ua-platform'] = clientSecChUaPlatform || browserHeaders['sec-ch-ua-platform']!;

  if (referer) {
    reqHeaders['Referer'] = referer;
    try {
      reqHeaders['Origin'] = new URL(referer).origin;
    } catch { }
  }

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    reqHeaders['Range'] = rangeHeader;
  }

  // ── Upstream Fetch with Multi-Node Retry Logic ─────────────────────────────
  const maxAttempts = 3;
  let lastError: Error | null = null;
  let response: AxiosResponse<Readable> | null = null;
  let usedProxyUrl: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    usedProxyUrl = authorizedProxy || proxyPool.getNextProxy();
    const httpsAgent = usedProxyUrl ? proxyPool.getAgent(usedProxyUrl) : undefined;

    const axiosConfig: AxiosRequestConfig = {
      headers: reqHeaders,
      timeout: 15_000,
      responseType: 'stream',
      validateStatus: (status) => status < 600,
      ...(httpsAgent ? { httpsAgent, httpAgent: httpsAgent } : {}),
    };

    try {
      const res = await axios.get<Readable>(targetUrl, axiosConfig);
      response = res;

      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        if (usedProxyUrl) proxyPool.reportFailure(usedProxyUrl);

        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 300));
          continue;
        }
      } else {
        if (usedProxyUrl) proxyPool.reportSuccess(usedProxyUrl);
        break;
      }
    } catch (err: unknown) {
      if (usedProxyUrl) proxyPool.reportFailure(usedProxyUrl);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 300));
        continue;
      }
    }
  }

  const safeTargetUrl = sanitizeUrlForLogging(targetUrl);

  if (!response) {
    console.error(`[Proxy Error] All ${maxAttempts} attempts failed for ${safeTargetUrl}:`, lastError?.message);
    return NextResponse.json(
      { ok: false, message: `Proxy failed after ${maxAttempts} attempts`, detail: lastError?.message, url: safeTargetUrl },
      { status: 502 }
    );
  }

  if (response.status === 403 || response.status === 401) {
    console.error(`[Proxy] Upstream blocked (${response.status}) on ${safeTargetUrl}`);
    return NextResponse.json(
      {
        ok: false,
        message: `Upstream server blocked the request (HTTP ${response.status}). Try using the Cloudflare Worker proxy instead.`,
        upstreamStatus: response.status,
        url: safeTargetUrl,
      },
      { status: response.status }
    );
  }

  if (response.status >= 400) {
    return NextResponse.json(
      { ok: false, message: `Upstream error: HTTP ${response.status}`, upstreamStatus: response.status, url: safeTargetUrl },
      { status: response.status }
    );
  }

  // ── Prepare Response Headers ───────────────────────────────────────────────
  const resHeaders = new Headers();
  const contentType = (response.headers['content-type'] as string) || '';

  Object.entries(response.headers).forEach(([key, val]) => {
    const lowerKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerKey) && val !== undefined) {
      resHeaders.set(key, Array.isArray(val) ? val.join(', ') : String(val));
    }
  });

  const requestOrigin = req.headers.get('origin');
  const allowedOriginEnv = process.env.CORS_ALLOWED_ORIGIN || process.env.CORS_ALLOWED_ORIGINS || '*';
  let corsOrigin = '*';
  if (allowedOriginEnv !== '*') {
    const allowed = allowedOriginEnv.split(',').map(s => s.trim());
    if (requestOrigin && allowed.includes(requestOrigin)) {
      corsOrigin = requestOrigin;
    } else {
      corsOrigin = allowed[0] || '';
    }
  }

  if (corsOrigin) {
    resHeaders.set('Access-Control-Allow-Origin', corsOrigin);
  }
  resHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  resHeaders.set('Access-Control-Allow-Headers', '*');
  resHeaders.set('X-Content-Type-Options', 'nosniff');
  resHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  resHeaders.set('X-Accel-Buffering', 'no');

  const isManifest = /\.m3u8/i.test(targetUrl) || contentType.includes('mpegurl') || contentType.includes('m3u8');
  const isSubtitle = /\.(vtt|srt|ass)$/i.test(targetUrl) || contentType.includes('vtt');

  // ── Subtitle Response ──────────────────────────────────────────────────────
  if (isSubtitle) {
    resHeaders.set('Content-Type', 'text/vtt; charset=utf-8');
    resHeaders.set('Cache-Control', 'public, max-age=3600');
    const webStream = Readable.toWeb(response.data) as ReadableStream<Uint8Array>;
    return new Response(webStream, { status: response.status, headers: resHeaders });
  }

  // ── HLS Playlist Rewriting ────────────────────────────────────────────────
  if (isManifest) {
    resHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
    resHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    const chunks: Uint8Array[] = [];
    const stream = response.data;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf-8');
    const baseUrl = new URL(targetUrl);
    const proxyPath = `${origin}/api/proxy`;

    const rewrittenText = text
      .split('\n')
      .map((line) => {
        if (line.includes('URI=')) {
          line = line.replace(/URI=["']([^"']+)["']/g, (match, uri) => {
            try {
              let keyUrl = uri.startsWith('http') ? uri : new URL(uri, baseUrl).toString();
              keyUrl = remapMirrorUrl(keyUrl);

              let proxied = `${proxyPath}?url=${encodeURIComponent(keyUrl)}`;
              if (referer) proxied += `&referer=${encodeURIComponent(referer)}`;
              if (authorizedProxy) proxied += `&proxy=${encodeURIComponent(authorizedProxy)}`;
              return `URI="${proxied}"`;
            } catch {
              return match;
            }
          });
        }

        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        try {
          let segmentUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).toString();
          segmentUrl = remapMirrorUrl(segmentUrl);

          let proxied = `${proxyPath}?url=${encodeURIComponent(segmentUrl)}`;
          if (referer) proxied += `&referer=${encodeURIComponent(referer)}`;
          if (authorizedProxy) proxied += `&proxy=${encodeURIComponent(authorizedProxy)}`;
          return proxied;
        } catch {
          return line;
        }
      })
      .join('\n');

    return new Response(rewrittenText, {
      status: response.status,
      headers: resHeaders,
    });
  }

  // ── Video / Audio Binary Streaming (Zero-Copy ReadableStream) ────────────
  const isRealMedia =
    contentType.includes('video') ||
    contentType.includes('audio') ||
    contentType.includes('octet-stream') ||
    contentType.includes('mp4') ||
    contentType.includes('mpeg');

  resHeaders.set('Content-Type', isRealMedia ? contentType : 'application/octet-stream');
  resHeaders.set('Cache-Control', 'public, max-age=7200, immutable');

  const webStream = Readable.toWeb(response.data) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: response.status === 206 ? 206 : response.status,
    headers: resHeaders,
  });
}
