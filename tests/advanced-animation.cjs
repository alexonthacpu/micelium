// Exact video timing under slow rendering, configurable ranges, lossless prepared playback.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [], external = [], base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin === new URL(base).origin || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); external.push(u.href); return route.abort(); });
  await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForFunction(() => cvLoaded && window.MiceliumAnimate);
  const set = (id, value) => page.locator(id).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(value));
  const fixture = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 160, 96); g.fillStyle = '#000'; g.fillRect(20, 15, 45, 60); g.beginPath(); g.arc(110, 48, 25, 0, Math.PI * 2); g.fill(); return c.toDataURL().split(',')[1]; });
  await page.locator('#fileInput').setInputFiles({ name: 'timing.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') }); await page.waitForFunction(() => MiceliumEditor.ready());
  for (let i = 1; i <= 6; i++) {
   await page.selectOption('#styleSelect', String(i), { force: true });
   const labels = await page.locator('#ui-content .control > span.label').allTextContents();
   const visible = await page.locator('#l1, #l2, #l3, #l4').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => el.textContent));
   assert.equal(new Set(visible).size, visible.length);
   if (i === 2) assert.deepEqual(visible, ['Grid Spacing', 'Threshold', 'Noise']);
   if (i === 5) assert.ok(visible.includes('Wave Frequency'));
   assert.ok(!labels.includes('Treshold'));
  }
  assert.equal(await page.locator('#agonReliefDepth option[value="deep"]').textContent(), 'Deep Chisel');
  await page.selectOption('#styleSelect', '1', { force: true });
  await page.evaluate(() => MiceliumAnimate.toggle(true)); await page.selectOption('#animate-preview-quality', 'full'); await set('#animate-duration', 1); await page.selectOption('#animate-resolution', 'source');
  await set('#p1', 60); await page.click('#animate-add'); await page.click('#animate-add-end'); await set('#p1', 220); await page.click('#animate-add');
  await set('#animate-seek-time', .23);
  const before = await page.evaluate(() => ({ snapshot: MiceliumAnimate.snapshot(), pixels: MiceliumAnimate.frameCanvas().toDataURL(), settings: MiceliumAnimate.compositionSettings() }));
  await page.click('#animate-export'); await page.selectOption('#animation-export-fps', '30'); await page.selectOption('#animation-export-resolution', '720');
  await page.selectOption('#animation-export-range', 'custom'); await set('#animation-export-first', 3); await set('#animation-export-last', 2);
  assert.equal(await page.locator('#animation-export-start').isDisabled(), true);
  await set('#animation-export-last', 9);
  await page.waitForFunction(() => [...document.getElementById('animation-export-format').options].some(o => o.value === 'webm'));
  await page.selectOption('#animation-export-format', 'webm');
  await page.selectOption('#animation-export-quality', 'custom'); await set('#animation-export-bitrate', 32);
  await page.waitForFunction(() => !document.getElementById('animation-export-start').disabled);
  const types = await page.evaluate(() => MiceliumAnimationExport.videoTypes().filter(t => t.offline)); assert.ok(types.length);
  for (const type of types) {
   await page.selectOption('#animation-export-format', type.ext);
   await page.evaluate(() => {
    window.encoded = []; window.configured = [];
    const proto = VideoEncoder.prototype; window.originalEncode = proto.encode; window.originalConfigure = proto.configure;
    proto.encode = function(frame, options) { encoded.push([frame.timestamp, frame.duration]); return originalEncode.call(this, frame, options); };
    proto.configure = function(config) { configured.push(config); return originalConfigure.call(this, config); };
    window.originalRender = MiceliumComposition.prototype.renderScene;
    MiceliumComposition.prototype.renderScene = function(...args) { const until = performance.now() + 80; while (performance.now() < until) {} return originalRender.apply(this, args); };
   });
   const [download] = await Promise.all([page.waitForEvent('download'), page.click('#animation-export-start')]);
   await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
   const record = await page.evaluate(() => {
    VideoEncoder.prototype.encode = originalEncode; VideoEncoder.prototype.configure = originalConfigure; MiceliumComposition.prototype.renderScene = originalRender;
    return { encoded, configured };
   });
   assert.equal(record.encoded.length, 7); assert.equal(record.configured[0].bitrate, 32000000); assert.equal(record.configured[0].framerate, 30);
   assert.deepEqual(record.encoded.map(f => f[0]), Array.from({ length: 7 }, (_, i) => Math.round(i * 1000000 / 30)));
   const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_frames', '-show_entries', 'stream=codec_name,width,height,nb_read_frames:format=duration:frame=best_effort_timestamp_time', '-of', 'json', await download.path()], { encoding: 'utf8' }));
   assert.equal(info.streams[0].nb_read_frames, '7'); assert.equal(info.streams[0].width, 720); assert.equal(info.streams[0].height, 432);
   for (let i = 0; i < 7; i++) assert.ok(Math.abs(Number(info.frames[i].best_effort_timestamp_time) - i / 30) < .0011);
   assert.ok(Math.abs(Number(info.format.duration) - 7 / 30) < 1 / 30);
   assert.deepEqual(await page.evaluate(() => MiceliumAnimate.compositionSettings()), before.settings);
   assert.equal(await page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL()), before.pixels);
   console.log(`PASS: ${type.ext} has all 7 selected frames at exact 30 FPS despite 80ms/frame rendering; 720px output, 32Mbps and restoration`);
  }
  await page.selectOption('#animation-export-format', 'zip');
  const [zipFile] = await Promise.all([page.waitForEvent('download'), page.click('#animation-export-start')]);
  await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
  const zipped = await page.evaluate(async b64 => { const z = await JSZip.loadAsync(b64, { base64: true }); return { metadata: JSON.parse(await z.file('animation.json').async('string')), images: await Promise.all([0, 6].map(i => z.file(`frames/frame_${String(i).padStart(5, '0')}.png`).async('base64'))) }; }, (await fs.readFile(await zipFile.path())).toString('base64'));
  assert.equal(zipped.metadata.bitrate, undefined); assert.equal(zipped.metadata.startFrame, 3); assert.equal(zipped.metadata.endFrame, 9); assert.equal(zipped.metadata.frameCount, 7);
  const expected = await page.evaluate(() => { const state = MiceliumAnimate.snapshot(), r = new MiceliumComposition(MiceliumEditor), saved = MiceliumEditor.capture(); try { return [3, 9].map(i => r.renderScene(MiceliumTimeline.sampleScene(state.frames, i / 30), { ...MiceliumAnimate.compositionSettings(), longEdge: 720 }).canvas.toDataURL().split(',')[1]); } finally { r.dispose(); MiceliumEditor.apply(saved); } });
  assert.deepEqual(zipped.images, expected); await page.click('#animation-export-cancel');
  console.log('PASS: custom PNG range has exact endpoint pixels and source frame metadata');
  await page.evaluate(() => { window.cacheMisses = []; const get = MyclmPlaybackCache.prototype.get; MyclmPlaybackCache.prototype.get = function(index) { const result = get.call(this, index); if (!result) cacheMisses.push({index, pending:[...this.pending.keys()], decoded:[...this.decoded.keys()]}); return result; }; window.styleCalls = 0; for (let n = 1; n <= 6; n++) { const name = `renderStyle0${n}`, original = window[name]; window[name] = function(...args) { styleCalls++; return original.apply(this, args); }; } });
  await page.click('#menu-toggle'); await page.click('#menu-dark');
  await page.click('#animate-smooth'); await page.selectOption('#playback-preview-fps', '24'); await page.click('#playback-preview-start');
  await page.waitForFunction(() => MiceliumAnimate.playbackPrepared() && !document.getElementById('playback-preview-dialog').open);
  const calls = await page.evaluate(() => styleCalls); await page.waitForTimeout(180);
  const check = await page.evaluate(() => {
   const calls = styleCalls; MiceliumAnimate.pause();
   const snapshot = MiceliumAnimate.snapshot(), c = document.querySelector('#canvas-holder canvas'), before = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
   const r = new MiceliumComposition(MiceliumEditor), buffer = r.renderScene(MiceliumTimeline.sampleScene(snapshot.frames, snapshot.time), { ...MiceliumAnimate.compositionSettings(), dark: false }, { rasterize: false });
   const fresh = document.createElement('canvas'); fresh.width = c.width; fresh.height = c.height;
   const g = fresh.getContext('2d'), d = pixelDensity(), scale = Math.max(.01, Math.min((width - 32) / buffer.width, (height - 32) / buffer.height));
   g.fillStyle = '#eee'; g.fillRect(0, 0, c.width, c.height); g.scale(d, d); g.translate((width - buffer.width * scale) / 2, (height - buffer.height * scale) / 2); g.scale(scale, scale); r.paint(g); g.resetTransform(); g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
   const after = g.getImageData(0, 0, c.width, c.height).data; let max = 0, sum = 0; for (let i = 0; i < after.length; i++) { const delta = Math.abs(after[i] - before[i]); sum += delta; max = Math.max(max, delta); }
   r.dispose(); return { calls, mean: sum / before.length, max, time: snapshot.time, misses: cacheMisses };
  });
  assert.ok(check.calls - calls <= 1, `prepared playback reuses frames rather than recalculating styles: start=${calls}, ${JSON.stringify(check)}`);
  assert.ok(check.mean < .001 && check.max <= 2, `prepared frame keeps native Retina detail: ${JSON.stringify(check)}`);
  const beforeSeek = await page.evaluate(() => styleCalls); await set('#animate-seek-time', .371);
  assert.ok(await page.evaluate(() => styleCalls) > beforeSeek, 'non-grid seeking renders the exact requested time instead of a nearby cached frame');
  console.log('PASS: prepared playback avoids geometry calculations, matches native Retina rendering in dark mode and preserves exact arbitrary-time seeking');
  await set('#animate-duration', 30); const saved = await page.evaluate(() => MiceliumAnimate.snapshot());
  await page.click('#animate-smooth'); await page.click('#playback-preview-start'); await page.waitForFunction(() => document.getElementById('playback-preview-progress').value > 0); await page.click('#playback-preview-cancel'); await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
  assert.match(await page.locator('#playback-preview-status').textContent(), /cancelled/);
  assert.equal(await page.evaluate(() => MiceliumAnimate.snapshot().time), saved.time); assert.equal(await page.evaluate(() => MiceliumAnimate.playbackPrepared()), false);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: prepared-preview cancellation restores the editor; no errors or external requests');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
