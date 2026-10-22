(function () {
    'use strict';
    const nav = document.createElement('nav');
    nav.id = 'editor-nav'; nav.setAttribute('data-editor-overlay', '');
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = `<button id="menu-toggle" aria-expanded="false" aria-controls="editor-menu" aria-label="Open menu">MENU <span aria-hidden="true">+</span></button>
        <div id="editor-menu" hidden>
            <button id="menu-about">About</button>
            <button id="menu-animate" aria-pressed="false" aria-describedby="menu-mobile-note">Animation <span class="menu-badge">WORK IN PROGRESS</span></button>
            <p id="menu-mobile-note">Animation is available on desktop only.</p>
            <button id="menu-dark" role="switch" aria-checked="false">Viewport dark mode <span class="dark-indicator" aria-hidden="true"></span></button>
        </div>`;
    document.getElementById('workspace').append(nav);
    const about = document.createElement('dialog');
    about.id = 'about-dialog'; about.setAttribute('data-editor-overlay', '');
    about.setAttribute('aria-labelledby', 'about-title');
    about.innerHTML = `<form method="dialog"><header><div><span class="editor-note">A VISUAL PLAYGROUND</span><h2 id="about-title">ABOUT MICELIUM</h2></div><button aria-label="Close About">×</button></header>
        <div id="about-content" tabindex="0" aria-label="How Micelium works">
        <p class="about-intro">An image is a field of numbers. Micelium turns those numbers into contours, marks, dots and patterns. Six different recipes, one source image, and a lot of room to experiment.</p>
        <section><h3>01 / FROM PIXELS TO MARKS</h3><p>Every pixel carries red, green and blue values. Brightness is the starting point for many treatments: the bitmap and dot tools use the average of those channels, while contour-based tools use OpenCV's grayscale conversion. A threshold separates lighter areas from darker ones; edge detection looks for changes between neighbouring pixels.</p>
        <p>Once a region or edge is found, it can become a line, a dot or a small shape. The parameters change how those marks are placed. A threshold is a decision about what counts as dark; spacing changes the sampling grid; stroke and dot sizes change how much ink covers the image.</p></section>
        <section><h3>02 / SIX WAYS TO SEE AN IMAGE</h3><div class="about-styles">
        <article><h4>01 · Techno Organic</h4><p>Canny edge detection finds sharp brightness changes. OpenCV traces them into contours, then curved lines and seeded jitter give those contours an organic character.</p></article>
        <article><h4>02 · Bitmap Dither</h4><p>A regular grid samples the source. Small rectangles appear where brightness falls below the threshold; controlled noise breaks up the regularity. A coarse grid can make a familiar image feel abstract.</p></article>
        <article><h4>03 · Analog Organic</h4><p>Thresholded regions become contours. A precomputed noise field displaces their points, and scattered short strokes create a texture that feels drawn rather than mechanically traced.</p></article>
        <article><h4>04 · Dot Halftone</h4><p>Dark samples become circles on a grid. Filled and hollow dots distribute ink differently: spacing, diameter and outline thickness can change the whole impression without changing the source.</p></article>
        <article><h4>05 · Dither Plugin Pro</h4><p>Wave modulation, Bayer grids and Floyd–Steinberg error diffusion offer different ways to turn tone into a pattern. Error diffusion passes a brightness error to neighbouring samples instead of simply throwing it away.</p></article>
        <article><h4>06 · Agon / Liquid Relief</h4><p>Thresholds and contours are layered with displaced edges and directional shadows. The relief is an illusion built from two-dimensional geometry, rather than a three-dimensional mesh.</p></article>
        </div></section>
        <section><h3>03 / SMALL FACTS, BIG DIFFERENCES</h3>
        <h4>Your eye finishes the picture.</h4><p>A field of black dots can suggest a gray tone from a distance. Printing and halftoning exploit this: the arrangement and coverage of ink can carry the tone even when individual marks are only black or white.</p>
        <h4>Random does not have to mean unpredictable.</h4><p>Micelium resets its random seed for reproducible renders. That keeps organic jitter from changing arbitrarily between frames, pauses and exports. The texture can look irregular while still being repeatable.</p>
        <h4>Zoom is a camera, not a new image.</h4><p>The image viewport retains native drawing paths and replays them at the display's pixel density. Panning and zooming can reuse geometry, rather than enlarging a small preview bitmap or recalculating every contour.</p>
        <h4>A small threshold change can reveal a new shape.</h4><p>Pixels on opposite sides of a threshold belong to different regions. Moving that boundary can connect two areas or split one apart. This is why a tiny parameter change can sometimes produce a dramatic result.</p></section>
        <section><h3>04 / MOVING BETWEEN LOOKS</h3><p>Each animation keyframe stores a style and its parameters. Within one style, numeric values interpolate over time. Between different styles, two complete renders dissolve into each other using the selected easing curve. Their parameter meanings stay separate: dot spacing is never treated as contour jitter.</p>
        <p>The selected processing detail stays fixed. If a style takes longer to calculate, playback may slow down instead of silently lowering quality. A PNG sequence renders every requested frame; browser video recording runs in real time and may skip frames under load.</p></section>
        <section><h3>05 / TRY A SMALL EXPERIMENT</h3><p>Start with a high-contrast image. Compare contours with a coarse dot grid, then vary only one parameter at a time. For an animation, save one look at the start, choose another style at the end, save that key and scrub between them. Try a different easing curve to change the rhythm of the dissolve.</p></section>
        <section><h3>06 / LOCAL BY DESIGN</h3><p>Image processing happens in your browser. The app's runtime libraries and typefaces are local assets; loading an image does not upload its pixels to a rendering service. Ordinary PNG and SVG exports remain available. Animation keys live in this page session and are lost when the page reloads.</p></section>
        <p class="editor-note about-footer">MYCLM · VERSION 16.0 · EXPERIMENT, LOOK CLOSER, REPEAT.</p>
        </div></form>`;
    document.body.append(about);
    const toggle = nav.querySelector('#menu-toggle'), menu = nav.querySelector('#editor-menu');
    const phoneLayout = matchMedia('(max-width: 767px), (max-height: 500px) and (pointer: coarse)');
    function updateAvailability() { nav.querySelector('#menu-animate').disabled = phoneLayout.matches; }
    updateAvailability(); phoneLayout.addEventListener('change', updateAvailability);
    function close(focus = false) {
        menu.hidden = true; toggle.setAttribute('aria-expanded', 'false');
        if (focus) toggle.focus();
    }
    toggle.onclick = () => {
        menu.hidden = !menu.hidden;
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) menu.querySelector('button').focus();
    };
    document.addEventListener('click', event => { if (!nav.contains(event.target)) close(); });
    document.addEventListener('keydown', event => {
        if (menu.hidden) return;
        if (event.key === 'Escape') { close(true); event.stopPropagation(); return; }
        const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
        if (['ArrowDown', 'ArrowUp'].includes(event.key) && !menu.hidden) {
            event.preventDefault();
            buttons[(buttons.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
        }
    }, true);
    nav.addEventListener('focusout', event => {
        // Safari can blur a button on pointer-down without focusing the next one.
        // A null destination must not hide the target before its click fires.
        if (event.relatedTarget && !nav.contains(event.relatedTarget)) close();
    });
    nav.querySelector('#menu-about').onclick = () => { close(); window.MiceliumAnimate.pause(); about.showModal(); };
    about.addEventListener('close', () => toggle.focus());
    about.addEventListener('click', event => { if (event.target === about) about.close(); });
    nav.querySelector('#menu-animate').onclick = () => { close(); window.MiceliumAnimate.toggle(); };
    const dark = nav.querySelector('#menu-dark');
    let enabled = false;
    try { enabled = localStorage.getItem('micelium.viewportDark') === 'true'; } catch (_) { /* storage may be disabled */ }
    function setDark(value) {
        enabled = value;
        document.getElementById('viewport').classList.toggle('viewport-dark', enabled);
        dark.setAttribute('aria-checked', String(enabled));
        dark.querySelector('span').classList.toggle('is-on', enabled);
        try { localStorage.setItem('micelium.viewportDark', String(enabled)); } catch (_) { /* optional preference */ }
        window.MiceliumEditor.render();
    }
    window.MiceliumViewport = {
        finishFrame(context) {
            if (!enabled) return;
            context.save();
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.globalCompositeOperation = 'difference';
            context.fillStyle = '#fff';
            context.fillRect(0, 0, context.canvas.width, context.canvas.height);
            context.restore();
        }
    };
    dark.onclick = () => setDark(!enabled);
    setDark(enabled);
})();
