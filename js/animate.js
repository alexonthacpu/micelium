(function () {
    'use strict';
    const { clamp, sample, upsert, presets } = window.MiceliumTimeline;
    const editor = window.MiceliumEditor;
    const panel = document.createElement('section');
    panel.id = 'animate-panel'; panel.setAttribute('data-editor-overlay', ''); panel.hidden = true;
    panel.setAttribute('aria-label', 'Animation editor');
    panel.innerHTML = `<header class="animate-header"><h2>ANIMATE</h2>
        <label class="animate-source"><span>LOAD IMAGE</span><input id="animate-source" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/svg+xml" aria-label="Load animation image"></label>
        <label>DURATION <input id="animate-duration" type="number" min="15" max="20" step="0.5" value="15" aria-label="Animation duration in seconds"> S</label>
        <button id="animate-close" aria-label="Close Animate">×</button></header>
        <div class="animate-body"><div class="animate-sequence">
        <div class="animate-transport"><button id="animate-play">PLAY</button><button id="animate-pause" disabled>PAUSE</button><button id="animate-stop">STOP</button>
            <output id="animate-time" aria-label="Current animation time">00:00.00 / 00:15.00</output>
            <span id="animate-performance" class="editor-note"></span></div>
        <div id="animate-track" aria-label="Keyframe timeline"><div class="animate-ruler" aria-hidden="true"><span>0</span><span>5</span><span>10</span><span id="animate-end-label">15 S</span></div>
            <div id="animate-markers"></div><div id="animate-playhead" aria-hidden="true"></div></div>
        <input id="animate-scrub" type="range" min="0" max="15" value="0" step="0.01" aria-label="Scrub animation time">
        <div class="animate-key-actions"><button id="animate-add">＋ KEYFRAME</button><button id="animate-delete" disabled>DELETE</button>
            <label>KEY TIME <input id="animate-key-time" type="number" min="0" max="15" step="0.01" disabled aria-label="Selected keyframe time"> S</label></div>
        <p id="animate-message" class="editor-note" role="status">Load an image, adjust the sidebar, then add a keyframe. Scrub to another time and repeat.</p>
        </div><div class="animate-easing">
        <label for="animate-ease">OUTGOING EASING</label>
        <select id="animate-ease" disabled><option value="linear">Linear</option><option value="ease-in">Ease In</option><option value="ease-out">Ease Out</option><option value="ease-in-out">Ease In-Out</option><option value="custom">Custom Bezier</option></select>
        <svg id="animate-curve" viewBox="0 0 120 100" preserveAspectRatio="none" aria-label="Easing curve preview"><path class="curve-grid" d="M10 10V90H110 M10 50H110 M60 10V90"/><path id="curve-links"/><path id="curve-path"/><circle id="curve-handle-1" r="4"/><circle id="curve-handle-2" r="4"/></svg>
        <div id="animate-bezier" hidden>${['x1', 'y1', 'x2', 'y2'].map((name, i) => `<label>${name.toUpperCase()}<input type="number" id="bezier-${name}" min="0" max="1" step="0.01" value="${[0.42, 0, 0.58, 1][i]}" aria-label="Bezier ${name}"></label>`).join('')}</div>
        <p class="editor-note">Drag keys to move. Arrow keys to fine-tune. Easing belongs to the selected key → next key. Styles and switches change at keyframes.</p>
        </div></div>`;
    document.getElementById('workspace').append(panel);
    const $ = id => panel.querySelector(`#${id}`);
    const scrub = $('animate-scrub'), track = $('animate-track');
    let active = false, playing = false, frames = [], selected = null;
    let duration = 15, time = 0, nextId = 1, raf = 0, origin = 0;
    let preview = null, previewSource = null, previewLimit = 480;
    let lastStamp = 0, measuredFrames = 0, measuredStart = 0, slowFrames = 0;
    const format = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    const message = text => { $('animate-message').textContent = text; };
    const current = () => frames.find(f => f.id === selected);
    function releasePreview() {
        if (preview) preview.remove();
        preview = previewSource = null;
    }
    function renderTime() {
        scrub.value = time;
        $('animate-playhead').style.left = `${time / duration * 100}%`;
        $('animate-time').textContent = `${format(time)} / ${format(duration)}`;
        scrub.setAttribute('aria-valuetext', `${time.toFixed(2)} seconds`);
    }
    function renderCurve() {
        const frame = current();
        const custom = Array.isArray(frame?.easing);
        const kind = custom ? 'custom' : frame?.easing || 'linear';
        const points = custom ? frame.easing : presets[kind];
        $('animate-ease').disabled = !frame;
        $('animate-ease').value = kind;
        $('animate-bezier').hidden = !custom;
        ['x1', 'y1', 'x2', 'y2'].forEach((name, i) => {
            const input = $(`bezier-${name}`);
            if (document.activeElement !== input) input.value = points[i];
        });
        const [x1, y1, x2, y2] = points.map((v, i) => i % 2 ? 90 - v * 80 : 10 + v * 100);
        $('curve-path').setAttribute('d', `M10 90 C${x1} ${y1} ${x2} ${y2} 110 10`);
        $('curve-links').setAttribute('d', `M10 90 L${x1} ${y1} M110 10 L${x2} ${y2}`);
        [1, 2].forEach((n, i) => {
            const circle = $(`curve-handle-${n}`);
            circle.setAttribute('cx', [x1, x2][i]); circle.setAttribute('cy', [y1, y2][i]);
            circle.style.display = custom ? '' : 'none';
        });
    }
    function renderKeys() {
        const markers = $('animate-markers'); markers.replaceChildren();
        frames.forEach((frame, index) => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'animate-key';
            button.dataset.id = frame.id;
            button.style.left = `${frame.time / duration * 100}%`;
            button.setAttribute('aria-label', `Keyframe ${index + 1} at ${frame.time.toFixed(2)} seconds`);
            button.setAttribute('aria-pressed', String(frame.id === selected));
            button.title = `${frame.time.toFixed(2)} s · drag to move`;
            button.innerHTML = '<span aria-hidden="true">◆</span>';
            markers.append(button);
        });
        const frame = current();
        $('animate-delete').disabled = !frame;
        $('animate-key-time').disabled = !frame;
        $('animate-key-time').value = frame ? frame.time.toFixed(2) : '';
        $('animate-add').textContent = frames.some(f => Math.abs(f.time - time) < 1 / 120) ? 'UPDATE KEYFRAME' : '＋ KEYFRAME';
        renderCurve();
    }
    function seek(value) {
        time = clamp(value, 0, duration);
        editor.apply(sample(frames, time));
        editor.render(); renderTime();
    }
    function pause(fullQuality = true) {
        cancelAnimationFrame(raf); raf = 0;
        const wasPlaying = playing; playing = false;
        $('animate-play').disabled = false; $('animate-pause').disabled = true;
        if (wasPlaying && fullQuality) { releasePreview(); editor.render(); }
    }
    function tick(stamp) {
        if (!playing) return;
        if (document.hidden || !editor.ready()) { pause(); return; }
        time = Math.min(duration, (stamp - origin) / 1000);
        const started = performance.now();
        editor.apply(sample(frames, time)); editor.render(); renderTime();
        const cost = performance.now() - started;
        // Bound expensive style work while leaving original pixels and exports intact.
        const missedBudget = cost > 12 || (lastStamp && stamp - lastStamp > 21);
        slowFrames = missedBudget ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames >= 4 && previewLimit > 160) {
            previewLimit = Math.max(160, Math.floor(previewLimit * 0.75));
            releasePreview(); slowFrames = 0;
        }
        if (lastStamp) measuredFrames++;
        lastStamp = stamp;
        if (stamp - measuredStart >= 1000) {
            $('animate-performance').textContent = `${Math.round(measuredFrames * 1000 / (stamp - measuredStart))} FPS · LIVE PREVIEW`;
            measuredFrames = 0; measuredStart = stamp;
        }
        if (time >= duration) { pause(); message('Playback complete. Play to restart, or scrub to edit.'); }
        else raf = requestAnimationFrame(tick);
    }
    function play() {
        if (playing) return;
        if (!editor.ready()) { message('Load a still image and wait for OpenCV to finish loading.'); return; }
        if (frames.length < 2) { message('Add at least two keyframes at different times to play.'); return; }
        if (time >= duration) time = 0;
        playing = true; selected = null; previewLimit = 480; releasePreview();
        origin = performance.now() - time * 1000;
        measuredStart = performance.now(); measuredFrames = 0; lastStamp = 0; slowFrames = 0;
        $('animate-play').disabled = true; $('animate-pause').disabled = false;
        renderKeys(); message('Playing · adaptive preview; pause restores full detail.');
        raf = requestAnimationFrame(tick);
    }
    function toggle(force) {
        const next = typeof force === 'boolean' ? force : !active;
        if (next && !editor.hasImage() && document.getElementById('videoBottomBar').style.display !== 'none') {
            message('Animate uses still images. Load one using the sidebar first.');
            document.getElementById('status-bar').textContent = 'Animate: load a still image first.';
            return;
        }
        if (!next) pause();
        active = next; panel.hidden = !active;
        document.getElementById('menu-animate')?.setAttribute('aria-pressed', String(active));
        if (active) { renderTime(); renderKeys(); $('animate-source').focus(); }
        else document.getElementById('menu-toggle')?.focus();
    }
    function moveKey(id, value) {
        const frame = frames.find(f => f.id === id);
        const t = Math.round(clamp(value, 0, duration) * 100) / 100;
        if (!frame || frames.some(f => f.id !== id && Math.abs(f.time - t) < 1 / 60)) return false;
        frame.time = t; frames.sort((a, b) => a.time - b.time);
        selected = id; seek(t); renderKeys(); return true;
    }
    $('animate-close').onclick = () => toggle(false);
    $('animate-play').onclick = play;
    $('animate-pause').onclick = () => { pause(); renderKeys(); };
    $('animate-stop').onclick = () => { pause(false); releasePreview(); selected = null; seek(0); renderKeys(); };
    $('animate-source').onchange = event => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.type === 'image/gif' || !(/\.(png|jpe?g|webp|bmp|svg)$/i.test(file.name))) { message('Choose a still PNG, JPEG, WebP, BMP or SVG image.'); return; }
        pause(false); handleFile(file); event.target.value = '';
    };
    $('animate-add').onclick = () => {
        pause();
        if (!editor.ready()) { message('Load a still image and wait for OpenCV before adding a keyframe.'); return; }
        const keyTime = Math.round(time * 100) / 100;
        const existing = frames.find(f => Math.abs(f.time - keyTime) < 1 / 120);
        const frame = { id: existing?.id || String(nextId++), time: keyTime,
            values: editor.capture(), easing: existing?.easing || 'linear' };
        frames = upsert(frames, frame); selected = frame.id; renderKeys();
        message('Keyframe saved. Scrub, adjust the sidebar, then add another keyframe.');
    };
    function deleteKey() {
        pause(false); frames = frames.filter(f => f.id !== selected); selected = null;
        seek(time); renderKeys(); message('Keyframe deleted.');
    }
    $('animate-delete').onclick = deleteKey;
    $('animate-key-time').onchange = event => {
        pause(false);
        if (!Number.isFinite(event.target.valueAsNumber) || !moveKey(selected, event.target.valueAsNumber)) {
            renderKeys(); message('Keep keyframes at different times.');
        }
    };
    $('animate-duration').onchange = event => {
        pause(false);
        const value = event.target.valueAsNumber;
        if (!Number.isFinite(value) || value < 15 || value > 20 || frames.some(f => f.time > value)) {
            event.target.value = duration; message('Choose 15–20 seconds. Move later keyframes before shortening.'); return;
        }
        duration = value; scrub.max = duration; $('animate-key-time').max = duration;
        $('animate-end-label').textContent = `${duration} S`;
        // Tick labels follow the duration rather than implying a fixed 15-second scale.
        track.querySelectorAll('.animate-ruler span').forEach((el, i) => { el.textContent = `${+(duration * i / 3).toFixed(1)}${i === 3 ? ' S' : ''}`; });
        seek(time); renderKeys();
    };
    scrub.addEventListener('pointerdown', () => pause(false));
    scrub.oninput = event => { pause(false); selected = null; seek(Number(event.target.value)); renderKeys(); };
    let dragId = null;
    const trackTime = event => (event.clientX - track.getBoundingClientRect().left) / track.clientWidth * duration;
    track.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        pause(false);
        const key = event.target.closest('.animate-key');
        if (key) { selected = dragId = key.dataset.id; seek(current().time); renderKeys(); }
        else { selected = null; seek(trackTime(event)); renderKeys(); }
        track.setPointerCapture(event.pointerId); event.preventDefault();
    });
    track.addEventListener('pointermove', event => { if (track.hasPointerCapture(event.pointerId)) {
        if (dragId) moveKey(dragId, trackTime(event)); else seek(trackTime(event));
    } });
    function endDrag() {
        dragId = null; renderKeys();
        if (selected) $('animate-markers').querySelector(`[data-id="${selected}"]`)?.focus({ preventScroll: true });
    }
    track.addEventListener('pointerup', endDrag); track.addEventListener('pointercancel', endDrag);
    track.addEventListener('click', event => { const key = event.target.closest('.animate-key'); if (key && event.detail === 0) { pause(false); selected = key.dataset.id; seek(current().time); renderKeys(); } });
    track.addEventListener('keydown', event => {
        const key = event.target.closest('.animate-key'); if (!key) return;
        if (['ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'].includes(event.key)) {
            event.preventDefault(); selected = key.dataset.id; pause(false);
            if (event.key === 'Delete' || event.key === 'Backspace') deleteKey();
            else { moveKey(selected, current().time + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 0.5 : 0.05)); $('animate-markers').querySelector(`[data-id="${selected}"]`)?.focus(); }
        }
    });
    $('animate-ease').onchange = event => {
        const frame = current(); if (!frame) return;
        pause(false); frame.easing = event.target.value === 'custom' ? [0.42, 0, 0.58, 1] : event.target.value;
        renderCurve();
    };
    function updateBezier(points) {
        const frame = current(); if (!frame) return;
        frame.easing = points.map(v => clamp(v, 0, 1)); renderCurve();
    }
    ['x1', 'y1', 'x2', 'y2'].forEach(name => {
        $(`bezier-${name}`).oninput = () => {
            const points = ['x1', 'y1', 'x2', 'y2'].map(n => $(`bezier-${n}`).valueAsNumber);
            if (points.every(Number.isFinite)) updateBezier(points);
        };
    });
    let curveHandle = null;
    const curve = $('animate-curve');
    curve.addEventListener('pointerdown', event => {
        if (!event.target.id.startsWith('curve-handle-') || !Array.isArray(current()?.easing)) return;
        document.activeElement?.blur();
        curveHandle = Number(event.target.id.slice(-1)) - 1; curve.setPointerCapture(event.pointerId); event.preventDefault();
    });
    curve.addEventListener('pointermove', event => {
        if (curveHandle === null) return;
        const rect = curve.getBoundingClientRect(), points = [...current().easing];
        points[curveHandle * 2] = Math.round(clamp(((event.clientX - rect.left) / rect.width * 120 - 10) / 100, 0, 1) * 100) / 100;
        points[curveHandle * 2 + 1] = Math.round(clamp((90 - (event.clientY - rect.top) / rect.height * 100) / 80, 0, 1) * 100) / 100;
        updateBezier(points);
    });
    curve.addEventListener('pointerup', () => { curveHandle = null; });
    curve.addEventListener('pointercancel', () => { curveHandle = null; });
    // Cancel playback before existing control listeners handle user edits.
    document.getElementById('ui').addEventListener('input', event => { if (active) pause(); }, true);
    document.getElementById('ui').addEventListener('change', event => { if (active) pause(); }, true);
    document.getElementById('ui').addEventListener('click', event => {
        if (active && event.target.closest('#btnZoomIn, #btnZoomOut')) pause();
    }, true);
    document.getElementById('viewport').addEventListener('wheel', () => { if (playing) pause(); }, { capture: true, passive: true });
    document.getElementById('btnExportSettings').addEventListener('click', () => pause(), true);
    document.addEventListener('micelium:media-loading', event => {
        pause(false); releasePreview();
        if (event.detail.animated && active) toggle(false);
    });
    document.addEventListener('micelium:image-ready', () => { releasePreview(); message('Image ready. Existing keyframes are preserved; add a keyframe to begin.'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    document.addEventListener('keydown', event => {
        if (!active || event.target.closest('input,select,textarea,button,dialog') || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.code === 'Space') { event.preventDefault(); if (playing) pause(); else play(); }
        if (event.key === 'Escape') toggle(false);
    });
    let resizeRaf = 0;
    new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => editor.resize());
    }).observe(document.getElementById('viewport'));
    window.MiceliumAnimate = {
        toggle, play, pause,
        getPreviewSource() {
            if (!playing) return null;
            const source = editor.image();
            if (previewSource !== source) { releasePreview(); previewSource = source; preview = editor.preview(previewLimit); }
            return preview;
        },
        // Read-only inspection is useful for tests and future project serialization.
        snapshot: () => ({ active, playing, time, duration, selected, previewLimit, frames: structuredClone(frames) })
    };
    renderTime(); renderKeys();
})();
