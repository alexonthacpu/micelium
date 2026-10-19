const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [], external = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        const base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.href); return route.abort();
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.MiceliumAnimate && cvLoaded);
        async function menu(id) {
            if (!await page.locator('#editor-menu').isVisible()) await page.click('#menu-toggle');
            await page.click(id);
        }
        async function setValue(id, value) {
            await page.locator(id).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(value));
        }
        const snapshot = () => page.evaluate(() => MiceliumAnimate.snapshot());
        await menu('#menu-about'); assert.equal(await page.locator('#about-dialog').evaluate(el => el.open), true);
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#about-dialog').evaluate(el => el.open), false);
        await page.waitForFunction(() => document.activeElement === document.getElementById('menu-toggle'));
        console.log('PASS: About dialog, Escape and focus restoration');
        await menu('#menu-animate');
        await page.click('#animate-play');
        assert.match(await page.locator('#animate-message').textContent(), /image/);
        const fixture = await page.evaluate(() => {
            const c = document.createElement('canvas'); c.width = c.height = 96;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 96);
            g.fillStyle = '#000'; g.fillRect(12, 12, 36, 60); g.beginPath(); g.arc(64, 48, 20, 0, Math.PI * 2); g.fill();
            return c.toDataURL().split(',')[1];
        });
        await page.locator('#animate-source').setInputFiles({ name: 'editor.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await page.waitForFunction(() => MiceliumEditor.ready());
        await page.waitForTimeout(100);
        await setValue('#p1', 80); await setValue('#p4', .1); await setValue('#zoomSlider', 1); await page.click('#animate-add');
        await setValue('#animate-scrub', 5); await setValue('#p1', 200); await setValue('#p4', 1); await setValue('#zoomSlider', 2); await page.click('#animate-add');
        await setValue('#animate-scrub', 10); await setValue('#p1', 100); await setValue('#p4', .5); await page.click('#animate-add');
        assert.equal((await snapshot()).frames.length, 3);
        await setValue('#animate-scrub', 2.5);
        assert.equal(Number(await page.locator('#p1').inputValue()), 140);
        await setValue('#animate-scrub', 2.55);
        const continuous = await page.evaluate(() => ({ p: readStyleParameters(), zoom: MiceliumEditor.parameters().zoomSlider }));
        assert.ok(Math.abs(continuous.p[3] - .559) < .00001);
        assert.ok(Math.abs(continuous.zoom - 1.51) < .00001);
        await page.locator('.animate-key[data-id="1"]').click();
        await page.selectOption('#animate-ease', 'ease-in');
        await setValue('#animate-scrub', 2.5);
        assert.ok(Number(await page.locator('#p1').inputValue()) < 140);
        console.log('PASS: image source, add/select keys, scrubbing and eased parameter interpolation');
        await page.locator('.animate-key[data-id="1"]').click();
        await page.selectOption('#animate-ease', 'custom');
        await setValue('#bezier-x1', .2); await setValue('#bezier-y1', .1);
        assert.deepEqual((await snapshot()).frames[0].easing, [.2, .1, .58, 1]);
        const handle = await page.locator('#curve-handle-1').boundingBox();
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 6, handle.y + handle.height / 2 - 4); await page.mouse.up();
        assert.ok((await snapshot()).frames[0].easing[0] > .2);
        await page.selectOption('#animate-ease', 'linear');
        // Move a key with pointer capture, then keyboard fine-tune and a numeric time edit.
        let key = await page.locator('.animate-key[data-id="2"]').boundingBox();
        let track = await page.locator('#animate-track').boundingBox();
        await page.mouse.move(key.x + key.width / 2, key.y + key.height / 2);
        await page.mouse.down(); await page.mouse.move(track.x + track.width * .4, key.y + key.height / 2, { steps: 5 }); await page.mouse.up();
        assert.ok(Math.abs((await snapshot()).frames.find(f => f.id === '2').time - 6) < .06);
        await page.locator('.animate-key[data-id="2"]').focus(); await page.keyboard.press('ArrowRight');
        assert.ok((await snapshot()).frames.find(f => f.id === '2').time > 6);
        await setValue('#animate-key-time', 5);
        assert.equal((await snapshot()).frames.find(f => f.id === '2').time, 5);
        console.log('PASS: custom Bezier handles/inputs and pointer/keyboard keyframe movement');
        await setValue('#animate-duration', 20); assert.equal((await snapshot()).duration, 20);
        await setValue('#animate-scrub', 20); await page.click('#animate-add');
        await setValue('#animate-duration', 15); assert.equal((await snapshot()).duration, 20);
        assert.match(await page.locator('#animate-message').textContent(), /Move later/);
        await page.locator('.animate-key[data-id="4"]').click(); await page.click('#animate-delete');
        assert.equal((await snapshot()).frames.length, 3);
        await setValue('#animate-duration', 15); assert.equal((await snapshot()).duration, 15);
        await page.click('#animate-stop');
        await page.click('#animate-play'); await page.waitForTimeout(1100);
        let state = await snapshot(); assert.ok(state.playing && state.time > .5 && state.time < 3);
        const playingTime = state.time;
        await page.click('#animate-pause'); await page.waitForTimeout(100);
        state = await snapshot(); assert.equal(state.playing, false); assert.ok(state.time >= playingTime);
        const pausedTime = state.time;
        await page.waitForTimeout(100); assert.equal((await snapshot()).time, pausedTime);
        await page.click('#animate-play'); await page.waitForTimeout(200);
        assert.ok((await snapshot()).time > pausedTime);
        // Custom sidebar selects dispatch synthetic DOM events after real clicks.
        const styleControl = page.locator('#styleSelect + .cselect-wrapper');
        await styleControl.locator('.cselect-closed').click();
        await styleControl.locator('.cselect-item[data-value="4"] .cselect-item-text').click();
        assert.equal((await snapshot()).playing, false);
        await page.click('#animate-stop'); assert.equal((await snapshot()).time, 0);
        assert.match(await page.locator('#styleSelect + .cselect-wrapper .cselect-closed').textContent(), /Style 01/);
        await setValue('#animate-scrub', 14.9); await page.click('#animate-play'); await page.waitForTimeout(400);
        state = await snapshot(); assert.equal(state.playing, false); assert.equal(state.time, 15);
        await page.click('#animate-close'); await menu('#menu-animate');
        assert.equal((await snapshot()).frames.length, 3);
        console.log('PASS: duration validation, deletion, play/pause/resume/stop/end and session preservation');
        await page.click('#animate-stop');
        await page.evaluate(() => {
            const c = document.querySelector('#canvas-holder canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            window.lightPixels = []; for (let i = 0; i < d.length; i += 4084) lightPixels.push([i, d[i], d[i+1], d[i+2]]);
            window.lightState = MiceliumEditor.capture();
        });
        await menu('#menu-dark');
        assert.equal(await page.evaluate(() => {
            const c = document.querySelector('#canvas-holder canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            return lightPixels.every(([i,r,g,b]) => Math.abs(d[i] + r - 255) <= 1 && Math.abs(d[i+1] + g - 255) <= 1 && Math.abs(d[i+2] + b - 255) <= 1)
                && JSON.stringify(lightState) === JSON.stringify(MiceliumEditor.capture());
        }), true);
        async function png() {
            // Close the dropdown before reaching the export controls.
            if (await page.locator('#editor-menu').isVisible()) await page.click('#menu-toggle');
            await page.click('#btnExportSettings');
            const [d] = await Promise.all([page.waitForEvent('download'), page.click('#expBlack')]);
            const bytes = await fs.readFile(await d.path()); await page.click('#modalCloseBtn'); return bytes;
        }
        const darkExport = await png(); await menu('#menu-dark'); const lightExport = await png();
        assert.deepEqual(darkExport, lightExport);
        console.log('PASS: actual canvas palette inversion, unchanged style state and identical PNG export');
        await page.screenshot({ path: '/tmp/micelium-editor.png' });
        await page.click('#animate-play');
        await page.locator('#fileInput').setInputFiles(require('node:path').join(__dirname, '../img/1_1.mp4'));
        await page.waitForFunction(() => isVideoMode && videoEl?.readyState >= 2 && !videoEl.paused);
        assert.equal((await snapshot()).playing, false);
        assert.equal(await page.locator('#animate-panel').isVisible(), false);
        assert.equal(await page.locator('#videoBottomBar').isVisible(), true);
        await page.waitForTimeout(150);
        await page.click('#btnPlayPause');
        assert.equal(await page.evaluate(() => videoEl.paused), true);
        const corner = () => page.evaluate(() => [...document.querySelector('#canvas-holder canvas').getContext('2d').getImageData(0, 0, 1, 1).data]);
        const lightCorner = await corner();
        await menu('#menu-dark');
        const darkCorner = await corner();
        assert.equal(darkCorner[0] + lightCorner[0], 255);
        await menu('#menu-dark');
        await menu('#menu-animate');
        assert.equal(await page.locator('#animate-panel').isVisible(), false);
        assert.match(await page.locator('#status-bar').textContent(), /still image/);
        console.log('PASS: video upload/play/pause and isolation from still-image Animate');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log('PASS: zero browser errors or external requests');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
