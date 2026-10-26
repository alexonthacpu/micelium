// Custom menus, lighter animation feedback, persistent output quality/background.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [], external = [], base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === new URL(base).origin || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); external.push(u.href); return route.abort(); });
  await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForFunction(() => cvLoaded && window.MiceliumAnimate);
  const fixture = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 960; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 960, 640); g.fillStyle = '#000'; for (let x = 40; x < 900; x += 75) { g.fillRect(x, 50, 26, 230); g.beginPath(); g.arc(x + 18, 410, 26, 0, Math.PI * 2); g.fill(); } return c.toDataURL().split(',')[1]; });
  await page.locator('#fileInput').setInputFiles({ name: 'interface.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') }); await page.waitForFunction(() => MiceliumEditor.ready());
  async function download(button) { const [file] = await Promise.all([page.waitForEvent('download'), page.click(button)]); assert.equal(await file.failure(), null); return fs.readFile(await file.path()); }
  async function photo() { await page.click('#btnExportSettings'); await page.selectOption('#exportQualitySelectModal', '1', { force: true }); const bytes = await download('#expBlack'); await page.click('#modalCloseBtn'); return bytes; }
  const originalPhoto = await photo();
  await page.evaluate(() => {
   window.renderWidths = [];
   for (let i = 1; i <= 6; i++) { const name = `renderStyle0${i}`, old = window[name]; window[name] = function(...args) { renderWidths.push(img.width); return old.apply(this, args); }; }
   MiceliumAnimate.toggle(true);
  });
  assert.equal(await page.locator('#animate-preview-quality').inputValue(), 'fast');
  assert.equal(await page.locator('#animate-detail').inputValue(), 'source');
  assert.ok([180, 240, 360].includes(Number(await page.evaluate(() => MiceliumAnimate.previewSettings().detail))));
  assert.equal(await page.evaluate(() => MiceliumAnimate.compositionSettings().detail), 'source');
  await page.evaluate(() => { renderWidths.length = 0; const c = document.getElementById('p1'); c.value = 180; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => renderWidths.length);
  assert.ok((await page.evaluate(() => renderWidths)).every(w => w <= 360), 'only live animation uses a smaller processing copy');
  const set = (id, value) => page.locator(id).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(value));
  await page.click('#animate-add'); await page.click('#animate-add-end'); await set('#animate-duration', 1);
  await page.selectOption('#animate-background-mode', 'custom'); await set('#animate-background-hex', '#d9e8c8');
  const corner = () => page.evaluate(() => Array.from(MiceliumAnimate.frameCanvas().getContext('2d').getImageData(0, 0, 1, 1).data));
  assert.deepEqual(await corner(), [217, 232, 200, 255]);
  assert.deepEqual(await page.evaluate(() => ['#ffffff', '#000000', '#ff00ff'].map(color => MiceliumComposition.darkBackground(color))), [false, true, false], 'ink follows the stronger light/dark contrast');
  await page.selectOption('#animate-background-mode', 'black'); assert.deepEqual(await corner(), [0, 0, 0, 255]);
  assert.equal(await page.evaluate(() => MiceliumAnimate.compositionSettings().dark), true, 'dark backgrounds get contrasting ink');
  await page.selectOption('#animate-background-mode', 'custom'); await set('#animate-background-hex', '#203040');
  assert.deepEqual(await corner(), [32, 48, 64, 255]);
  const fixedBackground = await page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL());
  await page.click('#menu-toggle'); await page.click('#menu-dark'); await page.click('#menu-toggle');
  assert.equal(await page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL()), fixedBackground, 'custom composition color is independent of viewport theme');
  assert.equal(await page.locator('#canvas-holder canvas').evaluate(c => c.getContext('2d').getImageData(0, 0, 1, 1).data[0]), 17, 'viewport surround follows its dark theme');
  await page.click('#menu-toggle'); await page.click('#menu-dark'); await page.click('#menu-toggle');
  await page.selectOption('#styleSelect', '4', { force: true });
  assert.deepEqual(await page.evaluate(() => Array.from(MiceliumAnimate.frameCanvas().getContext('2d').getImageData(40, 67, 1, 1).data)), [32, 48, 64, 255], 'hollow dot centers use the chosen background');
  await page.selectOption('#styleSelect', '1', { force: true });
  await page.click('#animate-export');
  const sections = await page.locator('#animation-export-settings h3').allTextContents();
  assert.deepEqual(sections, ['01 / FILE', '02 / TIMING', '03 / VIDEO QUALITY']);
  assert.equal(await page.locator('#animation-export-frame-range').isVisible(), false);
  assert.equal(await page.locator('#animation-export-video-quality').isVisible(), false);
  const select = page.locator('#animation-export-format');
  await page.waitForFunction(() => [...document.getElementById('animation-export-format').options].some(o => o.value === 'mp4'));
  await select.click(); assert.equal(await select.getAttribute('aria-expanded'), 'true');
  let list = page.locator('#' + await select.getAttribute('aria-controls'));
  assert.equal(await list.isVisible(), true);
  const selected = list.locator('[aria-selected="true"]');
  assert.deepEqual(await selected.evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, s.color]; }), ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
  const arrowInset = await select.evaluate(el => { const w = el.parentElement.getBoundingClientRect(), arrow = el.parentElement.querySelector('.design-select-arrow').getBoundingClientRect(); return w.right - arrow.right; });
  assert.ok(arrowInset >= 9, 'dropdown arrow has breathing room inside the border');
  await list.getByRole('option', { name: 'MP4 VIDEO', exact: true }).click();
  assert.equal(await select.inputValue(), 'mp4'); assert.equal(await page.locator('#animation-export-video-quality').isVisible(), true);
  const quality = page.locator('#animation-export-quality'); await quality.click();
  const qualityList = page.locator('#' + await quality.getAttribute('aria-controls')), qualityBox = await qualityList.boundingBox();
  assert.ok(qualityBox.y >= 0 && qualityBox.y + qualityBox.height <= 1000, 'option list stays inside the viewport');
  await qualityList.getByRole('option', { name: 'CUSTOM BITRATE', exact: true }).click();
  assert.equal(await page.locator('#animation-export-bitrate-label').isVisible(), true);
  const rate = page.locator('#animation-export-fps'); await rate.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await rate.inputValue(), '15');
  await rate.click(); await page.keyboard.press('Escape');
  assert.equal(await rate.getAttribute('aria-expanded'), 'false'); assert.equal(await page.locator('#animation-export-dialog').evaluate(el => el.open), true, 'Escape closes the menu before the dialog');
  await page.selectOption('#animation-export-range', 'custom'); assert.equal(await page.locator('#animation-export-frame-range').isVisible(), true);
  await set('#animation-export-first', 2); await set('#animation-export-last', 4);
  await page.selectOption('#animation-export-format', 'zip');
  assert.equal(await page.locator('#animation-export-video-quality').isVisible(), false);
  const expected = await page.evaluate(() => { const saved = MiceliumEditor.capture(), r = new MiceliumComposition(MiceliumEditor); try { return [2, 4].map(i => r.renderScene(MiceliumTimeline.sampleScene(MiceliumAnimate.snapshot().frames, i / 15), MiceliumAnimate.compositionSettings()).canvas.toDataURL().split(',')[1]); } finally { r.dispose(); MiceliumEditor.apply(saved); } });
  const zipBytes = await download('#animation-export-start'); await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
  const output = await page.evaluate(async b64 => { const zip = await JSZip.loadAsync(b64, { base64: true }); return { metadata: JSON.parse(await zip.file('animation.json').async('string')), png: await Promise.all([0, 2].map(i => zip.file(`frames/frame_${String(i).padStart(5, '0')}.png`).async('base64'))) }; }, zipBytes.toString('base64'));
  assert.equal(output.metadata.background, '#203040'); assert.equal(output.metadata.detail, 'source'); assert.equal(output.metadata.frameCount, 3);
  assert.deepEqual(output.png, expected, 'fast preview never reduces exported frame quality');
  await page.selectOption('#animation-export-format', 'mp4');
  const movie = await download('#animation-export-start'); await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
  const movieCorner = await page.evaluate(b64 => new Promise((resolve, reject) => {
   const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' })), video = document.createElement('video'); video.muted = true;
   const cleanup = () => { clearTimeout(timer); video.pause(); video.src = ''; URL.revokeObjectURL(url); };
   const timer = setTimeout(() => { cleanup(); reject(new Error('Video decode timeout')); }, 10000);
   video.onerror = () => { cleanup(); reject(new Error('Cannot decode background video')); };
   video.onloadeddata = () => { video.requestVideoFrameCallback(() => {
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; const g = c.getContext('2d'); g.drawImage(video, 0, 0);
    const pixel = Array.from(g.getImageData(0, 0, 1, 1).data); cleanup(); resolve(pixel);
   }); video.play().catch(reject); }; video.src = url;
  }), movie.toString('base64'));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(movieCorner[i] - [32, 48, 64][i]) < 7, 'encoded video retains the chosen background');
  await page.click('#animation-export-cancel');
  // Observe the work reduction on a substantial source without asserting machine-specific FPS.
  const benchmark = await page.evaluate(() => {
   const state = MiceliumEditor.capture(), saved = { ...state }, settings = MiceliumAnimate.compositionSettings(), result = {};
   for (const style of [1, 6]) {
    result[style] = {};
    const look = style === 6 ? { ...state, styleSelect: '6', p1: 140, p2: 14, p3: 28, p4: 2 } : state;
    for (const [name, retainDrawing, detail] of [['fast', false, '360'], ['full', true, 'source']]) {
     const r = new MiceliumComposition(MiceliumEditor, { retainDrawing }), times = [];
     for (let i = 0; i < 6; i++) { const t = performance.now(); r.render({ ...look, p1: 100 + i * 15 }, { ...settings, detail }); times.push(performance.now() - t); }
     result[style][name] = { medianMs: times.sort((a, b) => a - b)[3], processing: r.processing?.width || 960 }; r.dispose();
    }
   }
   MiceliumEditor.apply(saved); return result;
  });
  for (const style of [1, 6]) { assert.equal(benchmark[style].fast.processing, 360); assert.equal(benchmark[style].full.processing, 960); }
  console.log('OBSERVED preview render cost:', JSON.stringify(benchmark));
  await page.evaluate(() => {
   window.normalPreviewRender = MiceliumComposition.prototype.renderScene;
   MiceliumComposition.prototype.renderScene = function(...args) { if (!this.retainDrawing) { const end = performance.now() + 60; while (performance.now() < end) {} } return normalPreviewRender.apply(this, args); };
  });
  await page.selectOption('#animate-preview-quality', 'fast');
  await page.waitForFunction(() => MiceliumAnimate.previewSettings().detail === '180');
  await page.evaluate(() => { MiceliumComposition.prototype.renderScene = normalPreviewRender; });
  assert.equal(await page.evaluate(() => MiceliumAnimate.compositionSettings().detail), 'source', 'slow preview never downgrades export detail');
  await page.selectOption('#animate-preview-quality', 'balanced'); assert.equal(await page.evaluate(() => MiceliumAnimate.previewSettings().detail), '480');
  await page.selectOption('#animate-preview-quality', 'full'); assert.equal(await page.evaluate(() => MiceliumAnimate.previewSettings().detail), 'source');
  await page.evaluate(() => { MiceliumAnimate.toggle(false); document.getElementById('p1').value = 230; document.getElementById('p1').dispatchEvent(new Event('input', { bubbles: true })); });
  assert.deepEqual(await photo(), originalPhoto, 'image export retains its previous full quality');
  assert.deepEqual(await page.evaluate(() => [rawSourceMedia.width, rawSourceMedia.height, img.width, img.height]), [960, 640, 960, 640]);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: custom pointer/keyboard menus, hierarchy, background parity/metadata, fast preview/full export separation and unchanged photo quality');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
