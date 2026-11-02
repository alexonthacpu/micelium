const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium, devices } = require('playwright');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage(devices['iPhone 13']);
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(process.env.MICELIUM_URL || 'http://127.0.0.1:8000');
        await page.waitForFunction(() => cvLoaded && window.MiceliumEditor);
        const fixture = await page.evaluate(() => {
            const c = document.createElement('canvas'); c.width = 96; c.height = 64;
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 64);
            g.fillStyle = '#000'; g.fillRect(16, 12, 32, 40);
            return c.toDataURL().split(',')[1];
        });
        await page.locator('#fileInput').setInputFiles({ name: 'phone.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
        await page.waitForFunction(() => MiceliumEditor.ready());
        await page.locator('#btnExportSettings').tap();
        // Simulate encoding that outlives user activation and the old 1.5s cleanup.
        await page.evaluate(() => {
            const original = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
                setTimeout(() => original.call(this, callback, ...args), 5500);
            };
        });
        let oldUrl;
        for (const [id, name] of [['expBlack', 'black_transparent'], ['expWhite', 'white_transparent'], ['expColor', 'colored_white-background'], ['expSvg', 'vector_no-background']]) {
            await page.locator(`#${id}`).tap();
            const link = page.locator('#modalInfoText a[download]');
            await link.waitFor();
            const url = await link.getAttribute('href');
            if (oldUrl) assert.notEqual(url, oldUrl);
            assert.equal(await page.evaluate(async url => (await fetch(url)).ok, url), true);
            const [download] = await Promise.all([page.waitForEvent('download'), link.tap()]);
            assert.equal(await download.failure(), null);
            assert.match(download.suggestedFilename(), new RegExp(name));
            const bytes = await fs.readFile(await download.path());
            if (id === 'expSvg') assert.match(bytes.toString(), /<svg/);
            else {
                assert.equal(bytes.readUInt32BE(16), 192);
                assert.equal(bytes.readUInt32BE(20), 128);
            }
            oldUrl = url;
        }
        assert.deepEqual(errors, []);
        console.log('PASS: mobile touch exports all three PNG variants and SVG; slow encoding, explicit save tap, original 2X dimensions and live file URL');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
