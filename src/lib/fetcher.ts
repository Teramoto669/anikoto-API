import axios from 'axios';
import * as cheerio from 'cheerio';
import { BASE_URL, DEFAULT_HEADERS } from './constants';

/**
 * Fetch an HTML page from anikototv.to and return a Cheerio instance.
 */
export async function fetchPage(path: string): Promise<cheerio.CheerioAPI> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const { data } = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: 15_000,
  });
  return cheerio.load(data);
}

/**
 * Fetch JSON from the site's internal AJAX endpoints.
 */
export async function fetchJson<T = unknown>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const { data } = await axios.get<T>(url, {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: 15_000,
  });
  return data;
}
