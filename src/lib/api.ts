/**
 * Shared helpers for API route handlers.
 *
 *   ok(data)            → { ok: true, data }
 *   fail(message, 4xx)  → { ok: false, message }
 *   ApiError            → throw from a scraper/route to produce a specific status
 *   withApi(handler)    → wraps a route handler with:
 *                           • central error → JSON mapping (so routes don't need try/catch)
 *                           • request metrics (/api/health, /api/stats)
 *                           • optional Brotli/gzip compression (see compression.ts)
 */
import axios from 'axios';
import { NextResponse } from 'next/server';
import { compressResponse } from './compression';
import { recordRequest } from './metrics';
import { sanitizeUrlForLogging } from './validation';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 500, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

/** `?refresh=1` (or `true`) bypasses the cache. */
export function wantsRefresh(req: Request): boolean {
  const v = new URL(req.url).searchParams.get('refresh');
  return v === '1' || v === 'true';
}

/** Map any thrown value onto a status + public message. */
export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof ApiError) return { status: err.status, message: err.message };

  if (axios.isAxiosError(err)) {
    const upstream = err.response?.status;
    if (upstream === 404) return { status: 404, message: 'Not found on upstream site' };
    if (upstream && upstream >= 400 && upstream < 500) {
      return { status: 502, message: `Upstream rejected the request (HTTP ${upstream})` };
    }
    // Axios messages can embed the full URL (including proxy credentials).
    return { status: 502, message: sanitizeUrlForLogging(err.message) };
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  return { status: 500, message };
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

interface WithApiOptions {
  /**
   * Set false for streaming/binary responses (media proxy) so they are never
   * buffered or compressed. Default: true.
   */
  compress?: boolean;
}

export function withApi<C = unknown>(handler: Handler<C>, options: WithApiOptions = {}): Handler<C> {
  return async (req, ctx) => {
    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (err) {
      const { status, message } = describeError(err);
      if (status >= 500) console.error(`[${req.method} ${new URL(req.url).pathname}]`, message);
      res = fail(message, status);
    }

    recordRequest(res.status);

    if (options.compress === false) return res;
    return compressResponse(req, res);
  };
}
