<div align="center">
  <img src="public/logo-banner.png" alt="Anikoto API" width="560">

  <p><strong>⚡ A high-performance REST API for scraping anime data from anikoto.net — built with Next.js 16 ⚡</strong></p>

  <p>
    <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FTeramoto669%2Fanikoto-scrap-api"><img src="https://vercel.com/button" alt="Deploy with Vercel"></a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16">
    <img src="https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19">
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5">
    <img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 20+">
  </p>

  <p>
    <img src="https://img.shields.io/badge/endpoints-53-1fb6f5?style=flat-square&logo=databricks&logoColor=white" alt="53 endpoints">
    <img src="https://img.shields.io/badge/OpenAPI-3.0-6BA539?style=flat-square&logo=openapiinitiative&logoColor=white" alt="OpenAPI 3.0">
    <img src="https://img.shields.io/badge/compression-Brotli%20%E2%86%92%20gzip-f59e0b?style=flat-square&logo=speedtest&logoColor=white" alt="Brotli with gzip fallback">
    <img src="https://img.shields.io/badge/cache-node--cache-8b5cf6?style=flat-square&logo=redis&logoColor=white" alt="In-memory cache">
    <img src="https://img.shields.io/badge/scraping-Cheerio-e8742a?style=flat-square&logo=cheerio&logoColor=white" alt="Cheerio">
    <img src="https://img.shields.io/badge/Cloudflare-Worker%20proxy-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Worker proxy">
  </p>

  <p>
    <a href="https://github.com/Teramoto669/anikoto-scrap-api/stargazers"><img src="https://img.shields.io/github/stars/Teramoto669/anikoto-scrap-api?style=flat-square&logo=github&color=facc15" alt="GitHub stars"></a>
    <a href="https://github.com/Teramoto669/anikoto-scrap-api/network/members"><img src="https://img.shields.io/github/forks/Teramoto669/anikoto-scrap-api?style=flat-square&logo=github" alt="GitHub forks"></a>
    <a href="https://github.com/Teramoto669/anikoto-scrap-api/issues"><img src="https://img.shields.io/github/issues/Teramoto669/anikoto-scrap-api?style=flat-square&logo=github" alt="GitHub issues"></a>
    <a href="https://github.com/Teramoto669/anikoto-scrap-api/commits"><img src="https://img.shields.io/github/last-commit/Teramoto669/anikoto-scrap-api?style=flat-square&logo=git&logoColor=white" alt="Last commit"></a>
    <img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="License MIT">
    <img src="https://img.shields.io/badge/PRs-welcome-ff69b4?style=flat-square" alt="PRs welcome">
  </p>

  <p>👤 Author: <strong>Teramoto</strong></p>

  <p>
    <a href="#-features">✨ Features</a> •
    <a href="#-getting-started">🚀 Quick Start</a> •
    <a href="#-api-overview">📖 API Endpoints</a> •
    <a href="#%EF%B8%8F-environment-variables">⚙️ Configuration</a> •
    <a href="#%EF%B8%8F-project-structure">🗂️ Project Structure</a> •
    <a href="#%EF%B8%8F-cloudflare-worker-proxy-optional">☁️ Deployment</a>
  </p>
</div>

> 🎓 **For educational purposes only.** This project is not affiliated with anikoto.net.

> [!IMPORTANT]
>
> 1. There was previously a hosted version of this API for showcasing purposes only, and it was misused; It is recommended to deploy your own instance for personal use by customizing the API as you need it to be.
> 2. This API is just an unofficial API for [anikoto.net](https://anikoto.net) and is in no other way officially related to the same.
> 3. The content that this API provides is not mine, nor is it hosted by me. These belong to their respective owners. This API just demonstrates how to build an API that scrapes websites and uses their content.

---

## ✨ Features

- 🧩 **53 REST endpoints** — home, search, filter, anime detail, episodes, seasons, related, recommendations, tooltip, schedule, A–Z, rankings, AniList lookups, streaming sources (with opening/ending skip ranges), downloads and a streaming proxy
- 🚀 **High-volume proxy engine** — zero-copy `ReadableStream` video proxying, multi-node outbound proxy pool (`PROXIES` / `PROXY_LIST`), SSRF protection, anti-bot browser header rotation and exponential-backoff retries
- 🗜️ **Optional Brotli → gzip compression** — opt in with `ENABLE_BROTLI=true`; negotiates `Accept-Encoding`, never touches SSE or the media proxy
- 🪞 **Mirror failover** — optional `MIRROR_DOMAINS` with health tracking and cool-downs, so one dead domain doesn't take the API down
- 📦 **Consistent response envelope** — every response is `{ ok: true, data: ... }` or `{ ok: false, message: "..." }`
- ⚡ **In-memory cache** with per-endpoint TTLs — add `?refresh=1` to any request to bypass it
- 📚 **Interactive API docs** at `/` powered by an OpenAPI 3.0 spec (`public/openapi.yaml`, also served as JSON at `/api/openapi`)
- 🩺 **Observability** — `/api/health`, `/api/stats`, `/api/cache/stats`, `/api/mirrors`, `/api/proxy/status`
- 🔷 **TypeScript** — fully typed responses via `src/lib/types.ts`

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the interactive API docs.

---

## 📖 API Overview

### 🏠 Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/home` | Home data: spotlight, latest eps, top anime |
| GET | `/api/search?keyword=&page=` | Search anime by keyword (paginated) |
| GET | `/api/filter` | Advanced multi-param filter (paginated, returns `results` & optional `topRated`) |
| GET | `/api/anime/:slug` | Anime detail info (without related or recommendations) |
| GET | `/api/anime/:slug/episodes` | Episode list (with range filter) |
| GET | `/api/anime/:slug/related` | Related anime (watch order/sequels/prequels) |
| GET | `/api/anime/:slug/recommendations` | Recommended anime list (cards) |
| GET | `/api/anime/tooltip/:id` | Anime tooltip / preview info (by poster's `data-tip` ID) |
| GET | `/api/updated?page=` | Paginated latest updated anime listing directly from `https://anikoto.net/latest-updated` (returns `results` & optional `topRated`) |
| GET | `/api/widget?name=&page=` | Home AJAX widgets: `updated-all`, `updated-sub`, `updated-dub`, `trending`, `random` |
| GET | `/api/status?type=&page=` | Airing status listing: `currently-airing`, `finished-airing`, `not-yet-aired` (returns `results` & optional `topRated`) |
| GET | `/api/genre/:genre?page=` | Browse by genre slug (returns `results` & optional `topRated`) |
| GET | `/api/type/:type?page=` | Browse by media type: `tv`, `movie`, `ova`, `ona`, `special`, `music` (returns `results` & optional `topRated`) |
| GET | `/api/schedule?tz=&images=` | Weekly airing schedule (optional UTC tz offset in hours and image resolution) |
| GET | `/api/watch/:slug?ep=` | Streaming sources (m3u8, subtitles, and opening/ending skip ranges) |
| GET | `/api/proxy?url=` | High-volume streaming proxy (CORS bypass, zero-copy streaming, proxy routing) |

### 🔭 Discovery & lists

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/spotlight` | Spotlight carousel (from the home scrape) |
| GET | `/api/top-ten` | Top anime `{ today, week, month }` |
| GET | `/api/trending?page=` | Trending anime (AJAX widget, paginated) |
| GET | `/api/trending-sidebar` | Sidebar bundle: top day/week/month + latest episodes |
| GET | `/api/top-rankings?sort=day\|week\|month` | Ranked top anime for one window |
| GET | `/api/recently-updated?tab=all\|sub\|dub&page=` | Recently updated episodes by audio track |
| GET | `/api/completed` | Recently completed anime |
| GET | `/api/random` | Random anime (full detail + resolved `url`, never cached) |
| GET | `/api/most-popular?page=` | Most viewed anime |
| GET | `/api/new-release?page=` | New releases |
| GET | `/api/newly-added?page=` | Newly added anime |
| GET | `/api/upcoming?page=` | Not-yet-aired anime |
| GET | `/api/az-list/:letter?page=` | A–Z list (`a`–`z`, `0`–`9`, `other`, `all`) |
| GET | `/api/search/suggest?keyword=` | Autocomplete suggestions (max 10) |
| GET | `/api/suggestions?keyword=` | Rich suggestions as full cards (max 10) |

### 🎌 Anime extras & AniList

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/anime/:slug/seasons` | Seasons of an anime (`:slug` may be the numeric id) |
| GET | `/api/anime/:slug/episodes/latest` | Newest episode + episode count |
| GET | `/api/anime/:slug/episodes/ajax?style=&vrf=` | Raw episode list with filters, ranges, `dataIds`, `malId`, `timestamp` |
| GET | `/api/anilist?id=` or `?mal=` | AniList metadata by AniList or MAL id |
| GET | `/api/anilist/:id` | AniList metadata (path form) |
| GET | `/api/anilist/season?season=&year=&page=&perPage=` | Seasonal chart from AniList |

### 🎬 Streaming building blocks

`/api/watch/:slug` runs the whole pipeline for you; these expose the individual steps.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers?ids=&slug=` | Servers for an episode (`ids` = the episode's `dataIds`) |
| GET | `/api/stream?id=&slug=&sv=` | Embed URL + skip data for a server `linkId` |
| GET | `/api/stream/resolve?id=&slug=&type=` | `linkId` → playable HLS (m3u8, proxy URL, qualities, subtitles, skip ranges) |
| GET | `/api/stream/qualities?url=&referer=` | Quality variants of an HLS master playlist (allow-listed domains only) |
| GET | `/api/stream/embeds?slug=&ep=&lang=&provider=` | Ready-to-iframe player URLs (megaplay, anixo, megavid) |
| GET | `/api/mapper-servers?malId=&slug=&timestamp=` | Mapper sources per provider |
| GET | `/api/download?slug=&ep=` | Episode download links |
| GET | `/api/stream/proxy`, `/api/stream/ts-proxy` | Aliases of `/api/proxy` (original AniKotoAPI paths) |

### 🩺 System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Liveness: status, version, uptime, memory |
| GET | `/api/stats` | Request counters, cache usage, feature flags |
| GET | `/api/cache/stats` | Cache keys, hits, misses, hit rate |
| GET | `/api/mirrors` | Health/latency of each upstream mirror |
| POST | `/api/mirrors/reset` | Clear mirror failure state (needs `ADMIN_TOKEN` bearer if set) |
| GET | `/api/proxy/status` | Outbound proxy pool health (credentials masked) |
| GET | `/api/openapi` | OpenAPI 3.0 document as JSON |

See the **full interactive documentation** at `/` (when running locally) or in [`public/openapi.yaml`](./public/openapi.yaml).

---

## ⚡ Cache TTL

| Endpoint | TTL |
|----------|-----|
| `/api/home` | 5 minutes |
| `/api/anime/:slug` / `/api/anime/tooltip/:id` | 30 minutes |
| `/api/search` | 2 minutes |
| `/api/filter` | 5 minutes |
| `/api/schedule` | 1 hour |
| Episodes | 10 minutes |

Add `?refresh=1` to force a fresh scrape.

> [!TIP]
> **Schedule Images:** By default, `/api/schedule` returns an empty string for anime images to keep response times fast (fetching schedule images requires visiting each anime details page). Setting `images=true` will concurrently fetch the poster images for all listed anime with a global concurrency limit of 5.

---

## ⚙️ Environment Variables

Configure environment variables in a `.env` file at the root directory:

```env
# Target base URL (default: https://anikoto.net)
BASE_URL=https://anikoto.net

# Optional: CORS allowed origins (default: "*")
# Supports single origin, comma-separated list, or wildcard "*"
CORS_ALLOWED_ORIGIN=http://localhost:3000,https://your-app.vercel.app

# Optional: Cloudflare Worker URL for streaming proxy
CF_WORKER_URL=https://your-worker-name.workers.dev

# Optional: Comma-separated list of HTTP/HTTPS/SOCKS proxies for outbound routing
PROXIES=http://user:pass@node1.proxy.com:8080,http://node2.proxy.com:8080

# Optional: Brotli response compression (falls back to gzip, then identity)
ENABLE_BROTLI=true
BROTLI_QUALITY=5            # 0-11 (default 5)
GZIP_LEVEL=6                # 1-9 (default 6)
COMPRESSION_MIN_BYTES=1024  # skip tiny bodies (default 1024)

# Optional: fallback upstream mirrors, tried in order after BASE_URL
MIRROR_DOMAINS=https://anikototv.to,https://anikoto.cz
MIRROR_COOLDOWN_MS=60000    # how long a failed mirror is deprioritised (default 60000)

# Optional: protect POST /api/mirrors/reset (send "Authorization: Bearer <token>")
ADMIN_TOKEN=change-me

# Optional: default Referer for /api/stream/qualities when none is given
STREAM_PROXY_REFERER=https://megaplay.buzz/
```

### 🗜️ Compression (Brotli → gzip)

Set `ENABLE_BROTLI=true` to compress JSON responses yourself instead of leaving it to the platform:

| Client sends | Response |
|--------------|----------|
| `Accept-Encoding: br, gzip` | Brotli (`Content-Encoding: br`) |
| `Accept-Encoding: gzip` | gzip (fallback) |
| nothing / `identity` | uncompressed |

`q`-values are honoured (`br;q=0` is treated as "no Brotli"), `Vary: Accept-Encoding` is set, and bodies under `COMPRESSION_MIN_BYTES` or that wouldn't shrink are sent as-is. If Brotli ever throws, that response is gzipped. The streaming proxy and SSE responses are never buffered or compressed. With `ENABLE_BROTLI` unset nothing changes: Next.js' built-in gzip (`next start`) or your host/CDN's compression applies.

### 🪞 Mirrors

`BASE_URL` is always the primary. With `MIRROR_DOMAINS` set, a request that fails (network error, 5xx, 403/429, or a Cloudflare challenge page) is retried on the next mirror; a mirror that fails is tried last for `MIRROR_COOLDOWN_MS`. Check `/api/mirrors`; clear state with `POST /api/mirrors/reset`. Without `MIRROR_DOMAINS` behaviour is exactly as before.

---

## ☁️ Cloudflare Worker Proxy (Optional)

By default, the API provides an internal streaming proxy at `/api/proxy` to bypass CORS. For better performance and free unlimited bandwidth (100k req/day free tier), you can deploy the included Cloudflare Worker and configure the API to use it automatically.

1. Deploy the worker from the `cloudflare-worker/` directory:
   ```bash
   cd cloudflare-worker
   npm install wrangler -g
   wrangler deploy
   ```
2. Add your worker URL as an environment variable in a `.env` file at the root of the project:
   ```env
   CF_WORKER_URL=https://your-worker-name.workers.dev
   ```
   *Note: When this environment variable is set, the `/api/watch` endpoint will automatically return proxy URLs pointing to your Cloudflare Worker instead of the internal `/api/proxy`.*
3. (Optional) Configure outbound proxy rotation for Cloudflare Worker:
   ```bash
   npx wrangler secret put PROXIES
   # Enter comma-separated proxy list: http://user:pass@node1:8080,http://node2:8080
   ```

---

## 🗂️ Project Structure

```
src/
├── proxy.ts              # CORS & proxy middleware (Next.js 16)
├── app/
│   ├── page.tsx          # Interactive API documentation page
│   ├── layout.tsx        # Root layout
│   └── api/              # API route handlers
│       ├── home/         # GET /api/home
│       ├── search/       # GET /api/search
│       ├── filter/       # GET /api/filter
│       ├── anime/        # GET /api/anime/:slug (+ /episodes)
│       │   └── tooltip/  # GET /api/anime/tooltip/:id
│       ├── updated/      # GET /api/updated
│       ├── status/       # GET /api/status
│       ├── genre/        # GET /api/genre/:genre
│       ├── type/         # GET /api/type/:type
│       ├── schedule/     # GET /api/schedule
│       ├── watch/        # GET /api/watch/:slug
│       ├── proxy/        # GET /api/proxy (+ /status)
│       ├── stream/       # /api/stream, /resolve, /qualities, /embeds, proxy aliases
│       └── …             # spotlight, top-ten, az-list, anilist, servers, download,
│                         # health, stats, mirrors, openapi, etc. (see tables above)
├── lib/
│   ├── proxy-pool.ts     # Proxy pool manager & SSRF guard
│   ├── types.ts          # TypeScript interfaces
│   ├── constants.ts      # Base URL, cache TTLs, filter options
│   ├── cache.ts          # Node-Cache instance
│   ├── fetcher.ts        # Axios & proxy pool based HTML fetcher (mirror failover)
│   ├── api.ts            # withApi wrapper, ok/fail helpers, ApiError
│   ├── compression.ts    # Optional Brotli → gzip response compression
│   ├── mirrors.ts        # Upstream mirror selection & health
│   ├── metrics.ts        # Request counters for /api/health and /api/stats
│   ├── anilist.ts        # AniList GraphQL helpers
│   ├── extractors.ts     # Cheerio extraction helpers
│   └── scrapers/         # Per-endpoint scraping logic
│       ├── anime.scraper.ts
│       ├── home.scraper.ts
│       ├── schedule.scraper.ts
│       ├── search.scraper.ts
│       ├── discovery.scraper.ts
│       ├── stream.scraper.ts
│       ├── tooltip.scraper.ts
│       └── watch.scraper.ts
public/
├── openapi.yaml          # OpenAPI 3.0 specification
├── logo.png              # Anikoto wordmark (docs sidebar)
├── logo-banner.png       # README banner
└── favicon.png           # Icon (also src/app/icon.png & favicon.ico)
```

---

## 🧰 Tech Stack

- [Next.js 16](https://nextjs.org) — App Router
- [Cheerio](https://cheerio.js.org) — server-side HTML parsing
- [Axios](https://axios-http.com) — HTTP client
- [Node-Cache](https://www.npmjs.com/package/node-cache) — in-memory caching
- [OpenAPI 3.0](https://spec.openapis.org/oas/v3.0.3) — machine-readable spec behind the interactive docs page
- [Brotli / gzip](https://nodejs.org/api/zlib.html) — optional response compression (Node `zlib`)

---

## 👤 Author

<div align="center">

**Made with ❤️ by Teramoto** · [github.com/Teramoto669](https://github.com/Teramoto669)

⭐ If this project helps you, consider giving it a star!

</div>
