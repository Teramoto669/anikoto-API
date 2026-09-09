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

/**
 * Validates whether an IP address is private, loopback, or internal cloud metadata.
 */
function isPrivateIp(ip) {
  const cleanIp = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv4 checks
  const ipv4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true;  // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 0) return true; // 0.0.0.0/8 current network
    if (a === 100 && (b >= 64 && b <= 127)) return true; // Carrier NAT & Alibaba metadata
    return false;
  }

  // IPv6 checks
  if (
    cleanIp === '::1' ||
    cleanIp === '::' ||
    cleanIp.startsWith('fc') ||
    cleanIp.startsWith('fd') ||
    cleanIp.startsWith('fe80') ||
    cleanIp.startsWith('::ffff:')
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a target URL is private or points to an internal network address.
 */
function isPrivateUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    if (parsed.username || parsed.password) return true;

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan')
    ) {
      return true;
    }

    if (host === 'metadata.google.internal' || host.includes('169.254.169.254')) {
      return true;
    }

    if (isPrivateIp(host)) return true;

    return false;
  } catch (_) {
    return true;
  }
}

/**
 * Allowed video stream and CDN domains to prevent open forward proxy abuse.
 */
const DEFAULT_ALLOWED_STREAM_PATTERNS = [
  'cdn.imgnex.top',
  '*.imgnex.top',
  '*.snapcdn.top',
  '*.lostproject.club',
  'bb.akirax.buzz',
  '*.akirax.buzz',
  '*.zaplume.buzz',
  '*.mewstream.buzz',
  '*.megaplay.buzz',
  '*.vidstream.buzz',
  '*.xoticsky.top',
  '*.owocdn.top',
  '*.vidwish.live',
  '*.megacloud.blog',
  '*.megacloud.bloggy.click',
  '*.vidtube.site',
  '*.akamaized.net',
  '*.anikoto.net',
  '*.anikototv.to',
  '*.rapid-cloud.ru',
  '*.bunnycdn.ru',
  '*.streamwish.to',
  '*.filelions.to',
  '*.doodstream.com',
  '*.streamtape.com',
  '*.mp4upload.com',
  '*.anipixcdn.co',
  '*.chiaki.site',
];

function isAllowedStreamDomain(targetUrl, env) {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    const envAllowed = env && (env.ALLOWED_STREAM_DOMAINS || env.ALLOWED_PROXY_HOSTS)
      ? (env.ALLOWED_STREAM_DOMAINS || env.ALLOWED_PROXY_HOSTS).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    const allPatterns = [...DEFAULT_ALLOWED_STREAM_PATTERNS, ...envAllowed];
    for (const pattern of allPatterns) {
      if (pattern.startsWith('*.')) {
        const root = pattern.slice(2);
        if (host === root || host.endsWith('.' + root)) return true;
      } else if (host === pattern) {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Normalizes dead, stale, or rate-limited upstream CDN mirror hosts to the active high-capacity cdn.imgnex.top origin.
 */
function remapMirrorUrl(urlStr) {
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
  } catch (_) {
    return urlStr;
  }
}

export default {
  /**
   * Cloudflare Worker dedicated exclusively to video streaming proxying.
   * Proxies HLS manifests, media chunks, AES encryption keys, and subtitles.
   */
  async fetch(request, env) {
    // ── Handle CORS Preflight ───────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { searchParams, origin } = new URL(request.url);
    const target = searchParams.get('url');
    const referer = searchParams.get('referer');
    const customProxy = searchParams.get('proxy') || request.headers.get('x-proxy-target');

    if (!target) {
      return Response.json({ error: 'Missing url parameter' }, { status: 400, headers: CORS_HEADERS });
    }

    // ── SSRF Guard ─────────────────────────────────────────────────────────
    if (isPrivateUrl(target)) {
      return Response.json({ error: 'Access to private network addresses is restricted' }, { status: 403, headers: CORS_HEADERS });
    }

    // ── Enforce Streaming Domain Allowlist (Prevent Open Forward Proxy) ─────
    if (!isAllowedStreamDomain(target, env)) {
      return Response.json({ error: 'Target host is not permitted for streaming proxy' }, { status: 403, headers: CORS_HEADERS });
    }

    // ── Validate Custom Proxy against Pool (if configured) ─────────────────
    const envProxies = env && env.PROXIES ? env.PROXIES.split(',').map(p => p.trim()).filter(Boolean) : [];
    if (customProxy && envProxies.length > 0 && !envProxies.includes(customProxy)) {
      return Response.json({ error: 'Specified proxy node is not authorized' }, { status: 403, headers: CORS_HEADERS });
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
    upstreamHeaders.set('Sec-Fetch-Dest', 'empty');
    upstreamHeaders.set('Sec-Fetch-Mode', 'cors');
    upstreamHeaders.set('Sec-Fetch-Site', 'cross-site');

    if (fp['sec-ch-ua']) upstreamHeaders.set('sec-ch-ua', fp['sec-ch-ua']);
    if (fp['sec-ch-ua-mobile']) upstreamHeaders.set('sec-ch-ua-mobile', fp['sec-ch-ua-mobile']);
    if (fp['sec-ch-ua-platform']) upstreamHeaders.set('sec-ch-ua-platform', fp['sec-ch-ua-platform']);

    if (referer) {
      upstreamHeaders.set('Referer', referer);
      try {
        upstreamHeaders.set('Origin', new URL(referer).origin);
      } catch (_) { }
    }

    // Forward Range header for video seeking
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      upstreamHeaders.set('Range', rangeHeader);
    }

    // ── Upstream Fetch with Retries ──────────────────────────────────────────
    const maxAttempts = 3;
    let upstreamRes = null;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const isMediaChunk = !/\.m3u8/i.test(targetUrl) && !/\.(vtt|srt|ass)($|\?)/i.test(targetUrl);
        const fetchOptions = {
          headers: upstreamHeaders,
          redirect: 'follow',
          ...(isMediaChunk ? { cf: { cacheEverything: true, cacheTtl: 86400 } } : {}),
        };

        if (customProxy || envProxies.length > 0) {
          const selectedProxy = customProxy || envProxies[Math.floor(Math.random() * envProxies.length)];
          if (selectedProxy) {
            upstreamHeaders.set('X-Forwarded-Proxy', selectedProxy);
          }
        }

        upstreamRes = await fetch(targetUrl, fetchOptions);

        // Fallback for 404, 429, or 403 on rate-limited/dead origins
        if (upstreamRes.status === 404 || upstreamRes.status === 429 || upstreamRes.status === 403) {
          try {
            const parsed = new URL(targetUrl);
            if (parsed.host !== 'cdn.imgnex.top' && parsed.pathname.startsWith('/anime/')) {
              parsed.host = 'cdn.imgnex.top';
              const fallbackUrl = parsed.toString();
              if (fallbackUrl !== targetUrl) {
                const fbRes = await fetch(fallbackUrl, fetchOptions);
                if (fbRes.ok) {
                  upstreamRes = fbRes;
                  targetUrl = fallbackUrl;
                }
              }
            }
          } catch (_) {}
        }

        if (upstreamRes.status === 403 || upstreamRes.status === 429 || upstreamRes.status >= 500) {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, attempt * 300));
            continue;
          }
        } else {
          break;
        }
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, attempt * 300));
          continue;
        }
      }
    }

    if (!upstreamRes) {
      return Response.json(
        { error: 'Failed to reach upstream after retries', detail: String(lastErr) },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    if (!upstreamRes.ok) {
      return Response.json(
        { error: `Upstream returned HTTP ${upstreamRes.status}`, url: targetUrl },
        { status: upstreamRes.status, headers: CORS_HEADERS }
      );
    }

    // ── Process Response Headers ───────────────────────────────────────────
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isManifest = /\.m3u8/i.test(targetUrl) || contentType.includes('mpegurl') || contentType.includes('m3u8');
    const isSubtitle = /\.(vtt|srt|ass)$/i.test(targetUrl) || contentType.includes('vtt');

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
        .map(line => {
          // Normalize audio codecs to prevent MSE decoding buffer error in Chrome (HE-AAC v2)
          if (line.includes('CODECS=')) {
            line = line.replace(/mp4a\.40\.29/g, 'mp4a.40.2').replace(/mp4a\.40\.5/g, 'mp4a.40.2');
          }

          // Rewrite URI attributes in tag lines (AES keys, init maps, sub-playlists)
          if (line.includes('URI=')) {
            line = line.replace(/URI=["']([^"']+)["']/g, (match, uri) => {
              try {
                let abs = uri.startsWith('http') ? uri : new URL(uri, targetUrl).toString();
                abs = remapMirrorUrl(abs);

                let proxied = `${workerBase}/?url=${encodeURIComponent(abs)}`;
                if (referer) proxied += `&referer=${encodeURIComponent(referer)}`;
                if (customProxy) proxied += `&proxy=${encodeURIComponent(customProxy)}`;
                return `URI="${proxied}"`;
              } catch {
                return match;
              }
            });
          }

          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;

          // Segment or sub-playlist lines
          try {
            let resolved = trimmed.startsWith('http') ? trimmed : new URL(trimmed, targetUrl).toString();
            resolved = remapMirrorUrl(resolved);

            let proxied = `${workerBase}/?url=${encodeURIComponent(resolved)}`;
            if (referer) proxied += `&referer=${encodeURIComponent(referer)}`;
            if (customProxy) proxied += `&proxy=${encodeURIComponent(customProxy)}`;
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
    const isRealMedia =
      contentType.includes('video') ||
      contentType.includes('audio') ||
      contentType.includes('octet-stream') ||
      contentType.includes('mp4') ||
      contentType.includes('mpeg');

    resHeaders.set('Content-Type', isRealMedia ? contentType : 'application/octet-stream');
    resHeaders.set('Cache-Control', 'public, max-age=86400, immutable');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: resHeaders,
    });
  },
};
