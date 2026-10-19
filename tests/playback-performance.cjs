// Observational playback benchmark, not a hardware-independent FPS assertion.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox']
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(process.env.MICELIUM_URL || 'http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.MiceliumAnimate && cvLoaded);
        const fixture = await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
            const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 1024);
            for (let y = 16; y < 1024; y += 48) {
                for (let x = 16; x < 1024; x += 48) {
                    g.fillStyle = `rgb(${x % 256},${y % 256},${(x + y) % 256})`;
                    g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
                }
            }
            return canvas.toDataURL().split(',')[1];
        });
        await page.locator('#fileInput').setInputFiles({
            name: 'performance.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64')
        });
        await page.waitForFunction(() => MiceliumEditor.ready());
        await page.evaluate(() => MiceliumAnimate.toggle(true));
        for (let style = 1; style <= 6; style++) {
            await page.evaluate(value => {
                MiceliumAnimate.pause();
                const control = document.getElementById('styleSelect');
                control.value = String(value); control.dispatchEvent(new Event('change', { bubbles: true }));
            }, style);
            await page.click('#animate-stop'); await page.click('#animate-add');
            await page.locator('#animate-scrub').evaluate(el => {
                el.value = 5; el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await page.locator('#p1').evaluate(el => {
                el.value = Math.max(1, Number(el.value) * .7);
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await page.click('#animate-add'); await page.click('#animate-stop'); await page.click('#animate-play');
            await page.waitForTimeout(2400);
            const state = await page.evaluate(() => MiceliumAnimate.snapshot());
            assert.ok(state.playing && state.time > 0);
            console.log(`Style ${style}: ${await page.locator('#animate-performance').textContent()} · cap ${state.previewLimit}px`);
            await page.click('#animate-pause');
            assert.equal(await page.evaluate(() => img.width), 1024, 'full source must be restored');
        }
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
