const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const errors = [], external = [], base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
    async function load(page) {
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.href); return route.abort();
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => cvLoaded && window.MiceliumAnimate);
    }
    const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function upload(page, w, h) {
        const fixture = await page.evaluate(([w, h]) => {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#000'; g.fillRect(w * .1, h * .1, w * .8, h * .8);
            window.imageReady = new Promise(resolve => document.addEventListener('micelium:image-ready', resolve, { once: true }));
            return c.toDataURL().split(',')[1];
        }, [w, h]);
        await page.locator('#fileInput').setInputFiles({ name: `fit-${w}-${h}.png`, mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await page.evaluate(() => window.imageReady); await settle(page);
    }
    async function fitted(page, original, normalized = original) {
        const dimensions = await page.evaluate(() => {
            const slider = document.getElementById('zoomSlider'), zoom = Number(slider.value);
            return { original: [rawSourceMedia.width, rawSourceMedia.height], normalized: [img.width, img.height],
                viewport: [width, height], extent: [img.width * zoom, img.height * zoom], zoom,
                center: [viewX, viewY], min: Number(slider.min), max: Number(slider.max) };
        });
        assert.deepEqual(dimensions.original, original, 'upload fitting preserves original pixels');
        assert.deepEqual(dimensions.normalized, normalized, 'fitting does not enlarge the processing source');
        assert.deepEqual(dimensions.center, dimensions.viewport.map(v => v / 2));
        const occupancy = dimensions.extent.map((v, i) => v / dimensions.viewport[i]);
        assert.ok(occupancy.every(v => v > 0 && v <= .800001), `complete image fits inside viewport: ${JSON.stringify(dimensions)}`);
        assert.ok(Math.abs(Math.max(...occupancy) - .8) < .000001, 'at least one dimension fills the intended preview area');
        assert.ok(dimensions.min < dimensions.zoom && dimensions.zoom < dimensions.max, 'fitted camera can still zoom in and out');
        return dimensions;
    }
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
        await load(page);
        assert.equal(await page.title(), 'MYCLM beta');
        await upload(page, 334, 218);
        const initial = await fitted(page, [334, 218]);
        assert.ok(initial.zoom > 1, 'small image displays larger than its source dimensions');
        const bounds = await page.locator('#canvas-holder canvas').evaluate(c => {
            const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let minX = c.width, maxX = 0, minY = c.height, maxY = 0;
            for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (p[(y * c.width + x) * 4] < 128) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
            return { horizontal: (maxX - minX) / c.width, vertical: (maxY - minY) / c.height };
        });
        assert.ok(Math.max(bounds.horizontal, bounds.vertical) > .6, 'rendered artwork visibly occupies the viewport');
        async function png() {
            await page.click('#btnExportSettings');
            await page.selectOption('#exportQualitySelectModal', '1', { force: true });
            const [download] = await Promise.all([page.waitForEvent('download'), page.click('#expBlack')]);
            const bytes = await fs.readFile(await download.path()); await page.click('#modalCloseBtn'); return bytes;
        }
        const before = await png();
        assert.equal(before.readUInt32BE(16), 334); assert.equal(before.readUInt32BE(20), 218);
        await page.click('#btnZoomIn'); await settle(page);
        assert.ok(Number(await page.locator('#zoomSlider').inputValue()) > initial.zoom);
        assert.deepEqual(await png(), before, 'display fitting and zoom leave native PNG export unchanged');
        await page.locator('#viewport').dblclick({ position: { x: 100, y: 100 } }); await settle(page);
        assert.equal((await fitted(page, [334, 218])).zoom, initial.zoom, 'double-click restores the same fitted camera');
        console.log('PASS: small upload fills the preview, native export stays identical and double-click refits');

        await upload(page, 4, 4);
        const tiny = await fitted(page, [4, 4]); assert.ok(tiny.zoom > 8, 'tiny sources fit beyond the previous 8x cap');
        await page.click('#btnZoomIn'); await settle(page);
        assert.ok(Number(await page.locator('#zoomSlider').inputValue()) > tiny.zoom);
        await upload(page, 2400, 1600); await fitted(page, [2400, 1600], [1080, 720]);
        await page.selectOption('#previewNormSelect', 'native', { force: true });
        await upload(page, 24000, 16);
        const wide = await fitted(page, [24000, 16]); assert.ok(wide.zoom < .05, 'wide native sources fit below the previous minimum');
        await page.click('#btnZoomOut'); await settle(page);
        assert.ok(Number(await page.locator('#zoomSlider').inputValue()) < wide.zoom, 'small camera values retain precision');
        await upload(page, 64, 400); await fitted(page, [64, 400]);
        await upload(page, 334, 218);
        const baseZoom = (await fitted(page, [334, 218])).zoom;
        await page.evaluate(() => MiceliumAnimate.toggle(true)); await settle(page);
        const animation = await page.evaluate(() => MiceliumAnimate.snapshot());
        assert.equal(animation.cameraBase, baseZoom); assert.equal(animation.frames[0].values.zoomSlider, baseZoom);
        assert.deepEqual(await page.evaluate(() => [img.width, img.height]), [334, 218]);
        console.log('PASS: tiny, large, panoramic and portrait sources fit without resampling; animation captures the fitted base camera');

        const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await load(mobile); await upload(mobile, 128, 80); await fitted(mobile, [128, 80]);
        assert.match(await mobile.locator('.mobile-controls-header > div').textContent(), /^MYCLM /);
        assert.equal(await mobile.title(), 'MYCLM beta');
        const controls = await mobile.locator('.zoom-btn').evaluateAll(buttons => buttons.map(button => {
            const css = getComputedStyle(button); return { color: css.color, textFill: css.webkitTextFillColor, font: css.fontFamily, appearance: css.appearance };
        }));
        for (const css of controls) {
            assert.equal(css.color, 'rgb(0, 0, 0)'); assert.equal(css.textFill, 'rgb(0, 0, 0)');
            assert.equal(css.font, 'WTGaramono'); assert.equal(css.appearance, 'none');
        }
        console.log('PASS: mobile upload fits, MYCLM beta title and black Garamono zoom controls');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
