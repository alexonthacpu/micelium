const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const useWebKit = process.env.BROWSER === 'webkit';
(async () => {
    const browser = await (useWebKit ? webkit : chromium).launch(useWebKit ? {} : { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
        const errors = [], external = [], base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.href); return route.abort();
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => cvLoaded && window.MiceliumAnimate);
        const fixture = await page.evaluate(() => {
            const c = document.createElement('canvas'); c.width = 512; c.height = 320;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
            for (let x = 16; x < 500; x += 31) {
                g.fillStyle = `rgb(${x % 180},${x % 80},${x % 120})`;
                g.beginPath(); g.arc(x, 70 + x % 150, 22, 0, Math.PI * 2); g.fill();
            }
            return c.toDataURL().split(',')[1];
        });
        await page.locator('#fileInput').setInputFiles({ name: 'navigation.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await page.waitForFunction(() => MiceliumEditor.ready());
        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await settle();
        await page.evaluate(() => {
            window.styleCalls = 0; window.viewportDrawCalls = 0;
            const originalDraw = window.draw; window.draw = function (...args) { viewportDrawCalls++; return originalDraw.apply(this, args); };
            for (let n = 1; n <= 6; n++) {
                const name = `renderStyle0${n}`, original = window[name];
                window[name] = function (...args) { styleCalls++; return original.apply(this, args); };
            }
        });
        const canvasPixels = () => page.locator('#canvas-holder canvas').evaluate(c => c.toDataURL());
        // Classic viewport: no style recalculation or pixel changes on an unchanged redraw.
        for (let n = 1; n <= 6; n++) {
            await page.selectOption('#styleSelect', String(n), { force: true }); await settle();
            const before = await canvasPixels();
            await page.evaluate(() => {
                const c = document.querySelector('#canvas-holder canvas');
                window.referencePixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; redraw();
            });
            const unchanged = await page.evaluate(() => {
                const c = document.querySelector('#canvas-holder canvas'), pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let sum = 0, max = 0;
                for (let i = 0; i < pixels.length; i++) { const d = Math.abs(pixels[i] - referencePixels[i]); sum += d; max = Math.max(max, d); }
                return { mean: sum / pixels.length, max };
            });
            // WebKit's immediate and Path2D Bezier rasterizers differ slightly at antialiased edges.
            assert.ok(unchanged.mean < .02 && unchanged.max <= 32, `style ${n} retained path pixels: ${JSON.stringify(unchanged)}`);
            const counts = await page.evaluate(async () => {
                const start = styleCalls, draws = viewportDrawCalls, sourceVersion = currentSourceMediaVersion;
                zoomByStep(1.2);
                for (let i = 0; i < 20; i++) document.querySelector('#canvas-holder canvas').dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 2, deltaY: 1, cancelable: true }));
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return { calls: styleCalls - start, draws: viewportDrawCalls - draws, sourceVersion, afterVersion: currentSourceMediaVersion };
            });
            assert.ok(counts.draws <= 1, `style ${n} coalesces the wheel burst`);
            assert.equal(counts.calls, 0, `style ${n} camera reuses geometry`); assert.equal(counts.sourceVersion, counts.afterVersion);
            assert.notEqual(await canvasPixels(), before);
        }
        const inputBurst = await page.evaluate(async () => {
            const before = styleCalls, source = currentSourceMediaVersion, input = document.getElementById('p1');
            for (let i = 0; i < 20; i++) { input.value = 90 + i; input.dispatchEvent(new Event('input', { bubbles: true })); }
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return { calls: styleCalls - before, sameSource: source === currentSourceMediaVersion, value: Number(input.value) };
        });
        assert.equal(inputBurst.calls, 1); assert.equal(inputBurst.sameSource, true); assert.equal(inputBurst.value, 109);
        console.log('PASS: six classic styles preserve geometry during pan/zoom; input bursts render once without source invalidation');
        await page.evaluate(() => MiceliumAnimate.toggle(true)); await settle();
        assert.equal(await page.locator('#animate-detail').inputValue(), 'source');
        // At 2x output resolution retained vector drawing must match fresh style rendering.
        for (let n = 1; n <= 6; n++) {
            await page.selectOption('#styleSelect', String(n), { force: true }); await settle();
            const quality = await page.evaluate(() => {
                const state = MiceliumEditor.capture(), config = { ...MiceliumAnimate.compositionSettings(), longEdge: 720 };
                const retained = new MiceliumComposition(MiceliumEditor, { retainDrawing: true });
                retained.render(state, config);
                const high = new MiceliumComposition(MiceliumEditor, { retainDrawing: false }), original = high.render(state, { ...config, longEdge: 1440 });
                const c = document.createElement('canvas'); c.width = original.width; c.height = original.height;
                const g = c.getContext('2d'); g.scale(2, 2); retained.paint(g);
                const a = g.getImageData(0, 0, c.width, c.height).data;
                const b = original.drawingContext.getImageData(0, 0, c.width, c.height).data;
                let difference = 0, max = 0;
                for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); difference += d; max = Math.max(max, d); }
                retained.dispose(); high.dispose();
                return { mean: difference / a.length, max };
            });
            assert.ok(quality.mean < .02 && quality.max <= 32, `style ${n} native vector quality: ${JSON.stringify(quality)}`);
        }
        console.log('PASS: all six vector previews at 2x match fresh high-resolution rendering');
        await page.selectOption('#styleSelect', '4', { force: true }); await settle();
        await page.click('#animate-add'); await page.click('#animate-add-end');
        await page.locator('#animate-seek-time').evaluate(el => { el.value = '0.371'; el.dispatchEvent(new Event('change')); });
        const read = () => page.evaluate(() => ({ view: MiceliumAnimate.inspectionView(), timeline: MiceliumAnimate.snapshot(), parameters: MiceliumEditor.capture(), settings: MiceliumAnimate.compositionSettings(), pixels: MiceliumAnimate.frameCanvas().toDataURL(), calls: styleCalls }));
        const before = await read(), c = await page.locator('#canvas-holder canvas').boundingBox();
        await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
        await page.mouse.down(); await page.mouse.move(c.x + c.width / 2 + 60, c.y + c.height / 2 + 25, { steps: 8 }); await page.mouse.up(); await settle();
        let after = await read(); assert.ok(after.view.x > 55 && after.view.y > 20);
        // WheelEvent client coordinates are integers; avoid subpixel rounding in synthetic input.
        const target = { x: Math.round(c.width * .6), y: Math.round(c.height * .4) };
        await page.locator('#canvas-holder canvas').evaluate((el, target) => {
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -40, clientX: r.left + target.x, clientY: r.top + target.y }));
        }, target); await settle();
        const zoomed = await read(), factor = zoomed.view.zoom / after.view.zoom;
        assert.ok(factor > 1);
        assert.ok(Math.abs(zoomed.view.x - (target.x - c.width / 2 - (target.x - c.width / 2 - after.view.x) * factor)) < .001);
        assert.deepEqual(zoomed.parameters, before.parameters); assert.deepEqual(zoomed.timeline, before.timeline);
        assert.deepEqual(zoomed.settings, before.settings); assert.equal(zoomed.pixels, before.pixels); assert.equal(zoomed.calls, before.calls);
        // Native Safari gesture handlers use the same independent, cursor-anchored camera.
        await page.locator('#canvas-holder canvas').evaluate(el => {
            const r = el.getBoundingClientRect();
            for (const [type, scale] of [['gesturestart', 1], ['gesturechange', 1.25], ['gestureend', 1.25]]) {
                const e = new Event(type, { bubbles: true, cancelable: true });
                Object.assign(e, { scale, clientX: r.left + 200, clientY: r.top + 150 }); el.dispatchEvent(e);
            }
        }); await settle();
        assert.ok(Math.abs((await read()).view.zoom - zoomed.view.zoom * 1.25) < .001);
        await page.click('#animate-fit'); await settle(); assert.deepEqual((await read()).view, { x: 0, y: 0, zoom: 1 });
        await page.mouse.move(c.x + 100, c.y + 100); await page.mouse.wheel(20, 40); await settle();
        await page.mouse.dblclick(c.x + 100, c.y + 100); await settle(); assert.deepEqual((await read()).view, { x: 0, y: 0, zoom: 1 });
        assert.deepEqual((await read()).parameters, before.parameters);
        console.log('PASS: drag, anchored pinch/wheel, Safari gesture events and Fit; export, fractional parameters and keys unchanged');
        await page.click('#animate-play'); await page.mouse.move(c.x + 100, c.y + 100); await page.mouse.wheel(15, 20); await settle();
        assert.equal((await read()).timeline.playing, true); await page.click('#animate-pause');
        const paused = await read(); await page.mouse.wheel(-10, -15); await settle();
        after = await read(); assert.equal(after.timeline.time, paused.timeline.time); assert.equal(after.pixels, paused.pixels);
        await page.click('.animate-key:last-child');
        await page.locator('#zoomSlider').evaluate(el => { el.value = Number(el.value) * 1.2; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('#animate-add'); await page.click('#animate-stop');
        const callsBeforePlay = (await read()).calls;
        await page.click('#animate-play'); await page.waitForTimeout(150); await page.click('#animate-pause');
        assert.equal((await read()).calls, callsBeforePlay, 'zoom-only keyframes reuse style geometry');
        console.log('PASS: keyed zoom reuses geometry across playback frames without lowering detail');
        await page.screenshot({ path: `/tmp/micelium-viewport-${useWebKit ? 'webkit' : 'chromium'}.png` });
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log('PASS: navigation preserves playing/paused state and Retina density; no browser errors or external requests');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
