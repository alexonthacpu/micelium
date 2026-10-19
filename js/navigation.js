(function () {
    'use strict';
    const nav = document.createElement('nav');
    nav.id = 'editor-nav'; nav.setAttribute('data-editor-overlay', '');
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = `<button id="menu-toggle" aria-expanded="false" aria-controls="editor-menu" aria-label="Open menu">MENU <span aria-hidden="true">＋</span></button>
        <div id="editor-menu" hidden>
            <button id="menu-about">About</button>
            <button id="menu-animate" aria-pressed="false">Animate</button>
            <button id="menu-dark" role="switch" aria-checked="false">Viewport dark mode <span aria-hidden="true">○</span></button>
        </div>`;
    document.getElementById('workspace').append(nav);
    const about = document.createElement('dialog');
    about.id = 'about-dialog'; about.setAttribute('data-editor-overlay', '');
    about.setAttribute('aria-labelledby', 'about-title');
    about.innerHTML = `<form method="dialog"><header><h2 id="about-title">MICELIUM</h2><button aria-label="Close About">×</button></header>
        <p>A visual playground for organic structures, halftones and generative image treatments.</p>
        <p>Load an image, explore six styles and export PNG or SVG. Animate parameters with keyframes and custom easing.</p>
        <p class="editor-note">MYCLM · VERSION 16.0</p></form>`;
    document.body.append(about);
    const toggle = nav.querySelector('#menu-toggle'), menu = nav.querySelector('#editor-menu');
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
    nav.addEventListener('keydown', event => {
        if (event.key === 'Escape') { close(true); event.stopPropagation(); }
        const buttons = [...menu.querySelectorAll('button')];
        if (['ArrowDown', 'ArrowUp'].includes(event.key) && !menu.hidden) {
            event.preventDefault();
            buttons[(buttons.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
        }
    });
    nav.addEventListener('focusout', event => { if (!nav.contains(event.relatedTarget)) close(); });
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
        dark.querySelector('span').textContent = enabled ? '●' : '○';
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
