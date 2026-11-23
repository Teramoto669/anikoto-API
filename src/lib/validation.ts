/**
 * Input validation and sanitization helpers for API routes.
 * Mitigates SSRF, Path Traversal, and Injection attacks.
 */

// Permitted characters for URL slugs: alphanumeric, hyphens, and underscores only.
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

// Permitted characters for numeric IDs.
const ID_REGEX = /^\d+$/;

// Permitted characters for widget category names.
const WIDGET_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

// Allowed widget types to prevent unexpected scraping endpoints
const ALLOWED_WIDGETS = new Set([
  'banner',
  'popular',
  'top-airing',
  'most-popular',
  'most-favorite',
  'completed',
  'trending',
  'latest-completed',
  'latest-episode',
  'new-added',
  'random',
]);

/**
 * Validates and sanitizes an anime/episode slug.
 * Returns null if the slug is invalid, contains traversal sequences, or exceeds max length.
 */
export function validateSlug(slug: unknown): string | null {
  if (typeof slug !== 'string') return null;
  const trimmed = slug.trim();
  if (!trimmed || trimmed.length > 128) return null;
  // Block directory traversal sequences
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('%2e')) {
    return null;
  }
  if (!SLUG_REGEX.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates a numeric ID string (e.g. tooltip ID).
 */
export function validateId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 32) return null;
  if (!ID_REGEX.test(trimmed)) return null;
  return trimmed;
}

/**
 * Parses and bounds a pagination page number to a safe range [1, 500].
 */
export function validatePage(page: unknown, defaultPage = 1, maxPage = 500): number {
  if (page === undefined || page === null || page === '') return defaultPage;
  const num = typeof page === 'number' ? page : parseInt(String(page), 10);
  if (isNaN(num) || num < 1) return defaultPage;
  return Math.min(num, maxPage);
}

/**
 * Validates and bounds a timezone offset in hours to [-14, 14].
 */
export function validateTimezone(tz: unknown, defaultTz = 0): number {
  if (tz === undefined || tz === null || tz === '') return defaultTz;
  const num = typeof tz === 'number' ? tz : parseFloat(String(tz));
  if (isNaN(num)) return defaultTz;
  if (num < -14 || num > 14) return defaultTz;
  return Math.round(num * 10) / 10;
}

/**
 * Validates a search keyword string.
 * Strips control characters and enforces a maximum length.
 */
export function validateKeyword(keyword: unknown): string | null {
  if (typeof keyword !== 'string') return null;
  const trimmed = keyword.trim();
  if (!trimmed) return null;
  // Limit length to avoid catastrophic regex or scraper denial of service
  if (trimmed.length > 200) return trimmed.slice(0, 200);
  // Remove control characters (except common whitespace)
  return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validates a widget name against allowed widgets or safe pattern.
 */
export function validateWidgetName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().toLowerCase();
  if (!trimmed || trimmed.length > 64) return null;
  if (!WIDGET_NAME_REGEX.test(trimmed)) return null;
  if (ALLOWED_WIDGETS.has(trimmed)) return trimmed;
  return null;
}

/**
 * Validates a genre name (alphanumeric and hyphens only).
 */
export function validateGenre(genre: unknown): string | null {
  if (typeof genre !== 'string') return null;
  const trimmed = genre.trim().toLowerCase();
  if (!trimmed || trimmed.length > 64) return null;
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return null;
  if (!/^[a-z0-9-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Sanitizes URLs before logging or exposing them in error responses.
 * Strips basic-auth credentials to avoid leaking proxy passwords.
 */
export function sanitizeUrlForLogging(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  }
}

// ─── Validators added for the extended endpoint set ──────────────────────────

/** A-Z list segment: a single letter/digit, "other", or "all". */
export function validateLetter(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return /^(?:[a-z0-9]|other|all)$/.test(trimmed) ? trimmed : null;
}

/** Recently-updated tab. */
export function validateUpdatedTab(value: unknown): 'all' | 'sub' | 'dub' | null {
  if (value === undefined || value === null || value === '') return 'all';
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v === 'all' || v === 'sub' || v === 'dub' ? v : null;
}

/** Ranking window for /api/top-rankings. */
export function validateRankingWindow(value: unknown): 'day' | 'week' | 'month' | null {
  if (value === undefined || value === null || value === '') return 'day';
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v === 'day' || v === 'week' || v === 'month' ? v : null;
}

/** Episode number as used in `/watch/<slug>/ep-<n>` (integers or decimals like 12.5). */
export function validateEpisodeNumber(value: unknown, fallback?: string): string | null {
  if (value === undefined || value === null || value === '') return fallback ?? null;
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^\d{1,5}(\.\d{1,2})?$/.test(v) ? v : null;
}

/**
 * Opaque upstream identifiers (server link ids, `data-ids` lists). They are
 * placed in an upstream query string, so restrict to a conservative charset.
 */
export function validateOpaqueId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > 512) return null;
  return /^[A-Za-z0-9_\-.,:=+/]+$/.test(v) ? v : null;
}

/** Short token for upstream query params such as `style` / `vrf`. */
export function validateToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[A-Za-z0-9_\-]{1,64}$/.test(v) ? v : null;
}

/** Positive integer id (MAL / AniList / timestamps). Returns the numeric string. */
export function validateNumericString(value: unknown, maxLen = 16): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 && v.length <= maxLen && /^\d+$/.test(v) ? v : null;
}

/** Strict http(s) URL, no embedded credentials. */
export function validateHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > 2048) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}
