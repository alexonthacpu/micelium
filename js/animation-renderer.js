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
                if (this.retainDrawing) {
                    const shape = { ...state, zoomSlider: cameraBase };
                    const geometryKey = JSON.stringify([shape, cameraBase, detail]);
                    if (this.source !== source || this.geometryKey !== geometryKey) {
                        this.editor.apply(state);
                        this.geometry = window.MiceliumDrawing.capture(this.buffer.drawingContext, () =>
                            this.editor.paintComposition(this.buffer, shape, cameraBase, false, this.processing), { render: false });
                        this.geometryKey = geometryKey;
                    }
                    this.zoom = (state.zoomSlider || 1) / Math.max(.001, cameraBase); this.dark = dark;
                    this.needsRaster = true;
                } else { this.editor.apply(state); this.editor.paintComposition(this.buffer, state, cameraBase, dark, this.processing); }
                this.source = source; this.signature = signature;
            }
            if (rasterize) this.rasterize();
            return this.buffer;
        }
        renderScene(scene, config, { rasterize = true } = {}) {
            if (!scene) return null;
            const output = this.render(scene.from, config, { rasterize: false });
            if (scene.to) {
                this.secondary ??= new window.MiceliumComposition(this.editor);
                const previous = this.secondary.signature;
                try { this.secondary.render(scene.to, config, { rasterize: false }); }
                finally { this.editor.apply(scene.from); }
                if (this.mix !== scene.mix || previous !== this.secondary.signature) this.needsRaster = true;
                this.mix = scene.mix;
            } else {
                if (this.mix) this.needsRaster = true;
                this.mix = 0; this.secondary?.dispose(); this.secondary = null; this.blendLayers = null; this.blendSignature = null;
            }
            if (rasterize) this.rasterize();
            return output;
        }
        rasterize() {
            if (this.needsRaster && this.buffer) {
                this.buffer.clear(); this.paint(this.buffer.drawingContext); this.needsRaster = false;
            }
            return this.buffer?.canvas || null;
        }
        paint(context) {
            if (!this.secondary || !this.mix) { this.paintSingle(context); return; }
            // Isolate the complete second scene before blending: per-path alpha would
            // darken overlaps. Cache both complete scenes at actual target density;
            // blend-only frames then require two blits, with no vector replay.
            const matrix = context.getTransform(), width = context.canvas.width, height = context.canvas.height;
            const signature = [this.geometry, this.secondary.geometry, this.zoom, this.secondary.zoom,
                this.dark, this.secondary.dark, width, height, ...['a', 'b', 'c', 'd', 'e', 'f'].map(k => matrix[k])];
            this.blendLayers ??= [document.createElement('canvas'), document.createElement('canvas')];
            if (!this.blendSignature || signature.some((value, i) => value !== this.blendSignature[i])) {
                [this, this.secondary].forEach((renderer, i) => {
                    const layer = this.blendLayers[i];
                    if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
                    const buffer = layer.getContext('2d');
                    buffer.resetTransform(); buffer.clearRect(0, 0, width, height);
                    buffer.setTransform(matrix); renderer.paintSingle(buffer);
                });
                this.blendSignature = signature;
            }
            context.save();
            try {
                context.resetTransform(); context.drawImage(this.blendLayers[0], 0, 0);
                context.globalAlpha *= this.mix; context.drawImage(this.blendLayers[1], 0, 0);
            }
            finally { context.restore(); }
        }
        paintSingle(context) {
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
        dispose() { this.secondary?.dispose(); this.secondary = null; this.blendLayers = null; this.blendSignature = null; this.mix = 0; this.needsRaster = false; this.geometry = null; this.geometryKey = null; this.buffer?.remove(); this.processing?.remove(); this.buffer = null; this.processing = null; this.source = null; this.detail = null; this.signature = ''; }
    };
})();
