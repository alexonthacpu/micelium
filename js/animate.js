(function () {
    'use strict';
    const { clamp, sample, upsert, presets, ease } = window.MiceliumTimeline;
    const editor = window.MiceliumEditor;
    const composition = new window.MiceliumComposition(editor);
    const panel = document.createElement('section');
    panel.id = 'animate-panel'; panel.setAttribute('data-editor-overlay', ''); panel.hidden = true;
    panel.setAttribute('aria-label', 'Animation editor');
    panel.innerHTML = `<header class="animate-header"><h2>ANIMATE</h2>
        <label class="animate-source"><span>LOAD IMAGE</span><input id="animate-source" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/svg+xml" aria-label="Load animation image"></label>
        <label>DURATION <input id="animate-duration" type="number" min="1" max="30" step="0.1" value="15" aria-label="Animation duration in seconds"> S</label>
        <label class="animate-loop-label" title="Stretch keyframes proportionally when changing duration"><input id="animate-retime" type="checkbox" checked> RETIME KEYS</label>
        <label>FRAME <select id="animate-resolution" aria-label="Composition resolution"><option value="720">720 PX</option><option value="1080">1080 PX</option><option value="1920">1920 PX</option><option value="source">SOURCE (MAX 1920)</option></select></label>
        <span id="animate-frame-size" class="editor-note"></span><button id="animate-export">EXPORT ANIMATION</button>
        <button id="animate-close" aria-label="Close Animate">×</button></header>
        <div class="animate-body"><div class="animate-sequence">
        <div class="animate-transport"><button id="animate-play">PLAY</button><button id="animate-pause" disabled>PAUSE</button><button id="animate-restart" title="Play from the beginning">RESTART</button><button id="animate-stop" title="Pause and return to zero">STOP</button><button id="animate-prev" aria-label="Previous keyframe">‹ KEY</button><button id="animate-next" aria-label="Next keyframe">KEY ›</button>
            <output id="animate-time" aria-label="Current animation time">00:00.00 / 00:15.00</output>
            <label class="animate-loop-label"><input id="animate-loop" type="checkbox"> LOOP</label><span id="animate-performance" class="editor-note"></span></div>
        <div id="animate-track" aria-label="Keyframe timeline"><div class="animate-ruler" aria-hidden="true"><span>0</span><span>5</span><span>10</span><span id="animate-end-label">15 S</span></div>
            <div id="animate-segments"></div><div id="animate-markers"></div><div id="animate-playhead" aria-hidden="true"></div></div>
        <input id="animate-scrub" type="range" min="0" max="15" value="0" step="0.001" aria-label="Scrub animation time">
        <div class="animate-key-actions"><button id="animate-add">＋ KEYFRAME</button><button id="animate-add-end">＋ END KEY</button><button id="animate-delete" disabled>DELETE</button>
            <label>KEY TIME <input id="animate-key-time" type="number" min="0" max="15" step="0.01" disabled aria-label="Selected keyframe time"> S</label><label>SEEK <input id="animate-seek-time" type="number" min="0" max="15" step="0.01" value="0" aria-label="Playhead time in seconds"> S</label></div>
        <p id="animate-message" class="editor-note" role="status">Load an image, adjust the sidebar, then add a keyframe. Scrub to another time and repeat.</p>
        </div><div class="animate-easing">
        <span id="animate-transition" class="editor-note"></span><label for="animate-ease">TRANSITION CURVE</label>
        <select id="animate-ease" disabled><option value="linear">Linear</option><option value="ease-in">Ease In</option><option value="ease-out">Ease Out</option><option value="ease-in-out">Ease In-Out</option><option value="custom">Custom Bezier</option></select>
        <svg id="animate-curve" viewBox="0 0 120 100" preserveAspectRatio="none" aria-label="Easing curve preview"><path class="curve-grid" d="M10 10V90H110 M10 50H110 M60 10V90"/><path id="curve-links"/><path id="curve-path"/><circle id="curve-handle-1" r="4"/><circle id="curve-handle-2" r="4"/></svg>
        <div id="animate-bezier" hidden>${['x1', 'y1', 'x2', 'y2'].map((name, i) => `<label>${name.toUpperCase()}<input type="number" id="bezier-${name}" min="0" max="1" step="0.01" value="${[0.42, 0, 0.58, 1][i]}" aria-label="Bezier ${name}"></label>`).join('')}</div>
        <p class="editor-note">Click a transition strip to edit its curve without moving the playhead. Drag handles for live feedback. Styles switch at keys.</p>
        </div></div>`;
    document.getElementById('workspace').append(panel);
    const $ = id => panel.querySelector(`#${id}`);
    const scrub = $('animate-scrub'), track = $('animate-track');
    let active = false, playing = false, frames = [], selected = null;
    let duration = 15, time = 0, nextId = 1, raf = 0, origin = 0;
    let cameraBase = 1, segmentId = null, exporting = false, curveRaf = 0;
    let measuredFrames = 0, measuredStart = 0;
    const format = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    const message = text => { $('animate-message').textContent = text; };
    const current = () => frames.find(f => f.id === selected);
    const settings = () => ({
        longEdge: $('animate-resolution').value === 'source' ? Math.min(1920, Math.max(editor.image().width, editor.image().height)) : Number($('animate-resolution').value),
        cameraBase, dark: document.getElementById('viewport').classList.contains('viewport-dark')
    });
    function disposeComposition() { composition.dispose(); }
    function initializeImage() {
        cameraBase = editor.capture().zoomSlider || 1; disposeComposition();
        if (!frames.length) {
            time = 0; const key = { id: String(nextId++), time: 0, values: editor.capture(), easing: 'linear' };
            frames = [key]; selected = key.id;
        }
        renderTime(); renderKeys();
    }
    function curveFrame() {
        const index = frames.findIndex(frame => frame.id === segmentId);
        return index >= 0 && index < frames.length - 1 ? frames[index] : null;
    }
    function renderSegments() {
        if (!curveFrame()) {
            const index = frames.findIndex(frame => frame.id === selected);
            segmentId = frames[Math.min(Math.max(index, 0), frames.length - 2)]?.id || null;
        }
        $('animate-segments').replaceChildren();
        frames.slice(0, -1).forEach((frame, index) => {
            const next = frames[index + 1], button = document.createElement('button');
            button.type = 'button'; button.className = 'animate-segment'; button.dataset.segment = frame.id;
            button.style.left = `${frame.time / duration * 100}%`; button.style.width = `${(next.time - frame.time) / duration * 100}%`;
            button.setAttribute('aria-label', `Edit transition ${frame.time.toFixed(2)} to ${next.time.toFixed(2)} seconds`);
            button.innerHTML = '<svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><path/></svg><span></span>';
            $('animate-segments').append(button);
        });
    }
    function renderTime() {
        scrub.value = time;
        if (document.activeElement !== $('animate-seek-time')) $('animate-seek-time').value = time.toFixed(2);
        if (!playing) $('animate-play').textContent = time > 0 && time < duration ? 'RESUME' : 'PLAY';
        $('animate-playhead').style.left = `${time / duration * 100}%`;
        $('animate-time').textContent = `${format(time)} / ${format(duration)}`;
        scrub.setAttribute('aria-valuetext', `${time.toFixed(2)} seconds`);
    }
    function renderCurve() {
        const frame = curveFrame(), next = frame && frames[frames.indexOf(frame) + 1];
        $('animate-transition').textContent = frame ? `TRANSITION ${frame.time.toFixed(2)} → ${next.time.toFixed(2)} S` : 'ADD TWO KEYS TO EDIT A TRANSITION';
        $('animate-segments').querySelectorAll('button').forEach(button => {
            const key = frames.find(frame => frame.id === button.dataset.segment);
            button.setAttribute('aria-pressed', String(key.id === segmentId));
            button.querySelector('span').textContent = Array.isArray(key.easing) ? 'BEZIER' : key.easing.toUpperCase();
            button.querySelector('path').setAttribute('d', Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${i / 40 * 100},${30 - ease(i / 40, key.easing) * 26}`).join(' '));
        });
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
        $('animate-add').textContent = frames.some(f => Math.abs(f.time - time) < 1 / 120) ? 'SAVE KEYFRAME' : '＋ KEYFRAME';
        $('animate-add-end').textContent = frames.some(f => Math.abs(f.time - duration) < 1 / 120) ? 'SAVE END KEY' : '＋ END KEY';
        renderSegments(); renderCurve();
    }
    function seek(value) {
        time = clamp(value, 0, duration);
        editor.apply(sample(frames, time));
        editor.render(); renderTime();
    }
    function pause() {
        cancelAnimationFrame(raf); raf = 0; playing = false;
        $('animate-play').disabled = false; $('animate-pause').disabled = true;
        $('animate-play').textContent = time > 0 && time < duration ? 'RESUME' : 'PLAY';
    }
    function tick(stamp) {
        if (!playing) return;
        if (document.hidden || !editor.ready()) { pause(); return; }
        const elapsed = (stamp - origin) / 1000;
        if (elapsed >= duration && $('animate-loop').checked) {
            origin += Math.floor(elapsed / duration) * duration * 1000; time = (stamp - origin) / 1000;
        } else time = Math.min(duration, elapsed);
        editor.apply(sample(frames, time)); editor.render(); renderTime(); measuredFrames++;
        if (stamp - measuredStart >= 1000) {
            $('animate-performance').textContent = `${Math.round(measuredFrames * 1000 / (stamp - measuredStart))} FPS · EXACT PREVIEW`;
            measuredFrames = 0; measuredStart = stamp;
        }
        if (time >= duration) { pause(); message('Playback complete. Play to restart, or scrub to edit.'); }
        else raf = requestAnimationFrame(tick);
    }
    function play() {
        if (playing || exporting) return;
        if (!editor.ready()) { message('Load a still image and wait for OpenCV to finish loading.'); return; }
        if (frames.length < 2) { message('Add at least two keyframes at different times to play.'); return; }
        if (time >= duration) seek(0);
        playing = true; selected = null;
        origin = performance.now() - time * 1000;
        measuredStart = performance.now(); measuredFrames = 0;
        $('animate-play').disabled = true; $('animate-pause').disabled = false;
        renderKeys(); message('Playing the export composition. Pause keeps this exact frame.');
        raf = requestAnimationFrame(tick);
    }
    function toggle(force) {
        if (exporting) return;
        const next = typeof force === 'boolean' ? force : !active;
        if (next && !editor.hasImage() && document.getElementById('videoBottomBar').style.display !== 'none') {
            message('Animate uses still images. Load one using the sidebar first.');
            document.getElementById('status-bar').textContent = 'Animate: load a still image first.';
            return;
        }
        pause();
        if (next && !active && editor.hasImage() && !frames.length) initializeImage();
        active = next; panel.hidden = !active;
        document.getElementById('viewport').classList.toggle('animate-view', active);
        editor.resize(); editor.render();
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
    $('animate-pause').onclick = () => { pause(); renderKeys(); message('Paused on this frame. Resume continues here; Restart plays from zero.'); };
    $('animate-stop').onclick = () => { pause(); selected = null; seek(0); renderKeys(); };
    $('animate-restart').onclick = () => { pause(); selected = null; seek(0); play(); };
    $('animate-prev').onclick = () => jumpKey(frames.filter(frame => frame.time < time - .001).pop());
    $('animate-next').onclick = () => jumpKey(frames.find(frame => frame.time > time + .001));
    $('animate-resolution').onchange = () => { pause(); disposeComposition(); editor.render(); };
    $('animate-seek-time').onchange = event => {
        if (!Number.isFinite(event.target.valueAsNumber)) { renderTime(); return; }
        pause(); selected = null; seek(event.target.valueAsNumber); renderKeys();
    };
    function jumpKey(frame) {
        if (!frame) return; pause(); selected = frame.id; segmentId = null; seek(frame.time); renderKeys();
    }
    $('animate-add-end').onclick = () => saveKey(duration);
    $('animate-source').onchange = event => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.type === 'image/gif' || !(/\.(png|jpe?g|webp|bmp|svg)$/i.test(file.name))) { message('Choose a still PNG, JPEG, WebP, BMP or SVG image.'); return; }
        pause(false); handleFile(file); event.target.value = '';
    };
    $('animate-add').onclick = () => saveKey(time);
    function saveKey(at) {
        pause();
        if (!editor.ready()) { message('Load a still image and wait for OpenCV before adding a keyframe.'); return; }
        const keyTime = Math.round(at * 100) / 100;
        const existing = frames.find(f => Math.abs(f.time - keyTime) < 1 / 120);
        const frame = { id: existing?.id || String(nextId++), time: keyTime,
            values: editor.capture(), easing: existing?.easing || 'linear' };
        frames = upsert(frames, frame); selected = frame.id; segmentId = null; time = keyTime; renderKeys(); renderTime();
        message('Keyframe saved. Scrub, adjust the sidebar, then add another keyframe.');
    }
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
        if (!Number.isFinite(value) || value < 1 || value > 30 || (!$('animate-retime').checked && frames.some(f => f.time > value))) {
            event.target.value = duration; message('Choose 1–30 seconds. Move later keys before shortening, or enable RETIME KEYS.'); return;
        }
        if ($('animate-retime').checked) {
            const ratio = value / duration; frames.forEach(frame => { frame.time *= ratio; }); time *= ratio;
        }
        duration = value; scrub.max = duration; $('animate-key-time').max = duration; $('animate-seek-time').max = duration;
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
        if (event.button !== 0 || event.target.closest('.animate-segment')) return;
        pause(false);
        const key = event.target.closest('.animate-key');
        if (key) { selected = dragId = key.dataset.id; segmentId = null; seek(current().time); renderKeys(); }
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
    track.addEventListener('click', event => {
        const segment = event.target.closest('.animate-segment');
        if (segment) { pause(); segmentId = selected = segment.dataset.segment; renderKeys(); return; }
        const key = event.target.closest('.animate-key'); if (key && event.detail === 0) jumpKey(frames.find(frame => frame.id === key.dataset.id));
    });
    track.addEventListener('keydown', event => {
        const key = event.target.closest('.animate-key'); if (!key) return;
        if (['ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'].includes(event.key)) {
            event.preventDefault(); selected = key.dataset.id; pause(false);
            if (event.key === 'Delete' || event.key === 'Backspace') deleteKey();
            else { moveKey(selected, current().time + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 0.5 : 0.05)); $('animate-markers').querySelector(`[data-id="${selected}"]`)?.focus(); }
        }
    });
    $('animate-ease').onchange = event => {
        const frame = curveFrame(); if (!frame) return;
        pause(); frame.easing = event.target.value === 'custom' ? [0.42, 0, 0.58, 1] : event.target.value;
        curveChanged();
    };
    function curveChanged() {
        renderCurve(); cancelAnimationFrame(curveRaf);
        curveRaf = requestAnimationFrame(() => { curveRaf = 0; seek(time); });
    }
    function updateBezier(points) {
        const frame = curveFrame(); if (!frame) return;
        frame.easing = points.map(v => clamp(v, 0, 1)); curveChanged();
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
        if (!event.target.id.startsWith('curve-handle-') || !Array.isArray(curveFrame()?.easing)) return;
        document.activeElement?.blur();
        curveHandle = Number(event.target.id.slice(-1)) - 1; curve.setPointerCapture(event.pointerId); event.preventDefault();
    });
    curve.addEventListener('pointermove', event => {
        if (curveHandle === null) return;
        const rect = curve.getBoundingClientRect(), points = [...curveFrame().easing];
        points[curveHandle * 2] = clamp(((event.clientX - rect.left) / rect.width * 120 - 10) / 100, 0, 1);
        points[curveHandle * 2 + 1] = clamp((90 - (event.clientY - rect.top) / rect.height * 100) / 80, 0, 1);
        updateBezier(points);
    });
    curve.addEventListener('pointerup', () => { curveHandle = null; });
    curve.addEventListener('pointercancel', () => { curveHandle = null; });
    // Cancel playback before existing control listeners handle user edits.
    document.getElementById('ui').addEventListener('input', event => { if (active) pause(); }, true);
    document.getElementById('ui').addEventListener('change', () => {
        if (active) { pause(); message('Parameters changed. Save a keyframe before scrubbing or exporting.'); }
    }, true);
    document.getElementById('ui').addEventListener('click', event => {
        if (active && event.target.closest('#btnZoomIn, #btnZoomOut')) pause();
    }, true);
    document.getElementById('viewport').addEventListener('dblclick', event => {
        if (!active || !editor.ready()) return;
        event.preventDefault(); event.stopImmediatePropagation(); pause();
        editor.apply({ ...editor.capture(), zoomSlider: cameraBase }); editor.render();
        message('Camera fitted to the composition. Save a keyframe to keep this framing.');
    }, true);
    document.getElementById('viewport').addEventListener('wheel', () => { if (playing) pause(); }, { capture: true, passive: true });
    document.getElementById('btnExportSettings').addEventListener('click', () => pause(), true);
    document.addEventListener('micelium:media-loading', event => {
        pause(false); disposeComposition();
        if (event.detail.animated && active) toggle(false);
    });
    document.addEventListener('micelium:image-ready', () => { if (active) initializeImage(); else disposeComposition(); message('Image ready. Save your starting parameters, then add an end key.'); editor.render(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    document.addEventListener('keydown', event => {
        if (!active || exporting || event.target.closest('input,select,textarea,button,dialog') || event.ctrlKey || event.metaKey || event.altKey) return;
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
        ownsViewport: () => active && !isVideoMode,
        frameCanvas: () => composition.buffer?.canvas || null,
        compositionSettings: settings,
        drawComposition(target) {
            if (!active || !editor.ready()) return false;
            const config = settings(), buffer = composition.render(editor.capture(), config);
            const fit = Math.max(.01, Math.min((width - 32) / buffer.width, (height - 32) / buffer.height));
            target.clear(); target.background(config.dark ? 17 : 238); target.push();
            target.image(buffer, (width - buffer.width * fit) / 2, (height - buffer.height * fit) / 2, buffer.width * fit, buffer.height * fit); target.pop();
            $('animate-frame-size').textContent = `${buffer.width} × ${buffer.height} · ${config.dark ? 'DARK' : 'LIGHT'}`;
            return true;
        },
        beginExport() {
            pause();
            if (curveRaf) { cancelAnimationFrame(curveRaf); curveRaf = 0; seek(time); }
            exporting = true;
            return { duration, time, selected, currentState: editor.capture(), keyframes: structuredClone(frames), settings: settings() };
        },
        finishExport(saved) {
            exporting = false; time = saved.time; selected = saved.selected;
            editor.apply(saved.currentState); editor.render(); renderTime(); renderKeys();
        },
        // Read-only inspection is useful for tests and future project serialization.
        snapshot: () => ({ active, playing, time, duration, selected, segmentId, exporting, cameraBase, frames: structuredClone(frames) })
    };
    renderTime(); renderKeys();
})();
