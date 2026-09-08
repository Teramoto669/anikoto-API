import * as cheerio from 'cheerio';
import { fetchJson } from '../fetcher';
import { scrapeAnimeEpisodes } from './anime.scraper';
import { Episode } from '../types';
import { extractStreamUrl, extractVidstream, SubtitleTrack, IntroOutro } from '../extractors';
import { BASE_URL } from '../constants';

export interface VideoServer {
  id: string;    // linkId
  name: string;  // server name (e.g. Vidstreaming, MegaCloud)
  type: string;  // "sub" | "dub" | "softsub"
  svId?: string; // data-sv-id (server type identifier used by anikoto AJAX)
}

export interface VideoTrack extends SubtitleTrack {
  proxyUrl?: string;
}

export interface VideoSource {
  server: string;
  type: string; // "sub" | "dub" | "softsub"
  url: string; // The iframe/embed URL
  m3u8?: string | null; // Extracted m3u8 direct link
  referer?: string; // Required referer for the m3u8 stream
  proxyUrl?: string | null; // The URL to proxy the stream through our backend
  tracks?: VideoTrack[];
  skip_data?: {
    intro?: IntroOutro;
    outro?: IntroOutro;
  };
}

export interface WatchData {
  episode: Episode;
  servers: VideoServer[];
  sources: VideoSource[];
}

// ── Streaming chunk types ─────────────────────────────────────────────────────

/** First chunk: episode metadata (emitted right after the episode list resolves) */
export interface WatchStreamEpisode {
  type: 'episode';
  episode: Episode;
}

/** Second chunk: server list (emitted once the server list AJAX resolves) */
export interface WatchStreamServers {
  type: 'servers';
  servers: VideoServer[];
}

/** One chunk per resolved source — emitted as each server's extraction completes */
export interface WatchStreamSource {
  type: 'source';
  source: VideoSource;
}

/** Terminal chunk — signals all sources have been emitted */
export interface WatchStreamDone {
  type: 'done';
}

export type WatchStreamChunk =
  | WatchStreamEpisode
  | WatchStreamServers
  | WatchStreamSource
  | WatchStreamDone;

/** Cap individual server fetch+extraction so a single slow server can't block everything. */
const SERVER_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms (${label})`)), ms)
    ),
  ]);
}

function makeProxyHelper() {
  const rawBaseUrl = process.env.NEXT_PUBLIC_CF_WORKER_URL || process.env.CF_WORKER_URL || '/api/proxy';
  let proxyBase = rawBaseUrl.trim();
  if (proxyBase && !proxyBase.startsWith('http') && !proxyBase.startsWith('/')) {
    proxyBase = `https://${proxyBase}`;
  }
  const proxySep = proxyBase.includes('?') ? '&' : '?';
  return (targetUrl: string, referer?: string) => {
    const refererParam = referer ? `&referer=${encodeURIComponent(referer)}` : '';
    return `${proxyBase}${proxySep}url=${encodeURIComponent(targetUrl)}${refererParam}`;
  };
}

function parseSkipData(skipData: any): { intro?: IntroOutro; outro?: IntroOutro } {
  const result: { intro?: IntroOutro; outro?: IntroOutro } = {};
  if (skipData?.intro && Array.isArray(skipData.intro) && skipData.intro.length >= 2) {
    const start = Number(skipData.intro[0]);
    const end = Number(skipData.intro[1]);
    if (!isNaN(start) && !isNaN(end)) {
      result.intro = { start, end };
    }
  }
  if (skipData?.outro && Array.isArray(skipData.outro) && skipData.outro.length >= 2) {
    const start = Number(skipData.outro[0]);
    const end = Number(skipData.outro[1]);
    if (!isNaN(start) && !isNaN(end)) {
      result.outro = { start, end };
    }
  }
  return result;
}

/** Build all per-server extraction promises, each resolving to a VideoSource and its skip ranges, or null. */
function buildSourceTasks(
  ep: Episode,
  servers: VideoServer[],
  slug: string,
  epNum: string,
  getProxyUrl: (url: string, referer?: string) => string
): Array<Promise<VideoSource | null>> {
  const epReferer = `${BASE_URL}/watch/${slug}/ep-${epNum}`;

  // Regular servers
  const serverTasks: Array<Promise<VideoSource | null>> = servers.map(async (server) => {
    try {
      return await withTimeout(
        (async () => {
          const svParam = server.svId ? `&sv=${server.svId}` : '';
          
          interface AjaxServerResponse {
            status: boolean;
            result?: {
              url: string;
              skip_data?: {
                intro?: [number, number, string];
                outro?: [number, number, string];
              };
            };
          }

          const sourceData = await fetchJson<AjaxServerResponse>(
            `/ajax/server?get=${server.id}${svParam}`,
            { Referer: epReferer }
          );
          if (!sourceData.status || !sourceData.result?.url) return null;

          const embedUrl = sourceData.result.url;
          const ajaxSkip = sourceData.result.skip_data ? parseSkipData(sourceData.result.skip_data) : {};

          const serverNameLower = server.name.toLowerCase();
          const isVidstreamLike =
            serverNameLower.includes('vidstream') ||
            serverNameLower.includes('vidplay') ||
            serverNameLower.includes('vid-');

          let extracted: Awaited<ReturnType<typeof extractStreamUrl>> = null;
          if (isVidstreamLike) {
            // Race VidStream extractor and standard extractor using Promise.any
            // so we return the first successful result immediately without waiting for the slow/timing out one
            try {
              extracted = await Promise.any([
                extractVidstream(embedUrl, epReferer, server.type).then((res) => {
                  if (!res) throw new Error('No result');
                  return res;
                }),
                extractStreamUrl(embedUrl, epReferer, server.type).then((res) => {
                  if (!res) throw new Error('No result');
                  return res;
                }),
              ]);
            } catch {
              extracted = null;
            }
          } else {
            extracted = await extractStreamUrl(embedUrl, epReferer, server.type);
          }

          const intro = extracted?.intro ?? ajaxSkip.intro;
          const outro = extracted?.outro ?? ajaxSkip.outro;
          const skip_data = (intro || outro) ? { intro, outro } : undefined;

          const source: VideoSource = {
            server: server.name,
            type: server.type,
            url: embedUrl,
            m3u8: extracted?.m3u8 ?? null,
            referer: extracted?.referer,
            proxyUrl: extracted?.m3u8 ? getProxyUrl(extracted.m3u8, extracted.referer) : null,
            tracks: extracted?.tracks?.map((t) => ({
              ...t,
              proxyUrl: getProxyUrl(t.file, extracted!.referer),
            })) || [],
            skip_data,
          };
          return source;
        })(),
        SERVER_TIMEOUT_MS,
        server.name
      );
    } catch (err) {
      console.error(`Skipping server ${server.name} (${server.id}):`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  return serverTasks;
}

/**
 * Streaming variant of scrapeWatch.
 *
 * Chunk order (designed to minimise time-to-first-byte):
 *   1. { type:'episode' }  — emitted right after scrapeAnimeEpisodes resolves (~1 RTT)
 *   2. { type:'servers' }  — emitted after the server-list AJAX resolves (~1 more RTT)
 *   3. { type:'source' }×N — each emitted the moment that server's extraction completes
 *   4. { type:'done' }     — stream is closed
 *
 * Clients can start rendering episode info and the server list immediately,
 * then progressively fill in stream sources as they arrive.
 */
export async function* scrapeWatchStream(
  slug: string,
  epNum: string
): AsyncGenerator<WatchStreamChunk> {
  // ── Step 1: resolve episode (~1 RTT, cached after first hit) ─────────────
  const { episodes } = await scrapeAnimeEpisodes(slug);
  const ep = episodes.find((e) => e.number === epNum);

  if (!ep || !ep.dataIds) {
    throw new Error(`Episode ${epNum} not found or has no data-ids for slug ${slug}`);
  }

  // Emit episode metadata immediately — client can render title, poster, etc.
  yield { type: 'episode', episode: ep } satisfies WatchStreamEpisode;

  // ── Step 2: fetch server list (~1 more RTT) ───────────────────────────────
  const listData = await fetchJson<{ status: boolean; result: string }>(
    `/ajax/server/list?servers=${ep.dataIds}`
  );

  if (!listData.status || !listData.result) {
    yield { type: 'done' } satisfies WatchStreamDone;
    return;
  }

  const $ = cheerio.load(listData.result);
  const servers: VideoServer[] = [];

  $('.server, li').each((_, el) => {
    const $el = $(el);
    const linkId = $el.attr('data-link-id');
    if (!linkId) return;

    const $typeContainer = $el.closest('.type');
    const typeLabel = $typeContainer.find('label, .name').text().trim().toLowerCase();
    const serverName = $el.text().trim();
    const svId = $el.attr('data-sv-id') || '';

    servers.push({
      id: linkId,
      name: serverName,
      type: typeLabel || 'sub',
      svId,
    });
  });

  // Emit server list — client can render the server selector UI
  yield { type: 'servers', servers } satisfies WatchStreamServers;

  // ── Step 3: launch all source tasks and yield as each resolves ────────────
  const getProxyUrl = makeProxyHelper();
  const tasks = buildSourceTasks(ep, servers, slug, epNum, getProxyUrl);

  // Tag each task so it can identify and remove itself from the pending set.
  type Tagged = Promise<{
    result: VideoSource | null;
    self: Tagged;
  }>;
  const pending = new Set<Tagged>();
  for (const task of tasks) {
    const tagged: Tagged = task.then((res) => ({ result: res, self: tagged }));
    pending.add(tagged);
  }

  // Race all pending promises; yield each source the moment it resolves
  while (pending.size > 0) {
    const { result, self } = await Promise.race(pending);
    pending.delete(self);
    if (result) {
      yield { type: 'source', source: result } satisfies WatchStreamSource;
    }
  }

  yield { type: 'done' } satisfies WatchStreamDone;
}

/**
 * Non-streaming variant — collects all sources then returns.
 * Used when serving from cache (instant response, no streaming needed).
 */
export async function scrapeWatch(slug: string, epNum: string): Promise<WatchData> {
  // Collect all chunks from the streaming generator
  const sources: VideoSource[] = [];
  let episode: Episode | undefined;
  let servers: VideoServer[] = [];

  for await (const chunk of scrapeWatchStream(slug, epNum)) {
    if (chunk.type === 'episode') episode = chunk.episode;
    else if (chunk.type === 'servers') servers = chunk.servers;
    else if (chunk.type === 'source') sources.push(chunk.source);
  }

  if (!episode) throw new Error('No episode data returned from stream');
  return { episode, servers, sources };
}
