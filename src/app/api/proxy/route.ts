import { NextResponse } from 'next/server';
import { DEFAULT_HEADERS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** Playlists are tiny and need rewriting, so they are read fully; media is streamed. */
const PLAYLIST_HINT_RE = /\.m3u8($|\?)|mpegurl/i;

/**
 * Loopback / RFC1918 / link-local / cloud metadata. Anchored, because a prefix match
 * would also reject legitimate public hosts such as `10.example.com`. WHATWG
 * normalises IPv4 shorthands (`127.1`, `2130706433`, `0x7f.1`) to dotted quads before
 * we ever see the hostname, so matching the parsed host covers those too.
 */
const PRIVATE_HOST_RE = /^(?:localhost|.*\.localhost|0\.0\.0\.0|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|\[::1\]|\[fe80:[0-9a-f:]+\])\.?$/i;

/**
 * Private targets stay reachable in local development (mock upstreams, a media
 * server on the LAN) but are refused on a deployed instance, where an open
 * `/api/proxy` would otherwise be an SSRF primitive.
 * Override explicitly with PROXY_ALLOW_PRIVATE_TARGETS=1|0.
 */
const PRIVATE_TARGETS_ALLOWED = (() => {
  const flag = (process.env.PROXY_ALLOW_PRIVATE_TARGETS || '').toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
})();

const MAX_REDIRECTS = 5;
/** Time allowed for the upstream to answer (connect + response headers). */
const HEADERS_TIMEOUT_MS = 20_000;
/** Time allowed for the first body chunk after the headers. */
const FIRST_CHUNK_TIMEOUT_MS = 20_000;
/** Silence tolerated mid-transfer. Re-armed on every chunk, so long downloads are
 *  never cut short — only CDNs that genuinely stop sending are. */
const IDLE_TIMEOUT_MS = 120_000;

class TargetRejected extends Error {}

function resolveTarget(raw: string, base?: URL): URL {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    throw new TargetRejected('Invalid url parameter');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetRejected(`Unsupported scheme: ${url.protocol.replace(':', '')}`);
  }
  if (url.username || url.password) {
    throw new TargetRejected('Credentials in the target URL are not allowed');
  }
  if (!PRIVATE_TARGETS_ALLOWED && PRIVATE_HOST_RE.test(url.hostname)) {
    throw new TargetRejected('Private, loopback and link-local targets are not allowed');
  }
  return url;
}

function buildHeaders(referer: string | null, range: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_HEADERS['User-Agent'],
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };

  if (referer) {
    headers['Referer'] = referer;
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      // ignore malformed referer
    }
  }

  // Forward Range header if present (needed for partial content / video seeking)
  if (range) headers['Range'] = range;

  return headers;
}

/** Follow redirects manually so every hop is validated against the SSRF guard. */
async function fetchUpstream(start: URL, headers: Record<string, string>, signal: AbortSignal) {
  let target = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target, { headers, redirect: 'manual', cache: 'no-store', signal });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      const next = resolveTarget(location, target); // throws for private/unsupported hops
      await response.body?.cancel().catch(() => {});
      target = next;
      continue;
    }
    return { response, target };
  }
  throw new TargetRejected(`Too many redirects (max ${MAX_REDIRECTS})`);
}

/**
 * Drop the upstream connection when it stops producing data.
 * The first chunk gets a short deadline (a CDN that answers and then goes quiet is
 * broken), after which the timer is re-armed on every chunk with the longer idle
 * window so a slow-but-alive transfer is never cut short. `pull` only runs when the
 * consumer wants more, so client backpressure is not mistaken for a dead upstream.
 */
function withDataTimeouts(
  source: ReadableStream<Uint8Array>,
  abort: (reason: unknown) => void,
  { firstChunkMs, idleMs }: { firstChunkMs: number; idleMs: number }
) {
  const reader = source.getReader();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sawData = false;
  const disarm = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const arm = () => {
    disarm();
    timer = setTimeout(
      () => abort(new DOMException(sawData ? 'Upstream stalled' : 'Upstream sent no data', 'TimeoutError')),
      sawData ? idleMs : firstChunkMs
    );
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      arm();
      try {
        const { done, value } = await reader.read();
        if (done) {
          disarm();
          controller.close();
          return;
        }
        sawData = true;
        controller.enqueue(value);
      } catch (err) {
        disarm();
        controller.error(err);
      }
    },
    cancel(reason) {
      disarm();
      return reader.cancel(reason);
    },
  });
}

/** Rewrite absolute/relative playlist entries so they keep flowing through this proxy. */
/**
 * ByteDance/Volcengine-style playlists mix ad creatives, thumbnails and subtitle
 * sidecars into the media stream. They are not media, so rewriting them into
 * `/api/proxy` URLs just invites junk (and ad-CDN) traffic from whichever player
 * consumes this playlist.
 */
const NON_SEGMENT_TAGS = /^#EXT-X-(?:IMAGE-STREAM-INF|I-FRAME-STREAM-INF)/i;
const NON_MEDIA_URL_RE = /\.(?:image|png|jpe?g|gif|webp|avif|bmp|svg|ico|vtt|srt|ass|ssa|html?|json|xml|css|js|txt)(?:[?#]|$)/i;

/** True when a playlist line must never be turned into a proxy URL. */
function isNonMediaEntry(line: string, prevTag: string): boolean {
  if (!line || line.startsWith('#')) return false;
  if (prevTag && NON_SEGMENT_TAGS.test(prevTag)) return true;
  return NON_MEDIA_URL_RE.test(line);
}

function rewritePlaylist(text: string, targetUrl: string, referer: string | null): string {
  const baseUrl = new URL(targetUrl);
  const proxied = (raw: string) => {
    const absolute = raw.startsWith('http') ? raw : new URL(raw, baseUrl).toString();
    return `/api/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(referer || '')}`;
  };

  let prevTag = '';
  return text
    .split('\n')
    .map((line) => {
      // Rewrite URI attributes in tags (e.g. #EXT-X-KEY:URI="...", #EXT-X-MAP:URI="...")
      if (line.includes('URI=')) {
        line = line.replace(/URI=["']([^"']+)["']/g, (_match, uri: string) =>
          isNonMediaEntry(uri, prevTag) ? `URI="${uri}"` : `URI="${proxied(uri)}"`
        );
      }
      if (line.startsWith('#')) { prevTag = line; return line; }
      if (!line.trim()) return line;
      // Media segment or sub-playlist line
      if (isNonMediaEntry(line.trim(), prevTag)) return line;
      return proxied(line.trim());
    })
    .join('\n');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  const referer = searchParams.get('referer');

  if (!targetUrl) {
    return NextResponse.json({ ok: false, message: 'Missing url parameter' }, { status: 400 });
  }

  let start: URL;
  try {
    start = resolveTarget(targetUrl);
  } catch (err) {
    const message = err instanceof TargetRejected ? err.message : 'Invalid url parameter';
    console.error(`[Proxy] Rejected target: ${message} (${targetUrl})`);
    return NextResponse.json({ ok: false, message, url: targetUrl }, { status: 400 });
  }

  const headers = buildHeaders(referer, req.headers.get('range'));
  // The client disconnecting (or our watchdog firing) aborts the upstream request too.
  const controller = new AbortController();
  const canCombineSignals = typeof AbortSignal.any === 'function';
  if (!canCombineSignals) req.signal.addEventListener('abort', () => controller.abort(), { once: true });
  const signal = canCombineSignals ? AbortSignal.any([req.signal, controller.signal]) : controller.signal;

  const headersTimer = setTimeout(
    () => controller.abort(new DOMException('Upstream did not respond', 'TimeoutError')),
    HEADERS_TIMEOUT_MS
  );

  try {
    const { response: upstream, target } = await fetchUpstream(start, headers, signal);
    clearTimeout(headersTimer);

    // Upstream blocked us (403/401): return the real status with a helpful message
    if (upstream.status === 403 || upstream.status === 401) {
      await upstream.body?.cancel().catch(() => {});
      console.error(`[Proxy] Upstream blocked: ${upstream.status} on ${target.href}`);
      return NextResponse.json(
        {
          ok: false,
          message: `Upstream server blocked the request (HTTP ${upstream.status}). Try using the Cloudflare Worker proxy instead.`,
          upstreamStatus: upstream.status,
          url: target.href,
        },
        { status: upstream.status }
      );
    }

    if (upstream.status >= 400) {
      await upstream.body?.cancel().catch(() => {});
      console.error(`[Proxy] Upstream error: ${upstream.status} on ${target.href}`);
      return NextResponse.json(
        { ok: false, message: `Upstream error: HTTP ${upstream.status}`, upstreamStatus: upstream.status, url: target.href },
        { status: upstream.status }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    // fetch() decodes compressed payloads transparently, so an upstream
    // content-length/content-range would describe bytes we are not sending. Only
    // forward them for identity-encoded responses, otherwise clients truncate.
    const encoded = upstream.headers.has('content-encoding');
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', contentType);
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Cache-Control', 'no-cache');
    for (const h of ['accept-ranges', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) resHeaders.set(h, v);
    }
    if (!encoded) {
      for (const h of ['content-length', 'content-range']) {
        const v = upstream.headers.get(h);
        if (v) resHeaders.set(h, v);
      }
    }

    const status = upstream.status === 206 ? 206 : upstream.ok ? 200 : upstream.status;

    if (PLAYLIST_HINT_RE.test(target.href) || contentType.includes('mpegurl')) {
      const text = Buffer.from(await upstream.arrayBuffer()).toString('utf-8');
      return new NextResponse(rewritePlaylist(text, target.href, referer), { status, headers: resHeaders });
    }

    if (!upstream.body) {
      return new NextResponse(null, { status, headers: resHeaders });
    }

    // Media (segments, mp4) is piped straight through — no buffering, no re-encoding,
    // no compression round-trip. Bytes reach the browser as the CDN produces them.
    const body = withDataTimeouts(upstream.body, (reason) => controller.abort(reason), {
      firstChunkMs: FIRST_CHUNK_TIMEOUT_MS,
      idleMs: IDLE_TIMEOUT_MS,
    });
    return new NextResponse(body, { status, headers: resHeaders });
  } catch (err: unknown) {
    clearTimeout(headersTimer);
    const name = err instanceof Error ? err.name : '';
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (err instanceof TargetRejected) {
      return NextResponse.json({ ok: false, message: err.message, url: targetUrl }, { status: 400 });
    }
    if (name === 'TimeoutError') {
      console.error(`[Proxy] Upstream timeout on ${targetUrl}`);
      return NextResponse.json({ ok: false, message: 'Upstream did not respond in time', url: targetUrl }, { status: 504 });
    }
    // Keep the response generic but log the underlying cause (DNS, TLS, ECONNREFUSED, …)
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
    console.error(`[Proxy Error] ${message}${cause} on ${targetUrl}`);
    return NextResponse.json({ ok: false, message: `Proxy request failed: ${message}`, url: targetUrl }, { status: 502 });
  }
}
