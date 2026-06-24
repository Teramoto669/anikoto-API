import { scrapeWatchStream, WatchData } from '@/lib/scrapers/watch.scraper';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/watch/[slug]?ep=1
 *
 * Retrieves video servers and stream sources for a specific episode.
 *
 * Behaviour:
 * - Cache warm  → instant JSON response  { ok: true, data, streaming: false }
 * - Cache cold  → NDJSON streaming response; chunks arrive progressively:
 *     1. { "type": "episode", "episode": {...} }          — after ~1 upstream RTT
 *     2. { "type": "servers", "servers": [...] }          — after ~2 upstream RTTs
 *     3. { "type": "source",  "source": {...} }  (×N)    — as each server resolves
 *     4. { "type": "done" }                               — stream closed; result cached
 *
 * Add ?refresh=1 to bypass cache and force a fresh stream.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedParams = await params;
    const slug = resolvedParams.slug;
    const epNum = searchParams.get('ep') || '1';
    const refresh = searchParams.get('refresh') === '1';

    if (!slug) {
      return Response.json({ ok: false, message: 'Missing slug' }, { status: 400 });
    }

    const cacheKey = `watch:${slug}:${epNum}`;

    // ── Cache hit: respond instantly with plain JSON ──────────────────────────
    if (!refresh) {
      const cached = cacheGet<WatchData>(cacheKey);
      if (cached !== undefined) {
        return Response.json({ ok: true, data: cached, streaming: false });
      }
    }

    // ── Cache miss (or forced refresh): stream the response as NDJSON ─────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const collectedSources: WatchData['sources'] = [];
        let episode: WatchData['episode'] | undefined;
        let servers: WatchData['servers'] = [];

        try {
          for await (const chunk of scrapeWatchStream(slug, epNum)) {
            // Forward each chunk as a newline-delimited JSON line
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));

            // Accumulate data to cache when complete
            if (chunk.type === 'episode') {
              episode = chunk.episode;
            } else if (chunk.type === 'servers') {
              servers = chunk.servers;
            } else if (chunk.type === 'source') {
              collectedSources.push(chunk.source);
            } else if (chunk.type === 'done') {
              // Persist completed result so the next request is an instant cache hit
              if (episode) {
                const fullData: WatchData = { episode, servers, sources: collectedSources };
                cacheSet(cacheKey, fullData, CACHE_TTL.EPISODE);
              }
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[GET /api/watch stream]`, message);
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'error', ok: false, message }) + '\n')
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no', // Disable Nginx/proxy buffering
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[GET /api/watch]`, message);
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
