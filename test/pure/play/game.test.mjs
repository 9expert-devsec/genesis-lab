import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getLevel } from '@/lib/play/levels/excel/beginner';
import { maxStarsFor, starsFor, xpFor } from '@/lib/play/game/stars';
import { hintsForTask, maskFormula } from '@/lib/play/game/hints';
import { PROGRESS_KEY, loadProgress, progressReducer, saveProgress, totalStars } from '@/lib/play/game/progress';
import { normalizeFormula, sameFormula } from '@/lib/play/game/normalize';

/**
 * 9Expert Play game logic: stars, the hint ladder, stored progress and formula
 * normalisation. The rows that would break first if the logic regressed are
 * named in their messages — 2-1's first hint must name SUM, a lower replay
 * must not overwrite a better score, a corrupt stored value reads as empty.
 */

const memoryStorage = (initial) => {
  const data = new Map(initial ? [[PROGRESS_KEY, initial]] : []);
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};
const throwingStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

test('stars: 3, −1 per hint, floor 1; XP is stars × 10; max counts every level', () => {
  assert.deepEqual([0, 1, 2, 3, 7].map(starsFor), [3, 2, 1, 1, 1]);
  assert.equal(starsFor(undefined), 3);
  assert.deepEqual([3, 2, 1].map(xpFor), [30, 20, 10]);
  assert.equal(maxStarsFor(new Array(16).fill({})), 48);
});

test('hints: three steps for a single-cell, a fill-down and a mustUse level', () => {
  const single = hintsForTask(getLevel('2-2').tasks[0]);
  assert.equal(single.length, 3);
  assert.match(single[0].text, /ช่อง B7 สูตรต้องขึ้นต้นด้วย =/);
  assert.doesNotMatch(single[0].text, /ต้องใช้/, '2-2 has no mustUse, so hint 1 must not demand a function');
  assert.equal(single[1].formula, '=___(B2:B6)');
  assert.equal(single[2].formula, '=AVERAGE(B2:B6)');

  const fill = hintsForTask(getLevel('1-2').tasks[0]);
  assert.match(fill[0].text, /ช่อง D2/);
  assert.match(fill[0].text, /D2:D6/);
  assert.equal(fill[1].formula, '=B2 _ C2');
  assert.equal(fill[2].formula, '=B2*C2');

  const mustUse = hintsForTask(getLevel('2-1').tasks[0]);
  assert.match(mustUse[0].text, /ด่านนี้ต้องใช้ SUM/, '2-1 hint 1 must name SUM');
  assert.equal(mustUse[1].formula, '=___(B2:B6)');
  assert.equal(mustUse[2].formula, '=SUM(B2:B6)');

  // The mask keeps refs and structure, hides operators, numbers, text and names.
  assert.equal(maskFormula('=IF(B2<10,"สั่งเพิ่ม","พอ")'), '=___(B2 _ _, "…", "…")');
  assert.equal(maskFormula('=(B2+C2)*D2'), '=(B2 _ C2) _ D2');
  assert.equal(maskFormula('=B2*$B$7'), '=B2 _ $B$7');
  assert.doesNotMatch(maskFormula(getLevel('3-5').tasks[0].model), /Gold|1000|>=/);
});

test('progress: best stars win, totals sum, storage that throws or holds junk reads as empty', () => {
  let p = progressReducer({}, { type: 'pass', levelId: '1-1', stars: 2, passedAt: 't1' });
  p = progressReducer(p, { type: 'pass', levelId: '1-1', stars: 1, passedAt: 't2' });
  assert.deepEqual(p['1-1'], { stars: 2, xp: 20, passedAt: 't1' }, 'a lower replay must not overwrite a better score');
  p = progressReducer(p, { type: 'pass', levelId: '1-1', stars: 3, passedAt: 't3' });
  assert.deepEqual(p['1-1'], { stars: 3, xp: 30, passedAt: 't3' });
  p = progressReducer(p, { type: 'pass', levelId: 'boss', stars: 1, passedAt: 't4' });
  assert.equal(totalStars(p, [{ id: '1-1' }, { id: '1-2' }, { id: 'boss' }]), 4);
  assert.equal(progressReducer(p, { type: 'noop' }), p);

  const store = memoryStorage();
  assert.equal(saveProgress(p, store), true);
  assert.deepEqual(loadProgress(store), p);

  assert.deepEqual(loadProgress(memoryStorage('{not json')), {}, 'corrupt storage → empty progress');
  assert.deepEqual(loadProgress(memoryStorage('[1,2]')), {});
  assert.deepEqual(
    loadProgress(memoryStorage(JSON.stringify({ '1-1': { stars: 9 }, '1-2': { stars: 2, passedAt: 'x' }, '1-3': 'gold' }))),
    { '1-2': { stars: 2, xp: 20, passedAt: 'x' } },
  );
  assert.deepEqual(loadProgress(memoryStorage()), {});
  assert.deepEqual(loadProgress(throwingStorage), {});
  assert.equal(saveProgress(p, throwingStorage), false);
  assert.deepEqual(loadProgress(null), {});
});

test('normalize: case and spaces outside strings do not matter, text inside does', () => {
  const rows = [
    ['=sum( b2:b6 )', '=SUM(B2:B6)', true],
    ['= b2 * $b$7', '=B2*$B$7', true],
    ['=IF(B2="เย็น", C2+10, C2)', '=if(b2="เย็น",c2+10,c2)', true],
    ['=IF(B2="เย็น ",C2+10,C2)', '=IF(B2="เย็น",C2+10,C2)', false],
    ['=B2*$B$7', '=B2*B$7', false],
    ['=C2*B2', '=B2*C2', false],
  ];
  for (const [a, b, same] of rows) {
    assert.equal(sameFormula(a, b), same, `${a} vs ${b}`);
  }
  assert.equal(normalizeFormula(' =average( B2:b6 ) '), '=AVERAGE(B2:B6)');
});
