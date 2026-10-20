import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { GameLifecycle } from '../src/shared/GameLifecycle.ts';

let frames;
let timeouts;
let intervals;
let audioContexts;
let sequence;

beforeEach(() => {
  frames = new Map();
  timeouts = new Map();
  intervals = new Map();
  audioContexts = [];
  sequence = 0;
  globalThis.window = {
    requestAnimationFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback) => {
      timeouts.set(++sequence, callback);
      return sequence;
    },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (callback) => {
      intervals.set(++sequence, callback);
      return sequence;
    },
    clearInterval: (id) => intervals.delete(id),
  };
  globalThis.AudioContext = class {
    closed = false;

    constructor() {
      audioContexts.push(this);
    }

    close() {
      this.closed = true;
      return Promise.resolve();
    }
  };
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.AudioContext;
});

test('unmount releases timers, animation frames, listeners, and audio', () => {
  const lifecycle = new GameLifecycle();
  const target = new EventTarget();
  let received = 0;
  lifecycle.listen(target, 'click', () => received++);
  lifecycle.requestAnimationFrame(() => assert.fail('Unmounted frame ran'));
  lifecycle.setTimeout(() => assert.fail('Unmounted timeout ran'), 100);
  lifecycle.setInterval(() => assert.fail('Unmounted interval ran'), 100);
  lifecycle.createAudioContext();

  target.dispatchEvent(new Event('click'));
  assert.equal(received, 1);
  lifecycle.dispose();
  lifecycle.dispose();
  target.dispatchEvent(new Event('click'));

  assert.equal(received, 1);
  assert.equal(frames.size + timeouts.size + intervals.size, 0);
  assert.equal(audioContexts[0].closed, true);
});

test('a queued callback cannot restart an animation after disposal', () => {
  const lifecycle = new GameLifecycle();
  let calls = 0;
  lifecycle.requestAnimationFrame(() => calls++);
  const queued = [...frames.values()][0];
  lifecycle.dispose();
  queued(16);
  assert.equal(calls, 0);
  assert.equal(
    lifecycle.requestAnimationFrame(() => calls++),
    0,
  );
  assert.equal(
    lifecycle.setTimeout(() => calls++),
    0,
  );
  assert.equal(
    lifecycle.setInterval(() => calls++),
    0,
  );
  assert.equal(frames.size + timeouts.size + intervals.size, 0);
});

test('completed frames may schedule the next frame while mounted', () => {
  const lifecycle = new GameLifecycle();
  let calls = 0;
  lifecycle.requestAnimationFrame(() => {
    calls++;
    lifecycle.requestAnimationFrame(() => calls++);
  });
  const [id, callback] = [...frames.entries()][0];
  frames.delete(id);
  callback(16);
  assert.equal(calls, 1);
  assert.equal(frames.size, 1);
  lifecycle.dispose();
  assert.equal(frames.size, 0);
});
