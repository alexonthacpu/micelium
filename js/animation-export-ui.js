/* Output controls are independent of the inspection camera and preview size. */
(function () {
    'use strict';
    const animation = window.MiceliumAnimate, editor = window.MiceliumEditor, engine = window.MiceliumAnimationExport;
    const dialog = document.createElement('dialog');
    dialog.id = 'animation-export-dialog'; dialog.setAttribute('data-editor-overlay', '');
    dialog.setAttribute('aria-labelledby', 'animation-export-title');
    dialog.innerHTML = `<header><div><span class="export-kicker">SAVE YOUR ANIMATION</span><h2 id="animation-export-title">EXPORT ANIMATION</h2></div><button id="animation-export-close" aria-label="Close animation export">×</button></header>
        <div class="export-overview"><span class="export-kicker">OUTPUT</span><p id="animation-export-summary"></p></div>
        <fieldset id="animation-export-settings">
        <section class="export-section" aria-labelledby="export-file-heading"><h3 id="export-file-heading">01 / FILE</h3><div class="export-fields">
        <label>FORMAT <select data-design-select id="animation-export-format"><option value="zip">PNG sequence</option></select></label>
        <label>RESOLUTION <select data-design-select id="animation-export-resolution"><option value="preview">MATCH COMPOSITION</option>${[720, 1080, 1440, 1920, 2560, 3840].map(n => `<option value="${n}">${n} PX</option>`).join('')}<option value="source">SOURCE</option></select></label>
        </div></section>
        <section class="export-section" aria-labelledby="export-motion-heading"><h3 id="export-motion-heading">02 / TIMING</h3><div class="export-fields">
        <label>FRAME RATE <select data-design-select id="animation-export-fps">${[12, 15, 24, 25, 30, 50, 60].map(f => `<option value="${f}"${f === 30 ? ' selected' : ''}>${f} FPS</option>`).join('')}</select></label>
        <label>FRAMES TO EXPORT <select data-design-select id="animation-export-range"><option value="all">ENTIRE ANIMATION</option><option value="custom">SELECT A RANGE</option></select></label></div>
        <div id="animation-export-frame-range" class="export-fields" hidden><label>FIRST FRAME <input id="animation-export-first" type="number" min="0" step="1" value="0" disabled></label>
        <label>LAST FRAME <input id="animation-export-last" type="number" min="0" step="1" value="449" disabled></label><p class="editor-note export-span">Count from 0. Both selected frames are included.</p></div></section>
        <section id="animation-export-video-quality" class="export-section" aria-labelledby="export-quality-heading" hidden><h3 id="export-quality-heading">03 / VIDEO QUALITY</h3><div class="export-fields">
        <label>QUALITY <select data-design-select id="animation-export-quality"><option value="12">STANDARD · 12 Mbps</option><option value="24" selected>HIGH · 24 Mbps</option><option value="50">MASTER · 50 Mbps</option><option value="custom">CUSTOM BITRATE</option></select></label>
        <label id="animation-export-bitrate-label" hidden>BITRATE · Mbps <input id="animation-export-bitrate" type="number" min="1" max="100" step="1" value="24"></label></div><p class="editor-note">Higher bitrate preserves more detail in motion.</p></section>
        </fieldset>
        <p class="editor-note" id="animation-export-note">PNG sequence preserves every frame without compression loss.</p>
        <div class="export-feedback"><progress id="animation-export-progress" max="1" value="0" aria-label="Export progress"></progress><p id="animation-export-status" role="status">Ready to export.</p></div>
        <footer><button id="animation-export-cancel">CLOSE</button><button id="animation-export-start">EXPORT FILE</button></footer>`;
    document.body.append(dialog);
    window.MyclmSelect.enhance(dialog);
    const $ = id => dialog.querySelector(`#animation-export-${id}`);
    let controller = null, types = [], probing = 0;
    const bitrate = () => Number($('quality').value === 'custom' ? $('bitrate').value : $('quality').value) * 1000000;
    function config() {
        const settings = animation.compositionSettings(), source = editor.image(), chosen = $('resolution').value;
        return { ...settings, longEdge: chosen === 'preview' ? settings.longEdge : chosen === 'source' ? Math.min(4096, Math.max(source.width, source.height)) : Number(chosen) };
    }
    function plan() {
        const duration = animation.snapshot().duration, fps = Number($('fps').value);
        return engine.framePlan({ duration, fps, ...($('range').value === 'custom' ? { startFrame: $('first').valueAsNumber, endFrame: $('last').valueAsNumber } : {}) });
    }
    function dimensions() {
        const source = editor.image(), edge = config().longEdge, ratio = edge / Math.max(source.width, source.height);
        return { width: Math.max(2, Math.round(source.width * ratio / 2) * 2), height: Math.max(2, Math.round(source.height * ratio / 2) * 2) };
    }
    function refresh() {
        if (!editor.ready() || controller) return;
        const fps = Number($('fps').value), total = Math.ceil(animation.snapshot().duration * fps - 1e-9), custom = $('range').value === 'custom';
        $('first').max = $('last').max = String(total - 1);
        $('first').disabled = $('last').disabled = !custom;
        $('frame-range').hidden = !custom;
        if (!custom) { $('first').value = 0; $('last').value = total - 1; }
        const video = $('format').value !== 'zip';
        $('quality').disabled = !video;
        $('video-quality').hidden = !video;
        $('bitrate-label').hidden = !video || $('quality').value !== 'custom';
        try {
            const selected = plan(), size = dimensions();
            if (video && (!Number.isFinite(bitrate()) || bitrate() < 1000000 || bitrate() > 100000000)) throw new Error('Choose a bitrate from 1 to 100 Mbps.');
            $('summary').textContent = `${size.width} × ${size.height} PX · ${fps} FPS\n${selected.frameCount} frames · ${(selected.frameCount / fps).toFixed(2)} s · BACKGROUND ${config().background || (config().dark ? '#000000' : '#ffffff')}`;
            $('start').disabled = false;
        } catch (error) { $('summary').textContent = error.message; $('start').disabled = true; }
        $('note').textContent = types.find(t => t.ext === $('format').value)?.offline === false
            ? 'Realtime compatibility mode may skip frames under load. PNG sequence renders every frame. Frame numbers start at 0; last frame included.'
            : video ? 'Every selected frame is encoded. Preview quality does not limit this file.' : 'PNG sequence · lossless frames. Preview quality does not limit these files.';
    }
    async function formats() {
        const revision = ++probing; $('start').disabled = true;
        const supported = await engine.supportedTypes({ ...dimensions(), fps: Number($('fps').value), bitrate: bitrate() || 24000000 });
        if (revision !== probing || controller || !dialog.open) return;
        types = supported;
        const previous = $('format').value;
        $('format').replaceChildren();
        for (const type of [...types, { ext: 'zip', label: 'PNG sequence · lossless' }]) {
            const option = new Option(type.ext === 'zip' ? 'PNG SEQUENCE' : type.offline === false ? `${type.ext.toUpperCase()} · REALTIME` : `${type.ext.toUpperCase()} VIDEO`, type.ext); $('format').append(option);
        }
        $('format').value = [...$('format').options].some(o => o.value === previous) ? previous : 'zip';
        $('format')._designRefresh?.();
        refresh();
    }
    function close() { if (controller) controller.abort(); else { probing++; dialog.close(); } }
    $('close').onclick = close; $('cancel').onclick = close;
    dialog.addEventListener('cancel', event => { if (controller) { event.preventDefault(); controller.abort(); } });
    matchMedia('(max-width: 767px), (max-height: 500px) and (pointer: coarse)').addEventListener('change', event => {
        if (event.matches && dialog.open) { controller?.abort(); dialog.close(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(); });
    $('settings').addEventListener('input', refresh);
    $('settings').addEventListener('change', event => {
        refresh();
        if (['animation-export-resolution', 'animation-export-fps', 'animation-export-quality', 'animation-export-bitrate'].includes(event.target.id)) formats();
    });
    document.getElementById('animate-export').onclick = () => {
        animation.pause();
        if (!editor.ready() || animation.snapshot().frames.length < 2) {
            document.getElementById('animate-message').textContent = 'Save at least two keyframes before exporting.'; return;
        }
        $('status').textContent = 'Ready. Save sidebar changes to keyframes before exporting.';
        $('progress').value = 0; dialog.showModal(); refresh(); formats();
    };
    $('start').onclick = async () => {
        if (controller) return;
        let selected;
        try { selected = plan(); } catch (error) { $('status').textContent = error.message; return; }
        const output = config(), fps = Number($('fps').value), bits = bitrate(), type = types.find(t => t.ext === $('format').value);
        if ($('format').value !== 'zip' && !type) { $('status').textContent = 'Choose an available video format or PNG sequence.'; return; }
        const saved = animation.beginExport(), renderer = new window.MiceliumComposition(editor);
        controller = new AbortController(); probing++;
        $('settings').disabled = true; $('start').disabled = true; $('cancel').textContent = 'CANCEL EXPORT';
        try {
            const keys = saved.keyframes;
            const canvas = renderer.renderScene(window.MiceliumTimeline.sampleScene(keys, selected.startFrame / fps), output).canvas;
            await engine.run({
                duration: saved.duration, fps, ...selected, bitrate: bits, signal: controller.signal, type,
                metadata: { width: canvas.width, height: canvas.height, dark: output.dark, background: output.background || (output.dark ? '#000000' : '#ffffff'), cameraBase: output.cameraBase, detail: output.detail, styleTransitions: 'spatial-dither', keyframes: keys },
                render: time => renderer.renderScene(window.MiceliumTimeline.sampleScene(keys, time), output).canvas,
                progress: (value, text) => { $('progress').value = value; $('status').textContent = text; }
            });
            $('progress').value = 1; $('status').textContent = `Export complete. ${selected.frameCount} frames downloaded.`;
        } catch (error) { $('status').textContent = error.name === 'AbortError' ? 'Export cancelled. No file downloaded.' : `Export failed: ${error.message}`; }
        finally {
            renderer.dispose(); controller = null; $('settings').disabled = false;
            $('cancel').textContent = 'CLOSE'; animation.finishExport(saved); refresh();
        }
    };
})();
