/**
 * OpenAPI path entries for the extended endpoint set (discovery lists,
 * suggestions, seasons, AniList, low-level streaming, system).
 * Merged into the main spec in openapi-spec.ts.
 *
 * Entries are built with small helpers to keep them uniform; `$ref: "Name"`
 * is this project's shorthand for a type in src/lib/types.ts.
 */

interface Param {
  name: string;
  in: "query" | "path";
  required: boolean;
  description: string;
  schema: Record<string, unknown>;
  example?: string;
}

const refresh: Param = {
  name: "refresh",
  in: "query",
  required: false,
  description: "Bypass cache and force fresh scrape (1 to enable)",
  schema: { type: "string", enum: ["0", "1"] },
  example: "1",
};

const q = (
  name: string,
  description: string,
  example?: string,
  required = false,
  schema: Record<string, unknown> = { type: "string" }
): Param => ({ name, in: "query", required, description, schema, example });

const p = (name: string, description: string, example: string): Param => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string" },
  example,
});

const page = q("page", "Page number (default: 1)", "1", false, { type: "integer" });
const slugParam = p("slug", "Anime slug (or numeric anime id)", "one-piece-100");

type Schema = Record<string, unknown>;

function get(
  tag: string,
  operationId: string,
  summary: string,
  description: string,
  parameters: Param[],
  data: Schema,
  errors: Record<string, string> = {}
) {
  return {
    get: {
      tags: [tag],
      summary,
      description,
      operationId,
      parameters,
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { ok: { type: "boolean", example: true }, data },
              },
            },
          },
        },
        ...Object.fromEntries(Object.entries(errors).map(([code, d]) => [code, { description: d }])),
        "500": { description: "Internal server error" },
      },
    },
  };
}

const listing: Schema = {
  type: "object",
  properties: {
    results: { type: "array", items: { $ref: "AnimeCard" } },
    topRated: { type: "array", items: { $ref: "AnimeCard" } },
    currentPage: { type: "integer", example: 1 },
    hasNextPage: { type: "boolean" },
    hasPreviousPage: { type: "boolean" },
    minPage: { type: "integer" },
    maxPage: { type: "integer" },
  },
};

const BAD = { "400": "Invalid or missing parameters" };
const BAD_404 = { ...BAD, "404": "Not found" };

export const extraPaths = {
  // ── Discovery ────────────────────────────────────────────────────────────
  "/spotlight": get("Discovery", "getSpotlight", "Spotlight carousel",
    "Featured anime from the home page spotlight carousel. Shares the cached home scrape with /home.",
    [refresh], { type: "array", items: { $ref: "SpotlightAnime" } }),

  "/top-ten": get("Discovery", "getTopTen", "Top ten (today / week / month)",
    "Top anime for today, this week and this month.",
    [refresh], {
      type: "object",
      properties: {
        today: { type: "array", items: { $ref: "TopAnimeItem" } },
        week: { type: "array", items: { $ref: "TopAnimeItem" } },
        month: { type: "array", items: { $ref: "TopAnimeItem" } },
      },
    }),

  "/trending": get("Discovery", "getTrending", "Trending anime",
    "Trending anime from the home page's AJAX widget (paginated). Equivalent to /widget?name=trending.",
    [page, refresh], { type: "object", description: "Widget result: items + pagination" }, BAD),

  "/trending-sidebar": get("Discovery", "getTrendingSidebar", "Trending sidebar bundle",
    "Top day / week / month lists plus the latest episodes, as shown in the site sidebar.",
    [refresh], {
      type: "object",
      properties: {
        day: { type: "array", items: { $ref: "TopAnimeItem" } },
        week: { type: "array", items: { $ref: "TopAnimeItem" } },
        month: { type: "array", items: { $ref: "TopAnimeItem" } },
        latestEpisodes: { type: "array", items: { $ref: "LatestEpisodeItem" } },
      },
    }),

  "/top-rankings": get("Discovery", "getTopRankings", "Top rankings for one window",
    "Ranked top anime for a single time window, de-duplicated.",
    [q("sort", "Ranking window", "day", false, { type: "string", enum: ["day", "week", "month"] }), refresh],
    {
      type: "object",
      properties: {
        sort: { type: "string", example: "day" },
        results: { type: "array", items: { $ref: "TopAnimeItem" } },
      },
    }, BAD),

  "/recently-updated": get("Discovery", "getRecentlyUpdated", "Recently updated episodes",
    "Recently updated episodes split by audio track (paginated, AJAX-backed).",
    [q("tab", "Audio filter", "all", false, { type: "string", enum: ["all", "sub", "dub"] }), page, refresh],
    { type: "object", description: "tab + widget result: items + pagination" }, BAD),

  "/completed": get("Discovery", "getCompleted", "Recently completed anime",
    "Recently completed anime from the home page.",
    [refresh], { type: "array", items: { $ref: "TopTableItem" } }),

  "/random": get("Discovery", "getRandom", "Random anime",
    "Follows the site's /random redirect and returns that anime's detail object plus its resolved `url`. Never cached.",
    [], { $ref: "AnimeDetail" }, { "502": "Upstream did not redirect to an anime page" }),

  // ── Browse additions ─────────────────────────────────────────────────────
  "/most-popular": get("Browse", "getMostPopular", "Most popular anime",
    "Most viewed anime (site listing /most-viewed).", [page, refresh], listing),

  "/new-release": get("Browse", "getNewRelease", "New releases",
    "Newly released anime (site listing /new-release).", [page, refresh], listing),

  "/newly-added": get("Browse", "getNewlyAdded", "Newly added anime",
    "Recently added anime (site listing /latest-updated?sort=added).", [page, refresh], listing),

  "/upcoming": get("Browse", "getUpcoming", "Upcoming anime",
    "Not-yet-aired anime (site listing /status/not-yet-aired).", [page, refresh], listing),

  "/az-list/{letter}": get("Browse", "getAzList", "A-Z list",
    "Alphabetical listing. `letter` is a single letter/digit, `other`, or `all`.",
    [p("letter", "Letter, digit, `other` or `all`", "a"), page, refresh],
    { ...listing, properties: { ...(listing.properties as Schema), letter: { type: "string", example: "a" } } },
    BAD),

  "/search/suggest": get("Browse", "searchSuggest", "Search autocomplete",
    "Up to 10 lightweight suggestions (id, slug, title, image, type) for a keyword.",
    [q("keyword", "Search text", "naruto", true), refresh],
    { type: "array", items: { $ref: "SuggestionItem" } }, BAD),

  "/suggestions": get("Browse", "getSuggestions", "Rich search suggestions",
    "Up to 10 full anime cards (including sub/dub episode counts) for a keyword.",
    [q("keyword", "Search text", "naruto", true), refresh],
    { type: "array", items: { $ref: "AnimeCard" } }, BAD),

  // ── Anime-scoped ─────────────────────────────────────────────────────────
  "/anime/{slug}/seasons": get("Anime", "getAnimeSeasons", "Seasons of an anime",
    "The site's season switcher for an anime. `slug` may also be the numeric anime id.",
    [slugParam, refresh], { $ref: "AnimeSeasons" }, BAD_404),

  "/anime/{slug}/episodes/latest": get("Anime", "getLatestEpisode", "Latest episode",
    "Newest released episode (highest episode number) plus the total episode count.",
    [slugParam, refresh], { $ref: "LatestEpisodeResult" }, BAD_404),

  "/anime/{slug}/episodes/ajax": get("Anime", "getEpisodesAjax", "Episode list (raw AJAX view)",
    "Episodes with the site's filters and range tabs, per-episode dataIds, malId and timestamp. `slug` may also be the numeric anime id.",
    [slugParam, q("style", "Optional list style passed to the site", undefined), q("vrf", "Optional token passed to the site", undefined), refresh],
    { $ref: "EpisodeAjaxResult" }, BAD_404),

  // ── AniList ──────────────────────────────────────────────────────────────
  "/anilist": get("AniList", "getAnilist", "AniList metadata (query)",
    "Look up AniList metadata by AniList id (`id`) or MAL id (`mal`).",
    [q("id", "AniList id", "21"), q("mal", "MAL id (alternative to id)", undefined)],
    { type: "object", description: "AniList Media object" }, BAD_404),

  "/anilist/{id}": get("AniList", "getAnilistById", "AniList metadata (path)",
    "AniList metadata for a numeric AniList id.",
    [p("id", "AniList id", "21")], { type: "object", description: "AniList Media object" }, BAD_404),

  "/anilist/season": get("AniList", "getAnilistSeason", "Seasonal chart",
    "Seasonal anime from AniList ordered by popularity. Defaults to the current season/year.",
    [
      q("season", "Season", "FALL", false, { type: "string", enum: ["WINTER", "SPRING", "SUMMER", "FALL"] }),
      q("year", "Year (1940-2100)", "2026", false, { type: "integer" }),
      page,
      q("perPage", "Items per page (max 50, default 25)", "25", false, { type: "integer" }),
    ],
    { type: "object", description: "season, year, page, perPage, pageInfo, media[]" }, BAD),

  // ── Streaming (low-level) ────────────────────────────────────────────────
  "/servers": get("Watch", "getServers", "Servers for an episode",
    "Video servers (sub/dub/softsub) for one episode. `ids` is the episode's `dataIds`; each server's `linkId` feeds /stream and /stream/resolve.",
    [q("ids", "Episode dataIds", undefined, true), q("slug", "Anime slug (improves Referer)", "one-piece-100"), refresh],
    { type: "array", items: { type: "object", description: "type, typeLabel, epId, linkId, cmid, svId, name, normalizedName" } },
    BAD_404),

  "/stream": get("Watch", "getStreamInfo", "Stream info for a server link",
    "Embed/player URL and intro/outro skip ranges for one server `linkId`. Use /stream/resolve for a playable HLS URL.",
    [q("id", "Server linkId", undefined, true), q("slug", "Anime slug", "one-piece-100"), q("sv", "Server id", undefined), refresh],
    { type: "object", description: "linkId, url, type, skipData, backup" }, BAD_404),

  "/mapper-servers": get("Watch", "getMapperServers", "Mapper servers",
    "Mapper-provided sources per provider (sub/dub) with embed and download URLs.",
    [q("malId", "MAL id", "21", true), q("slug", "Anime slug", "one-piece-100", true), q("timestamp", "Episode timestamp", undefined, true), refresh],
    { type: "array", items: { type: "object", description: "provider, type, url, download" } }, BAD),

  "/stream/resolve": get("Watch", "resolveStream", "Resolve a server link to HLS",
    "Resolves a server link to a playable stream: m3u8, proxied URL, qualities, subtitles and skip data. When extraction fails, `m3u8` is null and `error` is set.",
    [
      q("id", "Server linkId", undefined, true),
      q("slug", "Anime slug", "one-piece-100"),
      q("sv", "Server id", undefined),
      q("type", "Audio track hint", "sub", false, { type: "string", enum: ["sub", "dub", "softsub", "hsub", "raw"] }),
      refresh,
    ],
    { type: "object", description: "linkId, embedUrl, m3u8, proxyUrl, qualities[], subtitles[], skipData" }, BAD_404),

  "/stream/qualities": get("Watch", "getStreamQualities", "HLS quality variants",
    "Lists the variants of an HLS master playlist, best first. `url` must be on an authorised streaming domain and never a private address.",
    [q("url", "Master playlist URL", undefined, true), q("referer", "Referer to send", undefined)],
    { type: "object", description: "url, totalQualities, qualities[] (label, width, height, bandwidth, url, proxyUrl)" },
    { ...BAD, "403": "Domain not allowed / private address" }),

  "/stream/embeds": get("Watch", "getStreamEmbeds", "Third-party embed URLs",
    "Ready-to-iframe player URLs (megaplay, anixo, megavid) for an episode. Identify the anime with `slug`, `mal` or `anilist`.",
    [
      q("slug", "Anime slug", "one-piece-100"),
      q("mal", "MAL id", undefined),
      q("anilist", "AniList id", undefined),
      q("ep", "Episode number (default 1)", "1", false, { type: "integer" }),
      q("lang", "Audio", "sub", false, { type: "string", enum: ["sub", "dub"] }),
      q("provider", "Comma-separated provider ids", "megaplay,anixo"),
      refresh,
    ],
    { type: "object", description: "slug, episode, lang, ids, providers[], unavailable[]" }, BAD),

  "/download": get("Watch", "getDownloads", "Episode download links",
    "Download links for one episode grouped by server and audio type, exactly as published by the site.",
    [q("slug", "Anime slug", "one-piece-100", true), q("ep", "Episode number", "1", true, { type: "string" }), refresh],
    { type: "object", description: "slug, episode, totalDownloads, downloads[]" }, BAD_404),

  "/stream/proxy": get("Watch", "streamProxy", "Stream proxy (alias of /proxy)",
    "Alias of /proxy for players configured with the original AniKotoAPI path.",
    [q("url", "Target URL", undefined, true), q("referer", "Referer to send", undefined)],
    { type: "string", description: "Proxied media / rewritten playlist" }, { "403": "Forbidden" }),

  "/stream/ts-proxy": get("Watch", "streamTsProxy", "Segment proxy (alias of /proxy)",
    "Alias of /proxy for HLS segments, kept for compatibility with the original AniKotoAPI path.",
    [q("url", "Segment URL", undefined, true), q("referer", "Referer to send", undefined)],
    { type: "string", description: "Proxied segment" }, { "403": "Forbidden" }),

  // ── System ───────────────────────────────────────────────────────────────
  "/health": get("System", "getHealth", "Health check",
    "Liveness probe: status, version, uptime and memory. Never touches the upstream site.", [],
    { type: "object", description: "status, version, uptime, memory, node, timestamp" }),

  "/stats": get("System", "getStats", "Server statistics",
    "Request counters, cache usage and feature flags (brotli, mirrors, proxies) for this instance.", [],
    { type: "object", description: "requests, cache, endpoints, features" }),

  "/cache/stats": get("System", "getCacheStats", "Cache statistics",
    "In-memory cache entry count, hits, misses and hit rate.", [],
    { type: "object", description: "keys, hits, misses, hitRate" }),

  "/mirrors": get("System", "getMirrors", "Mirror status",
    "Health, latency and current selection for every configured upstream mirror. Cached for 30 s.", [],
    { type: "array", items: { type: "object", description: "name, url, status, latencyMs, isCurrent" } }),

  "/mirrors/reset": {
    post: {
      tags: ["System"],
      summary: "Reset mirror state",
      description:
        "Clears mirror failure state so the primary mirror is tried first again. Requires `Authorization: Bearer <ADMIN_TOKEN>` when ADMIN_TOKEN is set.",
      operationId: "resetMirrors",
      parameters: [] as Param[],
      responses: {
        "200": { description: "Reset done" },
        "401": { description: "Unauthorized" },
        "500": { description: "Internal server error" },
      },
    },
  },

  "/proxy/status": get("System", "getProxyStatus", "Outbound proxy status",
    "Proxy pool health (credentials masked) and Cloudflare Worker configuration.", [],
    { type: "object", description: "configured, total, healthy, proxies[], cloudflareWorker" }),

  "/openapi": get("System", "getOpenApi", "OpenAPI document",
    "This API's OpenAPI 3.0 description as JSON. Returned as the raw document, not wrapped in { ok, data }.", [], { type: "object" }),
};
