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
