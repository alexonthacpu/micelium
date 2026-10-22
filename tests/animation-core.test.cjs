const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ease, sample, sampleScene, upsert } = require('../js/animation-core.js');
const frame = (id, time, value, extra = {}) => ({ id, time, values: { styleSelect: '1', p1: value, invertColors: false }, easing: 'linear', ...extra });
test('linear interpolation clamps to endpoint states and holds discrete values', () => {
    const frames = [frame('a', 2, 10), frame('b', 6, 30, { values: { styleSelect: '1', p1: 30, invertColors: true } })];
    assert.equal(sample(frames, -1).p1, 10);
    assert.equal(sample(frames, 4).p1, 20);
    assert.equal(sample(frames, 4).invertColors, false);
    assert.equal(sample(frames, 6).invertColors, true);
    assert.equal(sample(frames, 25).p1, 30);
    assert.equal(sample([], 0), null);
});
test('easing is endpoint exact, monotone and symmetric for ease-in-out', () => {
    for (const kind of ['linear', 'ease-in', 'ease-out', 'ease-in-out']) {
        assert.equal(ease(0, kind), 0); assert.equal(ease(1, kind), 1);
        let previous = 0;
        for (let i = 1; i <= 100; i++) { const value = ease(i / 100, kind); assert.ok(value >= previous && value <= 1); previous = value; }
    }
    assert.ok(ease(.5, 'ease-in') < .5);
    assert.ok(ease(.5, 'ease-out') > .5);
    assert.ok(Math.abs(ease(.25, 'ease-in-out') + ease(.75, 'ease-in-out') - 1) < .00001);
});
test('custom Bezier inverts x instead of treating time as the curve parameter', () => {
    assert.ok(Math.abs(ease(.5, [.42, 0, 1, 1]) - .315357) < .00001);
    assert.ok(Math.abs(ease(.5, [0, 0, 1, 1]) - .5) < .00001);
});
test('outgoing easing affects numeric interpolation without mutating keyframes', () => {
    const frames = [frame('a', 0, 0, { easing: 'ease-in' }), frame('b', 10, 100)];
    const snapshot = JSON.stringify(frames);
    assert.ok(sample(frames, 5).p1 < 50);
    assert.equal(JSON.stringify(frames), snapshot);
});
test('sidebar parameters retain their own style meanings between different-style keys', () => {
    const frames = [frame('a', 0, 230), frame('b', 5, 1, { values: { styleSelect: '2', p1: 1 } })];
    assert.equal(sample(frames, 4.99).styleSelect, '1');
    assert.equal(sample(frames, 4.99).p1, 230);
    assert.equal(sample(frames, 5).styleSelect, '2');
});
test('different styles dither with outgoing easing and shared continuous zoom', () => {
    const frames = [frame('a', 0, 230, { easing: 'ease-in', values: { styleSelect: '1', p1: 230, zoomSlider: 1 } }),
        frame('b', 4, 2, { values: { styleSelect: '4', p1: 2, zoomSlider: 2 } })];
    const saved = JSON.stringify(frames), scene = sampleScene(frames, 2);
    assert.equal(scene.from.styleSelect, '1'); assert.equal(scene.to.styleSelect, '4');
    assert.equal(scene.from.p1, 230); assert.equal(scene.to.p1, 2);
    assert.equal(scene.mix, ease(.5, 'ease-in'));
    assert.equal(scene.from.zoomSlider, 1 + scene.mix); assert.equal(scene.to.zoomSlider, scene.from.zoomSlider);
    assert.deepEqual(sampleScene(frames, 0), { from: frames[0].values, to: null, mix: 0 });
    assert.deepEqual(sampleScene(frames, 4), { from: frames[1].values, to: null, mix: 0 });
    assert.equal(JSON.stringify(frames), saved);
});
test('scene sampling keeps same-style interpolation, boundaries and empty timelines', () => {
    const frames = [frame('a', 1, 20), frame('b', 3, 40)];
    assert.deepEqual(sampleScene(frames, 2), { from: sample(frames, 2), to: null, mix: 0 });
    assert.equal(sampleScene([], 2), null);
    assert.equal(sampleScene(frames, -2).from.p1, 20); assert.equal(sampleScene(frames, 10).from.p1, 40);
});
test('upsert sorts additions and updates an existing time without duplicating a key', () => {
    const frames = [frame('a', 5, 10)];
    const next = upsert(frames, frame('b', 0, 20));
    assert.deepEqual(next.map(f => f.id), ['b', 'a']);
    const updated = upsert(next, frame('c', 5, 30));
    assert.equal(updated.length, 2); assert.equal(updated[1].id, 'a'); assert.equal(updated[1].values.p1, 30);
    assert.equal(frames[0].values.p1, 10);
});
