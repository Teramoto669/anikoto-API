#!/usr/bin/env node
/**
 * Offline checks for `src/app/api/proxy/route.ts`.
 *
 *   node scripts/check-proxy.mjs
 *
 * The route is transpiled with the project's own TypeScript (no bundler, no network
 * needed) and exercised in-process, so the security- and reliability-relevant
 * invariants are verified on every change instead of only during a live run:
 *
 *   1. the SSRF guard rejects loopback/LAN/metadata targets on a deployed instance,
 *      including redirect hops;
 *   2. it is not a blanket block — local development can still reach a mock upstream —
 *      and PROXY_ALLOW_PRIVATE_TARGETS overrides both ways;
 *   3. non-http(s) schemes and credentials in the target URL are refused;
 *   4. the stream watchdog drops a CDN that stops sending data, while a slow but
 *      steady transfer is passed through untouched (the trigger is silence, never
 *      total duration).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const routePath = join(root, 'src', 'app', 'api', 'proxy', 'route.ts');
const source = readFileSync(routePath, 'utf-8');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** Transpile the route and expose its internals for testing. */
async function loadRoute(env) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  // Swap the two framework imports for local stand-ins so the module runs in plain Node.
  const nextResponseStub = [
    'class NextResponse extends Response {}',
    "NextResponse.json = (body, init = {}) => new Response(JSON.stringify(body), { status: init.status, headers: { 'content-type': 'application/json' } });",
  ].join('\n');
  const local = js
    .replace(/import\s*\{[^}]*\}\s*from\s*['"]@\/lib\/constants['"];?/, "const DEFAULT_HEADERS = { 'User-Agent': 'check' };")
    .replace(/import\s*\{[^}]*\}\s*from\s*['"]next\/server['"];?/, nextResponseStub)
    .replace(/^export\s+/gm, '');

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PROXY_ALLOW_PRIVATE_TARGETS: process.env.PROXY_ALLOW_PRIVATE_TARGETS,
  };
  Object.assign(process.env, env);
  try {
    // A unique marker keeps these loads as separate module instances, so the
    // module-level env evaluation really is re-run for each variant.
    const unique = `${local}\nexport { resolveTarget, withDataTimeouts, GET, PRIVATE_TARGETS_ALLOWED, rewritePlaylist };\n// ${Math.random()}\n`;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(unique).toString('base64')}`);
    return { mod, restore: () => Object.assign(process.env, previous) };
  } catch (err) {
    Object.assign(process.env, previous);
    throw err;
  }
}

/* ---------------------------------------------------------------- *
 * 1-3. Target validation
 * ---------------------------------------------------------------- */
const prod = await loadRoute({ NODE_ENV: 'production', PROXY_ALLOW_PRIVATE_TARGETS: '' });
const { resolveTarget, withDataTimeouts } = prod.mod;
/** Resolve through a specific module instance: returns the rejection message, or null. */
const rejectionOf = (resolve, target, base) => {
  try {
    resolve(target, base);
    return null;
  } catch (err) {
    return err.message;
  }
};
const blocked = (target, base) => rejectionOf(resolveTarget, target, base);

check('production blocks loopback', !!blocked('http://127.0.0.1:4900/segment.ts') && !!blocked('http://localhost:4900/x'));
check(
  'production blocks RFC1918 ranges',
  !!blocked('http://192.168.1.5/x') && !!blocked('http://10.0.0.9/x') && !!blocked('http://172.20.0.1/x'),
  [blocked('http://192.168.1.5/x'), blocked('http://10.0.0.9/x'), blocked('http://172.20.0.1/x')].join(' / ')
);
check('production blocks the cloud metadata address', !!blocked('http://169.254.169.254/latest/meta-data/'));
check('production blocks non-http(s) schemes', !!blocked('file:///etc/passwd') && !!blocked('gopher://x/') && !!blocked('data:text/plain,hi'));
check('production blocks credentials in the target URL', !!blocked('http://user:pass@cdn.example.com/x.ts'));
check(
  'production allows public CDN URLs',
  !blocked('https://cdn.example.com/a/master.m3u8') && !blocked('http://megap.mikora.top/x.ts?token=1'),
  [blocked('https://cdn.example.com/a/master.m3u8'), blocked('http://megap.mikora.top/x.ts?token=1')].join(' / ')
);
check(
  'shorthand spellings of loopback are still blocked',
  !!blocked('http://127.1/x') && !!blocked('http://2130706433/x') && !!blocked('http://0x7f.1/x') && !!blocked('http://[0:0:0:0:0:0:0:1]/x'),
  [blocked('http://127.1/x'), blocked('http://2130706433/x'), blocked('http://[0:0:0:0:0:0:0:1]/x')].join(' / ')
);
check(
  'public hosts that merely look private are not blocked',
  !blocked('https://1720.example.com/x') && !blocked('https://10.example.com/x') && !blocked('https://localhost.example.com/x') && !blocked('https://172.32.0.1/x'),
  ['1720.example.com', '10.example.com', 'localhost.example.com', '172.32.0.1'].map((h) => `${h}:${blocked(`https://${h}/x`) ? 'blocked' : 'allowed'}`).join(' ')
);
check(
  'redirect hops are validated too',
  !!blocked('http://169.254.169.254/x', new URL('https://cdn.example.com/playlist.m3u8'))
);
const realError = console.error;
console.error = () => {}; // the route logs every rejection; keep the check output readable
const blockedResponse = await prod.mod.GET(new Request('http://app.local/api/proxy?url=http%3A%2F%2F127.0.0.1%3A4900%2Fsegment.ts'));
console.error = realError;
check('GET returns 400 (not a fetch) for a rejected target', blockedResponse.status === 400, `status=${blockedResponse.status}`);
prod.restore();

const dev = await loadRoute({ NODE_ENV: 'development', PROXY_ALLOW_PRIVATE_TARGETS: '' });
check(
  'development may reach a mock upstream on loopback',
  dev.mod.PRIVATE_TARGETS_ALLOWED === true && rejectionOf(dev.mod.resolveTarget, 'http://127.0.0.1:4900/segment.ts') === null
);
dev.restore();

const forcedOff = await loadRoute({ NODE_ENV: 'development', PROXY_ALLOW_PRIVATE_TARGETS: '0' });
check(
  'PROXY_ALLOW_PRIVATE_TARGETS=0 forces the block in development',
  forcedOff.mod.PRIVATE_TARGETS_ALLOWED === false && rejectionOf(forcedOff.mod.resolveTarget, 'http://127.0.0.1/x') !== null
);
forcedOff.restore();

const forcedOn = await loadRoute({ NODE_ENV: 'production', PROXY_ALLOW_PRIVATE_TARGETS: '1' });
check(
  'PROXY_ALLOW_PRIVATE_TARGETS=1 opens loopback deliberately',
  forcedOn.mod.PRIVATE_TARGETS_ALLOWED === true && rejectionOf(forcedOn.mod.resolveTarget, 'http://127.0.0.1:4900/x') === null
);
forcedOn.restore();

/* ---------------------------------------------------------------- *
 * 4. Watchdog semantics
 * ---------------------------------------------------------------- */
/* ------------------------------------------------------------------ *
 * Playlist rewriting: media goes through the proxy, junk does not
 * ------------------------------------------------------------------ */
const AD_IMAGE = 'https://p16-ad-site-sign-sg.tiktokcdn.com/ad-site-i18n-sg/202606165d0d'
  + '~tplv-d5opwmad15-ttam-origin.image?lk3s=6d71dd51&x-signature=cjXw%2ByQpKPmPlX1SpSajMYnPalg%3D';
const PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/key.bin"',
  '#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=80000,RESOLUTION=320x180,CODECS="jpeg",URI="' + AD_IMAGE + '"',
  '#EXTINF:4.0,',
  'seg0.ts',
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="https://cdn.example.com/subs/eng.vtt"',
  'https://cdn.example.com/thumb/poster.jpg',
  'next/index.m3u8',
].join('\n');
const rewritten = prod.mod.rewritePlaylist(PLAYLIST, 'https://cdn.example.com/1080/index.m3u8', 'https://megaplay.buzz/');
const wrapped = (needle) => new RegExp('/api/proxy\\?url=' + encodeURIComponent(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(rewritten);
// Relative lines resolve against the playlist's own URL, exactly as a player expects.
check(
  'segment and sub-playlist lines are proxied',
  wrapped('https://cdn.example.com/1080/seg0.ts') && wrapped('https://cdn.example.com/1080/next/index.m3u8'),
  rewritten.split('\n').filter((l) => !l.startsWith('#')).join(' | ')
);
check('key URIs are proxied', wrapped('https://cdn.example.com/key.bin'));
check(
  'ad creatives, thumbnails and subtitles are left untouched',
  !wrapped(AD_IMAGE) && !wrapped('https://cdn.example.com/thumb/poster.jpg') && !wrapped('https://cdn.example.com/subs/eng.vtt'),
  rewritten.split('\n').filter((l) => l.includes('image') || l.includes('jpg') || l.includes('vtt')).join(' | ')
);
check(
  'the referer travels with every rewritten URL',
  (rewritten.match(/referer=https%3A%2F%2Fmegaplay\.buzz%2F/g) || []).length === 3,
  `${(rewritten.match(/referer=/g) || []).length} wrapped URLs`
);

/** Emits `chunks` (with an optional gap), then either closes or goes silent forever. */
const streamOf = (chunks, { gapMs = 0, close = true } = {}) => {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        if (close) controller.close();
        return; // never settles when close === false: that is the "stalled upstream"
      }
      if (i > 0 && gapMs) await new Promise((r) => setTimeout(r, gapMs));
      controller.enqueue(new Uint8Array(chunks[i++]));
    },
  });
};

/** Reads a stream, returning the chunk sizes delivered (or how it ended). */
const drain = async (stream, spareMs = 900) => {
  const sizes = [];
  const reader = stream.getReader();
  return new Promise((resolve) => {
    const spare = setTimeout(() => resolve({ sizes, ended: 'timeout' }), spareMs);
    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(spare);
            return resolve({ sizes, ended: 'closed' });
          }
          sizes.push(value.byteLength);
        }
      } catch (err) {
        clearTimeout(spare);
        return resolve({ sizes, ended: 'error', error: err });
      }
    })();
  });
};

const steadyAborts = [];
const steady = await drain(
  withDataTimeouts(streamOf([[1, 2, 3], [4, 5, 6], [7, 8]], { gapMs: 60, close: true }), (r) => steadyAborts.push(r), {
    firstChunkMs: 400,
    idleMs: 400,
  })
);
check(
  'a slow but steady transfer completes untouched',
  steady.ended === 'closed' && steady.sizes.join(',') === '3,3,2' && steadyAborts.length === 0,
  `ended=${steady.ended} sizes=${steady.sizes.join(',')} aborts=${steadyAborts.length}`
);

const stallAborts = [];
const stalledMid = await drain(
  withDataTimeouts(streamOf([[1, 2, 3]], { close: false }), (r) => stallAborts.push(r), { firstChunkMs: 500, idleMs: 150 }),
  600
);
check(
  'a CDN that goes quiet mid-transfer is dropped',
  stallAborts.length === 1 && stallAborts[0]?.name === 'TimeoutError' && /stalled/i.test(stallAborts[0].message),
  `aborts=${stallAborts.map((a) => a.message).join('|')} ended=${stalledMid.ended}`
);

const silentAborts = [];
await drain(withDataTimeouts(streamOf([], { close: false }), (r) => silentAborts.push(r), { firstChunkMs: 100, idleMs: 5000 }), 500);
check(
  'a CDN that answers headers but never sends data is dropped early',
  silentAborts.length === 1 && /no data/i.test(silentAborts[0]?.message || ''),
  silentAborts.map((a) => a.message).join('|')
);

const cancelAborts = [];
const cancellable = withDataTimeouts(streamOf([[1, 2, 3]], { close: false }), (r) => cancelAborts.push(r), {
  firstChunkMs: 50,
  idleMs: 50,
});
const reader = cancellable.getReader();
await reader.read();
await reader.cancel();
await new Promise((r) => setTimeout(r, 200));
check('cancelling the response stops the watchdog', cancelAborts.length === 0, `aborts=${cancelAborts.length}`);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll proxy checks passed.');
process.exit(failures ? 1 : 0);
