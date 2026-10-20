/* Export dialog: snapshot the timeline and restore the editor after every outcome. */
(function () {
    'use strict';
    const animation = window.MiceliumAnimate, editor = window.MiceliumEditor;
    const dialog = document.createElement('dialog');
    dialog.id = 'animation-export-dialog'; dialog.setAttribute('data-editor-overlay', '');
    dialog.setAttribute('aria-labelledby', 'animation-export-title');
    dialog.innerHTML = `<header><h2 id="animation-export-title">EXPORT ANIMATION</h2><button id="animation-export-close" aria-label="Close animation export">×</button></header>
        <p id="animation-export-summary"></p><fieldset id="animation-export-settings"><label>FORMAT <select id="animation-export-format"></select></label>
        <label>FPS <select id="animation-export-fps"><option>15</option><option>24</option><option selected>30</option><option>60</option></select></label></fieldset>
        <p class="editor-note">Video records in real time; heavy styles may skip frames. PNG sequence exports every frame exactly. Keep this tab visible. The preview frame size and palette are used.</p>
        <progress id="animation-export-progress" max="1" value="0"></progress><p id="animation-export-status" role="status">Ready to export.</p>
        <footer><button id="animation-export-start">EXPORT</button><button id="animation-export-cancel">CLOSE</button></footer>`;
    document.body.append(dialog);
    const $ = id => dialog.querySelector(`#animation-export-${id}`);
    const types = window.MiceliumAnimationExport.videoTypes();
    let controller = null;
    for (const type of [...types, { ext: 'zip', label: 'PNG sequence (.zip) · exact frames' }]) {
        const option = document.createElement('option'); option.value = type.ext; option.textContent = type.label; $('format').append(option);
    }
    function close() { if (controller) controller.abort(); else dialog.close(); }
    $('close').onclick = close; $('cancel').onclick = close;
    dialog.addEventListener('cancel', event => { if (controller) { event.preventDefault(); controller.abort(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(); });
    document.getElementById('animate-export').onclick = () => {
        animation.pause();
        if (!editor.ready() || animation.snapshot().frames.length < 2) {
            document.getElementById('animate-message').textContent = 'Save at least two keyframes before exporting.'; return;
        }
        const state = animation.snapshot(), canvas = animation.frameCanvas();
        $('summary').textContent = `${state.duration.toFixed(2)} s · ${canvas.width} × ${canvas.height} · ${animation.compositionSettings().dark ? 'DARK' : 'LIGHT'} · ${state.frames.length} keys`;
        $('status').textContent = 'Ready. Save sidebar changes to keyframes before exporting.';
        $('progress').value = 0; dialog.showModal();
    };
    $('start').onclick = async () => {
        if (controller) return;
        const saved = animation.beginExport(), renderer = new window.MiceliumComposition(editor);
        controller = new AbortController();
        $('settings').disabled = true; $('start').disabled = true; $('cancel').textContent = 'CANCEL EXPORT';
        try {
            const config = saved.settings, keys = saved.keyframes, fps = Number($('fps').value);
            const canvas = renderer.render(window.MiceliumTimeline.sample(keys, 0), config).canvas;
            await window.MiceliumAnimationExport.run({
                duration: saved.duration, fps, signal: controller.signal, type: types.find(type => type.ext === $('format').value),
                metadata: { width: canvas.width, height: canvas.height, dark: config.dark, cameraBase: config.cameraBase, keyframes: keys },
                render: time => renderer.render(window.MiceliumTimeline.sample(keys, time), config).canvas,
                progress: (value, text) => { $('progress').value = value; $('status').textContent = text; }
            });
            $('progress').value = 1; $('status').textContent = 'Export complete. Download ready.';
        } catch (error) {
            $('status').textContent = error.name === 'AbortError' ? 'Export cancelled. No file downloaded.' : `Export failed: ${error.message}`;
        } finally {
            renderer.dispose(); controller = null;
            $('settings').disabled = false; $('start').disabled = false; $('cancel').textContent = 'CLOSE'; animation.finishExport(saved);
        }
    };
})();
