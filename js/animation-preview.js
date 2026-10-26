/* Lossless, native-density playback frames; geometry and exports stay independent. */
(function () {
    'use strict';
    const abort = signal => { if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError'); };
    window.MyclmPlaybackCache = class {
        constructor() { this.epoch = 0; this.blobs = []; this.decoded = new Map(); this.pending = new Map(); this.ready = false; }
        dispose() {
            this.epoch++; this.ready = false; this.blobs = [];
            for (const image of this.decoded.values()) image.close();
            this.decoded.clear(); this.pending.clear();
        }
        async prepare({ render, duration, fps, key, signal, progress }) {
            this.dispose(); this.fps = fps; this.key = key;
            let bytes = 0;
            try {
                for (let i = 0, count = Math.ceil(duration * fps - 1e-9); i < count; i++) {
                    abort(signal);
                    const canvas = render(i / fps);
                    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Cannot prepare preview frame.')), 'image/png'));
                    abort(signal); bytes += blob.size;
                    if (bytes > 192 * 1024 * 1024) throw new Error('Preview exceeds 192 MB. Shorten the timeline or choose fewer FPS; drawing detail is unchanged.');
                    this.blobs.push(blob); progress((i + 1) / count, `Preparing frame ${i + 1} / ${count}`);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                await Promise.all([0, 1, 2, 3].filter(i => i < this.blobs.length).map(i => this.ensure(i)));
                abort(signal); this.ready = true;
            } catch (error) { this.dispose(); throw error; }
        }
        ensure(index) {
            if (this.decoded.has(index)) return Promise.resolve(this.decoded.get(index));
            if (!this.blobs[index]) return Promise.resolve(null);
            if (!this.pending.has(index)) {
                const epoch = this.epoch;
                const promise = createImageBitmap(this.blobs[index]).then(image => {
                    if (this.epoch !== epoch) { image.close(); return null; }
                    this.decoded.set(index, image); this.pending.delete(index); return image;
                }).catch(error => { if (epoch === this.epoch) this.pending.delete(index); throw error; });
                this.pending.set(index, promise);
            }
            return this.pending.get(index);
        }
        get(index) {
            const image = this.decoded.get(index) || null;
            const keep = new Set(Array.from({ length: 5 }, (_, n) => (index + n) % this.blobs.length));
            for (const [i, frame] of this.decoded) if (!keep.has(i)) { frame.close(); this.decoded.delete(i); }
            for (const i of keep) this.ensure(i).catch(() => this.dispose());
            return image;
        }
    };
    window.MyclmPreviewDialog = class {
        constructor(animation) {
            const dialog = document.createElement('dialog'); dialog.id = 'playback-preview-dialog'; dialog.setAttribute('data-editor-overlay', '');
            dialog.setAttribute('aria-labelledby', 'playback-preview-title');
            dialog.innerHTML = `<h2 id="playback-preview-title">SMOOTH PREVIEW</h2><p>Prepare the current preview for steady playback. Export and image quality stay independent. Changes to the image, keys or view require a new preview.</p><label>FPS <select id="playback-preview-fps"><option>24</option><option selected>30</option><option>60</option></select></label><progress id="playback-preview-progress" max="1" value="0"></progress><p id="playback-preview-status" role="status">Ready.</p><footer><button id="playback-preview-start">PREPARE &amp; PLAY</button><button id="playback-preview-cancel">CLOSE</button></footer>`;
            document.body.append(dialog);
            dialog.querySelectorAll('select').forEach(select => select.setAttribute('data-design-select', '')); window.MyclmSelect.enhance(dialog);
            const $ = suffix => dialog.querySelector(`#playback-preview-${suffix}`);
            let controller = null;
            const cancel = () => { if (controller) controller.abort(); else dialog.close(); };
            $('cancel').onclick = cancel;
            dialog.addEventListener('cancel', event => { if (controller) { event.preventDefault(); controller.abort(); } });
            document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(); });
            matchMedia('(max-width: 767px), (max-height: 500px) and (pointer: coarse)').addEventListener('change', e => { if (e.matches) { controller?.abort(); dialog.close(); } });
            document.getElementById('animate-smooth').onclick = () => {
                animation.pause();
                if (!window.MiceliumEditor.ready() || animation.snapshot().frames.length < 2) {
                    document.getElementById('animate-message').textContent = 'Save at least two keys before preparing playback.'; return;
                }
                $('status').textContent = 'Ready. Preview uses the selected quality.'; $('progress').value = 0; dialog.showModal();
            };
            $('start').onclick = async () => {
                if (controller) return;
                controller = new AbortController(); $('start').disabled = $('fps').disabled = true; $('cancel').textContent = 'CANCEL';
                try {
                    await animation.preparePlayback({ fps: Number($('fps').value), signal: controller.signal,
                        progress: (value, message) => { $('progress').value = value; $('status').textContent = message; } });
                    dialog.close(); animation.play();
                } catch (error) { $('status').textContent = error.name === 'AbortError' ? 'Preview cancelled.' : error.message; }
                finally { controller = null; $('start').disabled = $('fps').disabled = false; $('cancel').textContent = 'CLOSE'; }
            };
        }
    };
})();
