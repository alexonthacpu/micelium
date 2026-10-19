const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ease, sample, upsert } = require('../js/animation-core.js');
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
test('style changes switch at the next keyframe without blending incompatible parameters', () => {
    const frames = [frame('a', 0, 230), frame('b', 5, 1, { values: { styleSelect: '2', p1: 1 } })];
    assert.equal(sample(frames, 4.99).styleSelect, '1');
    assert.equal(sample(frames, 4.99).p1, 230);
    assert.equal(sample(frames, 5).styleSelect, '2');
});
test('upsert sorts additions and updates an existing time without duplicating a key', () => {
    const frames = [frame('a', 5, 10)];
    const next = upsert(frames, frame('b', 0, 20));
    assert.deepEqual(next.map(f => f.id), ['b', 'a']);
    const updated = upsert(next, frame('c', 5, 30));
    assert.equal(updated.length, 2); assert.equal(updated[1].id, 'a'); assert.equal(updated[1].values.p1, 30);
    assert.equal(frames[0].values.p1, 10);
});
