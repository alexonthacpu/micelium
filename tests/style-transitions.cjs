const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
        const errors = [], external = [], base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.href); return route.abort();
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => cvLoaded && window.MiceliumAnimate);
        await page.selectOption('#previewNormSelect', 'native', { force: true });
        const fixture = await page.evaluate(() => {
            const c = document.createElement('canvas'); c.width = 160; c.height = 96;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 160, 96);
            const gradient = g.createLinearGradient(0, 0, 160, 0); gradient.addColorStop(0, '#000'); gradient.addColorStop(1, '#fff');
            g.fillStyle = gradient; g.fillRect(10, 14, 140, 64); g.fillStyle = '#000'; g.beginPath(); g.arc(105, 48, 26, 0, Math.PI * 2); g.fill();
            return c.toDataURL().split(',')[1];
        });
        await page.locator('#fileInput').setInputFiles({ name: 'blend.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await page.waitForFunction(() => MiceliumEditor.ready());
        const checks = await page.evaluate(() => {
            const editor = MiceliumEditor, states = [];
            for (let i = 1; i <= 6; i++) {
                const select = document.getElementById('styleSelect'); select.value = String(i); select.dispatchEvent(new Event('change', { bubbles: true }));
                const values = i === 2 ? [30, 50, 5, 1] : i === 4 ? [50, 20, 8, 1] : i === 5 ? [128, 6, 30, 5] : [120, 15, 20, 1];
                for (let n = 0; n < 4; n++) {
                    const input = document.getElementById(`p${n + 1}`); input.value = values[n]; input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                states.push({ ...editor.capture(), zoomSlider: 1, circleModeSelect: 'fill' });
            }
            window.blendStates = states;
            let calls = 0;
            let replays = 0;
            const draw = MiceliumDrawing.prototype.draw;
            MiceliumDrawing.prototype.draw = function (...args) { replays++; return draw.apply(this, args); };
            for (let i = 1; i <= 6; i++) {
                const name = `renderStyle0${i}`, original = window[name];
                window[name] = function (...args) { calls++; return original.apply(this, args); };
            }
            const config = { longEdge: 160, cameraBase: 1, detail: 'source', dark: false };
            const pixels = renderer => renderer.rasterize().getContext('2d').getImageData(0, 0, 160, 96).data;
            const references = states.map(state => {
                const renderer = new MiceliumComposition(editor); const data = renderer.render(state, config).canvas.toDataURL();
                const result = { data, pixels: pixels(renderer).slice() }; renderer.dispose(); return result;
            });
            let pairs = 0;
            for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (a !== b) {
                const keys = [{ id: 'a', time: 0, values: states[a], easing: 'linear' }, { id: 'b', time: 1, values: states[b], easing: 'linear' }];
                const renderer = new MiceliumComposition(editor);
                renderer.renderScene(MiceliumTimeline.sampleScene(keys, 0), config);
                if (renderer.rasterize().toDataURL() !== references[a].data) throw new Error(`pair ${a + 1}/${b + 1}: starting pixels`);
                renderer.renderScene(MiceliumTimeline.sampleScene(keys, .25), config); const generated = calls, replayed = replays;
                for (const time of [.5, .75, .999]) {
                    renderer.renderScene(MiceliumTimeline.sampleScene(keys, time), config);
                    const output = pixels(renderer);
                    for (let i = 0; i < output.length; i++) {
                        const expected = references[a].pixels[i] * (1 - time) + references[b].pixels[i] * time;
                        if (Math.abs(output[i] - expected) > 2) throw new Error(`pair ${a + 1}/${b + 1}: incorrect whole-frame dissolve at ${time}`);
                    }
                }
                if (calls !== generated) throw new Error('blend-only frames recalculated style geometry');
                if (replays !== replayed) throw new Error('blend-only frames replayed unchanged vector paths');
                renderer.renderScene(MiceliumTimeline.sampleScene(keys, 1), config);
                if (renderer.rasterize().toDataURL() !== references[b].data) throw new Error(`pair ${a + 1}/${b + 1}: ending pixels`);
                renderer.dispose(); pairs++;
            }
            // The inspection display must replay both vector layers at native 2x density.
            for (const [a, b] of [[0, 3], [4, 5]]) {
                const scene = { from: states[a], to: states[b], mix: .37 };
                const retained = new MiceliumComposition(editor), fresh = new MiceliumComposition(editor);
                retained.renderScene(scene, config, { rasterize: false }); fresh.renderScene(scene, { ...config, longEdge: 320 });
                const c = document.createElement('canvas'); c.width = 320; c.height = 192;
                const g = c.getContext('2d'); g.scale(2, 2); retained.paint(g);
                const left = g.getImageData(0, 0, 320, 192).data, right = fresh.rasterize().getContext('2d').getImageData(0, 0, 320, 192).data;
                let error = 0; for (let i = 0; i < left.length; i++) error += Math.abs(left[i] - right[i]);
                if (error / left.length > .05) throw new Error('2x dissolve lost vector detail');
                retained.dispose(); fresh.dispose();
            }
            const zoomKeys = [{ time: 0, values: { ...states[0], zoomSlider: .7 }, easing: 'ease-in-out' },
                { time: 1, values: { ...states[3], zoomSlider: 1.3 } }];
            const moving = new MiceliumComposition(editor);
            const zoomErrors = [];
            for (const time of [.15, .55, .9]) {
                const scene = MiceliumTimeline.sampleScene(zoomKeys, time);
                moving.renderScene(scene, config);
                const left = new MiceliumComposition(editor), right = new MiceliumComposition(editor);
                left.render(scene.from, config); right.render(scene.to, config);
                const output = pixels(moving), a = pixels(left), b = pixels(right);
                let max = 0, sum = 0;
                for (let i = 0; i < output.length; i++) { const error = Math.abs(output[i] - (a[i] * (1 - scene.mix) + b[i] * scene.mix)); max = Math.max(max, error); sum += error; }
                zoomErrors.push({ time, max, mean: sum / output.length });
                left.dispose(); right.dispose();
            }
            moving.dispose();
            return { pairs, zoomErrors };
        });
        assert.equal(checks.pairs, 30);
        // Fractional easing weights are quantized by Canvas's 8-bit alpha compositor.
        for (const error of checks.zoomErrors) assert.ok(error.max < 4 && error.mean < .2, `zoom dissolve pixels: ${JSON.stringify(error)}`);
        console.log('PASS: all 30 ordered style pairs, exact endpoints, smooth weighted frames, cached geometry and native 2x detail');
        const set = (id, value) => page.locator(id).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(value));
        const seek = value => set('#animate-seek-time', value);
        await page.click('#menu-toggle'); await page.click('#menu-animate');
        await set('#animate-duration', 1); await page.selectOption('#animate-resolution', 'source');
        async function choose(index) {
            await page.evaluate(index => { const state = blendStates[index]; MiceliumEditor.apply(state); }, index);
            // User style edits detach the sampled transition and preview the new draft.
            await page.locator('#p1').dispatchEvent('input');
        }
        await choose(0); await page.click('#animate-add'); await seek(1); await choose(3); await page.click('#animate-add');
        await seek(.5); assert.equal(await page.locator('#animate-add').isDisabled(), true);
        await choose(5); assert.equal(await page.locator('#animate-add').isEnabled(), true); await page.click('#animate-add');
        assert.deepEqual(await page.evaluate(() => MiceliumAnimate.snapshot().frames.map(key => key.values.styleSelect)), ['1', '6', '4']);
        assert.equal(await page.locator('.animate-key .key-style').count(), 3);
        assert.match(await page.locator('.animate-segment').first().textContent(), /DISSOLVE/);
        await page.locator('.animate-segment').first().click(); await page.selectOption('#animate-ease', 'ease-in-out');
        await page.click('#menu-toggle'); await page.click('#menu-dark');
        const expected = {};
        for (const index of [0, 3, 7, 11, 14]) { await seek(index / 15); expected[index] = await page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL().split(',')[1]); }
        await seek(.23); await page.click('#animate-play'); await page.waitForTimeout(100); await page.click('#animate-pause');
        const paused = await page.evaluate(() => ({ time: MiceliumAnimate.snapshot().time, pixels: MiceliumAnimate.frameCanvas().toDataURL() }));
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL()), paused.pixels);
        await page.click('#animate-export'); await page.selectOption('#animation-export-format', 'zip'); await page.selectOption('#animation-export-fps', '15');
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#animation-export-start')]);
        await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
        const bytes = await fs.readFile(await download.path());
        const exported = await page.evaluate(async ({ zip, indices }) => {
            const archive = await JSZip.loadAsync(zip, { base64: true }), result = {};
            for (const index of indices) result[index] = await archive.file(`frames/frame_${String(index).padStart(5, '0')}.png`).async('base64');
            return { images: result, metadata: JSON.parse(await archive.file('animation.json').async('string')) };
        }, { zip: bytes.toString('base64'), indices: Object.keys(expected).map(Number) });
        assert.deepEqual(exported.images, expected); assert.equal(exported.metadata.frameCount, 15);
        assert.equal(exported.metadata.styleTransitions, 'cross-dissolve'); assert.equal(exported.metadata.dark, true);
        assert.deepEqual(exported.metadata.keyframes.map(key => key.values.styleSelect), ['1', '6', '4']);
        assert.equal(await page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL()), paused.pixels);
        assert.equal(await page.evaluate(() => MiceliumAnimate.snapshot().time), paused.time);
        const types = await page.evaluate(() => MiceliumAnimationExport.videoTypes());
        for (const type of types) {
            await page.selectOption('#animation-export-format', type.ext);
            const [movie] = await Promise.all([page.waitForEvent('download'), page.click('#animation-export-start')]);
            await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
            const data = await fs.readFile(await movie.path());
            const decoded = await page.evaluate(base64 => new Promise((resolve, reject) => {
                const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([data]));
                const video = document.createElement('video'); video.muted = true;
                const timer = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('Mixed video decode timeout')); }, 10000);
                video.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(url); reject(new Error('Mixed video cannot decode')); };
                video.onloadeddata = () => { video.currentTime = .3; };
                video.onseeked = () => {
                    video.requestVideoFrameCallback(() => {
                        const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
                        const g = c.getContext('2d'); g.drawImage(video, 0, 0);
                        const pixels = g.getImageData(0, 0, c.width, c.height).data;
                        let min = 255, max = 0;
                        for (let i = 0; i < pixels.length; i += 4) { min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]); }
                        clearTimeout(timer); video.pause(); video.src = ''; URL.revokeObjectURL(url);
                        resolve({ width: c.width, height: c.height, contrast: max - min });
                    });
                    video.play().catch(reject);
                };
                video.src = url; video.load();
            }), data.toString('base64'));
            assert.equal(decoded.width, 160); assert.equal(decoded.height, 96); assert.ok(decoded.contrast > 30);
            assert.equal(await page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL()), paused.pixels);
            console.log(`PASS: mixed-style ${type.ext} export decodes with artwork during the dissolve`);
        }
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log('PASS: three-style UI timeline, paused-frame stability, mixed PNG ZIP parity/metadata and editor restoration');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
