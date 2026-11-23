/**
 * GET /api/stream/ts-proxy?url=<url>&referer=<url>
 *
 * Alias of GET /api/proxy, kept so players configured with the
 * `/api/stream/ts-proxy` URL (the original AniKotoAPI path) keep working.
 * HLS playlists are rewritten, and segment responses are streamed through,
 * by the same SSRF-guarded implementation.
 */
export { GET } from '../../proxy/route';

export const dynamic = 'force-dynamic';
