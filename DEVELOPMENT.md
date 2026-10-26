# Development baseline

MYCLM is a static application. `index.html` is the entry point; `img/` and
`font/` contain existing assets. No package installation or build is needed.

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the server in a browser. All runtime scripts are local in `vendor/`;
the interface uses only the local WTGaramono regular/italic files in `font/`.
CDN access is not required. OpenCV's WebAssembly payload is embedded
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

The top-right menu opens About, Animation (marked **Work in progress**) and viewport dark mode.
Black/white PNG exports use transparent backgrounds. Colored/full-image PNGs,
animation compositions and animation exports follow the selected viewport palette.
SVG retains its style palette and has no background.

Load a still image: Animate saves an initial key at zero. Adjust the sidebar
and click **Overwrite keyframe 01** to save the key; seek to another time and
click **Add keyframe** to add the next one. At a saved key's time, the primary
button explicitly becomes **Overwrite keyframe**; sidebar edits remain a draft
until that button is clicked. The status strip highlights unsaved changes.
Floating diamonds in the middle timeline lane and a scrollable list identify
each saved key and its time; selected diamonds have a solid fill. A separate
triangle above the lane scrubs time without moving saved keys. Both controls
accept Left/Right and Shift for larger steps; the playhead also supports Home/End. **How to animate** explains creation,
overwriting, navigation and transitions. **End Key** saves
the current parameters at the duration endpoint. Duration accepts 1–30 seconds.
**Retime Keys** stretches all key times and the playhead proportionally by
default. Uncheck it to retain absolute timing; shortening is rejected if later
keys would be lost. Drag markers, edit key time, use Left/Right (0.05 s, Shift:
0.5 s), or delete the selected key. Previous/Next Key and numeric Seek are also
available. Save sidebar changes to keys before moving the playhead/exporting.

Click a transition strip between keys to select its easing without moving the
playhead. Strips show their own curves; the editor identifies the interval.
Linear, Ease In/Out, Ease In-Out and custom Bezier are available. Drag handles
or edit coordinates; changes update the current frame live, coalesced by RAF.
Numeric parameters and zoom interpolate within a style; switches change at keys.
Keys with different styles use progressive spatial dithering controlled by the
outgoing easing curve: outgoing marks break apart as incoming marks appear,
without an opacity fade. Each endpoint keeps its own style parameters, so values
with different meanings are never blended together. Key markers and the key
list identify both key number and style; transition strips distinguish
parameter animation from a style dither. Sidebar edits preview a draft look;
save it as a key before seeking or exporting. A mixed preview cannot be saved
as if it were a single style: change a sidebar control to define the new look
before adding a key inside a style transition.
Before the first key and after the last, values hold.

**Pause** freezes the displayed frame without changing quality. **Resume**
continues there, **Restart** plays from zero, **Stop** returns to zero without
playing, and **Loop** repeats the duration. Keys persist when closing/reopening
Animate during this page session; they are not stored across page reloads.
The existing video/GIF player remains separate; Animate uses still images.

### Animation dock size

Animation opens at the full height of its controls, capped to leave at least
160 px for the viewport. It opens fully again after being closed.
Drag the divider above it up or down to choose how much space goes to the
viewport or the timeline. The dock scrolls internally at small sizes, keeping
all controls and instructions available. Its settings and action buttons are
grouped separately, with a shorter timeline track and tighter spacing.

The divider is keyboard focusable: Up/Down changes height by 16 px (48 px with
Shift), Home minimizes it, End expands it up to the actual content height while retaining a 160 px viewport,
and Enter or a double-click shows all controls again. A manually chosen height
applies during the current opening and adapts to window resizing. Opening/closing the instructions or changing the content also
updates the maximum height: the dock cannot grow into unused blank space.
Dock resizing only changes display fitting; keyframes,
playhead time, composition settings and exported pixels are unchanged.

### Matching preview and output

The viewport shows the composition fitted to the available area. Its selected
720/1080/1920-pixel long edge, or source size capped at 1920, sets the default composition size; the export dialog can override it independently. Source aspect ratio is kept, with even dimensions for video codecs.
The initial camera is full-image framing; keyed zoom is relative to that
baseline. The inspection camera is separate: drag to pan, use two-finger scroll
for pan and pinch or Ctrl/Cmd/Alt + scroll to zoom around the cursor. Two-touch
pinch and Safari gesture events are supported. **Fit View** or double-click
resets inspection only. Inspection remains available during playback and pause;
it never changes keys, sampled parameters, time, or exported composition.
Resizing the viewport changes display fitting, not composition coordinates.

Export and Full Detail preview share frame parameters, camera, random seed,
processing detail and palette. Export Detail is explicit: Source (default),
Balanced (480 px) or Fine (720 px). Fast/Balanced preview use their own processing
copy and raster surface as described below, never changing export settings.
Play/Pause do not switch quality profiles or upscale the processing source.

Full Detail and classic image navigation retain native Path2D geometry for
camera changes. Fast/Balanced retain raster geometry for zoom-only updates.
Input bursts remain coalesced with RAF; original path order, fill/stroke and
style equations are retained. Only the current scene/pair is kept per renderer.
Measured FPS is observational and depends on image complexity/hardware. Still
exports seed randomness explicitly so viewport draws cannot change the result.

For a style transition, both endpoints are retained as vectors for export/Full
Detail, or raster scenes for Fast/Balanced, and isolated in reusable canvases at
the target pixel density. A deterministic
64×64 ranked noise tile provides 4096 progressive thresholds. Each local cell
selects one complete endpoint pixel, including its background, rather than
mixing opacity. The grain scale derives from the normalized source dimensions
and stays anchored to composition coordinates: inspection pan/zoom and export
size cannot change its registration. Nearest-neighbor sampling keeps the mask
binary; antialiased style edges keep their original detail. Exact key times
bypass the mask and reproduce the original endpoint.

The same renderer handles preview and export, including dark palette and
continuous keyed zoom. Dither-only frames reuse both native-density layers
without geometry generation or path replay. Repeated seeks use the same noise,
so pausing, scrubbing and exporting do not introduce random flicker. A
camera/zoom, source or style change rebuilds the affected layers; processing
export detail is never automatically reduced.

### Animation export

**Export Animation** controls format, FPS (12/15/24/25/30/50/60), output
resolution independently of preview (up to a 3840 px long edge, or source capped
at 4096), bitrate and frame range. Quality presets are 12, 24 and 50 Mbps; custom
bitrate accepts 1–100 Mbps. PNG is lossless and disables bitrate controls.

Frame numbers start at zero. A custom range includes both first and last
selected frames; timestamps sample `(startFrame + index) / fps`. All Frames
includes every timestamp before the timeline's duration, excluding the terminal
endpoint. Output video starts at zero and lasts `selected frame count / fps`.
The summary shows actual dimensions, frame count, duration and palette.

On browsers with supported WebCodecs encoders, MP4/H.264 and WebM/VP9 encode
frames offline in order. Each VideoFrame has an explicit microsecond timestamp
and duration. Encoder backpressure is bounded and the final encoded frame count
is checked before download, so slow geometry calculations cannot drop frames.
Native encoder capabilities are probed for the requested size/FPS/bitrate.
Unmodified MIT-licensed mp4-muxer and webm-muxer bundles assemble local files;
see vendor/SOURCES.md. A browser without a usable offline encoder can expose
an explicitly labelled realtime compatibility mode using MediaRecorder, which
may skip frames under load. PNG sequence remains frame-accurate everywhere.

PNG ZIP contains every requested frame and animation.json with source duration,
selected range, actual output dimensions, FPS, processing detail, palette, bitrate
and saved keys. Output size never changes preview framing or the selected
processing detail. All export outcomes restore the prior editor frame and draft.
Cancellation downloads no partial file. Hiding the tab or entering phone layout
cancels the job. PNG payload is capped at 192 MB; encoded video at 512 MB.

### Animation viewport and prepared playback

Animation defaults to **Fast** feedback, independently of image mode and export.
It renders onto a raster composition with at most a 720 px long edge, avoiding
native-density Path2D recording/replay for every parameter change. A processing
copy starts at 360 px and can step down to 240/180 px after a render exceeds
45 ms. It does not oscillate upwards during playback. **Balanced** fixes the
copy at 480 px; **Full Detail** retains the original native vector preview.
Neither mode enlarges the source or modifies its pixels. Fast/Balanced never
exceed the drawing detail selected for export.

**Export Detail** and output resolution remain independent. frameCanvas(), PNG
sequences and video use the selected full composition settings, not the preview
copy or its raster. Classic image mode keeps its previous high quality. Zoom-only
updates reuse raster or vector geometry instead of rerunning the style algorithm.

**Smooth Preview → Prepare & Play** prepares the currently selected preview at
24/30/60 FPS into lossless frames. A small lookahead decodes nearby images;
waiting on decoding does not rerun heavy geometry. The cache is valid only for
the same source, keys, duration, palette, preview profile/detail, camera and
display dimensions/density. Full Detail preserves native Retina vector quality.
Arbitrary-time seeking and export remain exact and independent of the cache.
Preparation is cancellable, restores the editor, and caps compressed data at
192 MB. Live Play remains immediately available. Separate transport/readout
rows avoid viewport jumps. Dark preview inverts the complete viewport once,
preserving light/dark symmetry on antialiased composition edges.

### Animation backgrounds

The Background control offers Auto (the existing viewport palette), White,
Black and Custom. A native color picker and editable #RRGGBB value choose the
custom color. Hollow dot cutouts use the chosen background without changing the
original style function. Invalid hex values revert to the last valid color. Ink polarity
adjusts for brightness contrast. The exact chosen background is kept in live,
prepared and Full previews, PNG frames and video, and recorded in animation.json.
The surrounding viewport still follows its theme; custom composition colors
remain fixed when that theme changes. Background changes do not affect image
mode or its photo exports.

### Export interface

The export dialog separates **File**, **Timing** and **Video Quality**, preceded
by actual output size/FPS/frame count/duration/background. First/last frame
controls appear together only for a custom range. Bitrate controls appear only
for video, with a separate custom value when needed. Progress and the primary
export action are separated from configuration.

Animation controls and export use a shared custom select matching the site's
black/white rows and inset double chevrons. The native select retains its value,
label, events and disabled state beneath the visual control. Pointer and keyboard
navigation use a positioned listbox, with Home/End, typeahead, Enter, Tab and
Escape. Popovers escape dialog scrolling/clipping; a fixed-position fallback
supports browsers without the Popover API. Image sidebar selects are unchanged.
Internal legacy Micelium* API/event names and the old dark-mode preference key
remain for compatibility; public copy and filenames use MYCLM.

The modules under `js/` separate timeline math, existing-sketch adaptation,
composition rendering, export encoding, export dialog, Animate and navigation.
Feature CSS remains scoped under `css/`.

Checks (serve the app for browser suites):

```sh
node --test tests/animation-core.test.cjs
node tests/smoke.cjs
node tests/editor.cjs
node tests/navigation.cjs
node tests/animation-workflow.cjs
node tests/viewport-navigation.cjs
node tests/responsive.cjs
node tests/style-transitions.cjs
node tests/image-fit.cjs
node tests/image-export.cjs
node tests/advanced-animation.cjs
node tests/animation-interface.cjs
```

Set `BROWSER=webkit` to run the existing browser suites in Playwright WebKit;
the touch/font suite `responsive.cjs` and style-transition suite use Chromium. Workflow tests
exercise all six composition styles, 1–30 seconds and retiming, live transition
editing, pause/resume/restart/stop/loop, real PNG ZIP frame counts/metadata,
byte-identical preview/export samples, video recording/decoding when supported,
and cancellation/restoration. Viewport tests exercise all six cached classic
styles, compare retained paths with fresh high-resolution rendering at 2x,
verify camera gestures/drag/Fit, coalescing, and unchanged keys, fractional
parameters, palette, playback and composition pixels. Existing suites check original PNG/SVG export,
image/video upload and menu behavior with external requests blocked.
`node tests/playback-performance.cjs` reports observational FPS on a generated
1024×1024 source; it does not assert a universal frame rate.

## Upload framing

New images are centered and fitted to 80% of the available viewport in their
limiting dimension. Small sources display larger and large sources display
smaller; the camera does not upsample the processing source or change ordinary
PNG/SVG export dimensions or pixels. Double-click restores that fit in the
classic viewport. The slider range adapts to tiny and large native sources,
with continuous precision for zoom values beyond the old 0.05–8 range. The same
initial framing applies to the existing GIF/video upload flows. Animation saves
the fitted camera as its baseline; resizing its dock changes only inspection
fitting.

`tests/image-fit.cjs` checks actual rendered occupancy, small/tiny/large/native
panoramic/portrait sources, preserved source dimensions and byte-identical native
PNG after zoom, double-click refitting and Animation's baseline camera. It also
checks mobile naming and explicit black zoom-button styling. The active page
title is **MYCLM beta**, and the mobile controls header is **MYCLM**.

## Still image export labels

Still-image buttons explicitly distinguish **PNG Black / Transparent Background**,
**PNG White / Transparent Background** and **PNG Colored / Full Image**. The full
image includes a white background in light mode or a black background in dark
mode, using the same inversion as the viewport. Its subtitle identifies the
background and, for monochrome styles, black on white or white on black. SVG is
labelled **Vector / No Background**. Download names also identify the palette
and background.

Transparent black/white PNGs tint the original drawing coverage after rendering,
including styles that normally paint their own colors. Bitmap dither temporarily
uses its monochrome option, restoring the sidebar afterward. Hollow halftone
centers become transparent cutouts before tinting, preserving ring geometry and
antialiasing. The six style functions and viewport rendering are unchanged.

`tests/image-export.cjs` inspects 36 downloaded PNGs across six styles and both
palettes: actual alpha/color values, opaque backgrounds, dark inversion, hollow
centers, native/2× dimensions, unchanged controls, truthful names and mobile
label fit. Existing smoke tests retain SVG coverage.

## Phone layout and typography

At widths up to 767 px, and on coarse-pointer landscape screens up to 500 px
high, the viewport stays above an independently scrolling controls pane. The
upper workspace now takes 56% of portrait screen height (60% on short landscape
screens), giving the preview more room while preserving text sizes and touch
targets in the smaller controls pane below. The
decorative logo is hidden, a Load File button remains available after upload,
and controls use larger touch targets and native selects. Image styles,
PNG/SVG export and the existing media player remain available. Export dialogs
scroll within the available screen height.

Animation is disabled in the phone menu and cannot be opened through its
controller there. Moving an open desktop editor into the phone layout pauses
and closes it while retaining keys for the page session. An in-progress
animation export is cancelled when entering the phone layout.

Desktop text is 2 px larger than the previous baseline. All interface text,
including inputs, selects and dialogs, uses WTGaramono. UI symbols absent from
the font use CSS shapes or supported text, avoiding an implicit second font.
The older vendored font artifacts remain unchanged but are no longer loaded.

`tests/responsive.cjs` uses Chromium touch emulation to check phone scrolling,
all six styles, parameter edits, PNG/SVG downloads, narrow and landscape layouts,
the basic video player and desktop-only Animation. It also verifies actual
Garamono glyph rendering, explicit keyframe overwrite without changing other
keys, interpolation after saving, and timeline preservation across layout changes.
Physical phones and native Safari still require a manual check.

All application chrome uses black, white and neutral gray, including native
control accents, selection/focus, draft indicators, recording state and the
playhead. Existing artwork palette options are independent of the interface.
About is a concise MYCLM introduction: brightness/edge processing becomes lines,
dots and dithering; keyframes animate the result. A short paragraph explains the
open-source, co-designed future and links to the existing GitHub repository.
It retains Garamono, monochrome styling and scrolling when needed. Existing
style names remain, with parenthetical explanations removed. Bitmap's first
slider is Grid Spacing (not another threshold); Dither's wave control is Wave
Frequency; Agon's Relief Profile is distinct from its numeric Relief Depth.
Option values, parameter ranges and the six original render algorithms remain
unchanged. Visible slider names are also their accessible labels.

`tests/style-transitions.cjs` checks all 30 ordered pairs of distinct styles,
exact endpoints, binary endpoint-pixel selection, monotone deterministic
progress, geometry reuse, native 2× vector replay and grain registration through pan/zoom and an actual three-style PNG ZIP. It verifies preview
parity, dark palette, easing, saved style metadata and editor restoration.
Animation JSON includes `styleTransitions: "spatial-dither"`. WebM and MP4
recordings are decoded at an intermediate transition time to check visible output.

After the logo's first click switches it from video to the static character,
hovering the character replaces the pointer with a Garamono “refresh page” label.
Clicking still reloads the page; keyboard Enter/Space also activates the static
character. The first video-state cursor is retained. Selected custom dropdown
rows use the same black background and white foreground for their chevrons.

Responsive checks also cover mouse/keyboard dock resizing and reset, bounds
after window resizing, unchanged timeline/export pixels, the logo reload flow
and actual cursor font, and selected dropdown-arrow colors.


## Navigation compatibility checks

```sh
node tests/navigation.cjs
BROWSER=webkit node tests/navigation.cjs
BROWSER=webkit node tests/smoke.cjs
BROWSER=webkit node tests/editor.cjs
```

WebKit runs require the Playwright WebKit browser and its platform libraries.
The navigation check exercises native pointer/keyboard actions and a macOS
Safari-style button-focus policy: pointer-down blurs the active button without
focusing the clicked button. A null `focusout.relatedTarget` must leave the menu
visible until click dispatch. Outside clicks, known outside focus targets and
Escape still close it. Linux WebKit coverage supplements, but does not replace,
a manual check in Safari on macOS. The missing upstream p5.svg.js.map is a
DevTools source-map reference, not an application runtime script dependency.


`tests/advanced-animation.cjs` requires ffprobe in addition to Chromium. It
checks actual encoded frame counts and timestamps for MP4 and WebM with an
artificially slow 80 ms/frame renderer, custom range/bitrate/output dimensions,
PNG range pixel parity and metadata, editor restoration, prepared-frame Retina
pixel parity, geometry reuse and cancellation. It also checks concise labels.
Physical Safari and codecs unavailable in the environment are not covered by
Chromium tests.

`tests/animation-interface.cjs` verifies actual custom-menu clicks and keyboard
selection, arrow inset and popup bounds, conditional export controls, exact
background pixels and PNG metadata, decoded video background, Fast/full-output
separation and byte-identical photo export. Render-cost measurements for Techno
Organic and Agon on a generated 960×640 source are observational, not universal
FPS assertions. Native vector-quality tests explicitly select Full Detail.
