import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getLevel } from '@/lib/play/levels/excel/beginner';
import { getLevel as getIntermediate } from '@/lib/play/levels/excel/intermediate';
import { maxStarsFor, starsFor, xpFor } from '@/lib/play/game/stars';
import { hintsForTask, maskFormula } from '@/lib/play/game/hints';
import { LEGACY_PROGRESS_KEY, PROGRESS_KEY, loadProgress, migrateV1, progressReducer, saveProgress, seriesProgress, totalStars } from '@/lib/play/game/progress';
import { failureMessage } from '@/lib/play/game/view';
import { displayFormula, normalizeFormula, sameFormula } from '@/lib/play/game/normalize';

/**
 * 9Expert Play game logic: stars, the hint ladder, stored progress and formula
 * normalisation. The rows that would break first if the logic regressed are
 * named in their messages — 2-1's first hint must name SUM, a lower replay
 * must not overwrite a better score, a corrupt stored value reads as empty.
 */

const memoryStorage = (initial, key = PROGRESS_KEY) => {
  const data = new Map(initial ? [[key, initial]] : []);
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
  assert.doesNotMatch(maskFormula(getIntermediate('1-5').tasks[0].model), /Gold|1000|>=/);
});

test('progress: best stars win, totals sum, storage that throws or holds junk reads as empty', () => {
  const pass = (state, levelId, stars, passedAt, series = 'beginner') => progressReducer(state, { type: 'pass', series, levelId, stars, passedAt });
  let p = pass({}, '1-1', 2, 't1');
  p = pass(p, '1-1', 1, 't2');
  assert.deepEqual(p.beginner['1-1'], { stars: 2, xp: 20, passedAt: 't1' }, 'a lower replay must not overwrite a better score');
  p = pass(p, '1-1', 3, 't3');
  assert.deepEqual(p.beginner['1-1'], { stars: 3, xp: 30, passedAt: 't3' });
  p = pass(p, 'boss', 1, 't4');
  assert.equal(totalStars(seriesProgress(p, 'beginner'), [{ id: '1-1' }, { id: '1-2' }, { id: 'boss' }]), 4);
  assert.equal(progressReducer(p, { type: 'noop' }), p);

  // Ids repeat across tiers; a pass in one must not show as a pass in the other.
  const both = pass(p, '1-1', 1, 't5', 'intermediate');
  assert.equal(both.beginner['1-1'].stars, 3);
  assert.equal(both.intermediate['1-1'].stars, 1);
  assert.deepEqual(seriesProgress(p, 'intermediate'), {});

  const store = memoryStorage();
  assert.equal(saveProgress(p, store), true);
  assert.deepEqual(loadProgress(store), p);

  assert.deepEqual(loadProgress(memoryStorage('{not json')), {}, 'corrupt storage → empty progress');
  assert.deepEqual(loadProgress(memoryStorage('[1,2]')), {});
  assert.deepEqual(
    loadProgress(memoryStorage(JSON.stringify({ beginner: { '1-1': { stars: 9 }, '1-2': { stars: 2, passedAt: 'x' }, '1-3': 'gold' }, junk: 4 }))),
    { beginner: { '1-2': { stars: 2, xp: 20, passedAt: 'x' } } },
  );
  assert.deepEqual(loadProgress(memoryStorage()), {});
  assert.deepEqual(loadProgress(throwingStorage), {});
  assert.equal(saveProgress(p, throwingStorage), false);
  assert.deepEqual(loadProgress(null), {});
});

test('progress v1: the IF levels keep their stars in Intermediate, never as Beginner CH.3', () => {
  const entry = (stars) => ({ stars, xp: stars * 10, passedAt: 't' });
  const v1 = { '1-1': entry(3), '2-5': entry(2), '3-1': entry(3), '3-5': entry(1), boss: entry(2) };
  const migrated = migrateV1(v1);
  assert.deepEqual(migrated.beginner, { '1-1': entry(3), '2-5': entry(2) });
  assert.deepEqual(migrated.intermediate, { '1-1': entry(3), '1-5': entry(1) });
  assert.deepEqual(migrated.retired, { boss: entry(2) });
  assert.equal(migrated.beginner['3-1'], undefined, 'an old IF pass must not clear the new text level');
  assert.equal(migrated.beginner.boss, undefined, 'the old boss must not clear the new one');

  const store = memoryStorage(JSON.stringify(v1), LEGACY_PROGRESS_KEY);
  assert.deepEqual(loadProgress(store), migrated, 'no v2 value yet: v1 is read through the migration');
  assert.equal(store.data.has(PROGRESS_KEY), false, 'reading writes nothing');
  saveProgress(progressReducer(loadProgress(store), { type: 'pass', series: 'beginner', levelId: '3-1', stars: 1, passedAt: 'n' }), store);
  assert.equal(loadProgress(store).beginner['3-1'].stars, 1, 'once v2 exists it wins');
  assert.equal(loadProgress(store).intermediate['1-1'].stars, 3);
  assert.equal(store.data.get(LEGACY_PROGRESS_KEY), JSON.stringify(v1), 'v1 is left in place');
  assert.deepEqual(loadProgress(memoryStorage('{not json', LEGACY_PROGRESS_KEY)), {});
});

test('failure copy: a typed-in answer gets text wording on a text level, number wording otherwise', () => {
  const typed = { reason: 'no_cell_ref', cells: [] };
  assert.match(failureMessage(typed, '="LAT"', getLevel('3-1').tasks[0]).headline, /พิมพ์คำตอบตรงๆ/);
  assert.match(failureMessage(typed, '=60', getLevel('1-2').tasks[0]).headline, /พิมพ์ตัวเลขตรงๆ/);
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

  // The display form for the input on Run: names upper-cased, spacing and quoted text kept.
  assert.equal(displayFormula('=b2+c2'), '=B2+C2');
  assert.equal(displayFormula(' =sum( b2:b6 ) '), '=SUM( B2:B6 )');
  assert.equal(displayFormula('=if(b2="เย็น abc",c2+10,c2)'), '=IF(B2="เย็น abc",C2+10,C2)');
  assert.equal(displayFormula('=$b$7*b2'), '=$B$7*B2');
  assert.equal(displayFormula('=b2+"x'), '=b2+"x', 'untokenizable input is left alone');
});
