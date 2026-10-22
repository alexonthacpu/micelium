const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
            const c = document.createElement('canvas'); c.width = 96; c.height = 64;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 64);
            g.fillStyle = '#a03c28'; g.fillRect(16, 12, 32, 40); g.fillStyle = '#000';
            g.beginPath(); g.arc(64, 32, 16, 0, Math.PI * 2); g.fill();
            return c.toDataURL().split(',')[1];
        });
        await page.locator('#fileInput').setInputFiles({ name: 'export.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await page.waitForFunction(() => MiceliumEditor.ready());
        async function download(selector) {
            const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
            assert.equal(await file.failure(), null);
            return { name: file.suggestedFilename(), bytes: await fs.readFile(await file.path()) };
        }
        async function pixels(file) {
            return page.evaluate(async b64 => {
                const image = new Image(); image.src = `data:image/png;base64,${b64}`; await image.decode();
                const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
                const g = c.getContext('2d'); g.drawImage(image, 0, 0);
                return Array.from(g.getImageData(0, 0, c.width, c.height).data);
            }, file.bytes.toString('base64'));
        }
        const modes = [];
        for (let style = 1; style <= 6; style++) {
            await page.selectOption('#styleSelect', String(style), { force: true });
            if (style === 2) await page.selectOption('#colorModeSelect', 'color', { force: true });
            const saved = await page.evaluate(() => MiceliumEditor.capture());
            const results = [];
            for (const dark of [false, true]) {
                await page.click('#menu-toggle');
                const currentDark = (await page.locator('#menu-dark').getAttribute('aria-checked')) === 'true';
                if (currentDark !== dark) await page.click('#menu-dark'); else await page.click('#menu-toggle');
                await page.click('#btnExportSettings');
                const scale = style === 6 ? 2 : 1;
                await page.selectOption('#exportQualitySelectModal', String(scale), { force: true });
                for (const id of ['#expBlack', '#expWhite']) assert.match(await page.locator(id).textContent(), /TRANSPARENT BACKGROUND/);
                const label = await page.locator('#still-export-background').textContent();
                assert.match(label, [2, 5].includes(style) ? new RegExp(`COLORED · ${dark ? 'BLACK' : 'WHITE'} BACKGROUND`) : new RegExp(dark ? 'WHITE ON BLACK' : 'BLACK ON WHITE'));
                assert.match(await page.locator('#expSvg').textContent(), /NO BACKGROUND/);
                const black = await download('#expBlack'), white = await download('#expWhite'), colored = await download('#expColor');
                assert.match(black.name, /black_transparent/); assert.match(white.name, /white_transparent/);
                assert.match(colored.name, new RegExp(`colored_${dark ? 'black' : 'white'}-background`));
                for (const file of [black, white, colored]) {
                    assert.equal(file.bytes.readUInt32BE(16), 96 * scale); assert.equal(file.bytes.readUInt32BE(20), 64 * scale);
                }
                const a = await pixels(black), b = await pixels(white), full = await pixels(colored);
                assert.equal(a[3], 0, 'transparent export has no corner background');
                let ink = 0, chroma = 0;
                for (let i = 0; i < a.length; i += 4) {
                    assert.equal(a[i + 3], b[i + 3], 'black and white retain identical geometry/coverage');
                    if (a[i + 3]) { ink++; assert.deepEqual(a.slice(i, i + 3), [0, 0, 0]); assert.deepEqual(b.slice(i, i + 3), [255, 255, 255]); }
                    assert.equal(full[i + 3], 255, 'colored/full PNG always has an opaque background');
                    if (full[i] !== full[i + 1] || full[i] !== full[i + 2]) chroma++;
                }
                assert.ok(ink > 0, `style ${style} contains exported marks`);
                if (style === 4) {
                    const step = await page.locator('#p2').evaluate(el => Math.floor(4 + 36 * Number(el.value) / 100));
                    const center = Math.ceil(20 / step) * step;
                    assert.equal(a[(center * 96 + center) * 4 + 3], 0, 'hollow dots retain transparent centers');
                }
                if ([2, 5].includes(style)) assert.ok(chroma > 0, 'colored styles preserve artwork colors');
                if (![2].includes(style)) assert.deepEqual(full.slice(0, 4), dark ? [0, 0, 0, 255] : [255, 255, 255, 255]);
                assert.deepEqual(await page.evaluate(() => MiceliumEditor.capture()), saved, 'export restores sidebar parameters');
                results.push({ black, white, full });
                await page.click('#modalCloseBtn');
            }
            assert.deepEqual(results[0].black.bytes, results[1].black.bytes, 'transparent black is independent of dark mode');
            assert.deepEqual(results[0].white.bytes, results[1].white.bytes, 'transparent white is independent of dark mode');
            for (let i = 0; i < results[0].full.length; i += 4) for (let c = 0; c < 3; c++) assert.equal(results[1].full[i + c], 255 - results[0].full[i + c], 'full-image dark palette matches viewport inversion');
            modes.push(style);
        }
        console.log(`PASS: six styles, 36 PNGs, truthful labels/filenames, transparent black/white, opaque light/dark colored output and unchanged parameters (${modes.join(', ')})`);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.click('#btnExportSettings');
        for (const id of ['#expBlack', '#expWhite', '#expColor', '#expSvg']) {
            await page.locator(id).scrollIntoViewIfNeeded();
            assert.equal(await page.locator(id).evaluate(el => el.scrollWidth <= el.clientWidth), true, `${id} label fits on mobile`);
        }
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log('PASS: export labels fit the phone dialog');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
