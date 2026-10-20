/* A fixed composition shared by playback, scrubbing and exported frames. */
(function () {
    'use strict';
    window.MiceliumComposition = class {
        constructor(editor, { retainDrawing = true } = {}) {
            this.editor = editor; this.retainDrawing = retainDrawing;
            this.geometry = null; this.geometryKey = null;
            this.buffer = null; this.processing = null; this.source = null;
            this.signature = ''; this.detail = null;
        }
        render(state, { longEdge = 720, cameraBase = 1, dark = false, detail = 'source' } = {}, { rasterize = true } = {}) {
            const source = this.editor.image();
            if (!source || !state) return null;
            const ratio = longEdge / Math.max(source.width, source.height);
            const w = Math.max(2, Math.round(source.width * ratio / 2) * 2);
            const h = Math.max(2, Math.round(source.height * ratio / 2) * 2);
            if (!this.buffer || this.buffer.width !== w || this.buffer.height !== h) {
                this.dispose(); this.buffer = createGraphics(w, h); this.buffer.pixelDensity(1);
            }
            if (this.source !== source || this.detail !== detail) {
                this.processing?.remove();
                this.processing = this.editor.processingSource(detail === 'source' ? Infinity : Number(detail));
                this.detail = detail; this.signature = '';
            }
            const signature = JSON.stringify([state, cameraBase, dark, detail]);
            if (this.source !== source || this.signature !== signature) {
                this.editor.apply(state);
                if (this.retainDrawing) {
                    const shape = { ...state, zoomSlider: cameraBase };
                    const geometryKey = JSON.stringify([shape, cameraBase, detail]);
                    if (this.source !== source || this.geometryKey !== geometryKey) {
                        this.geometry = window.MiceliumDrawing.capture(this.buffer.drawingContext, () =>
                            this.editor.paintComposition(this.buffer, shape, cameraBase, false, this.processing), { render: false });
                        this.geometryKey = geometryKey;
                    }
                    this.zoom = (state.zoomSlider || 1) / Math.max(.001, cameraBase); this.dark = dark;
                    this.needsRaster = true;
                } else this.editor.paintComposition(this.buffer, state, cameraBase, dark, this.processing);
                this.source = source; this.signature = signature;
            }
            if (rasterize) this.rasterize();
            return this.buffer;
        }
        rasterize() {
            if (this.needsRaster && this.buffer) {
                this.buffer.clear(); this.paint(this.buffer.drawingContext); this.needsRaster = false;
            }
            return this.buffer?.canvas || null;
        }
        paint(context) {
            const { width: w, height: h } = this.buffer;
            context.save();
            try {
                context.beginPath(); context.rect(0, 0, w, h); context.clip();
                context.fillStyle = '#fff'; context.fillRect(0, 0, w, h);
                context.save(); context.translate(w / 2, h / 2); context.scale(this.zoom, this.zoom); context.translate(-w / 2, -h / 2);
                this.geometry.draw(context); context.restore();
                if (this.dark) { context.globalCompositeOperation = 'difference'; context.fillStyle = '#fff'; context.fillRect(0, 0, w, h); }
            } finally { context.restore(); }
        }
        dispose() { this.needsRaster = false; this.geometry = null; this.geometryKey = null; this.buffer?.remove(); this.processing?.remove(); this.buffer = null; this.processing = null; this.source = null; this.detail = null; this.signature = ''; }
    };
})();
