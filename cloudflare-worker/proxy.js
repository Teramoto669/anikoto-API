// ── Cloudflare Worker High-Volume Production Proxy ──────────────────────────

const BROWSER_FINGERPRINTS = [
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
    'Accept-Language': 'en-US,en;q=0.5',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Accept-Language': 'en-US,en;q=0.9',
  },
];

function getRandomHeaders() {
  const index = Math.floor(Math.random() * BROWSER_FINGERPRINTS.length);
  return BROWSER_FINGERPRINTS[index];
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
};

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

/** Constant-time string equality check to prevent timing side-channels */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  let c = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    c |= aBuf[i] ^ bBuf[i];
  }
  return c === 0;
}

function isPrivateIp(ip) {
  // IPv4 dot-decimal
  const v4Parts = ip.split('.').map((p) => parseInt(p, 10));
  if (v4Parts.length === 4 && v4Parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [a, b, c] = v4Parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true; // Multicast & Reserved
    return false;
  }

  // IPv6
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::' || norm === '0:0:0:0:0:0:0:1' || norm === '0:0:0:0:0:0:0:0') return true;
  if (norm.startsWith('::ffff:')) return isPrivateIp(norm.replace('::ffff:', ''));
  if (/^f[cd][0-9a-f]{2}:/i.test(norm)) return true; // Unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/i.test(norm)) return true; // Link-local fe80::/10
  if (/^ff[0-9a-f]{2}:/i.test(norm)) return true; // Multicast
  return false;
}

function isPrivateUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return true;
    if (parsed.username || parsed.password) return true;

    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }

    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.home') ||
      host.endsWith('.corp') ||
      host.endsWith('.test')
    ) {
      return true;
    }

    if (
      host === 'metadata.google.internal' ||
      host === 'metadata' ||
      host === '169.254.169.254' ||
      host === '100.100.100.200'
    ) {
      return true;
    }

    // Single integer IP representation (e.g. 2130706433)
    if (/^\d+$/.test(host)) {
      const num = parseInt(host, 10);
      if (!isNaN(num) && num >= 0 && num <= 4294967295) {
        const a = (num >>> 24) & 255;
        const b = (num >>> 16) & 255;
        const c = (num >>> 8) & 255;
        const d = num & 255;
        return isPrivateIp(`${a}.${b}.${c}.${d}`);
      }
      return true;
    }

    // Check hex or octal segments
    if (host.includes('.') && host.split('.').every((seg) => /^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(seg))) {
      const parts = host.split('.').map((seg) => {
        if (seg.startsWith('0x') || seg.startsWith('0X')) return parseInt(seg, 16);
        if (seg.length > 1 && seg.startsWith('0')) return parseInt(seg, 8);
        return parseInt(seg, 10);
      });
      if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
        return isPrivateIp(parts.join('.'));
      }
      return true;
    }

    return isPrivateIp(host);
  } catch (_) {
    return true;
  }
}

// ── Dynamic & Secure Streaming Media Validator ────────────────────────────
const BLOCKED_FILE_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.sh', '.bat', '.cmd', '.ps1', '.bash',
  '.apk', '.ipa', '.jar', '.msi', '.bin', '.app',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.php', '.asp', '.aspx', '.jsp', '.cgi', '.py', '.rb', '.pl',
  '.env', '.git', '.htaccess', '.conf', '.ini', '.sql', '.yaml', '.yml'
]);

/**
 * Validates whether an outgoing target URL is safe and legitimate for streaming proxy.
 * Eliminates manual domain whitelisting while ensuring multi-layered security:
 * 1. Protocol & Port restriction (HTTP/HTTPS, 80/443 only)
 * 2. Strict blacklist on hazardous extensions & path traversal
 * 3. Dynamic media pattern & streaming signature verification
 * 4. Caller client validation (reject direct browser navigation document/iframe)
 */
function isAllowedStreamTarget(targetUrl, request, env) {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();

    // 1. Protocols & Ports
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return false;
    if (parsed.username || parsed.password) return false;
    if (!host.includes('.')) return false; // Hostname must be FQDN, not single label intranet

    // 2. Reject Path Traversal
    if (pathname.includes('../') || pathname.includes('..\\') || pathname.includes('%2e%2e')) {
      return false;
    }

    // 3. Block Dangerous File Extensions
    for (const ext of BLOCKED_FILE_EXTENSIONS) {
      if (pathname.endsWith(ext) || pathname.includes(ext + '?')) {
        return false;
      }
    }

    // 4. Reject Direct Browser Top-Level Navigation
    if (request) {
      const secFetchDest = request.headers.get('Sec-Fetch-Dest');
      if (secFetchDest === 'document' || secFetchDest === 'iframe') {
        return false;
      }
    }

    // 5. Explicit whitelist override from environment (if configured)
    const allowedEnv = env && env.ALLOWED_PROXY_HOSTS ? env.ALLOWED_PROXY_HOSTS.trim() : '';
    if (allowedEnv === '*') return true;
    if (allowedEnv) {
      const explicitHosts = allowedEnv.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
      if (explicitHosts.some((domain) => host === domain || host.endsWith('.' + domain))) {
        return true;
      }
    }

    // 6. Dynamic Streaming Media Identification
    // Manifests (m3u8, mpd), video segments (ts, m4s, mp4, aac, m4a, webm), subtitles (vtt, srt, ass), DRM keys (key)
    const isMediaExtension = /\.(m3u8|mpd|ts|m4s|mp4|aac|m4a|webm|vtt|srt|ass|key)($|\?)/i.test(pathname + search);

    // Segment naming conventions used by HLS / DASH / Video CDNs
    const isSegmentPattern =
      /\/seg-[a-z0-9_.-]+/i.test(pathname) ||
      /\/segment-[a-z0-9_.-]+/i.test(pathname) ||
      /\/frag-[a-z0-9_.-]+/i.test(pathname) ||
      /\/index[a-z0-9_.-]*\.(m3u8|ts)/i.test(pathname) ||
      /\/master[a-z0-9_.-]*\.m3u8/i.test(pathname) ||
      /\/playlist[a-z0-9_.-]*\.m3u8/i.test(pathname) ||
      /\/subtitles?\//i.test(pathname) ||
      /\/tracks?\//i.test(pathname) ||
      pathname.includes('~tplv-'); // TikTok/ByteDance CDN video chunks

    // Streaming signatures & CDN tokens
    const hasStreamingSignature =
      /(\/anime\/|\/hls\/|\/stream\/|\/video\/|\/videojs\/)/i.test(pathname) ||
      parsed.searchParams.has('x-expires') ||
      parsed.searchParams.has('x-signature') ||
      parsed.searchParams.has('token') ||
      parsed.searchParams.has('sig') ||
      parsed.searchParams.has('signature') ||
      parsed.searchParams.has('auth_key') ||
      parsed.searchParams.has('hash') ||
      parsed.searchParams.has('lk3s');

    return isMediaExtension || isSegmentPattern || hasStreamingSignature;
  } catch (_) {
    return false;
  }
}

/**
 * Normalizes dead, stale, or rate-limited upstream CDN mirror hosts to active origins.
 */
function remapMirrorUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // 1. ncdn.imgnex.top is obsolete / returns 404. Normalize to active cdn.imgnex.top!
    if (host === 'ncdn.imgnex.top') {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }

    // 2. bb.akirax.buzz and .snapcdn.top mirror mapping
    if (host === 'bb.akirax.buzz' && pathname.startsWith('/anime/')) {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }
    if (host.endsWith('.snapcdn.top') && pathname.startsWith('/anime/')) {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }

    // 3. Stale buzz / click mirrors
    const isDeadBuzz = host.includes('zaplume.buzz') || host.includes('mewstream.buzz');
    if (isDeadBuzz || (host.endsWith('.click') && !host.includes('akirax.buzz'))) {
      parsed.host = 'cdn.imgnex.top';
      return parsed.toString();
    }

    return parsed.toString();
  } catch (_) {
    return urlStr;
  }
}

export default {
  async fetch(request, env) {
    // ── Handle CORS Preflight ───────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { searchParams, origin } = new URL(request.url);
    const target = searchParams.get('url');
    const referer = searchParams.get('referer') || request.headers.get('Referer') || '';
    const rawCustomProxy = searchParams.get('proxy') || request.headers.get('x-proxy-target');
    const mode = searchParams.get('mode'); // 'scrape' = server-side HTML/JSON scraping mode
    const isScrapeMode = mode === 'scrape';

    // ── Secret Key Auth (For backend scraping mode) ─────────────────────────
    if (isScrapeMode && env.WORKER_SECRET) {
      const provided = request.headers.get('X-Worker-Secret') || '';
      if (!timingSafeEqual(provided, env.WORKER_SECRET)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
      }
    }

    if (!target) {
      return Response.json({ error: 'Missing url parameter' }, { status: 400, headers: CORS_HEADERS });
    }

    // ── SSRF Guard ─────────────────────────────────────────────────────────
    if (isPrivateUrl(target)) {
      return Response.json(
        { error: 'Access to private network addresses is restricted' },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // ── Dynamic Streaming Media Validator ──────────────────────────────────
    if (!isScrapeMode && !isAllowedStreamTarget(target, request, env)) {
      return Response.json(
        { error: 'Target host or media pattern is not authorized for proxy streaming' },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // ── Target URL Normalization & Stale Mirror Remapping ──────────────────
    let targetUrl = remapMirrorUrl(target);

    // ── Build Upstream Request Headers ─────────────────────────────────────
    const clientUserAgent = request.headers.get('User-Agent');
    const clientSecChUa = request.headers.get('sec-ch-ua');
    const clientSecChUaMobile = request.headers.get('sec-ch-ua-mobile');
    const clientSecChUaPlatform = request.headers.get('sec-ch-ua-platform');
    const clientAcceptLanguage = request.headers.get('Accept-Language');

    const fp = getRandomHeaders();
    const upstreamHeaders = new Headers();
    upstreamHeaders.set('User-Agent', clientUserAgent || fp['User-Agent']);
    upstreamHeaders.set('Accept', '*/*');
    upstreamHeaders.set('Accept-Encoding', 'gzip, deflate, br');
    upstreamHeaders.set('Accept-Language', clientAcceptLanguage || fp['Accept-Language']);

    const isXhrRequest = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
    const incomingAccept = request.headers.get('Accept');

    if (isScrapeMode && !isXhrRequest) {
      upstreamHeaders.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
      upstreamHeaders.set('Sec-Fetch-Dest', 'document');
      upstreamHeaders.set('Sec-Fetch-Mode', 'navigate');
      upstreamHeaders.set('Sec-Fetch-Site', 'none');
      upstreamHeaders.set('Sec-Fetch-User', '?1');
      upstreamHeaders.set('Upgrade-Insecure-Requests', '1');
      upstreamHeaders.set('Cache-Control', 'max-age=0');
      upstreamHeaders.set('Priority', 'u=0, i');
      if (env.SCRAPE_COOKIE) upstreamHeaders.set('Cookie', env.SCRAPE_COOKIE);
    } else if (isScrapeMode && isXhrRequest) {
      upstreamHeaders.set('Accept', incomingAccept || 'application/json, text/javascript, */*; q=0.01');
      upstreamHeaders.set('X-Requested-With', 'XMLHttpRequest');
      upstreamHeaders.set('Sec-Fetch-Dest', 'empty');
      upstreamHeaders.set('Sec-Fetch-Mode', 'cors');
      upstreamHeaders.set('Sec-Fetch-Site', 'same-origin');
      try { upstreamHeaders.set('Referer', new URL(target).origin + '/'); } catch (_) {}
      if (env.SCRAPE_COOKIE) upstreamHeaders.set('Cookie', env.SCRAPE_COOKIE);
    } else {
      upstreamHeaders.set('Sec-Fetch-Dest', 'empty');
      upstreamHeaders.set('Sec-Fetch-Mode', 'cors');
      upstreamHeaders.set('Sec-Fetch-Site', 'cross-site');
    }

    if (fp['sec-ch-ua']) upstreamHeaders.set('sec-ch-ua', fp['sec-ch-ua']);
    if (fp['sec-ch-ua-mobile']) upstreamHeaders.set('sec-ch-ua-mobile', fp['sec-ch-ua-mobile']);
    if (fp['sec-ch-ua-platform']) upstreamHeaders.set('sec-ch-ua-platform', fp['sec-ch-ua-platform']);

    if (referer) {
      upstreamHeaders.set('Referer', referer);
      try {
        upstreamHeaders.set('Origin', new URL(referer).origin);
      } catch (_) {}
    }

    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      upstreamHeaders.set('Range', rangeHeader);
    }

    // ── Upstream Fetch with Retries ──────────────────────────────────────────
    const maxAttempts = 3;
    let upstreamRes = null;
    let lastErr = null;

    const envProxies = env && env.PROXIES ? env.PROXIES.split(',').map((p) => p.trim()).filter(Boolean) : [];
    // Only accept customProxy if it is among authorized env.PROXIES
    const safeCustomProxy = rawCustomProxy && envProxies.includes(rawCustomProxy) ? rawCustomProxy : null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const isMediaChunk = !/\.m3u8/i.test(targetUrl) && !/\.(vtt|srt|ass)($|\?)/i.test(targetUrl) && !isScrapeMode;
        const fetchOptions = {
          headers: upstreamHeaders,
          redirect: 'follow',
          ...(isMediaChunk ? { cf: { cacheEverything: true, cacheTtl: 86400 } } : {}),
        };

        if (safeCustomProxy || envProxies.length > 0) {
          const selectedProxy = safeCustomProxy || envProxies[Math.floor(Math.random() * envProxies.length)];
          if (selectedProxy) {
            upstreamHeaders.set('X-Forwarded-Proxy', selectedProxy);
          }
        }

        upstreamRes = await fetch(targetUrl, fetchOptions);

        if (upstreamRes.status === 404 || upstreamRes.status === 429 || upstreamRes.status === 403 || upstreamRes.status >= 500) {
          try {
            const parsed = new URL(targetUrl);
            if (parsed.pathname.startsWith('/anime/')) {
              for (const fallbackHost of ['cdn.imgnex.top', 'fetch.nexabloom.top']) {
                if (parsed.host === fallbackHost) continue;
                parsed.host = fallbackHost;
                const fallbackUrl = parsed.toString();
                const fbRes = await fetch(fallbackUrl, fetchOptions);
                if (fbRes.ok) {
                  upstreamRes = fbRes;
                  targetUrl = fallbackUrl;
                  break;
                }
              }
            }
          } catch (_) {}
        }

        if (upstreamRes.status === 403 || upstreamRes.status === 429 || upstreamRes.status >= 500) {
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, attempt * 300));
            continue;
          }
        } else {
          break;
        }
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 300));
          continue;
        }
      }
    }

    if (!upstreamRes) {
      return Response.json(
        { error: 'Failed to reach upstream after retries' },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    if (!upstreamRes.ok) {
      return Response.json(
        { error: `Upstream returned HTTP ${upstreamRes.status}` },
        { status: upstreamRes.status, headers: CORS_HEADERS }
      );
    }

    // ── Process Response Headers ───────────────────────────────────────────
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isManifest = /\.m3u8/i.test(targetUrl) || contentType.includes('mpegurl') || contentType.includes('m3u8');
    const isSubtitle = /\.(vtt|srt|ass)$/i.test(targetUrl) || contentType.includes('vtt');
    const isSegment =
      /\/seg-[a-z0-9_.-]+/i.test(targetUrl) ||
      /\/segment-[a-z0-9_.-]+/i.test(targetUrl) ||
      /\/frag-[a-z0-9_.-]+/i.test(targetUrl) ||
      /\.(ts|m4s|mp4|aac|m4a|webm)($|\?)/i.test(targetUrl) ||
      targetUrl.includes('~tplv-');
    const isRealMedia =
      isSegment ||
      contentType.includes('video') ||
      contentType.includes('audio') ||
      contentType.includes('octet-stream') ||
      contentType.includes('mp4') ||
      contentType.includes('mpeg') ||
      contentType.includes('dash+xml') ||
      contentType.includes('image/');

    // Security check: If not in scrape mode, reject unexpected HTML or non-media payloads
    if (!isScrapeMode && !isManifest && !isSubtitle && !isSegment && !isRealMedia && contentType.includes('text/html')) {
      return Response.json(
        { error: 'Upstream returned invalid content type for media proxy' },
        { status: 415, headers: CORS_HEADERS }
      );
    }

    if (isScrapeMode) {
      const scrapeHeaders = new Headers();
      scrapeHeaders.set('Content-Type', contentType || 'text/html; charset=utf-8');
      scrapeHeaders.set('Cache-Control', 'no-store');
      Object.entries(CORS_HEADERS).forEach(([k, v]) => scrapeHeaders.set(k, v));
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: scrapeHeaders,
      });
    }

    const resHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
        resHeaders.set(key, value);
      }
    });

    Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));

    // ── Subtitles ───────────────────────────────────────────────────────────
    if (isSubtitle) {
      resHeaders.set('Content-Type', 'text/vtt; charset=utf-8');
      resHeaders.set('Cache-Control', 'public, max-age=3600');
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: resHeaders,
      });
    }

    // ── HLS Manifest Playlist Rewriting ──────────────────────────────────────
    if (isManifest) {
      const workerBase = origin;
      const text = await upstreamRes.text();

      const rewritten = text
        .split('\n')
        .map((line) => {
          if (line.includes('CODECS=')) {
            line = line.replace(/mp4a\.40\.29/g, 'mp4a.40.2').replace(/mp4a\.40\.5/g, 'mp4a.40.2');
          }

          if (line.includes('URI=')) {
            line = line.replace(/URI=["']([^"']+)["']/g, (match, uri) => {
              try {
                let abs = uri.startsWith('http') ? uri : new URL(uri, targetUrl).toString();
                abs = remapMirrorUrl(abs);

                let proxied = `${workerBase}/?url=${encodeURIComponent(abs)}`;
                if (referer) proxied += `&referer=${encodeURIComponent(referer)}`;
                if (safeCustomProxy) proxied += `&proxy=${encodeURIComponent(safeCustomProxy)}`;
                return `URI="${proxied}"`;
              } catch {
                return match;
              }
            });
          }

          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;

          try {
            let resolved = trimmed.startsWith('http') ? trimmed : new URL(trimmed, targetUrl).toString();
            resolved = remapMirrorUrl(resolved);

            let proxied = `${workerBase}/?url=${encodeURIComponent(resolved)}`;
            if (referer) proxied += `&referer=${encodeURIComponent(referer)}`;
            if (safeCustomProxy) proxied += `&proxy=${encodeURIComponent(safeCustomProxy)}`;
            return proxied;
          } catch {
            return line;
          }
        })
        .join('\n');

      resHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      resHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');

      return new Response(rewritten, {
        status: upstreamRes.status,
        headers: resHeaders,
      });
    }

    // ── Video / Audio Media Stream (Zero-Copy Pass-Through) ───────────────
    let outgoingContentType = contentType || 'application/octet-stream';
    if (isSegment && (contentType.includes('text/html') || contentType.includes('image/'))) {
      outgoingContentType = 'video/mp2t';
    } else if (!isRealMedia) {
      outgoingContentType = 'application/octet-stream';
    }

    resHeaders.set('Content-Type', outgoingContentType);
    resHeaders.set('Cache-Control', 'public, max-age=86400, immutable');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: resHeaders,
    });
  },
};
