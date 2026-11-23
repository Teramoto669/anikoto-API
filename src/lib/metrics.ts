/**
 * Lightweight in-process request metrics backing /api/health and /api/stats.
 *
 * State lives on `globalThis` so dev-mode HMR and per-route module instances
 * share a single counter. On serverless platforms each warm instance keeps its
 * own counters — they describe "this instance", not the whole deployment.
 */

interface MetricsState {
  startTime: number;
  total: number;
  /** 5xx responses */
  serverErrors: number;
  /** 4xx responses */
  clientErrors: number;
}

const globalKey = '__anikotoMetrics';
const g = globalThis as unknown as Record<string, MetricsState | undefined>;

function state(): MetricsState {
  if (!g[globalKey]) {
    g[globalKey] = { startTime: Date.now(), total: 0, serverErrors: 0, clientErrors: 0 };
  }
  return g[globalKey]!;
}

export function recordRequest(status: number): void {
  const s = state();
  s.total += 1;
  if (status >= 500) s.serverErrors += 1;
  else if (status >= 400) s.clientErrors += 1;
}

export function getMetrics(): Readonly<MetricsState> {
  return { ...state() };
}
