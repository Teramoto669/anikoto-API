const spec = {
  info: {
    title: "Anikoto Scraper API",
    version: "1.0.0",
    description:
      "A high-performance REST API for scraping anime data from anikoto.net — built with Next.js, Cheerio, and in-memory caching.",
  },
  paths: {
    "/home": {
      get: {
        tags: ["Home"],
        summary: "Homepage data",
        description:
          "Returns spotlight carousel, latest episodes, new release, and top anime by day / week / month.",
        operationId: "getHome",
        parameters: [
          {
            name: "refresh",
            in: "query",
            required: false,
            description: "Set to 1 to bypass cache and force a fresh scrape",
            schema: { type: "string", enum: ["1"] },
            example: "1",
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        spotlight: { type: "array", items: { $ref: "SpotlightAnime" } },
                        latestEpisodes: { type: "array", items: { $ref: "AnimeCard" } },
                        newRelease: { type: "array", items: { $ref: "AnimeCard" } },
                        newAdded: { type: "array", items: { $ref: "AnimeCard" } },
                        justCompleted: { type: "array", items: { $ref: "AnimeCard" } },
                        topDay: { type: "array", items: { $ref: "AnimeCard" } },
                        topWeek: { type: "array", items: { $ref: "AnimeCard" } },
                        topMonth: { type: "array", items: { $ref: "AnimeCard" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/search": {
      get: {
        tags: ["Browse"],
        summary: "Search anime by keyword",
        description: "Search anime by keyword. Returns a list of matching anime cards.",
        operationId: "searchAnime",
        parameters: [
          {
            name: "keyword",
            in: "query",
            required: true,
            description: "Search keyword",
            schema: { type: "string" },
            example: "one piece",
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            description: "Set to 1 to bypass cache",
            schema: { type: "string", enum: ["1"] },
          },
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number (default: 1)",
            schema: { type: "integer" },
            example: "1",
          },
        ],
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        keyword: { type: "string" },
                        totalResults: { type: "integer" },
                        currentPage: { type: "integer" },
                        hasNextPage: { type: "boolean" },
                        hasPreviousPage: { type: "boolean" },
                        maxPage: { type: "integer" },
                        minPage: { type: "integer" },
                        results: { type: "array", items: { $ref: "AnimeCard" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required keyword parameter" },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/filter": {
      get: {
        tags: ["Browse"],
        summary: "Advanced anime filter",
        description:
          "Filter anime with multiple combinable parameters: genre, season, year, type, status, language, rating and sort.",
        operationId: "filterAnime",
        parameters: [
          { name: "keyword", in: "query", required: false, description: "Search keyword", schema: { type: "string" }, example: "demon slayer" },
          { name: "genre[]", in: "query", required: false, description: "Genre ID (e.g. 1=Action, 3=Fantasy)", schema: { type: "string" }, example: "1" },
          {
            name: "season[]",
            in: "query",
            required: false,
            description: "Season",
            schema: { type: "string", enum: ["spring", "summer", "fall", "winter"] },
            example: "spring",
          },
          { name: "year[]", in: "query", required: false, description: "Year (e.g. 2025)", schema: { type: "string" }, example: "2025" },
          {
            name: "term_type[]",
            in: "query",
            required: false,
            description: "Media type",
            schema: { type: "string", enum: ["Movie", "Music", "ONA", "OVA", "Special", "TV"] },
            example: "TV",
          },
          {
            name: "status[]",
            in: "query",
            required: false,
            description: "Airing status",
            schema: { type: "string", enum: ["currently-airing", "finished-airing", "not-yet-aired"] },
            example: "currently-airing",
          },
          {
            name: "language[]",
            in: "query",
            required: false,
            description: "Language",
            schema: { type: "string", enum: ["sub", "dub"] },
            example: "sub",
          },
          {
            name: "rating[]",
            in: "query",
            required: false,
            description: "Age rating",
            schema: { type: "string", enum: ["G", "PG", "PG-13", "R", "R+", "Rx"] },
            example: "PG-13",
          },
          {
            name: "sort",
            in: "query",
            required: false,
            description: "Sort order",
            schema: { type: "string", enum: ["default", "latest-updated", "latest-added", "score", "name-az", "release-date", "most-viewed", "number_of_episodes"] },
            example: "score",
          },
          { name: "page", in: "query", required: false, description: "Page number (default: 1)", schema: { type: "integer" }, example: "1" },
        ],
        responses: {
          "200": {
            description: "Filtered results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        results: { type: "array", items: { $ref: "AnimeCard" } },
                        currentPage: { type: "integer" },
                        hasNextPage: { type: "boolean" },
                        hasPreviousPage: { type: "boolean" },
                        maxPage: { type: "integer" },
                        minPage: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/anime/{slug}": {
      get: {
        tags: ["Anime"],
        summary: "Anime detail",
        description:
          "Get full anime info: title, synopsis, genres, studios, MAL score, episode count, and airing status. Optionally filter the included episode list by range using start and end parameters.",
        operationId: "getAnimeDetail",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "Anime slug from the URL",
            schema: { type: "string" },
            example: "one-piece-odmau",
          },
          {
            name: "start",
            in: "query",
            required: false,
            description: "Starting episode number to include (inclusive). Must be used together with end.",
            schema: { type: "integer" },
            example: 1,
          },
          {
            name: "end",
            in: "query",
            required: false,
            description: "Ending episode number to include (inclusive). Must be used together with start.",
            schema: { type: "integer" },
            example: 12,
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            description: "Set to 1 to bypass cache",
            schema: { type: "string", enum: ["1"] },
          },
        ],
        responses: {
          "200": {
            description: "Anime detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: { $ref: "AnimeDetail" },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid or incomplete episode range parameters" },
          "404": { description: "Anime not found" },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/anime/{slug}/episodes": {
      get: {
        tags: ["Anime"],
        summary: "Anime episode list",
        description:
          "Get episode list for an anime. Optionally filter by episode range using start and end parameters.",
        operationId: "getAnimeEpisodes",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "Anime slug from the URL",
            schema: { type: "string" },
            example: "one-piece-odmau",
          },
          {
            name: "start",
            in: "query",
            required: false,
            description: "Starting episode number (inclusive)",
            schema: { type: "string" },
            example: "5",
          },
          {
            name: "end",
            in: "query",
            required: false,
            description: "Ending episode number (inclusive)",
            schema: { type: "string" },
            example: "10",
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            description: "Set to 1 to bypass cache",
            schema: { type: "string", enum: ["1"] },
          },
        ],
        responses: {
          "200": {
            description: "Episode list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        animeId: { type: "string" },
                        slug: { type: "string" },
                        episodes: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              number: { type: "string" },
                              title: { type: "string" },
                              href: { type: "string" },
                              hasDub: { type: "boolean" },
                              hasSub: { type: "boolean" },
                            },
                          },
                        },
                        related: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              malId: { type: "string" },
                              title: { type: "string" },
                              titleJp: { type: "string" },
                              image: { type: "string" },
                              relation: { type: "string" },
                              href: { type: "string" },
                              slug: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { description: "Anime not found" },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/anime/tooltip/{id}": {
      get: {
        tags: ["Anime"],
        summary: "Get anime tooltip info by ID",
        description: "Fetches and parses the preview/tooltip HTML containing title, synopsis, year, scores, genres, and more for a given anime ID.",
        operationId: "getAnimeTooltip",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Anime ID (data-tip attribute of the anime poster)",
            schema: { type: "string" },
            example: "4127",
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            description: "Set to 1 to bypass cache",
            schema: { type: "string", enum: ["1"] },
          },
        ],
        responses: {
          "200": {
            description: "Anime tooltip info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "4127" },
                        slug: { type: "string", example: "that-time-i-got-reincarnated-as-a-slime-tales-veldora-s-journal-ngovq" },
                        title: { type: "string", example: "That Time I Got Reincarnated as a Slime: Tales - Veldora's Journal" },
                        titleJp: { type: "string", example: "Tensei shitara Slime Datta Ken: Kanwa - Veldora Nikki" },
                        rating: { type: "string", example: "PG-13" },
                        quality: { type: "string", example: "HD" },
                        episodes: {
                          type: "object",
                          properties: {
                            sub: { type: "integer", nullable: true, example: null },
                            dub: { type: "integer", nullable: true, example: null },
                            total: { type: "integer", nullable: true, example: null },
                          },
                        },
                        synopsis: { type: "string", example: "Ifrit, who has been trapped in Rimuru due to the latter's Predator skill..." },
                        otherNames: { type: "string", example: "That Time I Got Reincarnated as a Slime..." },
                        score: { type: "number", example: 6.48 },
                        year: { type: "string", example: "?" },
                        duration: { type: "string", example: "23m min" },
                        status: { type: "string", example: "Finished Airing" },
                        genres: {
                          type: "array",
                          items: { type: "string" },
                          example: ["Fantasy", "Comedy", "Shounen"],
                        },
                        watchUrl: { type: "string", example: "https://anikoto.net/watch/that-time-i-got-reincarnated-as-a-slime-tales-veldora-s-journal-ngovq" },
                        href: { type: "string", example: "/api/anime/that-time-i-got-reincarnated-as-a-slime-tales-veldora-s-journal-ngovq" },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { description: "Anime tooltip not found" },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/latest": {
      get: {
        tags: ["Browse"],
        summary: "Latest / popular anime listing",
        description:
          "Paginated listing of anime sorted by latest-updated, new-release, or most-viewed.",
        operationId: "getLatest",
        parameters: [
          {
            name: "type",
            in: "query",
            required: false,
            description: "Listing type (default: latest-updated)",
            schema: { type: "string", enum: ["latest-updated", "new-release", "most-viewed"] },
            example: "latest-updated",
          },
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number (default: 1)",
            schema: { type: "integer" },
            example: "1",
          },
        ],
        responses: {
          "200": {
            description: "Listing results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: { type: "array", items: { $ref: "AnimeCard" } },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/status": {
      get: {
        tags: ["Browse"],
        summary: "Browse by airing status",
        description: "Browse anime filtered by airing status.",
        operationId: "getByStatus",
        parameters: [
          {
            name: "type",
            in: "query",
            required: false,
            description: "Airing status (default: currently-airing)",
            schema: { type: "string", enum: ["currently-airing", "finished-airing", "not-yet-aired"] },
            example: "currently-airing",
          },
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number (default: 1)",
            schema: { type: "integer" },
            example: "1",
          },
        ],
        responses: {
          "200": {
            description: "Status listing",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: { type: "array", items: { $ref: "AnimeCard" } },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/genre/{genre}": {
      get: {
        tags: ["Browse"],
        summary: "Browse by genre",
        description: "Browse anime filtered by genre slug.",
        operationId: "getByGenre",
        parameters: [
          {
            name: "genre",
            in: "path",
            required: true,
            description: "Genre slug (e.g. action, romance, isekai, fantasy)",
            schema: { type: "string" },
            example: "action",
          },
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number (default: 1)",
            schema: { type: "integer" },
            example: "1",
          },
        ],
        responses: {
          "200": {
            description: "Genre listing",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: { type: "array", items: { $ref: "AnimeCard" } },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/type/{type}": {
      get: {
        tags: ["Browse"],
        summary: "Browse by media type",
        description: "Browse anime filtered by media type.",
        operationId: "getByType",
        parameters: [
          {
            name: "type",
            in: "path",
            required: true,
            description: "Media type",
            schema: { type: "string", enum: ["tv", "movie", "ova", "ona", "special", "music"] },
            example: "movie",
          },
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number (default: 1)",
            schema: { type: "integer" },
            example: "1",
          },
        ],
        responses: {
          "200": {
            description: "Type listing",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: { type: "array", items: { $ref: "AnimeCard" } },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/schedule": {
      get: {
        tags: ["Schedule"],
        summary: "Weekly airing schedule",
        description:
          "Get the 7-day airing schedule starting from today (UTC). Each day is fetched in parallel via the site's `/ajax/schedule/date` endpoint.\n\nTimestamps are UTC-midnight Unix values spaced 86 400 s apart.\n\nAnimeCard fields repurposed for schedule items:\n- `date` — airing time in the requested timezone (e.g. `\"21:00\"`)\n- `type` — episode label (e.g. `\"Episode 13\"`)\n- `image` — resolved poster image URL (requires setting `images=true`)",
        operationId: "getSchedule",
        parameters: [
          {
            name: "tz",
            in: "query",
            required: false,
            description:
              "UTC offset in hours (e.g. 7 for UTC+7, -5 for UTC-5). Defaults to 0 (UTC). Affects the airing times shown in each item's `date` field.",
            schema: { type: "integer", minimum: -12, maximum: 14 },
            example: 7,
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            description: "Set to 1 to bypass cache and force a fresh scrape",
            schema: { type: "string", enum: ["1"] },
          },
          {
            name: "images",
            in: "query",
            required: false,
            description: "Set to true to resolve and fetch poster images (defaults to false)",
            schema: { type: "boolean" },
            example: true,
          },
        ],
        responses: {
          "200": {
            description: "7-day schedule grouped by day",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    data: {
                      type: "array",
                      description: "Array of 7 days starting from today (UTC midnight)",
                      items: {
                        type: "object",
                        properties: {
                          day: {
                            type: "string",
                            description: "Day label derived from the UTC-midnight timestamp",
                            example: "Sat Jul 04",
                          },
                          animes: {
                            type: "array",
                            description: "Anime airing on this day. Empty array if nothing airs.",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string", description: "Same as slug" },
                                slug: { type: "string", example: "one-piece-odmau" },
                                title: { type: "string", example: "One Piece" },
                                titleJp: { type: "string", example: "One Piece" },
                                href: { type: "string", description: "API link to anime detail", example: "/api/anime/one-piece-odmau" },
                                image: { type: "string", description: "Poster image URL (empty string if images is false/omitted or image fetch fails)", example: "https://cdn.anipixcdn.co/thumbnail/a1ea8c4b315b25f06e3c212423037951.jpg" },
                                date: { type: "string", description: "Airing time in the requested timezone", example: "21:00" },
                                type: { type: "string", description: "Episode label", example: "Episode 13" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/watch/{slug}": {
      get: {
        tags: ["Watch"],
        summary: "Streaming sources for an episode",
        description:
          "Returns available streaming servers and direct m3u8 URLs (with optional proxy &amp; subtitles) for a specific episode.",
        operationId: "watchEpisode",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "Anime slug from the URL",
            schema: { type: "string" },
            example: "haibara-s-teenage-new-game-8axzw",
          },
          {
            name: "ep",
            in: "query",
            required: true,
            description: "Episode number to watch",
            schema: { type: "string" },
            example: "1",
          },
        ],
        responses: {
          "200": {
            description: "Streaming sources",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    cached: { type: "boolean" },
                    data: {
                      type: "object",
                      description: "Streaming server list with m3u8 URLs and subtitle tracks",
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required ep parameter" },
          "404": { description: "Anime or episode not found" },
          "500": { description: "Internal server error" },
        },
      },
    },

    "/proxy": {
      get: {
        tags: ["Watch"],
        summary: "Streaming proxy",
        description:
          "Internal proxy to bypass Cloudflare and CORS restrictions for m3u8 video streams and subtitle files. Rewrites segment URLs within m3u8 playlists to keep them routed through the proxy.",
        operationId: "proxyStream",
        parameters: [
          {
            name: "url",
            in: "query",
            required: true,
            description: "The target m3u8 or subtitle URL to proxy",
            schema: { type: "string" },
            example: "https://cdn.mewstream.buzz/.../master.m3u8",
          },
          {
            name: "referer",
            in: "query",
            required: false,
            description: "Referer header to bypass hotlink protection",
            schema: { type: "string" },
            example: "https://megaplay.buzz/",
          },
        ],
        responses: {
          "200": { description: "Proxied m3u8 playlist or subtitle stream" },
          "400": { description: "Missing required url parameter" },
          "500": { description: "Proxy error" },
        },
      },
    },
  },
} as const;

export default spec;
