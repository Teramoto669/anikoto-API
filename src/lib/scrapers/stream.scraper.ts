/**
 * Low-level streaming endpoints: server lists, stream info by link id, stream
 * resolution, HLS quality parsing, third-party embed URLs and download links.
 *
 * `/api/watch/[slug]` already runs the whole pipeline for one episode; these
 * expose the individual steps for clients that want finer control.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ApiError } from '../api';
import { getOrSet } from '../cache';
import { CACHE_TTL } from '../constants';
import { extractStreamUrl, type IntroOutro, type SubtitleTrack } from '../extractors';
import { fetchJson, fetchPage } from '../fetcher';
import { resolveAnilistIdFromMal } from '../anilist';
import { getMirrorOrder } from '../mirrors';
import { getRandomBrowserHeaders, isPrivateUrl, isPrivateUrlAsync } from '../proxy-pool';
import { scrapeAnimeEpisodes } from './anime.scraper';
import { makeProxyHelper, parseSkipData } from './watch.scraper';

const DEFAULT_STREAM_REFERER = 'https://megaplay.buzz/';

function streamReferer(): string {
  return process.env.STREAM_PROXY_REFERER || DEFAULT_STREAM_REFERER;
}

function siteReferer(slug?: string): string {
  const origin = getMirrorOrder()[0];
  return slug ? `${origin}/watch/${slug}` : `${origin}/`;
}

// ─── Server list ──────────────────────────────────────────────────────────────

const SERVER_NAME_MAP: Record<string, string> = {
  'VidPlay-1': 'vidplay',
  'VidPlay-2': 'vidplay',
  'HD-1': 'hd',
  'HD-2': 'hd',
  'Vidstream-1': 'vidstream',
  'Vidstream-2': 'vidstream',
  'VidCloud-1': 'vidcloud',
  'VidCloud-2': 'vidcloud',
  'StreamTape-1': 'streamtape',
  'StreamTape-2': 'streamtape',
};

export function normalizeServerName(name: string): string {
  if (!name) return 'unknown';
  return SERVER_NAME_MAP[name] ?? name.toLowerCase().replace(/[-\s]+\d+$/, '').trim();
}

export interface ServerListItem {
  type: string;
  typeLabel: string;
  epId: string;
  linkId: string;
  cmid: string;
  svId: string;
  name: string;
  normalizedName: string;
}

interface AjaxEnvelope {
  status?: boolean | number;
  result?: unknown;
  message?: string;
}

/** Surface the upstream's own error envelope (`{status: 4xx, result: "..."}`) as an ApiError. */
function assertUpstreamOk(payload: AjaxEnvelope | null | undefined): void {
  const status = typeof payload?.status === 'number' ? payload.status : undefined;
  if (status !== undefined && status >= 400) {
    const text = typeof payload?.result === 'string' ? payload.result : payload?.message ?? 'Bad request';
    throw new ApiError(status < 500 ? status : 502, `Upstream error (${status}): ${text}`);
  }
}

export async function scrapeServerList(
  ids: string,
  slug?: string,
  refresh?: boolean
): Promise<ServerListItem[]> {
  const key = `servers:${ids}`;
  return getOrSet(
    key,
    async () => {
      const payload = await fetchJson<AjaxEnvelope>(
        `/ajax/server/list?servers=${encodeURIComponent(ids)}`,
        { Referer: siteReferer(slug) },
        refresh
      );
      assertUpstreamOk(payload);

      const $ = cheerio.load(typeof payload?.result === 'string' ? payload.result : '');
      const servers: ServerListItem[] = [];

      $('li[data-link-id]').each((_, li) => {
        const $li = $(li);
        const $type = $li.closest('.type');
        const label = $type.find('label').first().text().trim();
        const type = $type.attr('data-type') || label.toLowerCase() || 'sub';
        const name = $li.text().trim();
        servers.push({
          type,
          typeLabel: label || type.toUpperCase(),
          epId: $li.attr('data-ep-id') ?? '',
          linkId: $li.attr('data-link-id') ?? '',
          cmid: $li.attr('data-cmid') ?? '',
          svId: $li.attr('data-sv-id') ?? '',
          name,
          normalizedName: normalizeServerName(name),
        });
      });
      return servers;
    },
    CACHE_TTL.SERVERS,
    refresh
  );
}

// ─── Stream info (embed URL for one server link) ──────────────────────────────

export interface StreamInfo {
  linkId: string;
  /** Embed/player page URL for this server (not a media file). */
  url: string | null;
  type: 'embed' | null;
  skipData: { intro?: IntroOutro; outro?: IntroOutro } | null;
  backup: string | null;
}

export async function scrapeStreamInfo(
  linkId: string,
  opts: { slug?: string; svId?: string } = {},
  refresh?: boolean
): Promise<StreamInfo> {
  const key = `stream-info:${linkId}:${opts.svId ?? ''}`;
  return getOrSet(
    key,
    async () => {
      const sv = opts.svId ? `&sv=${encodeURIComponent(opts.svId)}` : '';
      const payload = await fetchJson<AjaxEnvelope>(
        `/ajax/server?get=${encodeURIComponent(linkId)}${sv}`,
        { Referer: siteReferer(opts.slug) },
        refresh
      );
      assertUpstreamOk(payload);

      let result = payload?.result;
      if (typeof result === 'string') {
        try {
          result = JSON.parse(result);
        } catch {
          throw new ApiError(502, 'Upstream returned an unparseable stream payload');
        }
      }
      const r = (result ?? {}) as { url?: string; skip_data?: unknown; backup?: string };

      // skip_data arrives either as an object or as a JSON-encoded string.
      let skipRaw: unknown = r.skip_data;
      if (typeof skipRaw === 'string') {
        try {
          skipRaw = JSON.parse(skipRaw);
        } catch {
          skipRaw = undefined;
        }
      }
      const skip = skipRaw ? parseSkipData(skipRaw) : {};
      return {
        linkId,
        url: typeof r.url === 'string' && r.url ? r.url : null,
        type: r.url ? ('embed' as const) : null,
        skipData: skip.intro || skip.outro ? skip : null,
        backup: typeof r.backup === 'string' ? r.backup : null,
      };
    },
    CACHE_TTL.STREAM,
    refresh
  );
}

// ─── Mapper servers ───────────────────────────────────────────────────────────

export interface MapperServer {
  provider: string;
  type: 'sub' | 'dub';
  url: string | null;
  download: string | null;
}

export async function scrapeMapperServers(
  malId: string,
  slug: string,
  timestamp: string,
  refresh?: boolean
): Promise<MapperServer[]> {
  return getOrSet(
    `mapper:${malId}:${slug}:${timestamp}`,
    async () => {
      const data = await fetchJson<Record<string, { sub?: MapperSource; dub?: MapperSource }>>(
        `/ajax/mapper/${malId}/${encodeURIComponent(slug)}/${timestamp}`,
        { Referer: siteReferer(slug) },
        refresh
      );

      const servers: MapperServer[] = [];
      if (data && typeof data === 'object') {
        for (const [provider, sources] of Object.entries(data)) {
          for (const type of ['sub', 'dub'] as const) {
            const src = sources?.[type];
            if (src) {
              servers.push({ provider, type, url: src.url ?? null, download: src.download ?? null });
            }
          }
        }
      }
      return servers;
    },
    CACHE_TTL.SERVERS,
    refresh
  );
}

interface MapperSource {
  url?: string;
  download?: string;
}

// ─── HLS qualities ────────────────────────────────────────────────────────────

export interface StreamQuality {
  label: string;
  width: number;
  height: number;
  bandwidth: number;
  url: string;
  proxyUrl: string;
}

/**
 * Fetch an HLS master playlist and list its variants (best first).
 *
 * The URL is validated against private/loopback targets here, so every caller —
 * including ones whose URL came from a third-party player — is covered. Public
 * endpoints that accept a *user-supplied* URL must additionally enforce the
 * streaming-domain allowlist (see /api/stream/qualities).
 */
export async function parseM3u8Qualities(
  m3u8Url: string,
  referer?: string
): Promise<StreamQuality[]> {
  if (isPrivateUrl(m3u8Url) || (await isPrivateUrlAsync(m3u8Url))) {
    throw new ApiError(403, 'Access to private or local network addresses is restricted');
  }

  const effectiveReferer = referer || streamReferer();
  const fp = getRandomBrowserHeaders();
  let content: string;
  try {
    const res = await axios.get<string>(m3u8Url, {
      headers: {
        'User-Agent': fp['User-Agent'],
        'Accept-Language': fp['Accept-Language'],
        Accept: '*/*',
        Referer: effectiveReferer,
        Origin: safeOrigin(effectiveReferer),
      },
      timeout: 10_000,
      maxRedirects: 3,
      maxContentLength: 2_000_000,
      responseType: 'text',
      transformResponse: (d) => d,
      beforeRedirect: (options) => {
        if (options.href && isPrivateUrl(options.href)) {
          throw new Error(`SSRF blocked redirect to private address: ${options.href}`);
        }
      },
    });
    content = typeof res.data === 'string' ? res.data : String(res.data);
  } catch (err) {
    const upstream = axios.isAxiosError(err) ? err.response?.status : undefined;
    throw new ApiError(
      502,
      upstream ? `Upstream returned HTTP ${upstream} for the playlist` : 'Could not fetch the playlist'
    );
  }

  return parseMasterPlaylist(content, m3u8Url, effectiveReferer);
}

/**
 * Pure parser: list the variants of an HLS master playlist (best first), or the
 * playlist itself as a single "default" quality when it has no variants.
 */
export function parseMasterPlaylist(
  content: string,
  playlistUrl: string,
  referer: string
): StreamQuality[] {
  if (!content.includes('#EXTM3U')) {
    throw new ApiError(415, 'URL did not return an HLS playlist');
  }

  const toProxy = makeProxyHelper();
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const qualities: StreamQuality[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const attrs = lines[i].slice('#EXT-X-STREAM-INF:'.length);
    const bandwidth = Number.parseInt(attrs.match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const resolution = attrs.match(/RESOLUTION=(\d+)x(\d+)/);
    const width = resolution ? Number.parseInt(resolution[1], 10) : 0;
    const height = resolution ? Number.parseInt(resolution[2], 10) : 0;

    const next = lines[i + 1];
    if (!next || next.startsWith('#')) continue;

    let variantUrl: string;
    try {
      variantUrl = new URL(next, playlistUrl).href;
    } catch {
      continue;
    }
    qualities.push({
      label: height ? `${height}p` : `${bandwidth}bps`,
      width,
      height,
      bandwidth,
      url: variantUrl,
      proxyUrl: toProxy(variantUrl, referer),
    });
  }

  // A media playlist (no variants) is itself the only "quality".
  if (qualities.length === 0 && content.includes('#EXTINF')) {
    qualities.push({
      label: 'default',
      width: 0,
      height: 0,
      bandwidth: 0,
      url: playlistUrl,
      proxyUrl: toProxy(playlistUrl, referer),
    });
  }

  qualities.sort((a, b) => (b.height || b.bandwidth) - (a.height || a.bandwidth));
  return qualities;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// ─── Resolve a server link all the way to a playable stream ───────────────────

export interface ResolvedStream {
  linkId: string;
  embedUrl: string;
  m3u8: string | null;
  type: 'hls' | null;
  referer: string | null;
  proxyUrl: string | null;
  qualities: StreamQuality[];
  subtitles: (SubtitleTrack & { proxyUrl: string })[];
  skipData: { intro?: IntroOutro; outro?: IntroOutro } | null;
  backup: string | null;
  /** Set when the embed was reachable but no playable stream could be extracted. */
  error?: string;
}

export async function resolveStream(
  linkId: string,
  opts: { slug?: string; svId?: string; type?: string } = {},
  refresh?: boolean
): Promise<ResolvedStream> {
  const key = `resolved:${linkId}:${opts.svId ?? ''}:${opts.type ?? ''}`;
  return getOrSet(
    key,
    async () => {
      const info = await scrapeStreamInfo(linkId, opts, refresh);
      if (!info.url) throw new ApiError(404, 'Stream URL not found for this link ID');
      if (isPrivateUrl(info.url) || (await isPrivateUrlAsync(info.url))) {
        throw new ApiError(403, 'Embed URL points to a private or local network address');
      }

      const extracted = await extractStreamUrl(info.url, siteReferer(opts.slug), opts.type);
      const toProxy = makeProxyHelper();

      if (!extracted?.m3u8) {
        return {
          linkId,
          embedUrl: info.url,
          m3u8: null,
          type: null,
          referer: null,
          proxyUrl: null,
          qualities: [],
          subtitles: [],
          skipData: info.skipData,
          backup: info.backup,
          error: 'Could not extract a playable stream from this embed',
        };
      }

      let qualities: StreamQuality[] = [];
      try {
        qualities = await parseM3u8Qualities(extracted.m3u8, extracted.referer);
      } catch (err) {
        // Qualities are a nicety; the stream itself is still usable.
        console.error('[resolveStream] qualities failed:', err instanceof Error ? err.message : err);
      }

      const intro = extracted.intro ?? info.skipData?.intro;
      const outro = extracted.outro ?? info.skipData?.outro;

      return {
        linkId,
        embedUrl: info.url,
        m3u8: extracted.m3u8,
        type: 'hls' as const,
        referer: extracted.referer,
        proxyUrl: toProxy(extracted.m3u8, extracted.referer),
        qualities,
        subtitles: (extracted.tracks ?? []).map((t) => ({
          ...t,
          proxyUrl: toProxy(t.file, extracted.referer),
        })),
        skipData: intro || outro ? { intro, outro } : null,
        backup: info.backup,
      };
    },
    CACHE_TTL.STREAM,
    refresh
  );
}

// ─── Third-party embed URLs ───────────────────────────────────────────────────

const EMBED_COLOR = '%23e63946';

interface EmbedProviderDef {
  id: string;
  name: string;
  origin: string;
  requires: string;
  build(args: { malId: string | null; anilistId: string | null; episode: number; lang: 'sub' | 'dub' }): string | null;
}

const EMBED_PROVIDERS: Record<string, EmbedProviderDef> = {
  megaplay: {
    id: 'megaplay',
    name: 'MegaPlay',
    origin: 'https://megaplay.buzz',
    requires: 'malId | anilistId',
    build({ malId, anilistId, episode, lang }) {
      if (malId) return `https://megaplay.buzz/stream/mal/${malId}/${episode}/${lang}`;
      if (anilistId) return `https://megaplay.buzz/stream/ani/${anilistId}/${episode}/${lang}`;
      return null;
    },
  },
  anixo: {
    id: 'anixo',
    name: 'AniXo',
    origin: 'https://anixo.buzz',
    requires: 'anilistId',
    build({ anilistId, episode, lang }) {
      if (!anilistId) return null;
      return `https://anixo.buzz/embed/ani/${anilistId}/${episode}/${lang}?color=${EMBED_COLOR}`;
    },
  },
  megavid: {
    id: 'megavid',
    name: 'Megavid',
    origin: 'https://megavid.buzz',
    requires: 'malId | anilistId',
    build({ malId, anilistId, episode, lang }) {
      const id = malId || anilistId;
      if (!id) return null;
      return `https://megavid.buzz/${malId ? 'mal' : 'ani'}/${id}/${episode}/${lang}?color=${EMBED_COLOR}&autoplay=true`;
    },
  },
};

export const EMBED_PROVIDER_IDS = Object.keys(EMBED_PROVIDERS);

interface ExternalIds {
  animeId: string;
  malId: string | null;
  anilistId: string | null;
}

async function resolveExternalIds(slug: string): Promise<ExternalIds> {
  return getOrSet(
    `ext-ids:${slug}`,
    async () => {
      const { animeId, episodes } = await scrapeAnimeEpisodes(slug);
      const malId = episodes.find((e) => e.dataMal)?.dataMal ?? null;
      const anilist = malId ? await resolveAnilistIdFromMal(malId) : null;
      return { animeId, malId, anilistId: anilist ? String(anilist) : null };
    },
    CACHE_TTL.IDS
  );
}

export interface EmbedsResult {
  slug: string | null;
  episode: number;
  lang: 'sub' | 'dub';
  ids: ExternalIds;
  providers: { id: string; name: string; url: string; iframeReady: true; origin: string }[];
  unavailable: { id: string; name: string; reason: string }[];
}

export async function buildEpisodeEmbeds(args: {
  slug?: string | null;
  episode: number;
  lang: 'sub' | 'dub';
  providers?: string[] | null;
  malId?: string | null;
  anilistId?: string | null;
}): Promise<EmbedsResult> {
  const { slug = null, episode, lang } = args;
  let malId = args.malId ?? null;
  let anilistId = args.anilistId ?? null;
  let animeId = '';

  if ((!malId || !anilistId) && slug) {
    const ids = await resolveExternalIds(slug);
    animeId = ids.animeId;
    malId = malId ?? ids.malId;
    anilistId = anilistId ?? ids.anilistId;
  }
  if (malId && !anilistId) {
    const resolved = await resolveAnilistIdFromMal(malId);
    anilistId = resolved ? String(resolved) : null;
  }

  const ids: ExternalIds = { animeId, malId, anilistId };

  if (!malId && !anilistId) {
    return {
      slug,
      episode,
      lang,
      ids,
      providers: [],
      unavailable: Object.values(EMBED_PROVIDERS).map((p) => ({
        id: p.id,
        name: p.name,
        reason: 'No MAL or AniList ID available for this anime',
      })),
    };
  }

  const wanted = args.providers?.length ? args.providers : EMBED_PROVIDER_IDS;
  const providers: EmbedsResult['providers'] = [];
  const unavailable: EmbedsResult['unavailable'] = [];

  for (const id of wanted) {
    const def = EMBED_PROVIDERS[id];
    if (!def) {
      unavailable.push({ id, name: id, reason: 'Unknown provider' });
      continue;
    }
    const url = def.build({ malId, anilistId, episode, lang });
    if (url) providers.push({ id: def.id, name: def.name, url, iframeReady: true, origin: def.origin });
    else unavailable.push({ id: def.id, name: def.name, reason: `Requires ${def.requires}` });
  }

  return { slug, episode, lang, ids, providers, unavailable };
}

// ─── Download links ───────────────────────────────────────────────────────────

export interface DownloadLink {
  server: string;
  serverGroup: string;
  type: string;
  typeLabel: string;
  url: string;
}

export interface DownloadResult {
  slug: string;
  episode: string;
  totalDownloads: number;
  downloads: DownloadLink[];
  note?: string;
}

/** `download-data` is base64(JSON) shaped `{ group: { serverName: url } }`. */
function decodeDownloadData(encoded: string): Record<string, Record<string, string>> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, Record<string, string>>;
  } catch {
    return null;
  }
}

function collectDownloads($: cheerio.CheerioAPI, into: DownloadLink[]): void {
  $('[download-data]').each((_, el) => {
    const encoded = $(el).attr('download-data') ?? '';
    if (encoded.length <= 10) return;
    const decoded = decodeDownloadData(encoded);
    if (!decoded) return;

    const $type = $(el).closest('.type');
    const type = $type.attr('data-type') ?? 'unknown';
    const typeLabel = $type.find('label').first().text().trim() || type;

    for (const [serverGroup, servers] of Object.entries(decoded)) {
      if (!servers || typeof servers !== 'object') continue;
      for (const [server, url] of Object.entries(servers)) {
        // Only ever hand out plain web links.
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
        if (into.some((d) => d.url === url)) continue;
        into.push({ server, serverGroup, type, typeLabel, url });
      }
    }
  });
}

export async function scrapeDownloadLinks(
  slug: string,
  episode: string,
  refresh?: boolean
): Promise<DownloadResult> {
  return getOrSet(
    `download:${slug}:${episode}`,
    async () => {
      const downloads: DownloadLink[] = [];

      // 1) the episode page itself
      const $page = await fetchPage(`/watch/${slug}/ep-${episode}`, undefined, refresh);
      collectDownloads($page, downloads);

      // 2) otherwise the lazily loaded server list for that episode
      if (downloads.length === 0) {
        const { episodes } = await scrapeAnimeEpisodes(slug, undefined, undefined, refresh);
        const ep = episodes.find((e) => e.number === episode);
        if (ep?.dataIds) {
          try {
            const payload = await fetchJson<AjaxEnvelope>(
              `/ajax/server/list?servers=${encodeURIComponent(ep.dataIds)}`,
              { Referer: siteReferer(slug) }
            );
            if (typeof payload?.result === 'string') {
              collectDownloads(cheerio.load(payload.result), downloads);
            }
          } catch {
            /* the page-level result (empty) is still reported below */
          }
        }
      }

      return {
        slug,
        episode,
        totalDownloads: downloads.length,
        downloads,
        note:
          downloads.length === 0
            ? 'No download links were exposed for this episode. They may be loaded dynamically by the site.'
            : undefined,
      };
    },
    CACHE_TTL.STREAM,
    refresh
  );
}
