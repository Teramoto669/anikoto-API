import { fail, ok, wantsRefresh, withApi } from '@/lib/api';
import { getAzList } from '@/lib/scrapers/discovery.scraper';
import { validateLetter, validatePage } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/az-list/[letter]?page=<n>
 *
 * Alphabetical anime listing.
 *
 * @param letter  A single letter or digit, `other` (non-alphanumeric titles) or `all`
 * @query page       Page number (default 1)
 * @query refresh=1  Bypass cache and force re-scrape
 */
async function handler(req: Request, { params }: { params: Promise<{ letter: string }> }) {
  const letter = validateLetter((await params)?.letter);
  if (!letter) return fail('letter must be a single letter/digit, "other" or "all"', 400);

  const { searchParams } = new URL(req.url);
  const page = validatePage(searchParams.get('page'));
  return ok(await getAzList(letter, page, wantsRefresh(req)));
}

export const GET = withApi(handler);
