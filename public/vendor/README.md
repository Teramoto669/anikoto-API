# Vendored browser dependencies

## `tomp4.min.js`

- **Package:** [`@invintusmedia/tomp4`](https://www.npmjs.com/package/@invintusmedia/tomp4) `1.7.4`
- **License:** MIT — © 2024 Invintus Media (TVWIT), full text in `LICENSE-tomp4`
- **Used by:** `public/streamvault.html` (MPEG-TS → fragmented MP4 remux, `stitchTs`)
- **Source:** `npm pack @invintusmedia/tomp4@1.7.4` → `package/src/index.js` (the upstream tarball ships `src/` only; there is no prebuilt browser bundle in it)
- **Build command** (run inside the extracted package, requires esbuild only at build time):

  ```bash
  npx esbuild@0.25.9 src/index.js --bundle --format=iife --global-name=tomp4Vendor \
    --minify --legal-comments=none --target=es2020 --outfile=tomp4.min.js
  ```

  The result exposes `window.tomp4Vendor` (`stitchTs`, `toMp4`, `concatTs`, …) and is loaded by
  StreamVault with a plain `<script src="./vendor/tomp4.min.js">` tag. A classic script (rather than
  an ES module import) is used on purpose so the page also works when the HTML is opened directly
  from disk, where browsers refuse to load module scripts.

- **Pinned artifact:** SHA-256 `dcbec505dc6411bc0d595464f604f27a5474e568e8045b88dc679d791922f1ae`
  (88,063 bytes). The command above reproduces this file byte-for-byte, and
  `npm run check:streamvault` fails if the shipped file ever stops matching this hash.
- The bundle is loaded, never auto-run: it performs no network access on import (the page's checks
  load it in a sandbox with no `fetch` at all). Upstream also ships `downloadHls`/`RemoteMp4`
  helpers that would fetch; StreamVault only ever calls `stitchTs`, and tree-shaking them away is
  not possible because the upstream entry module has top-level side effects (a trimmed build is
  within 0.5 KB of the full one).

### Why vendor it instead of loading it from a CDN

StreamVault previously pulled the muxer from `cdn.jsdelivr.net` at runtime. Serving it from this
repository means:

- no third-party origin sees the user's IP or that they are downloading something (no tracking),
- the executed code cannot silently change under us (a CDN tag is mutable),
- downloads keep working offline / behind a network that blocks CDNs.

Only the remux code that the page actually calls is executed, and it runs in the page — nothing is
uploaded anywhere. Keep the version pinned; a new upstream release can be re-vendored with the
command above.
