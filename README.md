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

- 13 REST endpoints covering home, search, filter, anime detail, episodes, tooltip, schedule, streaming sources, and a streaming proxy
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
| GET | `/api/search?keyword=&page=` | Search anime by keyword (paginated) |
| GET | `/api/filter` | Advanced multi-param filter (paginated, returns `results` & optional `topRated`) |
| GET | `/api/anime/:slug` | Anime detail info |
| GET | `/api/anime/:slug/episodes` | Episode list (with range filter) |
| GET | `/api/anime/tooltip/:id` | Anime tooltip / preview info (by poster's `data-tip` ID) |
| GET | `/api/latest?type=&page=` | Paginated listings: `latest-updated`, `new-release`, `most-viewed` (returns `results` & optional `topRated`) |
| GET | `/api/status?type=&page=` | Airing status listing: `currently-airing`, `finished-airing`, `not-yet-aired` (returns `results` & optional `topRated`) |
| GET | `/api/genre/:genre?page=` | Browse by genre slug (returns `results` & optional `topRated`) |
| GET | `/api/type/:type?page=` | Browse by media type: `tv`, `movie`, `ova`, `ona`, `special`, `music` (returns `results` & optional `topRated`) |
| GET | `/api/schedule?tz=&images=` | Weekly airing schedule (optional UTC tz offset in hours and image resolution) |
| GET | `/api/watch/:slug?ep=` | Streaming sources (m3u8 + subs) |
| GET | `/api/proxy?url=` | Streaming proxy (CORS bypass) |

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
│       │   └── tooltip/  # GET /api/anime/tooltip/:id
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
│       ├── anime.scraper.ts
│       ├── home.scraper.ts
│       ├── schedule.scraper.ts
│       ├── search.scraper.ts
│       ├── tooltip.scraper.ts
│       └── watch.scraper.ts
public/
└── openapi.yaml          # OpenAPI 3.0 specification
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
