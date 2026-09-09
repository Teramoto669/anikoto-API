import { HttpsProxyAgent } from 'https-proxy-agent';
import dns from 'dns';

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

// ── SSRF Guard & IP Parsing ──────────────────────────────────────────────────
/**
 * Validates whether an IP address is private, loopback, link-local, or cloud metadata.
 */
export function isPrivateIp(ip: string): boolean {
  const cleanIp = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv4 standard dotted-quad
  const ipv4Parts = cleanIp.split('.');
  if (ipv4Parts.length === 4) {
    const nums = ipv4Parts.map(p => {
      if (p.startsWith('0x') || p.startsWith('0X')) return parseInt(p, 16);
      if (p.startsWith('0') && p.length > 1) return parseInt(p, 8);
      return parseInt(p, 10);
    });

    if (nums.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
      const [a, b] = nums;
      if (a === 127) return true; // 127.0.0.0/8 (Loopback)
      if (a === 10) return true;  // 10.0.0.0/8 (RFC1918)
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
      if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local & AWS/Azure/GCP metadata)
      if (a === 0) return true; // 0.0.0.0/8
      if (a === 100 && (b >= 64 && b <= 127)) return true; // Carrier-grade NAT (Alibaba metadata: 100.100.100.200)
      return false;
    }
  }

  // IPv4 integer encoding (e.g. 2130706433 for 127.0.0.1)
  if (/^\d+$/.test(cleanIp)) {
    const num = parseInt(cleanIp, 10);
    if (!isNaN(num) && num >= 0 && num <= 0xFFFFFFFF) {
      const a = (num >>> 24) & 0xFF;
      const b = (num >>> 16) & 0xFF;
      if (a === 127) return true;
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      if (a === 0) return true;
    }
  }

  // IPv6 loopback & private subnets
  if (
    cleanIp === '::1' ||
    cleanIp === '::' ||
    cleanIp.startsWith('fc00:') ||
    cleanIp.startsWith('fd') ||
    cleanIp.startsWith('fe80:') ||
    cleanIp.startsWith('ff00:') ||
    cleanIp.startsWith('::ffff:')
  ) {
    return true;
  }

  return false;
}

/**
 * Synchronous URL syntax and host checks.
 */
export function isPrivateUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();

    // Protocol enforcement
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    // Reject user credentials in target URL
    if (parsed.username || parsed.password) {
      return true;
    }

    // Localhost and internal domains
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan')
    ) {
      return true;
    }

    // Cloud metadata hostnames
    if (
      hostname === 'metadata.google.internal' ||
      hostname.includes('169.254.169.254')
    ) {
      return true;
    }

    if (isPrivateIp(hostname)) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Asynchronous DNS resolution check to prevent DNS rebinding attacks.
 */
export async function isPrivateUrlAsync(targetUrl: string): Promise<boolean> {
  if (isPrivateUrl(targetUrl)) return true;

  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname;

    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

// ── Streaming Domain Allowlist (Prevent Open Forward Proxy Abuse) ────────────
const DEFAULT_ALLOWED_STREAM_DOMAINS = [
  'cdn.imgnex.top',
  '*.imgnex.top',
  '*.snapcdn.top',
  '*.lostproject.club',
  'bb.akirax.buzz',
  '*.akirax.buzz',
  '*.megaplay.buzz',
  '*.vidstream.buzz',
  '*.rapid-cloud.ru',
  '*.bunnycdn.ru',
  '*.streamwish.to',
  '*.filelions.to',
  '*.doodstream.com',
  '*.streamtape.com',
  '*.mp4upload.com',
];

/**
 * Validates if the target URL host is on the streaming whitelist.
 */
export function isAllowedStreamDomain(targetUrl: string): boolean {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();

    const envAllowed = (process.env.ALLOWED_PROXY_HOSTS || process.env.ALLOWED_STREAM_DOMAINS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const allPatterns = [...DEFAULT_ALLOWED_STREAM_DOMAINS, ...envAllowed];

    for (const pattern of allPatterns) {
      if (pattern.startsWith('*.')) {
        const root = pattern.slice(2);
        if (host === root || host.endsWith('.' + root)) return true;
      } else if (host === pattern) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
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
   * Validates if a caller-supplied proxy string is authorized (matches one in the configured list).
   */
  public isValidProxy(proxyUrl: string | null | undefined): boolean {
    if (!proxyUrl) return false;
    const clean = proxyUrl.trim();
    return this.proxies.includes(clean);
  }

  /**
   * Get the next healthy proxy URL from the pool using round-robin.
   */
  public getNextProxy(): string | null {
    if (this.proxies.length === 0) return null;

    const now = Date.now();
    const total = this.proxies.length;

    for (let i = 0; i < total; i++) {
      const candidate = this.proxies[this.index];
      this.index = (this.index + 1) % total;

      const failedAt = this.failedProxies.get(candidate);
      if (!failedAt || now - failedAt > this.coolDownMs) {
        if (failedAt) this.failedProxies.delete(candidate);
        return candidate;
      }
    }

    const fallback = this.proxies[this.index];
    this.index = (this.index + 1) % total;
    return fallback;
  }

  /**
   * Report a proxy failure.
   */
  public reportFailure(proxyUrl: string): void {
    if (!proxyUrl) return;
    this.failedProxies.set(proxyUrl, Date.now());
  }

  /**
   * Report a proxy success.
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
