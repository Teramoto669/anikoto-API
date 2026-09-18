<div align="center">
  <h1>Anikoto API</h1>
  
  <p><strong>A high-performance REST API for scraping anime data from anikoto.net, built with Next.js 16</strong></p>

  <p>
    <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FTeramoto669%2Fanikoto-scrap-api"><img src="https://vercel.com/button" alt="Deploy with Vercel"></a>
    <img src="https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js" alt="Next.js 16">
    <img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License MIT">
  </p>

  <p>Author: <strong>Teramoto</strong></p>

  <p>
    <a href="#-features">Features</a> • 
    <a href="#-getting-started">Quick Start</a> • 
    <a href="#-api-overview">API Endpoints</a> • 
    <a href="#%EF%B8%8F-project-structure">Project Structure</a> • 
    <a href="#%E2%98%81%EF%B8%8F-cloudflare-worker-proxy-optional">Deployment</a>
  </p>
</div>

> **For educational purposes only.** This project is not affiliated with anikoto.net.

> [!IMPORTANT]
>
> 1. There was previously a hosted version of this API for showcasing purposes only, and it was misused; It is recommended to deploy your own instance for personal use by customizing the API as you need it to be.
> 2. This API is just an unofficial API for [anikoto.net](https://anikoto.net) and is in no other way officially related to the same.
> 3. The content that this API provides is not mine, nor is it hosted by me. These belong to their respective owners. This API just demonstrates how to build an API that scrapes websites and uses their content.

---

## ✨ Features

- 12 REST endpoints covering home, search, filter, anime detail, episodes, schedule, streaming sources, and a streaming proxy
- Response envelope — every response is `{ ok: true, data: ... }` or `{ ok: false, message: "..." }`
- In-memory cache (TTL per endpoint) — add `?refresh=1` to any request to bypass
- Interactive **Swagger UI** docs at `/` powered by an OpenAPI 3.0 spec (`public/openapi.yaml`)
- TypeScript — fully typed responses via `src/lib/types.ts`

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

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/home` | Home data: spotlight, latest eps, top anime |
| GET | `/api/search?keyword=` | Search anime by keyword |
| GET | `/api/filter` | Advanced multi-param filter |
| GET | `/api/anime/:slug` | Anime detail info |
| GET | `/api/anime/:slug/episodes` | Episode list (with range filter) |
| GET | `/api/latest` | Latest / popular anime listing |
| GET | `/api/status` | Browse by airing status |
| GET | `/api/genre/:genre` | Browse by genre |
| GET | `/api/type/:type` | Browse by media type |
| GET | `/api/schedule` | Weekly airing schedule |
| GET | `/api/watch/:slug?ep=` | Streaming sources (m3u8 + subs) |
| GET | `/api/proxy?url=` | Streaming proxy (CORS bypass) |

See the **full interactive documentation** at [`/`](https://anikoto-scrap-api.vercel.app) or in [`public/openapi.yaml`](./public/openapi.yaml).

---

## ⚡ Cache TTL

| Endpoint | TTL |
|----------|-----|
| `/api/home` | 5 minutes |
| `/api/anime/:slug` | 30 minutes |
| `/api/search` | 2 minutes |
| `/api/filter` | 5 minutes |
| `/api/schedule` | 1 hour |
| Episodes | 10 minutes |

Add `?refresh=1` to force a fresh scrape.

---

## 🎛️ Stream resolution settings (optional)

`/api/watch/:slug` resolves the site's players (MegaPlay `Vidstream-*` / `HD-1` servers, the Kiwi mapper side-channel, MegaCloud/VidStream embeds) into direct `m3u8` URLs. MegaPlay rotates its player crypto from time to time — the defaults below track the current bundle and can be overridden via environment variables if it rotates again:

```env
# AES key/IV used to decrypt the player's `enc` payload (defaults match the live bundle)
MEGAPLAY_AES_KEY=i?LMTAx0Q6,:}50U
MEGAPLAY_AES_IV=W0;27ToaUpl_P%'c
# HMAC secret used to mint the short-lived `token=` on path-locked CDN URLs
MEGAPLAY_TOKEN_SECRET=MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s
# Token lifetime in seconds (default 90; tokens are re-signed automatically while cached)
MEGAPLAY_TOKEN_TTL_SECONDS=90
# Verbose per-request resolution logs
DEBUG_MEGAPLAY=1
```

Notes:

- Sources that could not be resolved to an m3u8 come back with `"m3u8": null`, `"unresolved": true` and (when the Kiwi mapper only offers downloads) a `"downloads": { "1080p": "…" }` map.
- Mapper mirrors are raced in parallel; `mapper.mewcdn.online` is currently down and only kept as a fallback, so a `502` line in the logs is expected.

The bundled download client is served at **`/streamvault.html`** (alias: `/streamvault`).

---

## 📥 StreamVault download client

`public/streamvault.html` assembles an episode in the browser: it picks the **highest** playlist rung, fetches the
segments and remuxes MPEG-TS into MP4 with the vendored `toMp4.js` muxer (`public/vendor/tomp4.min.js`, MIT —
see `public/vendor/README.md`). Nothing is re-encoded, so video and audio quality are exactly what the CDN served
(a clean remux is typically 4–8 % smaller only because TS packet padding is dropped).

### Speed

| Mechanism | Effect |
| --- | --- |
| Adaptive concurrency (AIMD) | Starts at your setting and ramps toward 16 in-flight segments, halving immediately on `429`/errors |
| Pre-flight probe | Segment 0 is fetched through the full host/transport ladder first, so a dead CDN host is discovered in seconds and benched instead of stalling the run |
| Host cooldown | Hosts that returned 403/404/bad bytes are skipped for 90 s (20 s for soft failures) — no repeated probing of dead mirrors, and healthy hosts never pay for speculative mirror requests |
| Streamed `/api/proxy` | The proxy pipes upstream bytes straight through instead of buffering whole segments (TTFB is now the CDN's, not the full segment download) |
| Muxer prefetch + per-slot mode memory | The muxer loads while segments download, and the working transport (`cf`/`proxy`/`direct`) plus host stick per slot |

### Safety and privacy

- **Only media is downloaded.** Segments must start with a valid MPEG-TS sync byte, `ftyp` or `moof`; direct downloads
  are sniffed by container (`MP4`, `Matroska/WebM`, `MPEG-TS`, `Ogg`, `AVI`, `FLV`, `MP3`) and anything else —
  executables, ZIPs, HTML/JSON error pages — is rejected with a clear message instead of being saved as a video.
- **No third-party requests.** The page loads no fonts, analytics or remote scripts; the muxer is vendored in this
  repository. Fetches are cookie-less (`credentials: 'omit'`), send no referrer, and the page ships a
  `Content-Security-Policy` restricting scripts/styles/frames to the page itself.
- **Playlist hygiene.** These CDNs interleave playlists with entries that are not video: ad creatives
  (`…~tplv-….image` on the TikTok ad CDNs), thumbnail/poster images and subtitle sidecars. Those lines are dropped
  before anything is queued — the downloader never fetches them (an ad-injected playlist used to cost hundreds of
  requests to ad CDNs) and the proxy leaves their URIs un-rewritten.
- **URL guard.** Playlist and user-supplied URLs must be `http(s)`, public-host and credential-free — `javascript:`,
  `data:`, `file:`, `blob:`, embedded credentials and LAN/loopback targets are refused.
- **Verifiable output.** Every finished file is hashed (SHA-256) and the digest is shown in the log and next to the
  completed item, plus a remux ratio in the log (a clean TS→MP4 remux keeps ~90–96 % of the input).
- **Honest file names.** A pasted `.m3u8` is detected and routed through the segment downloader; anything else keeps the
  extension its container actually has (`.mp4`, `.ts`, `.mkv`, …) instead of being relabelled.

---

### If the CDN refuses you (VPN / region)

Some of these hosts are picky about who connects. A `403`/`401` in the log means the CDN rejected *this
connection*, not that the host is gone: datacenter ranges and VPN exit IPs are often refused outright. Because the
proxy runs on your own machine, both the direct and the `/api/proxy` path leave through the same VPN, so it is
worth trying a different exit (or turning the VPN off for one download) before blaming the mirrors. The client
already says so: a failure that ends in 401/403/451 is reported as *"the CDN refused this connection — try another
VPN exit, or turn the VPN off"*, while a 404 stays a plain failure.

DNS-level filtering (Proton NetShield, Pi-hole, …) has little to bite on here: the page fetches media and key files
only, never ad or tracker hosts, because playlists are filtered before anything is queued. Host cooldowns live in
memory for the current page and are cleared when you save settings, so after switching exits a reload is enough.
Both the direct and `/api/proxy` paths leave through your machine, so they see the same VPN exit — a refusal in the
log therefore points at the exit, not at the client.

## ✅ Offline checks

Both suites run on Node built-ins only (no browser, no network) and fail loudly if a guarantee above regresses:

```bash
npm run check            # both of the below
npm run check:streamvault  # privacy surface, URL guard, container sniffing, muxer provenance (sha256), concurrency
npm run check:proxy        # /api/proxy SSRF guard, redirect hop validation, stream watchdog semantics
```

---

## ☁️ Cloudflare Worker Proxy (Optional)

By default, the API provides an internal streaming proxy at `/api/proxy` to bypass CORS. For better performance and free unlimited bandwidth (100k req/day free tier), you can deploy the included Cloudflare Worker and configure the API to use it automatically.

### How `/api/proxy` behaves

| Aspect | Behaviour |
| --- | --- |
| Transfer | Media is piped straight from the CDN to the client — nothing is buffered, re-encoded or compression-decoded twice (playlists are read fully, since they get rewritten) |
| Headers | `Range` → `206`/`Content-Range`, `Accept-Ranges`, `ETag`, `Last-Modified` are forwarded; `Content-Length` is only forwarded when the upstream body is identity-encoded, otherwise the framework's transparent decompression would make it lie and clients would truncate |
| Redirects | Followed manually (max 5 hops) so every hop is checked against the SSRF guard |
| Timeouts | 20 s to answer with headers, 20 s to the first body chunk, then 120 s of tolerated silence mid-transfer — re-armed on every chunk, so long downloads are never cut short |
| Target policy | `http(s)` only, no credentials in the URL, and loopback/RFC1918/link-local/metadata targets are refused when `NODE_ENV=production`. Set `PROXY_ALLOW_PRIVATE_TARGETS=1` to allow them deliberately (local dev allows them by default so mock upstreams work) |

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

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── page.tsx          # Swagger UI documentation page
│   ├── layout.tsx        # Root layout
│   └── api/              # API route handlers
│       ├── home/         # GET /api/home
│       ├── search/       # GET /api/search
│       ├── filter/       # GET /api/filter
│       ├── anime/        # GET /api/anime/:slug (+ /episodes)
│       ├── latest/       # GET /api/latest
│       ├── status/       # GET /api/status
│       ├── genre/        # GET /api/genre/:genre
│       ├── type/         # GET /api/type/:type
│       ├── schedule/     # GET /api/schedule
│       ├── watch/        # GET /api/watch/:slug
│       ├── proxy/        # GET /api/proxy
│       └── sources/      # Streaming source resolvers
├── lib/
│   ├── types.ts          # TypeScript interfaces
│   ├── constants.ts      # Base URL, cache TTLs, filter options
│   ├── cache.ts          # Node-Cache instance
│   ├── fetcher.ts        # Axios-based HTML fetcher
│   ├── extractors.ts     # Cheerio extraction helpers
│   └── scrapers/         # Per-endpoint scraping logic
public/
├── openapi.yaml          # OpenAPI 3.0 specification
├── streamvault.html      # Browser download client (segment fetch + remux UI)
└── vendor/               # Vendored browser deps (toMp4.js muxer, MIT) + build notes
```

---

## 🛠️ Tech Stack

- [Next.js 16](https://nextjs.org) — App Router
- [Cheerio](https://cheerio.js.org) — server-side HTML parsing
- [Axios](https://axios-http.com) — HTTP client
- [Node-Cache](https://www.npmjs.com/package/node-cache) — in-memory caching
- [Swagger UI](https://swagger.io/tools/swagger-ui/) — interactive API docs

---

## 👤 Author

**Teramoto** · [github.com/Teramoto669](https://github.com/Teramoto669)
