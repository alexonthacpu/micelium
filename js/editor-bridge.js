/* The only adapter between modular editor features and the existing p5 sketch. */
(function () {
    'use strict';
    const ids = ['styleSelect', 'p1', 'p2', 'p3', 'p4', 'zoomSlider',
        'colorModeSelect', 'circleModeSelect', 'ditherAlgo', 'resamplingMode',
        'vintagePreset', 'agonMode', 'agonReliefDepth', 'agonGeom', 'agonLight', 'invertColors'];
    const controls = ids.map(id => document.getElementById(id)).filter(Boolean);
    let animatedParameters = null;
    const clearParameters = () => { animatedParameters = null; };
    document.getElementById('ui').addEventListener('input', clearParameters, true);
    document.getElementById('ui').addEventListener('change', clearParameters, true);
    document.getElementById('ui').addEventListener('click', event => {
        if (event.target.closest('#btnZoomIn, #btnZoomOut')) clearParameters();
    }, true);
    document.getElementById('viewport').addEventListener('wheel', () => {
        if (!window.MiceliumAnimate?.ownsViewport()) clearParameters();
    }, { capture: true, passive: true });
    document.addEventListener('micelium:media-loading', clearParameters);
    window.MiceliumEditor = {
        parameters: () => animatedParameters,
        controls,
        ready: () => cvLoaded && !!img && !isVideoMode,
        hasImage: () => !!img && !isVideoMode,
        image: () => img,
        capture() {
            const state = {};
            for (const el of controls) state[el.id] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
            state.colorMapType = document.querySelector('input[name="colorMapType"]:checked')?.value || 'original';
            // Range inputs quantize display values; retain continuous sampled values.
            if (animatedParameters) Object.assign(state, animatedParameters);
            return state;
        },
        apply(state) {
            animatedParameters = state;
            if (!state) return;
            const style = document.getElementById('styleSelect');
            if (style.value !== state.styleSelect) {
                style.value = state.styleSelect;
                updateUI({ redraw: false });
                style._cselectRefresh?.();
            }
            for (const el of controls) {
                const value = state[el.id];
                if (value === undefined) continue;
                const previous = el.type === 'checkbox' ? el.checked : el.value;
                if (el.type === 'checkbox') el.checked = value;
                else el.value = value;
                if (el.tagName === 'SELECT' && previous !== el.value) el._cselectRefresh?.();
            }
            document.querySelectorAll('input[name="colorMapType"]').forEach(el => { el.checked = el.value === state.colorMapType; });
            document.getElementById('vintagePreset').style.display = state.colorMapType === 'vintage' ? 'block' : 'none';
        },
        render: () => { if (img) redraw(); },
        resize() {
            // ResizeObserver can fire before p5 creates its global canvas.
            if (typeof width !== 'number' || typeof height !== 'number') return;
            const dimensions = getViewportDimensions();
            viewX += (dimensions.w - width) / 2;
            viewY += (dimensions.h - height) / 2;
            updateCanvasSize();
        },
        processingSource(maxEdge) {
            if (Math.max(img.width, img.height) <= maxEdge) return null;
            const ratio = maxEdge / Math.max(img.width, img.height);
            const copy = createGraphics(Math.max(1, Math.round(img.width * ratio)), Math.max(1, Math.round(img.height * ratio)));
            copy.pixelDensity(1); copy.drawingContext.drawImage(img.canvas, 0, 0, copy.width, copy.height);
            return copy;
        },
        paintComposition(target, state, cameraBase, dark, sourceOverride) {
            const original = img;
            if (sourceOverride) img = sourceOverride;
            try {
                const zoom = (state.zoomSlider || 1) / Math.max(.001, cameraBase);
                const fit = Math.min(target.width / img.width, target.height / img.height);
                const p = ['p1', 'p2', 'p3', 'p4'].map(id => state[id]);
                target.clear(); target.background(255); target.push();
                try {
                    // Legacy styles seed the target but sometimes call global random().
                    // Seed both to make a frame independent of the previous render.
                    randomSeed(42);
                    target.translate(target.width / 2, target.height / 2);
                    target.scale(fit * zoom); target.translate(-img.width / 2, -img.height / 2);
                    const renderers = [null, renderStyle01, renderStyle02, renderStyle03, renderStyle04, renderStyle05, renderStyle06];
                    if (state.styleSelect === '2') renderStyle02(target, p[0], p[1], p[2], 0);
                    else renderers[Number(state.styleSelect)](target, ...p, 0);
                } finally { target.pop(); }
                if (dark) {
                    const ctx = target.drawingContext; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, target.canvas.width, target.canvas.height); ctx.restore();
                }
            } finally { img = original; }
        }
    };
})();
