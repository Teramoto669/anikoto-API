import axios from 'axios';
import crypto from 'crypto';
import { DEFAULT_HEADERS } from './constants';

export interface SubtitleTrack {
  file: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

export interface IntroOutro {
  start: number;
  end: number;
}

export interface ExtractedStream {
  m3u8: string;
  referer: string;
  tracks: SubtitleTrack[];
  intro?: IntroOutro;
  outro?: IntroOutro;
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

function decryptMegaplayEnc(enc: string): string | null {
  try {
    const E = 'i?LMTAx0Q6,:}50U';
    const C = "W0;27ToaUpl_P%'c";

    let b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';

    const cipherBytes = Buffer.from(b64, 'base64');
    const key = Buffer.alloc(32);
    key.set(Buffer.from(E, 'utf8').subarray(0, 32));
    const iv = Buffer.from(C, 'utf8');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(cipherBytes);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8'));
    return parsed.file || parsed[0]?.file || null;
  } catch (err) {
    console.error('[Megaplay] Decryption failed:', err);
    return null;
  }
}

async function _doMegaplay(
  host: string,
  html: string,
  referer: string,
  sParam?: string | null,
  embedUrl?: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  const match = html.match(/<title>File ([0-9]+)/);
  if (!match) return null;

  const id = match[1];
  const sQs = sParam ? `&s=${encodeURIComponent(sParam)}` : '';

  // Resolve mediaType (sub, dub, hsub)
  // Priority: 1. HTML settings (e.g. type: 'dub') 2. passed mediaType / server.type 3. URL path (/dub, /hsub, /sub)
  const htmlTypeMatch = html.match(/type:\s*['"]([a-zA-Z0-9_-]+)['"]/i) ||
                        html.match(/data-type=['"]([a-zA-Z0-9_-]+)['"]/i);
  const urlTypeMatch = (embedUrl || '').match(/\/(sub|dub|hsub|raw)(?:[?#]|$)/i);
  const resolvedType = htmlTypeMatch?.[1] || mediaType || urlTypeMatch?.[1];
  const typeQs = resolvedType ? `&type=${encodeURIComponent(resolvedType)}` : '';

  const reqReferer = embedUrl || referer;
  const { data } = await axios.get(`https://${host}/stream/getSources?id=${id}${sQs}${typeQs}`, {
    headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest', Referer: reqReferer },
    timeout: 5000,
  });

  let m3u8: string | undefined = data?.sources?.file || data?.sources?.[0]?.file;
  if (!m3u8 && data?.enc) {
    m3u8 = decryptMegaplayEnc(data.enc) || undefined;
  }
  const tracks: SubtitleTrack[] = data?.tracks || [];
  
  const intro = data?.intro && typeof data.intro.start === 'number' && typeof data.intro.end === 'number'
    ? { start: data.intro.start, end: data.intro.end }
    : undefined;
  const outro = data?.outro && typeof data.outro.start === 'number' && typeof data.outro.end === 'number'
    ? { start: data.outro.start, end: data.outro.end }
    : undefined;

  if (m3u8) {
    // cdn.imgnex.top blocks master.m3u8 with 403, but ncdn.imgnex.top serves master.m3u8 with 200 OK
    if (m3u8.includes('//cdn.imgnex.top')) {
      m3u8 = m3u8.replace('//cdn.imgnex.top', '//ncdn.imgnex.top');
    } else if (m3u8.includes('mewstream.buzz')) {
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
  }

  return m3u8 ? { m3u8, referer, tracks, intro, outro } : null;
}

async function _doMegacloud(
  embedUrl: string,
  html: string,
  _referer: string
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
      Referer: embedUrl, // Fix: Referer of getSources must be embedUrl
    },
    timeout: 5000,
  });

  const tracks: SubtitleTrack[] = data?.tracks || [];
  
  const intro = data?.intro && typeof data.intro.start === 'number' && typeof data.intro.end === 'number'
    ? { start: data.intro.start, end: data.intro.end }
    : undefined;
  const outro = data?.outro && typeof data.outro.start === 'number' && typeof data.outro.end === 'number'
    ? { start: data.outro.start, end: data.outro.end }
    : undefined;

  const streamReferer = origin + '/'; // Referer for CDN stream is megacloud.tv origin

  if (!data.encrypted || data.sources?.[0]?.file.includes('.m3u8')) {
    return data.sources?.[0]?.file ? { m3u8: data.sources[0].file, referer: streamReferer, tracks, intro, outro } : null;
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
  return m3u8 ? { m3u8, referer: streamReferer, tracks, intro, outro } : null;
}

export async function extractVidstream(
  embedUrl: string,
  referer: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  try {
    let parentOrigin = referer;
    try {
      parentOrigin = new URL(referer).origin + '/';
    } catch (_) {}

    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: parentOrigin },
      timeout: 8000,
    });

    const epIdMatch = html.match(/data-ep-id=["'](\d+)["']/);
    const typeMatch = html.match(/type:\s*'(\w+)'/);
    const domain2Match = html.match(/domain2_url:\s*'([^']+)'/);

    if (!epIdMatch || (!typeMatch && !mediaType) || !domain2Match) return null;

    const epId = epIdMatch[1];
    const epType = mediaType || typeMatch?.[1];
    const domain2 = domain2Match[1].trim();

    const saveDataUrl = `${domain2}/save_data.php?id=${epId}-${epType}`;
    const { data } = await axios.get(saveDataUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: embedUrl }, // Fix: Referer of save_data.php must be embedUrl
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

export async function extractMegaplay(
  embedUrl: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  try {
    const parsed = new URL(embedUrl);
    const host = parsed.host;
    const sParam = parsed.searchParams.get('s');
    const referer = 'https://' + host + '/';
    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 5000,
    });
    return await _doMegaplay(host, html, referer, sParam, embedUrl, mediaType);
  } catch (err) {
    console.error('Megaplay extraction failed:', err);
    return null;
  }
}

export async function extractMegacloud(
  embedUrl: string,
  parentReferer?: string
): Promise<ExtractedStream | null> {
  try {
    const origin = new URL(embedUrl).origin;
    let referer = origin + '/';
    if (parentReferer) {
      try {
        referer = new URL(parentReferer).origin + '/';
      } catch (_) {}
    }
    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 5000,
    });
    return await _doMegacloud(embedUrl, html, embedUrl); // Use embedUrl as the referer for getSources!
  } catch (err) {
    console.error('Megacloud extraction failed:', err);
    return null;
  }
}

export async function extractStreamUrl(
  embedUrl: string,
  parentReferer?: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  const hostname = new URL(embedUrl).hostname;

  if (
    hostname.includes('megaplay.buzz') ||
    hostname.includes('vidwish.live') ||
    hostname.includes('megacloud.bloggy.click')
  ) {
    const megaplayUrl = embedUrl
      .replace('vidwish.live', 'megaplay.buzz')
      .replace('megacloud.bloggy.click', 'megaplay.buzz');
    return extractMegaplay(megaplayUrl, mediaType);
  }

  if (hostname.includes('megacloud.blog')) {
    return extractMegacloud(embedUrl, parentReferer);
  }

  if (hostname.includes('vidtube.site')) {
    return extractMegaplay(embedUrl, mediaType);
  }

  let currentUrl = embedUrl;

  for (let i = 0; i < 2; i++) {
    let html = '';
    try {
      let host = new URL(currentUrl).host;
      let referer = 'https://' + host + '/';
      if (parentReferer) {
        try {
          referer = new URL(parentReferer).origin + '/';
        } catch (_) {}
      }
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
          if (parentReferer) {
            try {
              referer = new URL(parentReferer).origin + '/';
            } catch (_) {}
          }
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
        if (parentReferer) {
          try {
            referer = new URL(parentReferer).origin + '/';
          } catch (_) {}
        }
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
        const sParam = new URL(currentUrl).searchParams.get('s');
        return await _doMegaplay(new URL(currentUrl).host, html, finalReferer, sParam, currentUrl, mediaType);
      }
      if (finalHost.includes('megacloud.blog')) {
        return await _doMegacloud(currentUrl, html, currentUrl); // Use currentUrl as referer for getSources!
      }

      return null;
    } catch (err) {
      console.error(`[extractStreamUrl] Failed for ${currentUrl}:`, err);
      return null;
    }
  }

  return null;
}
