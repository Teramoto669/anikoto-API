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

function isPrivateUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
    if (host === '::1' || host === '[::1]' || host === '0.0.0.0') return true;
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  } catch (_) {
    return true;
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
    const referer = searchParams.get('referer');
    const customProxy = searchParams.get('proxy') || request.headers.get('x-proxy-target');
    const mode = searchParams.get('mode'); // 'scrape' = server-side HTML/JSON scraping mode
    const isScrapeMode = mode === 'scrape';

    // ── Secret Key Auth (Only for backend scraping mode) ────────────────────
    if (isScrapeMode && env.WORKER_SECRET) {
      const provided = request.headers.get('X-Worker-Secret');
      if (provided !== env.WORKER_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
      }
    }

    if (!target) {
      return Response.json({ error: 'Missing url parameter' }, { status: 400, headers: CORS_HEADERS });
    }

    // ── SSRF Guard ─────────────────────────────────────────────────────────
    if (isPrivateUrl(target)) {
      return Response.json({ error: 'Access to private network addresses is restricted' }, { status: 403, headers: CORS_HEADERS });
    }

    // ── Target URL Normalization & Stale Mirror Remapping ──────────────────
    let targetUrl = target;
    try {
      const parsedTarget = new URL(targetUrl);
      // bb.akirax.buzz does not host /anime/ paths (returns 404). Active origin is cdn.imgnex.top.
      if (parsedTarget.hostname === 'bb.akirax.buzz' && parsedTarget.pathname.startsWith('/anime/')) {
        parsedTarget.host = 'cdn.imgnex.top';
        targetUrl = parsedTarget.toString();
      }
      // Non-master files under ncdn.imgnex.top (child playlists & segments) return 404 or stale mirrors.
      // Active origin for index playlists and media segments is cdn.imgnex.top.
      if (parsedTarget.hostname === 'ncdn.imgnex.top' && !parsedTarget.pathname.endsWith('master.m3u8')) {
        parsedTarget.host = 'cdn.imgnex.top';
        targetUrl = parsedTarget.toString();
      }
    } catch (_) {}

    // ── Build Upstream Request Headers ─────────────────────────────────────
    const fp = getRandomHeaders();
    const upstreamHeaders = new Headers();
    upstreamHeaders.set('User-Agent', fp['User-Agent']);
    upstreamHeaders.set('Accept', '*/*');
    upstreamHeaders.set('Accept-Encoding', 'gzip, deflate, br');
    upstreamHeaders.set('Accept-Language', fp['Accept-Language']);
    // Detect XHR/AJAX request: fetcher passes X-Requested-With for JSON endpoints
    const isXhrRequest = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
    const incomingAccept = request.headers.get('Accept');

    if (isScrapeMode && !isXhrRequest) {
      // ── HTML page mode: full browser document navigation headers ────────────
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
      // ── AJAX/XHR mode: same-origin XHR headers for /ajax/* endpoints ────────
      upstreamHeaders.set('Accept', incomingAccept || 'application/json, text/javascript, */*; q=0.01');
      upstreamHeaders.set('X-Requested-With', 'XMLHttpRequest');
      upstreamHeaders.set('Sec-Fetch-Dest', 'empty');
      upstreamHeaders.set('Sec-Fetch-Mode', 'cors');
      upstreamHeaders.set('Sec-Fetch-Site', 'same-origin');
      // Always set Referer to the target origin for AJAX requests
      try { upstreamHeaders.set('Referer', new URL(target).origin + '/'); } catch (_) {}
      if (env.SCRAPE_COOKIE) upstreamHeaders.set('Cookie', env.SCRAPE_COOKIE);
    } else {
      // ── Media/streaming mode ─────────────────────────────────────────────────
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

    // Optional proxy list configured via worker environment variable PROXIES
    const envProxies = env && env.PROXIES ? env.PROXIES.split(',').map(p => p.trim()).filter(Boolean) : [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const fetchOptions = {
          headers: upstreamHeaders,
          redirect: 'follow',
        };

        // If Cloudflare proxy backend or custom proxy IP configured
        if (customProxy || envProxies.length > 0) {
          const selectedProxy = customProxy || envProxies[Math.floor(Math.random() * envProxies.length)];
          if (selectedProxy) {
            // Note: CF Workers allow routing or custom HTTP headers for proxy gateways
            upstreamHeaders.set('X-Forwarded-Proxy', selectedProxy);
          }
        }

        upstreamRes = await fetch(targetUrl, fetchOptions);

        if (upstreamRes.status === 404) {
          try {
            const parsed = new URL(targetUrl);
            if ((parsed.hostname === 'bb.akirax.buzz' || parsed.hostname === 'ncdn.imgnex.top') && parsed.pathname.startsWith('/anime/')) {
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
    const isManifest = /\.m3u8/i.test(target) || contentType.includes('mpegurl') || contentType.includes('m3u8');
    const isSubtitle = /\.(vtt|srt|ass)$/i.test(target) || contentType.includes('vtt');

    // ── Scrape Mode: return raw HTML/JSON for server-side processing ─────────
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
        .map(line => {
          // Normalize audio codecs to prevent MSE decoding buffer error in Chrome (HE-AAC v2)
          if (line.includes('CODECS=')) {
            line = line.replace(/mp4a\.40\.29/g, 'mp4a.40.2').replace(/mp4a\.40\.5/g, 'mp4a.40.2');
          }

          // Rewrite URI attributes in tag lines (AES keys, init maps, sub-playlists)
          // Rewrite URI= attributes (#EXT-X-KEY, #EXT-X-MAP, etc.)
          if (line.includes('URI=')) {
            line = line.replace(/URI=["']([^"']+)["']/g, (match, uri) => {
              try {
                let abs = uri.startsWith('http') ? uri : new URL(uri, targetUrl).toString();

                try {
                  const parsedUri = new URL(abs);
                  // Resolve child playlists / segments under ncdn.imgnex.top to cdn.imgnex.top
                  if (parsedUri.hostname === 'ncdn.imgnex.top' && !parsedUri.pathname.endsWith('master.m3u8')) {
                    parsedUri.host = 'cdn.imgnex.top';
                    abs = parsedUri.toString();
                  }
                  // bb.akirax.buzz with /anime/ path is a dead mirror; active host is cdn.imgnex.top
                  if (parsedUri.hostname === 'bb.akirax.buzz' && parsedUri.pathname.startsWith('/anime/')) {
                    parsedUri.host = 'cdn.imgnex.top';
                    abs = parsedUri.toString();
                  }
                  const isDeadBuzz = parsedUri.hostname.includes('zaplume.buzz') || parsedUri.hostname.includes('mewstream.buzz');
                  if (isDeadBuzz || (parsedUri.hostname.endsWith('.click') && !parsedUri.hostname.includes('akirax.buzz'))) {
                    parsedUri.host = new URL(targetUrl).host;
                    abs = parsedUri.toString();
                  }
                } catch (_) { }

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

            try {
              const parsedUri = new URL(resolved);
              // Resolve child playlists / segments under ncdn.imgnex.top to cdn.imgnex.top
              if (parsedUri.hostname === 'ncdn.imgnex.top' && !parsedUri.pathname.endsWith('master.m3u8')) {
                parsedUri.host = 'cdn.imgnex.top';
                resolved = parsedUri.toString();
              }
              // bb.akirax.buzz with /anime/ path is a dead mirror; active host is cdn.imgnex.top
              if (parsedUri.hostname === 'bb.akirax.buzz' && parsedUri.pathname.startsWith('/anime/')) {
                parsedUri.host = 'cdn.imgnex.top';
                resolved = parsedUri.toString();
              }
              const isDeadBuzz = parsedUri.hostname.includes('zaplume.buzz') || parsedUri.hostname.includes('mewstream.buzz');
              if (isDeadBuzz || (parsedUri.hostname.endsWith('.click') && !parsedUri.hostname.includes('akirax.buzz'))) {
                parsedUri.host = new URL(targetUrl).host;
                resolved = parsedUri.toString();
              }
            } catch (_) { }

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
    resHeaders.set('Cache-Control', 'public, max-age=7200, immutable');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: resHeaders,
    });
  },
};
