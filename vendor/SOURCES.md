# Vendored runtime sources

Downloaded over HTTPS with TLS verification. Library payloads are retained
unmodified, including upstream notices. No placeholder or CDN fallback is used.

Versions match the original index.html: p5.js 1.4.2 (LGPL-2.1), JSZip 3.10.1
(MIT or GPLv3), p5.js-svg 1.3.1 (MIT), OpenCV.js 4.5.4 (Apache-2.0).
The OpenCV build includes its WebAssembly data; no separate .wasm is needed.
Google Fonts are licensed under OFL-1.1. Existing project fonts are unchanged.

| Local file | Source |
| --- | --- |
| `p5-1.4.2.min.js` | https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.2/p5.min.js |
| `jszip-3.10.1.min.js` | https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js |
| `p5.svg-1.3.1.js` | https://unpkg.com/p5.js-svg@1.3.1/dist/p5.svg.js |
| `opencv-4.5.4.js` | https://docs.opencv.org/4.5.4/opencv.js |
| `p5-LICENSE.txt` | https://raw.githubusercontent.com/processing/p5.js/v1.4.2/license.txt |
| `jszip-LICENSE.markdown` | https://raw.githubusercontent.com/Stuk/jszip/v3.10.1/LICENSE.markdown |
| `p5.svg-LICENSE` | https://unpkg.com/p5.js-svg@1.3.1/LICENSE |
| `opencv-LICENSE` | https://raw.githubusercontent.com/opencv/opencv/4.5.4/LICENSE |
| `fonts/JetBrainsMono-OFL.txt` | https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt |
| `fonts/SpaceMono-OFL.txt` | https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/OFL.txt |
| `fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPQ.ttf` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPQ.ttf |
| `fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxjPQ.ttf` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxjPQ.ttf |
| `fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8FqtjPQ.ttf` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8FqtjPQ.ttf |
| `fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8L6tjPQ.ttf` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8L6tjPQ.ttf |
| `fonts/i7dNIFZifjKcF5UAWdDRYER8QA.ttf` | https://fonts.gstatic.com/s/spacemono/v17/i7dNIFZifjKcF5UAWdDRYER8QA.ttf |
| `fonts/i7dPIFZifjKcF5UAWdDRUEY.ttf` | https://fonts.gstatic.com/s/spacemono/v17/i7dPIFZifjKcF5UAWdDRUEY.ttf |
| `fonts/i7dMIFZifjKcF5UAWdDRaPpZYFI.ttf` | https://fonts.gstatic.com/s/spacemono/v17/i7dMIFZifjKcF5UAWdDRaPpZYFI.ttf |

`fonts.css` preserves the original Google Fonts request (JetBrains Mono normal
400/500/600/700, Space Mono normal 400/700 and italic 400, display=swap),
with only URLs changed to the local downloaded font files. Source stylesheet:

https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap

`SHA256SUMS` records all retained vendor files except this source record and
the checksum manifest itself. These hashes detect later changes; they are not
a separately signed upstream authenticity claim.

## Frame-accurate video export

Unmodified MIT-licensed IIFE bundles and licenses from npm archives:

- `mp4-muxer-5.2.2.js`, `mp4-muxer-LICENSE`: https://registry.npmjs.org/mp4-muxer/-/mp4-muxer-5.2.2.tgz (`package/build/mp4-muxer.js`, `package/LICENSE`).
- `webm-muxer-5.1.4.js`, `webm-muxer-LICENSE`: https://registry.npmjs.org/webm-muxer/-/webm-muxer-5.1.4.tgz (`package/build/webm-muxer.js`, `package/LICENSE`).

Encoding uses the browser's native WebCodecs API; no runtime CDN requests.
