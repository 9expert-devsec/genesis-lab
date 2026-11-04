import { test } from 'node:test';
import assert from 'node:assert/strict';

import { afterMotion } from '@/lib/play/game/motion';

/**
 * The wait in front of MISSION COMPLETE. The element is faked: only
 * getAnimations() is read, and the browser side of it (real CSS animations, the
 * skip keys) is checked by hand against a running level.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function anim(ms, { playState = 'running', endTime = ms } = {}) {
  const a = { playState, effect: { getComputedTiming: () => ({ endTime }) } };
  a.finished = sleep(ms).then(() => {
    a.playState = 'finished';
    return a;
  });
  return a;
}

const element = (...lists) => {
  let i = 0;
  return { getAnimations: () => lists[Math.min(i++, lists.length - 1)] };
};

function track(el, opts = {}) {
  const log = { calls: 0, at: null };
  const start = performance.now();
  const wait = afterMotion(el, {
    hold: 20,
    cap: 400,
    ...opts,
    done: () => {
      log.calls += 1;
      log.at = performance.now() - start;
    },
  });
  return { log, wait };
}

test('waits for the longest animation, then holds', async () => {
  const short = anim(10);
  const long = anim(60);
  const { log } = track({ getAnimations: () => [short, long] });
  await sleep(50);
  assert.equal(log.calls, 0);
  await sleep(60);
  assert.equal(log.calls, 1);
  assert.ok(log.at >= 75, `opened at ${log.at}ms, before the hold ended`);
});

test('nothing animating still holds, and opens once', async () => {
  const { log } = track(element([]));
  await sleep(10);
  assert.equal(log.calls, 0);
  await sleep(40);
  assert.equal(log.calls, 1);
});

test('re-reads the list: an animation started by another is waited for too', async () => {
  const second = anim(70);
  const { log } = track(element([anim(10)], [second], []));
  await sleep(60);
  assert.equal(log.calls, 0);
  await sleep(50);
  assert.equal(log.calls, 1);
});

test('loops, paused and already-finished (filled) animations do not hold it open', async () => {
  const loop = anim(1000, { endTime: Infinity });
  const paused = anim(1000, { playState: 'paused' });
  const filled = anim(0, { playState: 'finished' });
  const { log } = track({ getAnimations: () => [loop, paused, filled] });
  await sleep(50);
  assert.equal(log.calls, 1);
});

test('the cap opens it while an animation is still running', async () => {
  const { log } = track(element([anim(500)]), { cap: 40 });
  await sleep(70);
  assert.equal(log.calls, 1);
  await sleep(460);
  assert.equal(log.calls, 1);
});

test('a rejected animation (cancelled) does not stall the wait', async () => {
  const cancelled = { playState: 'running', effect: anim(0).effect, finished: Promise.reject(new DOMException('', 'AbortError')) };
  const { log } = track(element([cancelled], []));
  await sleep(50);
  assert.equal(log.calls, 1);
});

test('skip opens at once and only once', async () => {
  const { log, wait } = track(element([anim(100)]));
  wait.skip();
  wait.skip();
  assert.equal(log.calls, 1);
  await sleep(140);
  assert.equal(log.calls, 1);
});

test('cancel means it never fires', async () => {
  const { log, wait } = track(element([anim(10)]), { cap: 30 });
  wait.cancel();
  await sleep(70);
  assert.equal(log.calls, 0);
});
