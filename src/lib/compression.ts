/**
 * Optional response compression: Brotli with gzip fallback.
 *
 * Opt-in via environment:
 *
 *   ENABLE_BROTLI=true          Turn the feature on (default: off)
 *   BROTLI_QUALITY=5            0-11. 5 beats gzip-6 on JSON at similar CPU cost (4 does not)
 *   GZIP_LEVEL=6                1-9
 *   COMPRESSION_MIN_BYTES=1024  Don't bother compressing smaller bodies
 *
 * When ENABLE_BROTLI is on, every route wrapped with `withApi` negotiates the
 * client's `Accept-Encoding`:
 *
 *   br accepted        → Brotli
 *   only gzip accepted → gzip           (the fallback)
 *   neither            → identity
 *
 * If Brotli itself throws for some reason, the response is gzipped instead.
 *
 * When ENABLE_BROTLI is off this module is a no-op and the platform's own
 * compression applies (Next.js gzip on `next start`, Brotli/gzip on Vercel and
 * most CDNs), i.e. behaviour is identical to before this feature existed.
 *
 * Streaming responses (SSE, the media proxy) are never buffered or compressed.
 */
import zlib from 'zlib';
import { promisify } from 'util';

const brotliCompress = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export type ContentEncoding = 'br' | 'gzip';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export function isBrotliEnabled(): boolean {
  return TRUTHY.has((process.env.ENABLE_BROTLI ?? '').trim().toLowerCase());
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getCompressionConfig() {
  return {
    brotli: isBrotliEnabled(),
    brotliQuality: intEnv('BROTLI_QUALITY', 5, 0, 11),
    gzipLevel: intEnv('GZIP_LEVEL', 6, 1, 9),
    minBytes: intEnv('COMPRESSION_MIN_BYTES', 1024, 0, Number.MAX_SAFE_INTEGER),
  };
}

/**
 * Pick the best encoding the client accepts, honouring q-values
 * (`gzip;q=0` means "not acceptable") and the `*` wildcard.
 */
export function negotiateEncoding(
  acceptEncoding: string | null | undefined,
  brotliAllowed: boolean
): ContentEncoding | null {
  if (!acceptEncoding) return null;

  const weights = new Map<string, number>();
  for (const part of acceptEncoding.split(',')) {
    const [rawName, ...params] = part.trim().split(';');
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q=([0-9.]+)$/i);
      if (m) q = Number.parseFloat(m[1]);
    }
    weights.set(name, Number.isNaN(q) ? 1 : q);
  }

  const accepts = (enc: string): boolean => {
    const w = weights.get(enc) ?? weights.get('*');
    return w !== undefined && w > 0;
  };

  if (brotliAllowed && accepts('br')) return 'br';
  if (accepts('gzip')) return 'gzip';
  return null;
}

const COMPRESSIBLE_TYPE = /(^|\/|\+)(json|xml|yaml|javascript|html|plain|csv|mpegurl)\b|^text\//i;

function isCompressibleType(contentType: string | null): boolean {
  if (!contentType) return false;
  if (/text\/event-stream/i.test(contentType)) return false;
  return COMPRESSIBLE_TYPE.test(contentType);
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get('Vary');
  if (!existing) {
    headers.set('Vary', value);
    return;
  }
  const parts = existing.split(',').map((s) => s.trim().toLowerCase());
  if (!parts.includes(value.toLowerCase()) && existing.trim() !== '*') {
    headers.set('Vary', `${existing}, ${value}`);
  }
}

/**
 * Compress `res` according to `req`'s Accept-Encoding when ENABLE_BROTLI is on.
 * Returns the original response untouched whenever compression doesn't apply.
 */
export async function compressResponse(req: Request, res: Response): Promise<Response> {
  const cfg = getCompressionConfig();
  if (!cfg.brotli) return res;

  // Nothing to compress / must not touch.
  if (!res.body) return res;
  if (res.status === 204 || res.status === 205 || res.status === 304 || res.status === 206) return res;
  if (res.headers.has('Content-Encoding')) return res;
  if (/no-transform/i.test(res.headers.get('Cache-Control') ?? '')) return res;
  if (!isCompressibleType(res.headers.get('Content-Type'))) return res;

  const encoding = negotiateEncoding(req.headers.get('accept-encoding'), true);

  // The body is read here, so everything below must rebuild a Response from it.
  const raw = Buffer.from(await res.arrayBuffer());
  const headers = new Headers(res.headers);
  appendVary(headers, 'Accept-Encoding');

  const passthrough = (): Response => {
    headers.set('Content-Length', String(raw.length));
    return new Response(raw, { status: res.status, statusText: res.statusText, headers });
  };

  if (!encoding || raw.length < cfg.minBytes) return passthrough();

  let body: Buffer;
  let used: ContentEncoding = encoding;
  try {
    if (encoding === 'br') {
      body = await brotliCompress(raw, {
        params: {
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
          [zlib.constants.BROTLI_PARAM_QUALITY]: cfg.brotliQuality,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      });
    } else {
      body = await gzip(raw, { level: cfg.gzipLevel });
    }
  } catch (err) {
    // Brotli failed → gzip fallback (only if the client accepts it); else identity.
    console.error(`[compression] ${encoding} failed:`, err instanceof Error ? err.message : err);
    if (encoding === 'br' && negotiateEncoding(req.headers.get('accept-encoding'), false) === 'gzip') {
      try {
        body = await gzip(raw, { level: cfg.gzipLevel });
        used = 'gzip';
      } catch {
        return passthrough();
      }
    } else {
      return passthrough();
    }
  }

  // Never make a response bigger.
  if (body.length >= raw.length) return passthrough();

  headers.set('Content-Encoding', used);
  headers.set('Content-Length', String(body.length));
  // A strong ETag no longer describes these bytes.
  const etag = headers.get('ETag');
  if (etag && !etag.startsWith('W/')) headers.set('ETag', `W/${etag}`);

  return new Response(new Uint8Array(body), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
