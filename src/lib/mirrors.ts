/**
 * Upstream mirror management.
 *
 * `BASE_URL` is always the primary mirror. Optionally add fallbacks with
 *
 *   MIRROR_DOMAINS=https://anikototv.to,https://anikoto.cz,https://anikoto.me
 *
 * With no MIRROR_DOMAINS the list is just [BASE_URL] and the fetcher behaves
 * exactly as it did before mirrors existed.
 *
 * The fetcher asks `getMirrorOrder()` for the order to try, then reports each
 * outcome back. A mirror that fails is put on a short cool-down and tried last;
 * the first mirror to succeed becomes the "current" one.
 */
import axios from 'axios';
import { BASE_URL, DEFAULT_HEADERS } from './constants';
import { proxyPool } from './proxy-pool';

export interface Mirror {
  name: string;
  url: string;
  priority: number;
}

export interface MirrorStatus extends Mirror {
  status: 'online' | 'offline';
  latencyMs: number;
  httpStatus: number | null;
  isCurrent: boolean;
  coolingDown: boolean;
}

interface MirrorState {
  current: string | null;
  failedAt: Map<string, number>;
}

const globalKey = '__anikotoMirrors';
const g = globalThis as unknown as Record<string, MirrorState | undefined>;

function state(): MirrorState {
  if (!g[globalKey]) g[globalKey] = { current: null, failedAt: new Map() };
  return g[globalKey]!;
}

function cooldownMs(): number {
  const n = Number.parseInt(process.env.MIRROR_COOLDOWN_MS ?? '', 10);
  return Number.isNaN(n) || n < 0 ? 60_000 : n;
}

function toOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Configured mirrors, primary first, de-duplicated. Read each call so env changes apply. */
export function getMirrors(): Mirror[] {
  const origins: string[] = [];
  const add = (raw: string) => {
    const o = toOrigin(raw);
    if (o && !origins.includes(o)) origins.push(o);
  };

  add(BASE_URL);
  for (const raw of (process.env.MIRROR_DOMAINS ?? '').split(',')) {
    if (raw.trim()) add(raw);
  }

  return origins.map((url, i) => ({
    url,
    name: i === 0 ? 'Primary' : `Mirror ${i}`,
    priority: i + 1,
  }));
}

export function isKnownMirrorOrigin(origin: string): boolean {
  return getMirrors().some((m) => m.url === origin);
}

function inCooldown(url: string, now = Date.now()): boolean {
  const at = state().failedAt.get(url);
  return at !== undefined && now - at < cooldownMs();
}

/**
 * Order in which the fetcher should try mirrors: the current (last known good)
 * one first, then the healthy rest by priority, then any that are cooling down.
 */
export function getMirrorOrder(): string[] {
  const mirrors = getMirrors().map((m) => m.url);
  const { current } = state();
  const now = Date.now();

  const healthy = mirrors.filter((u) => !inCooldown(u, now));
  const cooling = mirrors.filter((u) => inCooldown(u, now));

  const ordered = [...healthy, ...cooling];
  if (current && ordered.includes(current) && !inCooldown(current, now)) {
    return [current, ...ordered.filter((u) => u !== current)];
  }
  return ordered;
}

export function reportMirrorSuccess(url: string): void {
  const s = state();
  s.failedAt.delete(url);
  s.current = url;
}

export function reportMirrorFailure(url: string): void {
  const s = state();
  s.failedAt.set(url, Date.now());
  if (s.current === url) s.current = null;
}

export function resetMirrors(): void {
  const s = state();
  s.current = null;
  s.failedAt.clear();
}

export function getCurrentMirror(): string {
  return state().current ?? getMirrors()[0].url;
}

/** Probe every mirror in parallel (GET /home) and report health + latency. */
export async function getMirrorStatus(): Promise<MirrorStatus[]> {
  const mirrors = getMirrors();
  const current = getCurrentMirror();

  return Promise.all(
    mirrors.map(async (m) => {
      const started = Date.now();
      let httpStatus: number | null = null;
      let online = false;
      const proxyUrl = proxyPool.getNextProxy();
      const httpsAgent = proxyUrl ? proxyPool.getAgent(proxyUrl) : undefined;
      try {
        const res = await axios.get(`${m.url}/home`, {
          headers: DEFAULT_HEADERS,
          timeout: 8_000,
          maxRedirects: 3,
          // We only care that the host answers; any non-5xx counts as reachable.
          validateStatus: () => true,
          responseType: 'text',
          // Don't download megabytes just to probe.
          maxContentLength: 2_000_000,
          ...(httpsAgent ? { httpsAgent, httpAgent: httpsAgent } : {}),
        });
        httpStatus = res.status;
        online = res.status >= 200 && res.status < 400;
        if (proxyUrl) {
          if (online) proxyPool.reportSuccess(proxyUrl);
          else proxyPool.reportFailure(proxyUrl);
        }
      } catch {
        if (proxyUrl) proxyPool.reportFailure(proxyUrl);
        online = false;
      }
      return {
        ...m,
        status: online ? ('online' as const) : ('offline' as const),
        latencyMs: Date.now() - started,
        httpStatus,
        isCurrent: m.url === current,
        coolingDown: inCooldown(m.url),
      };
    })
  );
}
