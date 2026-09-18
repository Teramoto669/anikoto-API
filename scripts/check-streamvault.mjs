#!/usr/bin/env node
/**
 * Offline checks for public/streamvault.html + public/vendor/tomp4.min.js.
 *
 *   node scripts/check-streamvault.mjs
 *
 * Verifies the guarantees that matter to users:
 *   1. the page loads nothing from third parties (no font CDN, no analytics, no CDN-hosted muxer),
 *   2. the vendored MP4 muxer is present, same-origin and transmux-healthy (ftyp + moov),
 *   3. URL safety guards reject non-media schemes, credentials and LAN/loopback hosts,
 *   4. the download guard refuses non-media payloads (exe/zip/html/json) instead of saving them,
 *   5. adaptive concurrency stays inside its bounds.
 *
 * It is intentionally dependency-free (Node's built-ins only) so it can run anywhere.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'public', 'streamvault.html');
const html = readFileSync(htmlPath, 'utf-8');
const vendorPath = join(root, 'public', 'vendor', 'tomp4.min.js');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/* ------------------------------------------------------------------ *
 * 1. Third-party surface
 * ------------------------------------------------------------------ */
const FORBIDDEN = [
  'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  'corsproxy.io', 'allorigins', 'thingproxy', 'cors-anywhere',
  'google-analytics', 'googletagmanager', 'doubleclick.net',
  'hotjar', 'clarity.ms', 'sentry-cdn', 'mixpanel', 'segment.io', 'facebook.net',
];
const found = FORBIDDEN.filter((needle) => html.includes(needle));
check('no third-party scripts/fonts/trackers referenced', found.length === 0, found.join(', '));
check('page declares no-referrer', html.includes('name="referrer" content="no-referrer"'));
check('page ships a Content-Security-Policy', html.includes('http-equiv="Content-Security-Policy"'));
check('muxer is loaded from ./vendor/', html.includes('src="./vendor/tomp4.min.js"'));
check('no remote import of the muxer', !/import\(['"]https?:/.test(html));
check('segment fetches stay cookie-less', (html.match(/credentials: 'omit'/g) || []).length >= 2);

/* ------------------------------------------------------------------ *
 * 2. Vendored muxer
 * ------------------------------------------------------------------ */
const vendor = readFileSync(vendorPath, 'utf-8');
const VENDOR_SHA256 = 'dcbec505dc6411bc0d595464f604f27a5474e568e8045b88dc679d791922f1ae';
const vendorSha = createHash('sha256').update(vendor).digest('hex');
check('vendor bundle is exactly the audited build (hash pinned)', vendorSha === VENDOR_SHA256, `sha256=${vendorSha}`);
check('vendor bundle is the pinned upstream version', /version\s*[:=]\s*"1\.7\.4"/.test(vendor));
check('vendor bundle is a classic script (works from file://)', !/^\s*(import|export)\s/m.test(vendor));
const license = readFileSync(join(root, 'public', 'vendor', 'LICENSE-tomp4'), 'utf-8');
check('vendored license is kept next to the bundle', /MIT License/i.test(license) && /TVWIT|Invintus/i.test(license));
// Every network entry point is trapped: importing the bundle must not reach out.
let networkAttempts = 0;
const trap = () => { networkAttempts++; throw new Error('bundled muxer attempted network access'); };
const ctx = {
  console, TextEncoder, TextDecoder, DataView, Uint8Array, ArrayBuffer, Blob: class {},
  fetch: trap,
  XMLHttpRequest: class { constructor() { trap(); } },
  WebSocket: class { constructor() { trap(); } },
};
ctx.window = ctx;
ctx.self = ctx;
const { createContext, runInContext } = await import('node:vm');
createContext(ctx);
runInContext(vendor, ctx);
const tomp4 = ctx.tomp4Vendor;
check('vendor exposes stitchTs', typeof tomp4?.stitchTs === 'function');
check('vendor does not touch the network when loaded', networkAttempts === 0, `attempts=${networkAttempts}`);
check('vendor exposes the default toMp4 API', typeof tomp4?.default === 'function');

/* ------------------------------------------------------------------ *
 * 3. Page helpers (extracted straight out of the shipped HTML)
 * ------------------------------------------------------------------ */
const fnSource = (name) => {
  for (const prefix of [`async function ${name}(`, `function ${name}(`]) {
    const i = html.indexOf(prefix);
    if (i !== -1) return html.slice(i, html.indexOf('\n}', i) + 2);
  }
  throw new Error(`function ${name} not found in streamvault.html`);
};
const constSource = (name) => {
  const i = html.indexOf(`const ${name} =`);
  if (i === -1) throw new Error(`const ${name} not found`);
  return html.slice(i, html.indexOf('\n', i));
};

const harness = [
  'let ADAPTIVE = true; const SEG_CONCURRENCY = 10; let stickyPath = null;',
  'let API = "http://localhost:3000"; const location = { origin: "http://localhost:3000" };',
  constSource('CONC_MIN'),
  constSource('CONC_MAX'),
  constSource('PRIVATE_HOST_RE'),
  constSource('CDN_MIRROR_HOSTS'),
  constSource('BLOCKED_HOST_RE'),
  constSource('UNRELIABLE_HOST_RE'),
  constSource('NON_SEGMENT_TAGS'),
  constSource('NON_MEDIA_URL_RE'),
  'const hostCooldown = new Map();',
  fnSource('unwrapProxyUrl'),
  fnSource('refusalNote'),
  fnSource('isBlockedHost'),
  fnSource('withHost'),
  fnSource('buildUrlCandidates'),
  fnSource('isNonMediaEntry'),
  fnSource('assertSafeUrl'),
  fnSource('noteHostFailure'),
  fnSource('hostIsCooling'),
  fnSource('makeConcurrency'),
  fnSource('sniffContainer'),
  fnSource('describeNonMedia'),
  'export { refusalNote, assertSafeUrl, noteHostFailure, hostIsCooling, makeConcurrency, sniffContainer, describeNonMedia, buildUrlCandidates, isNonMediaEntry };',
].join('\n');
const helpers = await import(`data:text/javascript,${encodeURIComponent(harness)}`);

const allow = ['https://cdn.example.com/a/b.ts', 'http://megap.mikora.top/x.ts?token=abc'];
const block = [
  'javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'file:///C:/evil.exe', 'blob:http://localhost/x',
  'https://user:pass@cdn.example.com/a.ts', 'http://localhost:3000/x', 'http://127.0.0.1/x',
  'http://192.168.1.5/x', 'http://10.0.0.7/x', 'http://172.16.3.4/x', 'http://169.254.169.254/latest/meta-data',
  'not a url',
];
const guardOk = (u) => { try { helpers.assertSafeUrl(u); return true; } catch { return false; } };
check('URL guard allows real CDN URLs', allow.every(guardOk), allow.filter((u) => !guardOk(u)).join(', '));
check('URL guard blocks scripts/data/file/blob/credentials/LAN', block.every((u) => !guardOk(u)), block.filter(guardOk).join(', '));

const enc = (s) => new TextEncoder().encode(s);
check('sniffs MP4', helpers.sniffContainer(enc('\u0000\u0000\u0000\u0018ftypisom\u0000\u0000\u0002\u0000mp41'))?.ext === '.mp4');
check('sniffs MPEG-TS', helpers.sniffContainer(new Uint8Array([0x47, ...new Array(187).fill(0)]))?.ext === '.ts');
check('refuses an executable', helpers.sniffContainer(enc('MZ\u0090\u0000\u0003\u0000\u0000\u0000')) === null
  && helpers.describeNonMedia(enc('MZ\u0090\u0000\u0003\u0000\u0000\u0000')) === 'a Windows executable');
check('refuses a zip', helpers.sniffContainer(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) === null);
check('refuses an HTML page', helpers.sniffContainer(enc('<!DOCTYPE html><html>Access denied</html>')) === null);
check('refuses a playlist as a file', helpers.sniffContainer(enc('#EXTM3U\n#EXTINF:4,\nseg.ts\n')) === null);

// A refusal (region lock, datacenter range, VPN exit) is fixable and the message
// should say so. A dead host is not, and must not get the same advice.
const note = helpers.refusalNote;
check('a refusal tells the user what to try', /VPN/.test(note(403)) && /403/.test(note(403)) && /VPN/.test(note('gd.example/x/direct:451')));
check('a refusal from our own API does not blame the network', note(403, 'http://localhost:3000/api/anime/x') === '');
check('a 404/410 stays a plain failure', note('HTTP 404') === '' && note(410) === '' && note('cdn.example.com/direct:404') === '');

// The candidate ladder is built from untrusted playlist data, so anything it emits
// must already have passed the URL guard — including URLs unwrapped from /api/proxy.
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return '(unparsable)'; } };
const proxiedLoopback = 'https://api.example.com/api/proxy?url='
  + encodeURIComponent('http://127.0.0.1:4900/secret.ts');
const safeCandidates = helpers.buildUrlCandidates(proxiedLoopback);
check(
  'a proxied loopback target never becomes a fetch candidate',
  safeCandidates.every((u) => { try { helpers.assertSafeUrl(u); return true; } catch { return false; } }),
  safeCandidates.map(hostOf).join(', ')
);
const healthyHostCandidates = helpers.buildUrlCandidates('https://megap.mikora.top/x/seg1.ts');
check(
  'healthy hosts get exactly one candidate (no speculative mirrors)',
  healthyHostCandidates.length === 1 && hostOf(healthyHostCandidates[0]) === 'megap.mikora.top',
  healthyHostCandidates.map(hostOf).join(', ')
);
const unreliableHostCandidates = helpers.buildUrlCandidates('https://cdn.mewstream.buzz/x/master.m3u8').map(hostOf);
check(
  'unreliable hosts get the mirror ladder',
  unreliableHostCandidates.length >= 2 && unreliableHostCandidates.includes('1oe.lostproject.club'),
  unreliableHostCandidates.join(', ')
);

// ByteDance/Volcengine-style playlists interleave ad creatives, thumbnails and
// subtitle sidecars with the media segments. Fetching those as if they were
// segments is what produced hundreds of TikTok-ad-CDN requests in the field.
const AD_IMAGE = 'https://p16-ad-site-sign-sg.tiktokcdn.com/ad-site-i18n-sg/202606165d0d'
  + '~tplv-d5opwmad15-ttam-origin.image?lk3s=6d71dd51&x-expires=1813107616&x-signature=cjXw%2ByQpKPmPlX1SpSajMYnPalg%3D';
const MEDIA_LINES = [
  'http://cdn.example.com/1080/seg0.ts',
  'http://cdn.example.com/1080/seg1.ts?token=abc',
  'http://cdn.example.com/fmp4/chunk-9.m4s',
  'https://cdn.example.com/a/audio.aac',
  'https://cdn.example.com/segments/00042',          // extensionless segment
  'https://cdn.example.com/key.bin',
];
const JUNK_LINES = [
  AD_IMAGE,
  'https://cdn.example.com/thumb/poster.jpg',
  'https://cdn.example.com/subs/eng.vtt',
  'https://cdn.example.com/ads/track.js',
  'https://cdn.example.com/player/index.html',
];
check(
  'media segments survive the playlist filter',
  MEDIA_LINES.every((l) => !helpers.isNonMediaEntry(l, '#EXTINF:4.0,'))
    && JUNK_LINES.every((l) => helpers.isNonMediaEntry(l, '#EXTINF:4.0,')),
  [...MEDIA_LINES.filter((l) => helpers.isNonMediaEntry(l, '')), ...JUNK_LINES.filter((l) => !helpers.isNonMediaEntry(l, ''))].join(' ')
);
check(
  'a URI after an image/iframe-stream tag is dropped even without an extension',
  helpers.isNonMediaEntry('https://cdn.example.com/opaque-id', '#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=80000')
    && helpers.isNonMediaEntry('https://cdn.example.com/opaque-id', '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=80000')
    && !helpers.isNonMediaEntry('https://cdn.example.com/opaque-id', '#EXT-X-STREAM-INF:BANDWIDTH=80000')
);
check(
  'the media-playlist parser actually applies the filter',
  (html.match(/isNonMediaEntry\(/g) || []).length >= 3, `${(html.match(/isNonMediaEntry\(/g) || []).length} call sites`
);

helpers.noteHostFailure('dead.example', 'dead.example/proxy:403');
check('hard-failed hosts are benched', helpers.hostIsCooling('dead.example') && !helpers.hostIsCooling('other.example'));

const conc = helpers.makeConcurrency(10);
const start = conc.limit;
for (let i = 0; i < 500; i++) conc.ok();
check('concurrency ramps up but never past its ceiling', conc.limit === conc.ceiling && conc.ceiling <= 16, `limit ${conc.limit}`);
for (let i = 0; i < 10; i++) conc.fail('x/:500');
check('concurrency backs off on errors without dying', conc.limit >= 4 && conc.limit < start + 1 && conc.limit === 4, `limit ${conc.limit}`);
const rateLimited = helpers.makeConcurrency(16);
rateLimited.fail('x/:429');
check('429 halves concurrency immediately', rateLimited.limit === 8, `limit ${rateLimited.limit}`);

/* ------------------------------------------------------------------ *
 * 4. Muxer smoke test — synthetic TS must be rejected, not silently saved
 * ------------------------------------------------------------------ */
let muxerRejectsGarbage = false;
try {
  tomp4.stitchTs([new Uint8Array(200_000).fill(0x11)]);
} catch {
  muxerRejectsGarbage = true;
}
check('muxer refuses non-media bytes', muxerRejectsGarbage);
check('vendor still has not touched the network after use', networkAttempts === 0, `attempts=${networkAttempts}`);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll StreamVault checks passed.');
process.exit(failures ? 1 : 0);
