import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionClassifier, type InputEvent } from '../src/recorder/actions';
import { cropForDisplay, normalizeInRegion, pickElementRect } from '../src/recorder/geometry';
import { createKeyMapper } from '../src/recorder/keymap';

let id = 0;
const down = (t: number, x = 100, y = 100, button = 1): InputEvent => ({ type: 'down', id: ++id, t, x, y, button });
const up = (t: number, x = 100, y = 100, button = 1): InputEvent => ({ type: 'up', id: ++id, t, x, y, button });
const char = (t: number): InputEvent => ({ type: 'key', id: ++id, t, printable: true, combo: null });
const combo = (t: number, c: string, ends = false): InputEvent => ({ type: 'key', id: ++id, t, printable: false, combo: c, ends });
const wheel = (t: number, direction: 'up' | 'down' = 'down'): InputEvent => ({ type: 'wheel', id: ++id, t, x: 50, y: 60, direction });
const run = (events: InputEvent[]) => {
  const c = new ActionClassifier();
  return [...events.flatMap(e => c.push(e)), ...c.finish()];
};

test('single click is emitted with the frame of its mousedown', () => {
  const d = down(0);
  const acts = run([d, up(80)]);
  assert.deepEqual(acts, [{ kind: 'click', frameId: d.id, point: { x: 100, y: 100 } }]);
});

test('two quick clicks at the same spot are one double click using the first frame', () => {
  const d1 = down(0);
  const acts = run([d1, up(60), down(200, 102, 101), up(260, 102, 101)]);
  assert.deepEqual(acts.map(a => a.kind), ['double']);
  assert.equal(acts[0].frameId, d1.id);
});

test('slow second click is two separate clicks', () => {
  assert.deepEqual(run([down(0), up(50), down(900), up(950)]).map(a => a.kind), ['click', 'click']);
});

test('right button emits right click immediately', () => {
  assert.deepEqual(run([down(0, 10, 10, 2), up(40, 10, 10, 2)]).map(a => a.kind), ['right']);
});

test('press, move and release is a drag with the release point', () => {
  const acts = run([down(0, 100, 100), up(500, 300, 220)]);
  assert.equal(acts[0].kind, 'drag');
  assert.deepEqual((acts[0] as { to: unknown }).to, { x: 300, y: 220 });
});

test('clicking then typing becomes one "type" action; later characters are ignored', () => {
  const d = down(0);
  const acts = run([d, up(40), char(500), char(600), char(700), combo(900, 'Enter', true)]);
  assert.deepEqual(acts.map(a => a.kind), ['type', 'key']);
  assert.equal(acts[0].frameId, d.id);
});

test('typing without a click (Tab into a field) is a "type" with no point', () => {
  const acts = run([char(0), char(50)]);
  assert.equal(acts.length, 1);
  assert.equal(acts[0].kind, 'type');
  assert.equal((acts[0] as { point: unknown }).point, null);
});

test('shortcut flushes a pending click first, keeping order', () => {
  assert.deepEqual(run([down(0), up(40), combo(700, 'Ctrl+S')]).map(a => a.kind), ['click', 'key']);
});

test('a burst of wheel events is one scroll step; a later burst is another', () => {
  const acts = run([wheel(0), wheel(100), wheel(200), wheel(2000)]);
  assert.deepEqual(acts.map(a => a.kind), ['scroll', 'scroll']);
});

test('needsFrame skips characters inside a typing session', () => {
  const c = new ActionClassifier();
  c.push(down(0)); c.push(up(40));
  assert.equal(c.needsFrame(char(100)), false); // pending click will be converted, its frame is used
  c.push(char(100));
  assert.equal(c.needsFrame(char(200)), false);
  assert.equal(c.needsFrame(combo(300, 'Ctrl+S')), true);
});

test('normalizeInRegion clips to the recording region', () => {
  const region = { x: 100, y: 100, width: 1000, height: 500 };
  assert.deepEqual(normalizeInRegion({ x: 50, y: 150, width: 100, height: 50 }, region), [0, 0.1, 0.05, 0.1]);
  assert.equal(normalizeInRegion({ x: 0, y: 0, width: 10, height: 10 }, region), null);
});

test('pickElementRect rejects huge containers and rects not containing the click', () => {
  const region = { x: 0, y: 0, width: 1000, height: 1000 };
  const p = { x: 500, y: 500 };
  assert.equal(pickElementRect({ x: 480, y: 490, width: 60, height: 24 }, p, region).fromElement, true);
  assert.equal(pickElementRect({ x: 0, y: 0, width: 900, height: 900 }, p, region).fromElement, false);
  assert.equal(pickElementRect({ x: 0, y: 0, width: 50, height: 50 }, p, region).fromElement, false);
  assert.equal(pickElementRect(null, p, region).rect.width, 80);
});

test('cropForDisplay maps DIP region to video pixels (HiDPI)', () => {
  const crop = cropForDisplay({ x: 100, y: 50, width: 400, height: 300 }, { x: 0, y: 0, width: 1440, height: 900 }, 2880, 1800);
  assert.deepEqual(crop, { sx: 200, sy: 100, sw: 800, sh: 600 });
});

test('key mapper reports only printable flag for characters and names shortcuts', () => {
  const map = createKeyMapper({ A: 30, S: 31, Enter: 28, Ctrl: 29, F8: 66, F9: 67, Comma: 51, Space: 57 });
  const k = (keycode: number, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
    map({ keycode, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  assert.deepEqual(k(30), { printable: true, combo: null, ends: false });
  assert.deepEqual(k(51), { printable: true, combo: null, ends: false });
  assert.equal(k(31, { ctrlKey: true }).combo, 'Ctrl+S');
  assert.equal(k(31, { metaKey: true }).combo, 'Ctrl+S'); // ⌘S == Ctrl+S
  assert.equal(k(28).combo, 'Enter');
  assert.equal(k(28).ends, true);
  assert.deepEqual(k(29, { ctrlKey: true }), { printable: false, combo: null, ends: false });
  assert.equal(k(66, { ctrlKey: true, shiftKey: true }).combo, null); // pause hotkey not recorded
});
