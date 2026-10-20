// Requires Playwright and Chromium or WebKit; see DEVELOPMENT.md.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium, webkit } = require('playwright');
const useWebKit = process.env.BROWSER === 'webkit';

(async () => {
  const browser = await (useWebKit ? webkit : chromium).launch(useWebKit ? {} : {
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const failures = [], external = [];
    page.on('pageerror', e => failures.push(e.message));
    page.on('console', m => { if (m.type() === 'error') failures.push(m.text()); });
    const base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['data:', 'blob:'].includes(url.protocol) || url.origin === new URL(base).origin) return route.continue();
      external.push(url.href);
      return route.abort();
    });
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failures.push(`${r.status()} ${r.url()}`); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof p5 !== 'undefined' && typeof JSZip !== 'undefined' && typeof SVG !== 'undefined' && typeof cv !== 'undefined' && typeof cv.Mat === 'function' && cvLoaded && document.querySelector('#canvas-holder canvas'));
    assert.equal(await page.evaluate(() => p5.VERSION), '1.4.2');
    console.log('PASS: local libraries, OpenCV initialization and canvas');
    async function selectControl(id, value) {
      const wrapper = page.locator(`#${id} + .cselect-wrapper`);
      await wrapper.locator('.cselect-closed').click();
      await wrapper.locator(`.cselect-item[data-value="${value}"] .cselect-item-text`).click();
    }
    await selectControl('previewNormSelect', 'native');
    const fixture = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 96);
      g.fillStyle = '#000'; g.fillRect(12, 12, 36, 60); g.beginPath(); g.arc(64, 48, 20, 0, Math.PI * 2); g.fill();
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#fileInput').setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
    await page.waitForFunction(() => rawSourceMedia && img && img.width > 0);
    console.log('PASS: image upload');
    for (let style = 1; style <= 6; style++) {
      await selectControl('styleSelect', String(style));
      await page.locator('#p1').evaluate(el => { el.value = 120; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#styleSelect').inputValue(), String(style));
      const ink = await page.evaluate(() => {
        const c = document.querySelector('#canvas-holder canvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let dark = 0, light = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i+3] && d[i] < 128) dark++; if (d[i+3] && d[i] > 200) light++; }
        return { dark, light };
      });
      assert.ok(ink.dark > 0 && ink.light > 0, `style ${style} must render content`);
      await page.locator('#btnExportSettings').click();
      await selectControl('exportQualitySelectModal', '1');
      for (const [button, ext] of [['#expBlack', 'png'], ['#expSvg', 'svg']]) {
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
        assert.equal(await download.failure(), null);
        const data = await fs.readFile(await download.path());
        assert.ok(data.length > 100, `${ext} output must contain data`);
        if (ext === 'png') {
          assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
          assert.equal(data.readUInt32BE(16), 96); assert.equal(data.readUInt32BE(20), 96);
        } else {
          const svg = data.toString();
          assert.ok(svg.includes('<svg') && /<(path|circle|rect|image|ellipse|line|polygon)\b/.test(svg), 'SVG must contain graphics');
        }
      }
      await page.locator('#modalCloseBtn').click();
      console.log(`PASS: style ${style}, parameter control, PNG and SVG download`);
    }
    const zip = await page.evaluate(async () => {
      const z = new JSZip(); z.file('test.txt', 'micelium');
      return (await JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }))).file('test.txt').async('string');
    });
    assert.equal(zip, 'micelium');
    assert.deepEqual(external, [], 'no external runtime requests');
    assert.deepEqual(failures, [], 'no browser errors');
    console.log('PASS: JSZip round-trip; zero external requests or browser errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
