const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const useWebKit = process.env.BROWSER === 'webkit';
(async () => {
    const browser = await (useWebKit ? webkit : chromium).launch(useWebKit ? {} : {
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']
    });
    try {
        const page = await browser.newPage();
        const errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        const base = process.env.MICELIUM_URL || 'http://127.0.0.1:8000';
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.href); return route.abort();
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.MiceliumAnimate && cvLoaded);
        async function openMenu() {
            if (!await page.locator('#editor-menu').isVisible()) await page.click('#menu-toggle');
        }
        async function checkActions() {
            await openMenu(); await page.click('#menu-about');
            assert.equal(await page.locator('#about-dialog').evaluate(el => el.open), true);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.getElementById('about-dialog').open && document.activeElement.id === 'menu-toggle');
            await openMenu(); await page.click('#menu-animate');
            assert.equal(await page.locator('#animate-panel').isVisible(), true);
            await page.click('#animate-close');
            await openMenu(); await page.click('#menu-dark');
            assert.equal(await page.locator('#menu-dark').getAttribute('aria-checked'), 'true');
            assert.equal(await page.locator('#viewport').evaluate(el => el.classList.contains('viewport-dark')), true);
            await page.click('#menu-dark');
            assert.equal(await page.locator('#menu-dark').getAttribute('aria-checked'), 'false');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#editor-menu').isVisible(), false);
        }
        await checkActions();
        console.log('PASS: native pointer interactions for About, Animate and Dark Mode');
        await page.evaluate(() => {
            // Linux WebKit focuses buttons on click. Reproduce macOS Safari's
            // no-button-focus policy while retaining native pointer/click events.
            window.nullFocusouts = 0;
            const nav = document.getElementById('editor-nav');
            nav.addEventListener('focusout', event => {
                if (event.relatedTarget === null) window.nullFocusouts++;
            });
            nav.addEventListener('mousedown', event => {
                if (event.target.closest('#editor-menu button')) {
                    document.activeElement.blur();
                    event.preventDefault(); // suppress this platform's default button focus
                }
            }, true);
        });
        await checkActions();
        assert.ok(await page.evaluate(() => window.nullFocusouts >= 3), 'exercise null-destination blur before each action');
        console.log('PASS: real clicks survive Safari-style null focusout before click');
        await openMenu(); await page.click('#menu-animate');
        await openMenu(); await page.click('#menu-dark');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#editor-menu').isVisible(), false);
        assert.equal(await page.locator('#animate-panel').isVisible(), true, 'Escape dismisses the menu without closing Animate');
        await page.click('#animate-close');
        await openMenu();
        await page.locator('#zoomSlider').focus();
        assert.equal(await page.locator('#editor-menu').isVisible(), false, 'focus to an outside control closes menu');
        await openMenu();
        await page.mouse.click(20, 180);
        assert.equal(await page.locator('#editor-menu').isVisible(), false, 'outside click closes menu');
        await openMenu(); await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-animate');
        await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
        assert.equal(await page.locator('#about-dialog').evaluate(el => el.open), true);
        await page.keyboard.press('Escape');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log('PASS: keyboard navigation, outside dismissal, no exceptions or external requests');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
