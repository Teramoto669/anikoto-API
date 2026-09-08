import { HttpsProxyAgent } from 'https-proxy-agent';

// ── Realistic Browser User-Agents & Fingerprints ────────────────────────────
export interface BrowserHeaders {
  'User-Agent': string;
  'sec-ch-ua'?: string;
  'sec-ch-ua-mobile'?: string;
  'sec-ch-ua-platform'?: string;
  'Accept-Language': string;
}

const BROWSER_FINGERPRINTS: BrowserHeaders[] = [
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
    'Accept-Language': 'en-US,en;q=0.5',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 OPR/118.0.0.0',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Opera GX";v="118", "Chromium";v="132"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Accept-Language': 'en-US,en;q=0.9',
  },
];

/**
 * Returns a random realistic browser header set for anti-bot evasion.
 */
export function getRandomBrowserHeaders(): BrowserHeaders {
  const index = Math.floor(Math.random() * BROWSER_FINGERPRINTS.length);
  return { ...BROWSER_FINGERPRINTS[index] };
}

// ── SSRF Guard ──────────────────────────────────────────────────────────────
/**
 * Checks if a target URL points to a private/internal IP address or hostname.
 */
export function isPrivateUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();

    // Protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    // Localhost & private hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan')
    ) {
      return true;
    }

    // IPv6 loopback
    if (hostname === '::1' || hostname === '[::1]') {
      return true;
    }

    // IPv4 regex checks
    // 127.0.0.0/8 (Loopback)
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    // 10.0.0.0/8 (Private)
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    // 172.16.0.0/12 (Private)
    if (
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) return true;
    // 192.168.0.0/16 (Private)
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    // 169.254.0.0/16 (Link-local / AWS metadata)
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    // 0.0.0.0
    if (hostname === '0.0.0.0') return true;

    return false;
  } catch (_) {
    return true; // invalid URL considered unsafe
  }
}

// ── Proxy Pool Manager ──────────────────────────────────────────────────────
class ProxyPoolManager {
  private proxies: string[] = [];
  private index = 0;
  private failedProxies = new Map<string, number>(); // proxyUrl -> timestamp of failure
  private agentCache = new Map<string, HttpsProxyAgent<string>>();
  private coolDownMs = 60_000; // 60 seconds cool-down for failed proxy nodes

  constructor() {
    this.reloadFromEnv();
  }

  /**
   * Reload proxies from environment variables.
   * Format: PROXIES or PROXY_LIST="http://user:pass@host:port,https://host2:port2"
   */
  public reloadFromEnv(): void {
    const rawEnv =
      process.env.PROXIES ||
      process.env.PROXY_LIST ||
      process.env.PROXY_URLS ||
      process.env.OUTBOUND_PROXY_URL ||
      process.env.SCRAPER_PROXY_URL ||
      '';

    this.proxies = rawEnv
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('socks')));

    this.index = 0;
  }

  /**
   * Check if proxy pool has active configured proxies.
   */
  public hasProxies(): boolean {
    return this.proxies.length > 0;
  }

  /**
   * Get total number of loaded proxies.
   */
  public get count(): number {
    return this.proxies.length;
  }

  /**
   * Get the next healthy proxy URL from the pool using round-robin.
   */
  public getNextProxy(): string | null {
    if (this.proxies.length === 0) return null;

    const now = Date.now();
    const total = this.proxies.length;

    // Try up to total proxies to find one that isn't in cool-down
    for (let i = 0; i < total; i++) {
      const candidate = this.proxies[this.index];
      this.index = (this.index + 1) % total;

      const failedAt = this.failedProxies.get(candidate);
      if (!failedAt || now - failedAt > this.coolDownMs) {
        // Proxy is healthy or cool-down expired
        if (failedAt) this.failedProxies.delete(candidate);
        return candidate;
      }
    }

    // All proxies are currently in cool-down, fallback to round-robin
    const fallback = this.proxies[this.index];
    this.index = (this.index + 1) % total;
    return fallback;
  }

  /**
   * Report a proxy failure (e.g. HTTP 403, 429, timeout, network error).
   * Put it in temporary cool-down.
   */
  public reportFailure(proxyUrl: string): void {
    if (!proxyUrl) return;
    this.failedProxies.set(proxyUrl, Date.now());
  }

  /**
   * Report a proxy success. Clear its failure record.
   */
  public reportSuccess(proxyUrl: string): void {
    if (!proxyUrl) return;
    this.failedProxies.delete(proxyUrl);
  }

  /**
   * Get an HttpsProxyAgent instance for a given proxy URL (cached).
   */
  public getAgent(proxyUrl: string): HttpsProxyAgent<string> | undefined {
    if (!proxyUrl) return undefined;
    if (this.agentCache.has(proxyUrl)) {
      return this.agentCache.get(proxyUrl)!;
    }
    try {
      const agent = new HttpsProxyAgent(proxyUrl, {
        keepAlive: true,
        timeout: 15_000,
      });
      this.agentCache.set(proxyUrl, agent);
      return agent;
    } catch (err) {
      console.error(`[ProxyPool] Invalid proxy URL: ${proxyUrl}`, err);
      return undefined;
    }
  }
}

export const proxyPool = new ProxyPoolManager();
