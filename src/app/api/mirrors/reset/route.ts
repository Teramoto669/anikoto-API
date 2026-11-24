import { timingSafeEqual } from 'crypto';
import cache from '@/lib/cache';
import { fail, ok, withApi } from '@/lib/api';
import { resetMirrors } from '@/lib/mirrors';

export const dynamic = 'force-dynamic';

function authorised(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const header = req.headers.get('authorization') ?? '';
  const supplied = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/mirrors/reset
 *
 * Clears mirror failure state so the primary mirror is tried first again.
 * Requires `ADMIN_TOKEN` to be configured and requests to send
 * `Authorization: Bearer <ADMIN_TOKEN>`.
 */
async function handler(req: Request) {
  if (!authorised(req)) return fail('Unauthorized', 401);
  resetMirrors();
  cache.del('mirrors:status');
  return ok({ reset: true });
}

export const POST = withApi(handler);
