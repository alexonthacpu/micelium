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
        for (const [id, name] of [['expBlack', 'black_transparent'], ['expWhite', 'white_transparent'], ['expColor', 'colored_white-background'], ['expSvg', 'vector_no-background']]) {
            const downloadPromise = page.waitForEvent('download');
            await page.locator(`#${id}`).tap();
            if (id !== 'expSvg') {
                await page.locator('.still-export-loading').waitFor();
                assert.equal(await page.locator('#expBlack').isDisabled(), true);
            }
            const download = await downloadPromise;
            assert.equal(await download.failure(), null);
            assert.match(download.suggestedFilename(), new RegExp(name));
            const bytes = await fs.readFile(await download.path());
            if (id === 'expSvg') assert.match(bytes.toString(), /<svg/);
            else { assert.equal(bytes.readUInt32BE(16), 192); assert.equal(bytes.readUInt32BE(20), 128); }
            assert.equal(await page.locator('#modalInfoText a').count(), 0);
            await page.waitForFunction(() => !mobileStillExportBusy);
        }
        // Test the native Photos/share handoff without relying on the host OS UI.
        await page.evaluate(() => {
            window.sharedFiles = [];
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
            Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
                window.sharedFiles.push({ name: files[0].name, type: files[0].type, size: files[0].size });
            }});
        });
        await page.locator('#expBlack').tap();
        await page.waitForFunction(() => window.sharedFiles.length === 1);
        const shared = await page.evaluate(() => window.sharedFiles[0]);
        assert.match(shared.name, /black_transparent/); assert.equal(shared.type, 'image/png'); assert.ok(shared.size > 0);
        await page.waitForFunction(() => !mobileStillExportBusy);
        await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } }));
        await page.locator('#expBlack').tap();
        await page.waitForFunction(() => document.getElementById('modalInfoText').textContent === 'Save cancelled.');
        assert.equal(await page.locator('#expBlack').isDisabled(), false);
        assert.deepEqual(errors, []);
        console.log('PASS: mobile single-tap export, loading bar, PNG/SVG downloads, native share handoff/cancel and unchanged 2X dimensions');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
