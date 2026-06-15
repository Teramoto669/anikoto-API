import axios from 'axios';
import { DEFAULT_HEADERS } from './constants';

export interface SubtitleTrack {
  file: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

export interface ExtractedStream {
  m3u8: string;
  referer: string;
  tracks: SubtitleTrack[];
}

// ─── Module-level GitHub keys cache ──────────────────────────────────────────
// Avoids re-fetching decryption keys from GitHub on every Megacloud request.

let _keysCache: Record<string, string> | null = null;
let _keysCacheAt = 0;
const KEYS_CACHE_MS = 15 * 60 * 1000; // 15 minutes

async function getMegacloudKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_keysCache && now - _keysCacheAt < KEYS_CACHE_MS) return _keysCache;
  const { data } = await axios.get<Record<string, string>>(
    'https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json',
    { timeout: 5000 }
  );
  _keysCache = data;
  _keysCacheAt = now;
  return data;
}

// ─── Internal helpers (accept pre-fetched HTML to avoid double-fetch) ─────────

/**
 * Extracts the m3u8 stream from a Megaplay embed page.
 * Accepts pre-fetched HTML so the caller doesn't need to GET the page twice.
 */
async function _doMegaplay(
  host: string,
  html: string,
  referer: string
): Promise<ExtractedStream | null> {
  const match = html.match(/<title>File ([0-9]+)/);
  if (!match) return null;

  const id = match[1];
  const { data } = await axios.get(`https://${host}/stream/getSources?id=${id}`, {
    headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest', Referer: referer },
    timeout: 5000,
  });

  let m3u8: string | undefined = data?.sources?.file;
  const tracks: SubtitleTrack[] = data?.tracks || [];

  if (m3u8 && m3u8.includes('mewstream.buzz')) {
    // Bypass Cloudflare bot-protection blocks by replacing cdn.mewstream.buzz with lostproject.club mirror.
    let replacementHost = '1oe.lostproject.club';
    const firstTrack = tracks.find(t => t.file && !t.file.includes('mewstream.buzz'));
    if (firstTrack) {
      try {
        replacementHost = new URL(firstTrack.file).host;
      } catch (_) {}
    }
    try {
      const parsedM3u8 = new URL(m3u8);
      parsedM3u8.host = replacementHost;
      m3u8 = parsedM3u8.toString();
    } catch (_) {}
  }

  return m3u8 ? { m3u8, referer, tracks } : null;
}

/**
 * Extracts the m3u8 stream from a Megacloud embed page.
 * Accepts pre-fetched HTML so the caller doesn't need to GET the page twice.
 */
async function _doMegacloud(
  embedUrl: string,
  html: string,
  referer: string
): Promise<ExtractedStream | null> {
  const origin = new URL(embedUrl).origin;

  const match1 = html.match(/\b[a-zA-Z0-9]{48}\b/);
  const match2 = html.match(/\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/);
  const nonce = match1?.[0] || (match2 ? match2[1] + match2[2] + match2[3] : null);

  if (!nonce) return null;

  const sId =
    embedUrl.split('/e-1/')[1]?.split('?')[0] ??
    embedUrl.split('/').pop()?.split('?')[0];
  const sourcesUrl = `${origin}/embed-2/v3/e-1/getSources?id=${sId}&_k=${nonce}`;

  const { data } = await axios.get(sourcesUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: referer,
    },
    timeout: 5000,
  });

  const tracks: SubtitleTrack[] = data?.tracks || [];

  if (!data.encrypted || data.sources?.[0]?.file.includes('.m3u8')) {
    return data.sources?.[0]?.file ? { m3u8: data.sources[0].file, referer, tracks } : null;
  }

  // Encrypted — use cached keys to avoid a GitHub round-trip on every call
  const keys = await getMegacloudKeys();
  const secret = keys['mega'];

  const decryptUrl =
    `https://megacloud-api-nine.vercel.app/` +
    `?encrypted_data=${encodeURIComponent(data.sources[0].file)}` +
    `&nonce=${encodeURIComponent(nonce)}` +
    `&secret=${encodeURIComponent(secret)}`;

  const { data: decrypted } = await axios.get(decryptUrl, { timeout: 5000 });

  const m3u8 = (typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted)).match(
    /"file":"(.*?)"/
  )?.[1];
  return m3u8 ? { m3u8, referer, tracks } : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Public wrapper — fetches the Megaplay embed page then extracts the stream.
 * Use extractStreamUrl() in most cases; this is exposed for direct use.
 */
export async function extractMegaplay(embedUrl: string): Promise<ExtractedStream | null> {
  try {
    const host = new URL(embedUrl).host;
    const referer = 'https://' + host + '/';
    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 5000,
    });
    return await _doMegaplay(host, html, referer);
  } catch (err) {
    console.error('Megaplay extraction failed:', err);
    return null;
  }
}

/**
 * Public wrapper — fetches the Megacloud embed page then extracts the stream.
 * Use extractStreamUrl() in most cases; this is exposed for direct use.
 */
export async function extractMegacloud(embedUrl: string): Promise<ExtractedStream | null> {
  try {
    const origin = new URL(embedUrl).origin;
    const referer = origin + '/';
    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 5000,
    });
    return await _doMegacloud(embedUrl, html, referer);
  } catch (err) {
    console.error('Megacloud extraction failed:', err);
    return null;
  }
}

/**
 * Resolves an embed URL to an ExtractedStream (m3u8 + referer + subtitle tracks).
 *
 * ── Fast path (most common) ──────────────────────────────────────────────────
 * Known providers are dispatched directly, skipping the intermediate HTML loop:
 *   • megaplay.buzz      → extractMegaplay
 *   • vidwish.live       → map to megaplay.buzz → extractMegaplay
 *   • megacloud.bloggy.click → map to megaplay.buzz → extractMegaplay
 *   • vidtube.site       → extractMegaplay (VidPlay, same Megaplay clone API)
 *   • megacloud.blog     → extractMegacloud
 *
 * ── Slow path (unknown host) ─────────────────────────────────────────────────
 * Fetches HTML, handles error-page fallbacks, follows up to 2 iframe hops.
 * The final HTML is passed directly into the extractor so no duplicate GET
 * is needed.
 */
export async function extractStreamUrl(embedUrl: string): Promise<ExtractedStream | null> {
  const hostname = new URL(embedUrl).hostname;

  // ── Fast path ────────────────────────────────────────────────────────────────
  if (
    hostname.includes('megaplay.buzz') ||
    hostname.includes('vidwish.live') ||
    hostname.includes('megacloud.bloggy.click')
  ) {
    const megaplayUrl = embedUrl
      .replace('vidwish.live', 'megaplay.buzz')
      .replace('megacloud.bloggy.click', 'megaplay.buzz');
    return extractMegaplay(megaplayUrl);
  }

  if (hostname.includes('megacloud.blog')) {
    return extractMegacloud(embedUrl);
  }

  // VidPlay (vidtube.site) is a Megaplay clone — same <title>File {id} / getSources API.
  if (hostname.includes('vidtube.site')) {
    return extractMegaplay(embedUrl);
  }

  // ── Slow path: unknown host ──────────────────────────────────────────────────
  let currentUrl = embedUrl;

  for (let i = 0; i < 2; i++) {
    let html = '';
    try {
      let host = new URL(currentUrl).host;
      let referer = 'https://' + host + '/';
      let response;

      try {
        response = await axios.get<string>(currentUrl, {
          headers: { ...DEFAULT_HEADERS, Referer: referer },
          timeout: 5000,
        });
      } catch {
        // Known-fallback hosts: try megaplay.buzz before giving up
        if (currentUrl.includes('vidwish.live') || currentUrl.includes('megacloud.bloggy.click')) {
          const fallbackUrl = currentUrl
            .replace('vidwish.live', 'megaplay.buzz')
            .replace('megacloud.bloggy.click', 'megaplay.buzz');
          host = new URL(fallbackUrl).host;
          referer = 'https://' + host + '/';
          response = await axios.get<string>(fallbackUrl, {
            headers: { ...DEFAULT_HEADERS, Referer: referer },
            timeout: 5000,
          });
          currentUrl = fallbackUrl;
        } else {
          return null;
        }
      }

      html = response.data;

      // Soft-error page check (200 OK but custom error content)
      const isErrorPage =
        html.includes('Error -') ||
        html.includes('error-container') ||
        html.includes("doesn't exist");
      if (
        isErrorPage &&
        (currentUrl.includes('vidwish.live') || currentUrl.includes('megacloud.bloggy.click'))
      ) {
        const fallbackUrl = currentUrl
          .replace('vidwish.live', 'megaplay.buzz')
          .replace('megacloud.bloggy.click', 'megaplay.buzz');
        host = new URL(fallbackUrl).host;
        referer = 'https://' + host + '/';
        response = await axios.get<string>(fallbackUrl, {
          headers: { ...DEFAULT_HEADERS, Referer: referer },
          timeout: 5000,
        });
        currentUrl = fallbackUrl;
        html = response.data;
      }

      // Follow iframe
      const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch) {
        const resolved = new URL(iframeMatch[1], currentUrl).toString();
        if (resolved !== currentUrl) {
          currentUrl = resolved;
          continue;
        }
      }

      // No iframe — dispatch with pre-fetched HTML (avoids duplicate GET)
      const finalHost = new URL(currentUrl).hostname;
      const finalReferer = 'https://' + new URL(currentUrl).host + '/';

      if (
        finalHost.includes('megaplay.buzz') ||
        finalHost.includes('vidwish.live') ||
        finalHost.includes('vidtube.site')
      ) {
        return await _doMegaplay(new URL(currentUrl).host, html, finalReferer);
      }
      if (finalHost.includes('megacloud.blog')) {
        return await _doMegacloud(currentUrl, html, finalReferer);
      }

      return null;
    } catch (err) {
      console.error(`[extractStreamUrl] Failed for ${currentUrl}:`, err);
      return null;
    }
  }

  return null;
}
