export default function HomePage() {
  const endpoints = [
    {
      method: "GET",
      path: "/api/home",
      description: "Home page data: spotlight carousel, latest episodes, new release, top anime by day/week/month.",
      params: [{ name: "refresh", type: "string", optional: true, desc: "Set to 1 to bypass cache" }],
      example: "/api/home",
    },
    {
      method: "GET",
      path: "/api/search",
      description: "Search anime by keyword.",
      params: [
        { name: "keyword", type: "string", optional: false, desc: "Search term (required)" },
        { name: "refresh", type: "string", optional: true, desc: "Set to 1 to bypass cache" },
      ],
      example: "/api/search?keyword=one+piece",
    },
    {
      method: "GET",
      path: "/api/filter?keyword=&type=&sort=default",
      description: "Advanced anime filter with multiple parameters.",
      params: [
        { name: "keyword", type: "string", optional: true, desc: "Search keyword" },
        { name: "genre[]", type: "string[]", optional: true, desc: "Genre ID (e.g. 1 for Action, 2 for Adventure)" },
        { name: "season[]", type: "string[]", optional: true, desc: "Season (spring | summer | fall | winter)" },
        { name: "year[]", type: "string[]", optional: true, desc: "Year (e.g. 2026, 2025)" },
        { name: "term_type[]", type: "string[]", optional: true, desc: "Type (Movie | Music | ONA | OVA | Special | TV)" },
        { name: "status[]", type: "string[]", optional: true, desc: "Status (currently-airing | finished-airing | not-yet-aired)" },
        { name: "language[]", type: "string[]", optional: true, desc: "Language (sub | dub)" },
        { name: "rating[]", type: "string[]", optional: true, desc: "Rating (G | PG | PG-13 | R | R+ | Rx)" },
        { name: "sort", type: "string", optional: true, desc: "Sort order (latest-updated | score | name-az | release-date | etc.)" },
        { name: "page", type: "number", optional: true, desc: "Page number (default: 1)" },
      ],
      example: "/api/filter?keyword=demon+slayer&type[]=Movie&type[]=OVA&sort=score",
    },
    {
      method: "GET",
      path: "/api/anime/:slug",
      description: "Get anime detail info: title, synopsis, genres, studios, MAL score, episode count, status.",
      params: [
        { name: "slug", type: "string", optional: false, desc: "Anime slug from the URL (e.g. one-piece-odmau)" },
        { name: "refresh", type: "string", optional: true, desc: "Set to 1 to bypass cache" },
      ],
      example: "/api/anime/one-piece-odmau",
    },
    {
      method: "GET",
      path: "/api/anime/:slug/episodes",
      description: "Get a list of anime episodes for a given anime, optionally filtered by episode range.",
      params: [
        { name: "slug", type: "string", optional: false, desc: "Anime slug from the URL" },
        { name: "refresh", type: "string", optional: true, desc: "Set to 1 to bypass cache" },
        { name: "start", type: "string", optional: true, desc: "Starting episode number for the range" },
        { name: "end", type: "string", optional: true, desc: "Ending episode number for the range" },
      ],
      example: "/api/anime/one-piece-odmau/episodes?start=5&end=10",
    },
    {
      method: "GET",
      path: "/api/latest",
      description: "Paginated listing of latest/popular anime.",
      params: [
        { name: "type", type: "string", optional: true, desc: "latest-updated | new-release | most-viewed (default: latest-updated)" },
        { name: "page", type: "number", optional: true, desc: "Page number (default: 1)" },
      ],
      example: "/api/latest?type=most-viewed&page=2",
    },
    {
      method: "GET",
      path: "/api/status",
      description: "Get anime by airing status.",
      params: [
        { name: "type", type: "string", optional: true, desc: "currently-airing | finished-airing | not-yet-aired (default: currently-airing)" },
        { name: "page", type: "number", optional: true, desc: "Page number (default: 1)" },
      ],
      example: "/api/status?type=currently-airing",
    },
    {
      method: "GET",
      path: "/api/genre/:genre",
      description: "Browse anime by genre.",
      params: [
        { name: "genre", type: "string", optional: false, desc: "Genre slug (action | romance | isekai | fantasy | etc.)" },
        { name: "page", type: "number", optional: true, desc: "Page number (default: 1)" },
      ],
      example: "/api/genre/action?page=1",
    },
    {
      method: "GET",
      path: "/api/type/:type",
      description: "Browse anime by media type.",
      params: [
        { name: "type", type: "string", optional: false, desc: "tv | movie | ova | ona | special | music" },
        { name: "page", type: "number", optional: true, desc: "Page number (default: 1)" },
      ],
      example: "/api/type/movie",
    },
    {
      method: "GET",
      path: "/api/schedule",
      description: "Get weekly airing schedule.",
      params: [{ name: "refresh", type: "string", optional: true, desc: "Set to 1 to bypass cache" }],
      example: "/api/schedule",
    },
    {
      method: "GET",
      path: "/api/watch/:slug",
      description: "Get streaming servers and direct m3u8 URLs (with proxy & subtitles) for a specific episode.",
      params: [
        { name: "slug", type: "string", optional: false, desc: "Anime slug from the URL" },
        { name: "ep", type: "string", optional: false, desc: "Episode number to watch" },
      ],
      example: "/api/watch/haibara-s-teenage-new-game-8axzw?ep=1",
    },
    {
      method: "GET",
      path: "/api/proxy",
      description: "Internal streaming proxy to bypass Cloudflare and CORS restrictions for m3u8 video streams and subtitles.",
      params: [
        { name: "url", type: "string", optional: false, desc: "The target m3u8 or subtitle URL to proxy" },
        { name: "referer", type: "string", optional: true, desc: "The referer header to bypass hotlink protection" },
      ],
      example: "/api/proxy?url=https%3A%2F%2Fcdn.mewstream.buzz%2F...%2Fmaster.m3u8&referer=https%3A%2F%2Fmegaplay.buzz%2F",

    },
  ];

  const responseShape = `{
  "ok": true,
  "data": { ... }
}

// On error:
{
  "ok": false,
  "message": "Error description"
}`;

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0e1a 0%, #0d1526 50%, #0a0e1a 100%)",
      color: "#e2e8f0",
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      padding: "0",
      margin: "0",
    }}>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(180deg, rgba(99,102,241,0.15) 0%, transparent 100%)",
        borderBottom: "1px solid rgba(99,102,241,0.2)",
        padding: "60px 24px 48px",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-block",
          background: "rgba(99,102,241,0.15)",
          border: "1px solid rgba(99,102,241,0.4)",
          borderRadius: "999px",
          padding: "4px 16px",
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#a5b4fc",
          marginBottom: "20px",
        }}>
          REST API · v1.0
        </div>
        <h1 style={{
          fontSize: "clamp(2rem, 5vw, 3.5rem)",
          fontWeight: 800,
          background: "linear-gradient(135deg, #fff 0%, #a5b4fc 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          margin: "0 0 16px",
          letterSpacing: "-0.03em",
        }}>
          Anikoto Scraper API
        </h1>
        <p style={{
          fontSize: "1.1rem",
          color: "#94a3b8",
          maxWidth: "600px",
          margin: "0 auto 32px",
          lineHeight: 1.7,
        }}>
          A high-performance REST API for scraping anime data from <strong style={{ color: "#c7d2fe" }}>anikototv.to</strong> — built with Next.js, Cheerio, and in-memory caching.
        </p>
        <p style={{
          fontSize: "13px",
          color: "#64748b",
          marginBottom: "24px",
        }}>
          Author: <span style={{ color: "#a5b4fc", fontWeight: 600 }}>Teramoto</span>
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          {["12 Endpoints", "In-Memory Cache", "TypeScript"].map((badge) => (
            <span key={badge} style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: "13px",
              color: "#cbd5e1",
            }}>{badge}</span>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 24px" }}>

        {/* Response format */}
        <section style={{ marginBottom: "48px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#a5b4fc", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Response Format
          </h2>
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: "12px",
            padding: "20px 24px",
          }}>
            <pre style={{ margin: 0, fontSize: "13px", color: "#94a3b8", fontFamily: "var(--font-geist-mono), monospace", lineHeight: 1.7 }}>
              {responseShape}
            </pre>
          </div>
        </section>

        {/* Endpoints */}
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#a5b4fc", marginBottom: "24px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Endpoints
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {endpoints.map((ep, i) => (
            <div key={i} style={{
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: "12px",
              overflow: "hidden",
              transition: "border-color 0.2s",
            }}>
              {/* Header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                background: "rgba(99,102,241,0.04)",
              }}>
                <span style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "11px",
                  padding: "3px 10px",
                  borderRadius: "6px",
                  letterSpacing: "0.05em",
                }}>
                  {ep.method}
                </span>
                <code style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: "14px",
                  color: "#e2e8f0",
                  fontWeight: 600,
                }}>
                  {ep.path}
                </code>
              </div>

              {/* Body */}
              <div style={{ padding: "16px 20px" }}>
                <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "14px", lineHeight: 1.6 }}>
                  {ep.description}
                </p>

                {/* Params */}
                {ep.params.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                      Parameters
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {ep.params.map((p, pi) => (
                        <div key={pi} style={{
                          display: "flex",
                          gap: "12px",
                          alignItems: "flex-start",
                          fontSize: "13px",
                        }}>
                          <code style={{
                            color: "#a5b4fc",
                            fontFamily: "var(--font-geist-mono), monospace",
                            minWidth: "120px",
                            flexShrink: 0,
                          }}>
                            {p.name}
                          </code>
                          <span style={{
                            color: "#475569",
                            minWidth: "70px",
                            flexShrink: 0,
                            fontSize: "11px",
                            paddingTop: "1px",
                          }}>
                            {p.type}
                          </span>
                          <span style={{
                            color: p.optional ? "#64748b" : "#f59e0b",
                            minWidth: "60px",
                            flexShrink: 0,
                            fontSize: "11px",
                            paddingTop: "1px",
                          }}>
                            {p.optional ? "optional" : "required"}
                          </span>
                          <span style={{ color: "#64748b" }}>{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Example */}
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                    Example
                  </div>
                  <a
                    href={ep.example}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      background: "rgba(99,102,241,0.08)",
                      border: "1px solid rgba(99,102,241,0.2)",
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: "12px",
                      color: "#818cf8",
                      textDecoration: "none",
                    }}
                  >
                    {ep.example} ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer style={{
          marginTop: "64px",
          paddingTop: "24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
          color: "#475569",
          fontSize: "13px",
        }}>
          <p>Built with Next.js · Cheerio · Node-Cache &nbsp;|&nbsp; Data source: anikototv.to</p>
          <p style={{ marginTop: "4px", fontSize: "11px" }}>For educational purposes only.</p>
        </footer>
      </div>
    </main>
  );
}
