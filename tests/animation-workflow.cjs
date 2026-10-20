const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium, webkit } = require('playwright');
const useWebKit = process.env.BROWSER === 'webkit';
(async () => {
    const browser = await (useWebKit ? webkit : chromium).launch(useWebKit ? {} : { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [], external = [], downloads = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('download', d => downloads.push(d));
        const base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.href); return route.abort();
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.MiceliumAnimate && cvLoaded);
        const set = (id, value) => page.locator(id).evaluate((el, value) => {
            el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(value));
        const seek = value => set('#animate-seek-time', value);
        const state = () => page.evaluate(() => MiceliumAnimate.snapshot());
        const pixels = () => page.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL());
        await page.click('#menu-toggle'); await page.click('#menu-animate');
        const fixture = await page.evaluate(() => {
            const c = document.createElement('canvas'); c.width = 160; c.height = 96;
            const g = c.getContext('2d'); g.fillStyle = 'white'; g.fillRect(0, 0, 160, 96);
            g.fillStyle = 'black'; g.fillRect(12, 12, 50, 64); g.beginPath(); g.arc(100, 48, 26, 0, Math.PI * 2); g.fill();
            return c.toDataURL().split(',')[1];
        });
        await page.locator('#animate-source').setInputFiles({ name: 'workflow.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await page.waitForFunction(() => MiceliumAnimate.snapshot().frames.length === 1);
        await page.selectOption('#animate-resolution', 'source');
        await set('#animate-duration', 30); assert.equal((await state()).duration, 30);
        await set('#animate-duration', 31); assert.equal((await state()).duration, 30);
        await set('#animate-duration', 1); assert.equal((await state()).duration, 1);
        for (let style = 1; style <= 6; style++) {
            await page.selectOption('#styleSelect', String(style), { force: true });
            const check = await page.evaluate(() => {
                const shown = MiceliumAnimate.frameCanvas(), data = shown.getContext('2d').getImageData(0, 0, shown.width, shown.height).data;
                let dark = 0, light = 0;
                for (let i = 0; i < data.length; i += 4) { if (data[i] < 128) dark++; if (data[i] > 200) light++; }
                const r = new MiceliumComposition(MiceliumEditor);
                const independent = r.render(MiceliumEditor.capture(), { longEdge: 160, cameraBase: MiceliumAnimate.snapshot().cameraBase, dark: false });
                const equal = shown.toDataURL() === independent.canvas.toDataURL(); r.dispose(); return { dark, light, equal };
            });
            assert.ok(check.dark > 0 && check.light > 0 && check.equal, `style ${style} must render deterministic composition pixels`);
        }
        console.log('PASS: six deterministic composition renderers');
        await page.selectOption('#styleSelect', '1', { force: true });
        await set('#p1', 60); await set('#p4', .2); await page.click('#animate-add');
        await page.click('#animate-add-end'); assert.equal((await state()).frames[1].time, 1);
        await set('#p1', 220); await set('#p4', 1.2); await page.click('#animate-add');
        assert.equal((await state()).frames.length, 2);
        await set('#animate-duration', 30); assert.equal((await state()).frames[1].time, 30);
        await set('#animate-duration', 1); assert.equal((await state()).frames[1].time, 1);
        await page.locator('#animate-retime').uncheck();
        await seek(.5); const linear = await page.evaluate(() => readStyleParameters()[0]);
        await page.locator('.animate-segment').click(); assert.equal((await state()).time, .5);
        await page.selectOption('#animate-ease', 'ease-in'); await page.waitForFunction(() => readStyleParameters()[0] < 140);
        assert.ok(await page.evaluate(() => readStyleParameters()[0]) < linear);
        assert.match(await page.locator('#animate-transition').textContent(), /0.00 → 1.00/);
        await page.selectOption('#animate-ease', 'custom');
        const handle = await page.locator('#curve-handle-1').boundingBox();
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 13.7, handle.y + handle.height / 2 - 9.2, { steps: 8 }); await page.mouse.up();
        assert.equal((await state()).time, .5); assert.ok((await state()).frames[0].easing[0] > .42);
        await page.selectOption('#animate-ease', 'linear'); await seek(.2);
        await page.click('#animate-play'); await page.waitForTimeout(180); await page.click('#animate-pause');
        const paused = await state(), image = await pixels(); await page.waitForTimeout(120);
        assert.equal((await state()).time, paused.time); assert.equal(await pixels(), image);
        await page.click('#animate-play'); await page.waitForTimeout(120); await page.click('#animate-pause'); assert.ok((await state()).time > paused.time);
        await page.click('#animate-restart'); await page.click('#animate-pause'); assert.ok((await state()).time < .3);
        await page.locator('#animate-loop').check(); await seek(.95); await page.click('#animate-play'); await page.waitForTimeout(160);
        assert.equal((await state()).playing, true); assert.ok((await state()).time < .8);
        await page.click('#animate-pause'); await page.locator('#animate-loop').uncheck(); await page.click('#animate-stop');
        assert.equal((await state()).time, 0); assert.equal((await state()).playing, false);
        console.log('PASS: 1–30 s, retiming, live transition curves, pause/resume/restart/stop/loop');
        await page.click('#menu-toggle'); await page.click('#menu-dark'); await page.click('#menu-toggle');
        const expected = {};
        for (const i of [0, 7, 14]) { await seek(i / 15); expected[i] = (await pixels()).split(',')[1]; }
        await seek(.35); const before = await state(), beforePixels = await pixels();
        await page.click('#animate-export'); await page.selectOption('#animation-export-format', 'zip'); await page.selectOption('#animation-export-fps', '15');
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#animation-export-start')]);
        assert.equal(await download.failure(), null); await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
        const bytes = await fs.readFile(await download.path());
        const zip = await page.evaluate(async base64 => {
            const z = await JSZip.loadAsync(base64, { base64: true });
            const names = Object.keys(z.files).filter(name => name.endsWith('.png')).sort(), images = {};
            for (const i of [0, 7, 14]) images[i] = await z.file(names[i]).async('base64');
            return { count: names.length, metadata: JSON.parse(await z.file('animation.json').async('string')), images };
        }, bytes.toString('base64'));
        assert.equal(zip.count, 15); assert.equal(zip.metadata.duration, 1); assert.equal(zip.metadata.fps, 15);
        assert.equal(zip.metadata.width, 160); assert.equal(zip.metadata.height, 96); assert.equal(zip.metadata.dark, true);
        assert.deepEqual(zip.images, expected); assert.equal((await state()).time, before.time); assert.equal(await pixels(), beforePixels);
        console.log('PASS: actual ZIP, 15 PNGs, metadata and byte-identical preview/export samples');
        await page.click('#animation-export-cancel'); await set('#animate-duration', 30); await page.click('#animate-export'); await page.selectOption('#animation-export-fps', '60');
        const count = downloads.length; await page.click('#animation-export-start');
        await page.waitForFunction(() => document.getElementById('animation-export-progress').value > 0); await page.click('#animation-export-cancel');
        await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
        assert.match(await page.locator('#animation-export-status').textContent(), /cancelled/); assert.equal(downloads.length, count); assert.equal((await state()).time, before.time);
        await page.click('#animation-export-cancel'); await set('#animate-duration', 1);
        console.log('PASS: ZIP cancellation and editor restoration');
        const types = await page.evaluate(() => MiceliumAnimationExport.videoTypes());
        for (const type of types) {
            await page.click('#animate-export'); await page.selectOption('#animation-export-format', type.ext); await page.selectOption('#animation-export-fps', '15');
            const [video] = await Promise.all([page.waitForEvent('download'), page.click('#animation-export-start')]);
            await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting); assert.equal(await video.failure(), null);
            const data = await fs.readFile(await video.path()); assert.ok(data.length > 1000);
            const decoded = await page.evaluate(base64 => new Promise((resolve, reject) => {
                const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([data]));
                const v = document.createElement('video'); v.muted = true;
                const timer = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('Video decode timeout')); }, 10000);
                v.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(url); reject(new Error('Exported video cannot decode')); };
                v.onloadeddata = () => { clearTimeout(timer); const info = { width: v.videoWidth, height: v.videoHeight, duration: v.duration }; v.src = ''; URL.revokeObjectURL(url); resolve(info); };
                v.src = url; v.load();
            }), data.toString('base64'));
            assert.equal(decoded.width, 160); assert.equal(decoded.height, 96);
            if (Number.isFinite(decoded.duration)) assert.ok(decoded.duration > .8 && decoded.duration < 1.5);
            assert.equal((await state()).time, before.time); await page.click('#animation-export-cancel');
            console.log(`PASS: exported ${type.ext} video decodes at the selected size`);
        }
        if (types.length) {
            await set('#animate-duration', 5); await page.click('#animate-export'); await page.selectOption('#animation-export-format', types[0].ext);
            const count = downloads.length; await page.click('#animation-export-start'); await page.waitForFunction(() => document.getElementById('animation-export-progress').value > 0);
            await page.click('#animation-export-cancel'); await page.waitForFunction(() => !MiceliumAnimate.snapshot().exporting);
            assert.match(await page.locator('#animation-export-status').textContent(), /cancelled/); assert.equal(downloads.length, count); assert.equal((await state()).time, before.time);
            await page.click('#animation-export-cancel'); await set('#animate-duration', 1);
            console.log('PASS: video cancellation produces no partial download');
        } else console.log('UNAVAILABLE: video recording codec; PNG sequence verified');
        await page.screenshot({ path: '/tmp/micelium-animation-workflow.png' });
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log('PASS: zero browser errors or external requests');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
