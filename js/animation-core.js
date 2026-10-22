/* Pure timeline math, shared by the editor and Node tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MiceliumTimeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    const presets = {
        linear: [0, 0, 1, 1], 'ease-in': [0.42, 0, 1, 1],
        'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1]
    };
    const coordinate = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
    function ease(progress, curve = 'linear') {
        const x = clamp(progress, 0, 1);
        if (x === 0 || x === 1 || curve === 'linear') return x;
        const points = Array.isArray(curve) ? curve : presets[curve] || presets.linear;
        // Invert Bezier x(t), not y(t): timing handles are not the time parameter.
        let lo = 0, hi = 1;
        for (let i = 0; i < 22; i++) {
            const t = (lo + hi) / 2;
            if (coordinate(t, points[0], points[2]) < x) lo = t;
            else hi = t;
        }
        return coordinate((lo + hi) / 2, points[1], points[3]);
    }
    function sample(frames, time) {
        if (!frames.length) return null;
        if (time <= frames[0].time) return { ...frames[0].values };
        for (let i = 1; i < frames.length; i++) {
            const right = frames[i], left = frames[i - 1];
            if (time === right.time) return { ...right.values };
            if (time < right.time) {
                // Parameters have different meanings/ranges across styles.
                if (left.values.styleSelect !== right.values.styleSelect) return { ...left.values };
                const mix = ease((time - left.time) / (right.time - left.time), left.easing);
                const result = { ...left.values };
                for (const key of Object.keys(result)) {
                    if (typeof result[key] === 'number' && typeof right.values[key] === 'number') {
                        result[key] += (right.values[key] - result[key]) * mix;
                    }
                }
                return result;
            }
        }
        return { ...frames[frames.length - 1].values };
    }
    function upsert(frames, frame) {
        const index = frames.findIndex(f => Math.abs(f.time - frame.time) < 1 / 120 || f.id === frame.id);
        const next = frames.slice();
        if (index < 0) next.push(frame); else next[index] = { ...frame, id: next[index].id };
        return next.sort((a, b) => a.time - b.time);
    }
    function sampleScene(frames, time) {
        const state = sample(frames, time);
        if (!state) return null;
        for (let i = 1; i < frames.length; i++) {
            const left = frames[i - 1], right = frames[i];
            if (time > left.time && time < right.time && left.values.styleSelect !== right.values.styleSelect) {
                const mix = ease((time - left.time) / (right.time - left.time), left.easing);
                const zoom = (left.values.zoomSlider ?? 1) + ((right.values.zoomSlider ?? 1) - (left.values.zoomSlider ?? 1)) * mix;
                return { from: { ...left.values, zoomSlider: zoom }, to: { ...right.values, zoomSlider: zoom }, mix };
            }
        }
        return { from: state, to: null, mix: 0 };
    }
    return { clamp, presets, ease, sample, sampleScene, upsert };
});
