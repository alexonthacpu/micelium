# Development baseline

Micelium is a static application. `index.html` is the entry point; `img/` and
`font/` contain existing assets. No package installation or build is needed.

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the server in a browser. All runtime scripts and fonts are local in
`vendor/`; CDN access is not required. OpenCV's WebAssembly payload is embedded
in its JavaScript file. Keep HTTP enabled locally rather than relying on `file:`.

## Browser smoke check

With the server running, Node.js, Playwright and Chromium available:

```sh
node tests/smoke.cjs
```

The Codex environment already supplies these test tools. On another machine,
provide Playwright through your normal development tooling. Set `CHROMIUM_PATH`
if Chromium is not at `/usr/bin/chromium`, and `MICELIUM_URL` to test another
local server. Playwright is a development tool, not an application dependency.

The test blocks external requests and checks library initialization, canvas
rendering, image upload, all six styles, parameter changes, PNG/SVG downloads,
and a JSZip round-trip. It fails on browser errors or unexpected network use.
It does not cover video/GIF processing, every parameter combination, or every
browser. There was no pre-existing automated test suite or build configuration.

## Vendored assets

See `vendor/SOURCES.md` for exact sources and licenses. Verify retained bytes
from the repository root with:

```sh
sha256sum -c vendor/SHA256SUMS
```

Do not add CDN fallbacks or second copies of the same dependency. Update local
assets, source records and checksums together when intentionally changing a
version. The active application's layout, style algorithms and export logic are
unchanged. OpenCV loading is deferred until parsing finishes, and readiness is
set only after its runtime exposes `cv.Mat`, avoiding the original startup race. Historical pages in `backup/` retain their original references and
are not application entry points.
