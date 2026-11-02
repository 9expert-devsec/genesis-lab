import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXCEL_BEGINNER_LEVELS } from '@/lib/play/levels/excel/beginner';
import {
  chapterProgress,
  currentChapter,
  firstUnpassedLevel,
  isBossUnlocked,
  isChapterUnlocked,
  nextLevelForPlayer,
} from '@/lib/play/game/map';

/**
 * The soft unlock rule behind the /play mission map and the HUD's lock look:
 * CH.1 always open, CH.n opens when CH.n−1 is fully passed, the boss when
 * CH.1–3 are. Run against the real level index, so a chapter that gains or
 * loses a level changes these numbers here first.
 */

const LEVELS = EXCEL_BEGINNER_LEVELS.map(({ id, chapter, order }) => ({ id, chapter, order }));
const passed = (...ids) => Object.fromEntries(ids.map((id) => [id, { stars: 3, xp: 30, passedAt: null }]));
const chapterIds = (c) => LEVELS.filter((l) => l.chapter === c).map((l) => l.id);
const unlocked = (progress) => [1, 2, 3, 4].map((c) => isChapterUnlocked(c, LEVELS, progress));

test('map: empty progress → CH.1 unlocked only; the next level is 1-1', () => {
  assert.deepEqual(unlocked({}), [true, false, false, false]);
  assert.equal(isBossUnlocked(LEVELS, {}), false);
  assert.equal(nextLevelForPlayer(LEVELS, {}), '1-1');
  assert.equal(currentChapter(LEVELS, {}), 1);
  assert.deepEqual(chapterProgress(LEVELS, {}), {
    1: { passed: 0, total: 5 },
    2: { passed: 0, total: 5 },
    3: { passed: 0, total: 5 },
    4: { passed: 0, total: 1 },
  });
});

test('map: CH.2 opens only when EVERY CH.1 level is passed', () => {
  // The row that must go red if the rule loosens to "any level of the previous chapter".
  const fourOfFive = passed('1-1', '1-2', '1-3', '1-4');
  assert.deepEqual(unlocked(fourOfFive), [true, false, false, false], 'four of five CH.1 levels must NOT unlock CH.2');

  const allCh1 = passed(...chapterIds(1));
  assert.deepEqual(unlocked(allCh1), [true, true, false, false]);
  assert.equal(currentChapter(LEVELS, allCh1), 2);
  assert.equal(chapterProgress(LEVELS, allCh1)[1].passed, 5);
});

test('map: the boss opens when CH.1–3 are all passed, not before', () => {
  const ch12 = passed(...chapterIds(1), ...chapterIds(2));
  assert.equal(isBossUnlocked(LEVELS, ch12), false);
  const all3 = passed(...chapterIds(1), ...chapterIds(2), ...chapterIds(3));
  assert.deepEqual(unlocked(all3), [true, true, true, true]);
  assert.equal(nextLevelForPlayer(LEVELS, all3), 'boss');
  assert.equal(currentChapter(LEVELS, passed(...LEVELS.map((l) => l.id))), 4, 'everything passed → the boss is "here", not CH.1');
});

test('map: next level and a chapter\'s first unpassed level skip what is passed', () => {
  const p = passed('1-1', '1-2', '1-4', '2-1');
  assert.equal(nextLevelForPlayer(LEVELS, p), '1-3');
  assert.equal(firstUnpassedLevel(1, LEVELS, p), '1-3');
  assert.equal(firstUnpassedLevel(2, LEVELS, p), '2-2');
  assert.equal(firstUnpassedLevel(1, LEVELS, passed(...chapterIds(1))), '1-1', 'all passed → the chapter\'s first level');
  assert.equal(firstUnpassedLevel(4, LEVELS, {}), 'boss');
  assert.equal(nextLevelForPlayer(LEVELS, passed(...LEVELS.map((l) => l.id))), '1-1', 'all passed → back to 1-1');
});
