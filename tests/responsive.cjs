// Phone layout, touch scrolling and explicit keyframe overwrite behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const errors = [], external = [];
    const base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
    async function load(page) {
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.href); return route.abort();
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => cvLoaded && window.MiceliumAnimate);
        await page.evaluate(() => document.fonts.ready);
    }
    const set = (page, id, value) => page.locator(id).evaluate((el, value) => {
        el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
    const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = page => page.evaluate(() => MiceliumAnimate.snapshot());
    const fonts = page => page.evaluate(() => document.fonts.check('12px WTGaramono') && [...document.querySelectorAll('body, body *')].every(el => getComputedStyle(el).fontFamily === 'WTGaramono'));
    async function monochrome(page) {
        const colored = await page.evaluate(() => {
            const result = [];
            for (const el of document.querySelectorAll('body, body *')) for (const pseudo of [null, '::before', '::after']) {
                const style = getComputedStyle(el, pseudo);
                for (const property of ['color', 'backgroundColor', 'borderTopColor', 'outlineColor', 'accentColor', 'fill', 'stroke']) {
                    const rgb = style[property]?.match(/^rgba?\(([^)]+)\)/);
                    if (!rgb) continue;
                    const values = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
                    if (values.length >= 3 && (values[0] !== values[1] || values[1] !== values[2])) result.push(`${el.id || el.tagName} ${pseudo || ''} ${property}: ${style[property]}`);
                }
            }
            return result;
        });
        assert.deepEqual(colored, [], 'application controls, focus rings and pseudo-elements stay monochrome');
    }
    async function renderedFonts(page) {
        const client = await page.context().newCDPSession(page);
        await client.send('DOM.enable'); await client.send('CSS.enable');
        const { root } = await client.send('DOM.getDocument');
        const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'button, label, .label, .cselect-label, .cselect-check, summary, p, h2, output, #status-bar, #logo-refresh-cursor' });
        for (const nodeId of nodeIds) {
            const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
            for (const font of fonts) assert.equal(font.familyName, 'WT Garamono TRIAL', 'actual glyphs must not fall back to another font');
        }
        await client.detach();
    }
    try {
        const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await load(mobile);
        assert.equal(await fonts(mobile), true);
        assert.equal(await mobile.locator('#logo-header').isVisible(), false);
        const upload = mobile.waitForEvent('filechooser'); await mobile.locator('.mobile-controls-header button').tap();
        const fixture = await mobile.evaluate(() => {
            const c = document.createElement('canvas'); c.width = c.height = 96;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 96);
            g.fillStyle = '#000'; g.fillRect(12, 12, 36, 60); g.beginPath(); g.arc(64, 48, 20, 0, Math.PI * 2); g.fill();
            return c.toDataURL().split(',')[1];
        });
        await (await upload).setFiles({ name: 'phone.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await mobile.waitForFunction(() => MiceliumEditor.ready()); await settle(mobile);
        const viewport = await mobile.locator('#viewport').boundingBox();
        assert.equal(viewport.y, 0);
        assert.ok(viewport.height > 844 * .54 && viewport.height < 844 * .58, 'phone preview occupies more than half the screen');
        const client = await mobile.context().newCDPSession(mobile);
        // A real touch swipe in the lower pane scrolls controls, never the preview.
        const controls = await mobile.locator('#ui').boundingBox();
        const swipeStart = controls.y + controls.height - 30, swipeEnd = controls.y + 55;
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y: swipeStart }] });
        for (let y = swipeStart - 20; y >= swipeEnd; y -= 20) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 8, y }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await mobile.waitForFunction(() => document.getElementById('ui').scrollTop > 50);
        assert.deepEqual(await mobile.locator('#viewport').boundingBox(), viewport);
        for (let n = 1; n <= 6; n++) {
            await mobile.selectOption('#styleSelect', String(n)); await settle(mobile);
            assert.equal(await mobile.locator('#styleSelect').isVisible(), true);
            const ink = await mobile.locator('#canvas-holder canvas').evaluate(c => {
                const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let dark = 0, light = 0;
                for (let i = 0; i < d.length; i += 4) { if (d[i] < 128) dark++; if (d[i] > 200) light++; }
                return dark > 0 && light > 0;
            });
            assert.equal(ink, true, `phone style ${n} renders artwork`);
        }
        await mobile.locator('#p1').scrollIntoViewIfNeeded();
        const slider = await mobile.locator('#p1').boundingBox(), oldValue = await mobile.locator('#p1').inputValue();
        await mobile.touchscreen.tap(slider.x + slider.width * .25, slider.y + slider.height / 2);
        assert.notEqual(await mobile.locator('#p1').inputValue(), oldValue);
        await mobile.locator('#btnExportSettings').tap();
        await mobile.selectOption('#exportQualitySelectModal', '1');
        for (const [button, ext] of [['#expBlack', '.png'], ['#expSvg', '.svg']]) {
            const [download] = await Promise.all([mobile.waitForEvent('download'), mobile.locator(button).tap()]);
            assert.equal(await download.failure(), null); assert.ok(download.suggestedFilename().endsWith(ext));
            assert.ok((await fs.readFile(await download.path())).length > 100);
        }
        assert.equal(await fonts(mobile), true);
        await mobile.locator('#modalCloseBtn').tap();
        console.log('PASS: phone touch scroll, six styles, slider editing, PNG/SVG export and Garamono throughout');
        for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
            await mobile.setViewportSize(size); await settle(mobile);
            assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(await mobile.locator('#viewport').evaluate(el => el.getBoundingClientRect().top), 0);
            await mobile.locator('#menu-toggle').tap();
            assert.equal(await mobile.locator('#menu-animate').isDisabled(), true);
            const dark = await mobile.locator('#menu-dark').boundingBox();
            assert.equal(await mobile.evaluate(({ x, y, width, height }) => document.elementFromPoint(x + width / 2, y + height / 2).closest('button')?.id, dark), 'menu-dark');
            await mobile.evaluate(() => MiceliumAnimate.toggle(true));
            assert.equal((await state(mobile)).active, false);
            await mobile.locator('#menu-about').tap();
            assert.equal(await mobile.locator('#about-dialog').evaluate(el => el.open), true);
            await mobile.locator('#about-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
            assert.ok(await mobile.locator('#about-content').evaluate(el => el.scrollTop > 0 && el.scrollWidth <= el.clientWidth));
            await monochrome(mobile);
            await mobile.locator('#about-dialog button').tap();
        }
        console.log('PASS: narrow/landscape phones have no horizontal overflow; Animation is unavailable; menu stays usable');
        await mobile.setViewportSize({ width: 320, height: 568 });
        await mobile.locator('#fileInput').setInputFiles(require('node:path').join(__dirname, '../img/1_1.mp4'));
        await mobile.waitForFunction(() => isVideoMode && videoEl?.readyState >= 2 && !videoEl.paused);
        await mobile.locator('#btnPlayPause').tap();
        assert.equal(await mobile.evaluate(() => videoEl.paused), true);
        assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.ok((await mobile.locator('#viewport').boundingBox()).height > 80);
        await renderedFonts(mobile);
        console.log('PASS: existing video player stays usable on a narrow phone; actual rendered text uses only Garamono');

        const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        await load(desktop);
        assert.equal(await desktop.locator('body').evaluate(el => getComputedStyle(el).fontSize), '13px');
        await desktop.locator('#logo').click();
        await desktop.waitForFunction(() => document.querySelector('#logo-header.png-mode img')?.naturalWidth > 0);
        await desktop.locator('#logo').hover();
        assert.equal(await desktop.locator('#logo-refresh-cursor').isVisible(), true);
        assert.equal(await desktop.locator('#logo-refresh-cursor').textContent(), 'refresh page');
        assert.equal(await desktop.locator('#logo').evaluate(el => getComputedStyle(el).cursor), 'none');
        await renderedFonts(desktop);
        await desktop.mouse.move(600, 100);
        assert.equal(await desktop.locator('#logo-refresh-cursor').isVisible(), false);
        await desktop.locator('#logo').hover();
        assert.equal(await desktop.locator('#logo-refresh-cursor').isVisible(), true);
        await Promise.all([desktop.waitForNavigation({ waitUntil: 'networkidle' }), desktop.locator('#logo').click()]);
        await desktop.waitForFunction(() => cvLoaded && window.MiceliumAnimate);
        assert.equal(await desktop.locator('#logo').evaluate(el => el.tagName), 'VIDEO');
        assert.equal(await desktop.locator('#logo-refresh-cursor').isVisible(), false);
        for (const id of ['previewNormSelect', 'styleSelect']) {
            const wrapper = desktop.locator(`#${id} + .cselect-wrapper`);
            await wrapper.locator('.cselect-closed').click();
            const colors = await wrapper.locator('.cselect-active .cselect-arrow').evaluate(el => ({
                background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color,
                rowBackground: getComputedStyle(el.parentElement).backgroundColor
            }));
            assert.equal(colors.background, colors.rowBackground); assert.equal(colors.background, 'rgb(0, 0, 0)');
            assert.equal(colors.color, 'rgb(255, 255, 255)');
            await wrapper.locator('.cselect-close-trigger').click();
        }
        console.log('PASS: Garamono refresh cursor, working logo reload and matching black/white selector arrows');
        await desktop.locator('#fileInput').setInputFiles({ name: 'desktop.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await desktop.waitForFunction(() => MiceliumEditor.ready());
        await desktop.click('#menu-toggle');
        assert.match(await desktop.locator('#menu-animate').textContent(), /WORK IN PROGRESS/);
        await desktop.click('#menu-animate');
        assert.equal(await fonts(desktop), true);
        await renderedFonts(desktop);
        await desktop.click('#animate-help summary');
        assert.match(await desktop.locator('#animate-help').textContent(), /other keys stay unchanged/);
        await desktop.click('#animate-help summary');
        await set(desktop, '#animate-seek-time', 5); await set(desktop, '#p1', 180); await desktop.click('#animate-add');
        const before = (await state(desktop)).frames;
        await desktop.locator('.animate-key-shortcut').first().click();
        await set(desktop, '#p1', 50);
        assert.match(await desktop.locator('#animate-key-status').textContent(), /UNSAVED CHANGES/);
        await monochrome(desktop);
        assert.match(await desktop.locator('#animate-add').textContent(), /OVERWRITE KEYFRAME 01/);
        assert.deepEqual((await state(desktop)).frames, before, 'edits remain a draft until explicitly saved');
        await desktop.click('#animate-add');
        const after = (await state(desktop)).frames;
        assert.equal(after.length, 2); assert.equal(after[0].id, before[0].id); assert.equal(after[0].values.p1, 50);
        assert.deepEqual(after[1], before[1], 'overwriting the first key preserves the other key');
        assert.match(await desktop.locator('#animate-key-status').textContent(), /SAVED/);
        assert.match(await desktop.locator('#animate-message').textContent(), /Keyframe 1 overwritten/);
        assert.equal(await desktop.locator('.animate-key[aria-pressed="true"] .key-number').textContent(), '01');
        const keyBox = await desktop.locator('.animate-key[aria-pressed="true"]').boundingBox();
        const playheadBox = await desktop.locator('#animate-playhead-handle').boundingBox();
        assert.ok(keyBox.y > playheadBox.y + playheadBox.height, 'key diamonds have a separate lane below the playhead handle even at the same time');
        assert.equal(await desktop.locator('.animate-key[aria-pressed="true"]').evaluate(el => {
            const shape = getComputedStyle(el, '::before'), box = getComputedStyle(el);
            return shape.width === shape.height && shape.transform !== 'none' && box.borderTopWidth === '0px' && box.backgroundColor === 'rgba(0, 0, 0, 0)';
        }), true, 'saved keyframes use a floating diamond rather than a rectangular playhead label');
        const keyTimes = (await state(desktop)).frames;
        const trackBox = await desktop.locator('#animate-track').boundingBox();
        await desktop.mouse.move(playheadBox.x + playheadBox.width / 2, playheadBox.y + playheadBox.height / 2);
        await desktop.mouse.down(); await desktop.mouse.move(trackBox.x + trackBox.width / 6, playheadBox.y + playheadBox.height / 2, { steps: 6 }); await desktop.mouse.up();
        assert.ok(Math.abs((await state(desktop)).time - 2.5) < .02);
        assert.deepEqual((await state(desktop)).frames, keyTimes, 'dragging the top triangle previews time without moving the diamonds');
        await desktop.locator('#animate-playhead-handle').focus(); await desktop.keyboard.press('ArrowRight');
        assert.ok(Math.abs((await state(desktop)).time - 2.55) < .02);
        assert.deepEqual((await state(desktop)).frames, keyTimes, 'keyboard playhead movement also preserves saved keys');
        await set(desktop, '#animate-seek-time', 2.5);
        assert.equal(Number(await desktop.locator('#p1').inputValue()), 115, 'new key values drive interpolation');
        assert.match(await desktop.locator('#animate-add').textContent(), /ADD KEYFRAME/);
        const originalState = await state(desktop), originalPixels = await desktop.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL());
        const panel = desktop.locator('#animate-panel'), grip = desktop.locator('#animate-resize');
        const initialHeight = (await panel.boundingBox()).height, initialView = (await desktop.locator('#viewport').boundingBox()).height;
        assert.equal(initialHeight, Number(await grip.getAttribute('aria-valuemax')), 'animation opens fully expanded to the height of its controls');
        assert.ok(await panel.evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'all animation controls fit on opening when viewport space is available');
        const handle = await grip.boundingBox();
        await desktop.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await desktop.mouse.down(); await desktop.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 140, { steps: 8 }); await desktop.mouse.up(); await settle(desktop);
        const cappedHeight = Math.max(initialHeight - 140, Number(await grip.getAttribute('aria-valuemin')));
        assert.ok(Math.abs((await panel.boundingBox()).height - cappedHeight) < 2);
        assert.ok(Math.abs((await desktop.locator('#viewport').boundingBox()).height - initialView + cappedHeight - initialHeight) < 2);
        assert.deepEqual(await state(desktop), originalState);
        assert.equal(await desktop.evaluate(() => MiceliumAnimate.frameCanvas().toDataURL()), originalPixels);
        await grip.focus(); await desktop.keyboard.press('ArrowDown'); await settle(desktop);
        const chosenHeight = (await panel.boundingBox()).height;
        assert.ok(Math.abs(chosenHeight - Math.max(Number(await grip.getAttribute('aria-valuemin')), cappedHeight - 16)) < 2);
        await desktop.click('#animate-close'); await desktop.evaluate(() => MiceliumAnimate.toggle(true)); await settle(desktop);
        assert.equal((await panel.boundingBox()).height, initialHeight, 'reopening shows all controls again after a manually compacted session');
        await grip.focus(); await desktop.keyboard.press('End'); await settle(desktop);
        assert.ok(await panel.evaluate(el => el.clientHeight <= el.querySelector('.animate-content').getBoundingClientRect().height + 18), 'dock expansion stops at its content height');
        assert.ok((await desktop.locator('#viewport').boundingBox()).height >= 159);
        await desktop.setViewportSize({ width: 1440, height: 650 }); await settle(desktop);
        assert.ok((await desktop.locator('#viewport').boundingBox()).height >= 159);
        assert.equal(await grip.getAttribute('aria-valuenow'), String((await panel.boundingBox()).height));
        await desktop.setViewportSize({ width: 1440, height: 1000 }); await grip.dblclick(); await settle(desktop);
        assert.equal((await panel.boundingBox()).height, initialHeight);
        assert.deepEqual(await state(desktop), originalState);
        console.log('PASS: fully open dock, separate diamond/playhead lanes, drag/keyboard resizing, reset, viewport bounds and unchanged timeline/export pixels');
        const keys = (await state(desktop)).frames;
        await desktop.setViewportSize({ width: 390, height: 844 }); await settle(desktop);
        assert.equal((await state(desktop)).active, false);
        await desktop.setViewportSize({ width: 1440, height: 1000 }); await desktop.evaluate(() => MiceliumAnimate.toggle(true));
        assert.deepEqual((await state(desktop)).frames, keys);
        await desktop.click('#menu-toggle'); await desktop.click('#menu-about');
        assert.ok((await desktop.locator('#about-dialog').boundingBox()).width >= 800);
        await desktop.locator('#about-content').hover(); await desktop.mouse.wheel(0, 650);
        await desktop.waitForFunction(() => document.getElementById('about-content').scrollTop > 0);
        assert.match(await desktop.locator('#about-content').textContent(), /Canny|Floyd–Steinberg|random seed/);
        assert.equal(await fonts(desktop), true); await monochrome(desktop);
        await desktop.locator('#about-dialog button').click();
        console.log('PASS: large scrollable About on desktop/phone and monochrome controls, focus and draft states');
        console.log('PASS: desktop typography, WIP label, help, numbered keys, explicit overwrite, interpolation and resize preservation');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log('PASS: no browser errors or external requests');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
