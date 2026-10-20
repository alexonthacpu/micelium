/* A fixed composition shared by playback, scrubbing and exported frames. */
(function () {
    'use strict';
    window.MiceliumComposition = class {
        constructor(editor) { this.editor = editor; this.buffer = null; this.source = null; this.signature = ''; }
        render(state, { longEdge = 720, cameraBase = 1, dark = false } = {}) {
            const source = this.editor.image();
            if (!source || !state) return null;
            const ratio = longEdge / Math.max(source.width, source.height);
            const w = Math.max(2, Math.round(source.width * ratio / 2) * 2);
            const h = Math.max(2, Math.round(source.height * ratio / 2) * 2);
            if (!this.buffer || this.buffer.width !== w || this.buffer.height !== h) {
                this.dispose(); this.buffer = createGraphics(w, h); this.buffer.pixelDensity(1);
            }
            const signature = JSON.stringify([state, cameraBase, dark]);
            this.editor.apply(state);
            if (this.source !== source || this.signature !== signature) {
                this.editor.paintComposition(this.buffer, state, cameraBase, dark);
                this.source = source; this.signature = signature;
            }
            return this.buffer;
        }
        dispose() { this.buffer?.remove(); this.buffer = null; this.source = null; this.signature = ''; }
    };
})();
