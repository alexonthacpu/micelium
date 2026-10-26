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
    about.innerHTML = `<form method="dialog"><header><div><span class="editor-note">A VISUAL PLAYGROUND</span><h2 id="about-title">ABOUT MYCLM</h2></div><button aria-label="Close About">×</button></header>
        <div id="about-content" tabindex="0" aria-label="How MYCLM works">
        <p class="about-intro">MYCLM turns images into lines, dots and textures. It reads brightness and edges, then rebuilds them through contours, halftones and dithering. Choose a style and shape the result with its parameters.</p>
        <p>Keyframes let those looks evolve over time. Everything is processed in your browser, with the same drawing detail preserved from preview to export.</p>
        <p>MYCLM is open source because the future is co-designed. Creative tools grow through shared experiments, questions and contributions. Explore the code, make it your own and help shape what comes next.</p>
        <p><a href="https://github.com/alexonthacpu/micelium" target="_blank" rel="noopener noreferrer">EXPLORE THE SOURCE</a></p>
        <p class="editor-note about-footer">MYCLM beta</p>
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
