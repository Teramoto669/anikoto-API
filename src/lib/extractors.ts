import axios from 'axios';
import { DEFAULT_HEADERS } from './constants';

const KIWI_MAPPER_URLS = [
  'https://mapper.nekostream.site/api/mal',
  'https://mapper.mewcdn.online/api/mal',
];

async function parseM3u8Subtitles(
  m3u8Url: string,
  referer: string
): Promise<{ file: string; label?: string; kind?: string; default?: boolean }[]> {
  try {
    const { data } = await axios.get<string>(m3u8Url, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 5000,
    });
    const tracks: { file: string; label?: string; kind?: string; default?: boolean }[] = [];
    for (const line of data.split('\n')) {
      if (!line.startsWith('#EXT-X-MEDIA') || !line.includes('TYPE=SUBTITLES')) continue;
      const uri = line.match(/URI="([^"]+)"/)?.[1];
      if (!uri) continue;
      const label = line.match(/NAME="([^"]+)"/)?.[1];
      const isDefault = /DEFAULT=YES/i.test(line);
      const fullUri = uri.startsWith('http') ? uri : new URL(uri, m3u8Url).toString();
      tracks.push({ file: fullUri, label: label || 'Unknown', kind: 'subtitles', default: isDefault });
    }
    return tracks;
  } catch {
    return [];
  }
}

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

let _keysCache: Record<string, string> | null = null;
let _keysCacheAt = 0;
const KEYS_CACHE_MS = 15 * 60 * 1000;

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

async function _tryKiwiMapperUrl(
  mapperBase: string,
  malId: string,
  epNum: string | number,
  timestamp: string,
  type: 'sub' | 'dub',
  baseUrl: string
): Promise<ExtractedStream> {
  const mapperUrl = `${mapperBase}/${encodeURIComponent(malId)}/${encodeURIComponent(epNum)}/${encodeURIComponent(timestamp)}`;
  const { data } = await axios.get(mapperUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: baseUrl + '/',
      Origin: baseUrl,
    },
    timeout: 8000,
  });

  if (!data || typeof data !== 'object') throw new Error('Invalid response');

  let serverCode: string | null = null;
  for (const key of Object.keys(data)) {
    if (key === 'status') continue;
    const entry = data[key]?.[type];
    if (entry?.url && typeof entry.url === 'string') {
      serverCode = entry.url;
      break;
    }
  }

  if (!serverCode) throw new Error('No server code found');

  const { data: serverData } = await axios.get(`${baseUrl}/ajax/server?get=${serverCode}`, {
    headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest' },
    timeout: 5000,
  });

  let embedUrl: string | null = serverData?.result?.url ?? null;
  if (!embedUrl) throw new Error('No embed URL');

  if (embedUrl.includes('#')) {
    try {
      const encoded = embedUrl.split('#')[1];
      embedUrl = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch (_) {}
  }

  const referer = 'https://kwik.cx2.mewcdn.online/';
  const tracks = await parseM3u8Subtitles(embedUrl, referer);
  return { m3u8: embedUrl, referer, tracks };
}

export async function extractKiwiMapper(
  malId: string,
  epNum: string | number,
  timestamp: string,
  type: 'sub' | 'dub',
  baseUrl: string
): Promise<ExtractedStream | null> {
  // Race all mapper URLs in parallel — use whichever responds successfully first
  try {
    return await Promise.any(
      KIWI_MAPPER_URLS.map((mapperBase) =>
        _tryKiwiMapperUrl(mapperBase, malId, epNum, timestamp, type, baseUrl)
      )
    );
  } catch (err) {
    // AggregateError: all URLs failed
    const msg = err instanceof AggregateError
      ? err.errors.map((e: Error) => e?.message).join('; ')
      : (err instanceof Error ? err.message : String(err));
    console.error(`[extractKiwiMapper] All mapper URLs failed (${type}):`, msg);
    return null;
  }
}

export async function extractVidstream(
  embedUrl: string,
  referer: string
): Promise<ExtractedStream | null> {
  try {
    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 8000,
    });

    const epIdMatch = html.match(/data-ep-id=["'](\d+)["']/);
    const typeMatch = html.match(/type:\s*'(\w+)'/);
    const domain2Match = html.match(/domain2_url:\s*'([^']+)'/);

    if (!epIdMatch || !typeMatch || !domain2Match) return null;

    const epId = epIdMatch[1];
    const epType = typeMatch[1];
    const domain2 = domain2Match[1].trim();

    const saveDataUrl = `${domain2}/save_data.php?id=${epId}-${epType}`;
    const { data } = await axios.get(saveDataUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 8000,
    });

    const sources = data?.data?.sources ?? [];
    const tracks: SubtitleTrack[] = data?.data?.tracks ?? [];
    const m3u8 = sources[0]?.url ?? null;

    if (!m3u8) return null;

    return { m3u8, referer: domain2 + '/', tracks };
  } catch (err) {
    console.error('[extractVidstream] Failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

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

export async function extractStreamUrl(embedUrl: string): Promise<ExtractedStream | null> {
  const hostname = new URL(embedUrl).hostname;

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

  if (hostname.includes('vidtube.site')) {
    return extractMegaplay(embedUrl);
  }

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

      const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch) {
        const resolved = new URL(iframeMatch[1], currentUrl).toString();
        if (resolved !== currentUrl) {
          currentUrl = resolved;
          continue;
        }
      }

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
