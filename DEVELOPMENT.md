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
version. The original style algorithms and export logic are retained. OpenCV loading
is deferred until parsing finishes, and readiness is
set only after its runtime exposes `cv.Mat`, avoiding the original startup race. Historical pages in `backup/` retain their original references and
are not application entry points.


## Menu and Animate

The top-right menu opens About, Animate and a viewport-only dark palette.
Dark mode composites the rendered canvas to invert its colors; source pixels,
style parameters and explicit PNG/SVG export palettes stay unchanged. The
preference is stored locally when browser storage is available.

Open Animate and load a still image (the existing sidebar upload also works).
Adjust sidebar parameters and add a keyframe, scrub to another time, change
parameters and add another. Adding at the same time updates that keyframe.
Play requires two keys. Duration can be set from 15 to 20 seconds. Shortening is
rejected if it would discard later keys. Drag keys, edit their time, or use
Left/Right (0.05 s, Shift: 0.5 s); Delete removes the selected key.

Choose the selected key's outgoing easing: Linear, Ease In, Ease Out, Ease
In-Out or Custom Bezier. Custom handles can be dragged or edited numerically.
Numeric parameters and zoom interpolate within a style. Style changes and
non-numeric switches apply at the next keyframe to avoid mixing incompatible
parameter meanings. Before the first key and after the last, values are held.

Playback uses one time-based requestAnimationFrame loop, targets the display's
refresh rate, and reduces preview source resolution when render cost or frame
intervals exceed the frame budget. The source starts at a maximum 480 px edge
and can reduce to 160 px. This changes preview detail while playing; Pause,
Stop and export restore the full source. FPS is measured and displayed rather
than guaranteed on every device/style/image. Editing controls, exporting,
closing Animate or hiding the page pauses playback. Existing image/video/GIF
workflows are retained; Animate itself uses still images. Replacing the image
or closing/reopening Animate preserves keys in the current page session.
Reloading the page does not save the timeline. Animation movie export is not
part of this editor; existing PNG/SVG buttons export the current parameter state.

Modules are scoped under `js/`: timeline math, the existing-sketch adapter,
Animate, and navigation. Feature CSS is scoped in `css/editor.css`.

Additional checks, with the server running for the browser check:

```sh
node --test tests/animation-core.test.cjs
node tests/editor.cjs
```

These cover easing math and boundaries, real menu/dialog interactions, image
loading, keyframe CRUD and dragging, custom Bezier, scrubbing, duration rules,
play/pause/stop/resume/end, palette inversion without changing PNG output, and
basic video upload/play/pause with Animate isolated from the video player.
The existing smoke suite still checks all six styles and PNG/SVG exports.

For an observational six-style playback benchmark with a generated 1024×1024
source, run `node tests/playback-performance.cjs`. It reports the measured FPS
and adaptive preview cap, then verifies the original source size after pausing.
Timings vary with hardware and load; this is not a universal 60 FPS assertion.
