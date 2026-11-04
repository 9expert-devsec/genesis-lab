import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXCEL_BEGINNER_LEVELS, getLevel } from '@/lib/play/levels/excel/beginner';
import { checkTask } from '@/lib/play/levels/check';
import { validateLevel } from '@/lib/play/levels/schema';
import {
  answerState,
  bossGoal,
  bossSteps,
  crateCount,
  dataRows,
  meetsThreshold,
  orderCell,
  platesFor,
  podiumTags,
  rateRefs,
  receiptScale,
  sceneConfig,
  sceneFor,
  sceneRows,
  stackCoins,
  statusTag,
  tierLabel,
  tierPlacement,
  tierRange,
  zeroDay,
} from '@/lib/play/game/scene';

/**
 * The simulator scene card: which levels get one, 2-5's broken-reference
 * detection when the player forgets $, 1-4's plate cap, 3-5's placement by the
 * player's own result, the boss goal bar, CH.2's data scenes, and thresholds
 * read from config.
 */

test('scene: routed by the level `scene` field — every level has one; no scene keeps the scoreboard', () => {
  const routed = Object.fromEntries(EXCEL_BEGINNER_LEVELS.map((l) => [l.id, sceneFor(l)]));
  assert.deepEqual(
    Object.entries(routed),
    [
      ['1-1', 'toppings'], ['1-2', 'checkout'], ['1-3', 'change'], ['1-4', 'split'], ['1-5', 'delivery'],
      ['2-1', 'tipjar'], ['2-2', 'average'], ['2-3', 'podium'], ['2-4', 'spike'], ['2-5', 'vat'],
      ['3-1', 'stock'], ['3-2', 'receipts'], ['3-3', 'discount'], ['3-4', 'iced'], ['3-5', 'tiers'], ['boss', 'boss'],
    ],
  );
  // Unknown kinds fall back to the scoreboard at runtime and fail validation.
  const bad = { ...getLevel('1-1'), scene: 'aquarium' };
  assert.equal(sceneFor(bad), null);
  assert.ok(validateLevel(bad).some((p) => p.startsWith('scene "aquarium"')));
  // A configured kind is refused without its parameters.
  const { threshold, ...rest } = getLevel('3-2').scene;
  assert.equal(threshold, 200);
  assert.ok(validateLevel({ ...getLevel('3-2'), scene: rest }).some((p) => p.includes('missing threshold')));
  assert.equal(sceneFor({ ...getLevel('2-1'), scene: undefined }), null);
  // A data scene needs a real range, and answers single cells.
  const sum = getLevel('2-1');
  assert.deepEqual(validateLevel(sum), []);
  assert.ok(validateLevel({ ...sum, scene: { ...sum.scene, data: 'nope' } }).some((p) => p.includes('data is not a range')));
  const filled = { ...sum, tasks: [{ ...sum.tasks[0], fill: 'B7:B7' }] };
  assert.ok(validateLevel(filled).some((p) => p.includes('single cells')));
});

test('scene 2-5: =B2*B7 filled down is caught per row from the fill-down, =B2*$B$7 is not', () => {
  const level = getLevel('2-5');
  const run = (formula) => {
    const { cells } = checkTask(level, 't1', formula);
    const results = Object.fromEntries(cells.map((c) => [c.ref, { value: c.value, ok: c.ok }]));
    const rows = sceneRows(level, results);
    return { rows, refs: rateRefs(formula, rows, { lockCell: 'B7', sheet: level.sheet }) };
  };

  const broken = run('=B2*B7');
  assert.deepEqual(broken.refs.map((r) => r.cell), ['B7', 'B8', 'B9', 'B10']);
  assert.deepEqual(broken.refs.map((r) => r.broken), [false, true, true, true]);
  assert.equal(broken.refs[1].formula, '=B3*B8');
  assert.equal(broken.refs[1].empty, true);
  assert.deepEqual(broken.rows.map((r) => r.state), ['match', 'error', 'error', 'error']);
  assert.equal(broken.rows[1].value, 0);

  const locked = run('=B2*$B$7');
  assert.deepEqual(locked.refs.map((r) => r.text), ['$B$7', '$B$7', '$B$7', '$B$7']);
  assert.ok(locked.refs.every((r) => !r.broken));
  assert.ok(locked.rows.every((r) => r.state === 'match'));
  // Order of the operands and a row-only lock do not matter.
  assert.ok(run('=$B$7*B2').refs.every((r) => r.cell === 'B7' && !r.broken));
  assert.ok(run('=B2*B$7').refs.every((r) => r.text === 'B$7' && !r.broken));
});

test('scene 1-4: plates cap at 3 and show ×n for a larger group', () => {
  assert.deepEqual(platesFor(2), { shown: 2, overflow: null });
  assert.deepEqual(platesFor(3), { shown: 3, overflow: null });
  assert.deepEqual(platesFor(5), { shown: 3, overflow: 5 });
  // Against the level data: group D has 5 people.
  const level = getLevel('1-4');
  assert.equal(platesFor(level.sheet.C5).overflow, 5);
});

/** The rows a formula produces, through the same checker and result shape the grid uses. */
function ranRows(level, formula) {
  const { cells } = checkTask(level, level.tasks[0].id, formula);
  return sceneRows(level, Object.fromEntries(cells.map((c) => [c.ref, { value: c.value, ok: c.ok }])));
}

test('scene 3-5: a customer stands in the zone their result cell names, wrong or right', () => {
  const level = getLevel('3-5');
  const config = sceneConfig(level);
  const ids = (rows) => rows.map((r) => r.index + 1);

  const right = tierPlacement(ranRows(level, level.tasks[0].model), config);
  assert.deepEqual(right.map(ids), [[1, 4], [3], [2, 5]]);

  // > instead of >=: customer 4 (exactly 1000) drops to Silver and is red there.
  const off = ranRows(level, '=IF(B2>1000,"Gold",IF(B2>=500,"Silver","Member"))');
  const placed = tierPlacement(off, config);
  assert.deepEqual(placed.map(ids), [[1], [3, 4], [2, 5]]);
  assert.equal(off[3].state, 'error');
  assert.ok(placed[1].some((r) => r.index === 3 && r.state === 'error'));

  // A result naming no tier stands nowhere; a row not yet run is the answer's ghost.
  const nowhere = tierPlacement(ranRows(level, '=IF(B2>=1000,"Gold","Bronze")'), config);
  assert.deepEqual(nowhere.map(ids), [[1, 4], [], []]);
  assert.deepEqual(tierPlacement(sceneRows(level, {}), config).map(ids), [[1, 4], [3], [2, 5]]);
});

test('scene boss: the goal bar is the matched step-1 sum before step 2 passes, its result after', () => {
  const level = getLevel('boss');
  const { cells } = checkTask(level, 't1', '=B2*C2');
  const results = Object.fromEntries(cells.slice(0, 2).map((c) => [c.ref, { value: c.value, ok: c.ok }]));

  // Two of four rows matched during step 1.
  const midway = sceneRows(level, results);
  const before = bossGoal(level, midway, results, { taskIndex: 0, complete: false });
  assert.equal(before.value, 360 + 260);
  assert.deepEqual(bossSteps(level, { taskIndex: 0, complete: false }), ['current', 'shadow', 'shadow']);

  // Step 2 active: still the rows, even with a wrong sum on the grid.
  for (const c of cells) results[c.ref] = { value: c.value, ok: c.ok };
  results.D6 = { value: 620, ok: false };
  assert.equal(bossGoal(level, sceneRows(level, results), results, { taskIndex: 1, complete: false }).value, 1030);

  // Step 2 passed: its own result, scaled so the target sits at targetAt.
  results.D6 = { value: 999, ok: true };
  const after = bossGoal(level, sceneRows(level, results), results, { taskIndex: 2, complete: false });
  assert.equal(after.value, 999);
  assert.ok(Math.abs(after.fill - 0.8991) < 1e-9);
  assert.deepEqual(bossSteps(level, { taskIndex: 2, complete: false }), ['match', 'match', 'current']);
  assert.deepEqual(bossSteps(level, { taskIndex: 2, complete: true }), ['match', 'match', 'match']);

  // The bar never runs past its end.
  results.D6 = { value: 5000, ok: true };
  assert.equal(bossGoal(level, sceneRows(level, results), results, { taskIndex: 2, complete: true }).fill, 1);
});

/** The answers a level's tasks produce, as the card reads them from `results`. */
function ranAnswers(level, formulas) {
  const results = {};
  level.tasks.forEach((t, i) => {
    if (!formulas[i]) return;
    for (const c of checkTask(level, t.id, formulas[i]).cells) results[c.ref] = { value: c.value, ok: c.ok };
  });
  return level.tasks.map((t) => answerState(results, t.anchor));
}

test('scene range bar: follows the rows the ran formula references, the data range before a run', () => {
  const level = getLevel('2-1');
  const inRange = (formula) => dataRows(level, formula).filter((r) => r.inRange).map((r) => r.row);

  assert.deepEqual(inRange(''), [2, 3, 4, 5, 6]);
  assert.deepEqual(inRange('=SUM(B2:B6)'), [2, 3, 4, 5, 6]);
  assert.deepEqual(inRange('=SUM(B2:B5)'), [2, 3, 4, 5]);
  // Any way of naming the cells counts, and a gap stays a gap.
  assert.deepEqual(inRange('=SUM($B$3:$B$4)'), [3, 4]);
  assert.deepEqual(inRange('=B2+B3+B6'), [2, 3, 6]);
  // A formula that reaches none of the data covers no row.
  assert.deepEqual(inRange('=SUM(C2:C6)'), []);
  // Rows are the input data.
  assert.deepEqual(dataRows(level, '').map((r) => [r.label, r.value]), [['จ.', 1240], ['อ.', 980], ['พ.', 1560], ['พฤ.', 0], ['ศ.', 1110]]);
  assert.deepEqual(dataRows(level, '').map((r) => stackCoins(r.value, level.scene)), [6, 5, 8, 0, 6]);
  assert.equal(stackCoins(9000, level.scene), 8);
});

test('scene 2-2: the 0-day note appears only on a wrong answer', () => {
  const level = getLevel('2-2');
  const rows = dataRows(level, '');
  const note = (formula) => zeroDay(rows, ranAnswers(level, [formula])[0]);

  assert.equal(zeroDay(rows, answerState({}, 'B7')), null);
  assert.equal(zeroDay(rows, answerState({}, 'B7', { running: true })), null);
  assert.equal(note(level.tasks[0].model), null);
  assert.equal(note('=SUM(B2:B6)/5'), null);
  // Dividing by 4 skips the 0 day: the note points at Thursday.
  const [wrong] = ranAnswers(level, ['=SUM(B2:B6)/4']);
  assert.equal(wrong.value, 1222.5);
  assert.equal(wrong.state, 'error');
  assert.equal(note('=SUM(B2:B6)/4').label, 'พฤ.');
});

test('scene 2-3: MAX and MIN sit on the stack equal to the player\'s value, or nowhere', () => {
  const level = getLevel('2-3');
  const rows = dataRows(level, '');
  const tags = (...formulas) => {
    const answers = ranAnswers(level, formulas);
    const { max, min } = podiumTags(rows, answers);
    return { max: max?.label ?? null, min: min?.label ?? null, states: answers.map((a) => a.state) };
  };

  assert.deepEqual(tags(), { max: null, min: null, states: ['shadow', 'shadow'] });
  // Step 1 done, step 2 not run: MAX stands alone.
  assert.deepEqual(tags('=MAX(B2:B6)'), { max: 'พ.', min: null, states: ['match', 'shadow'] });
  assert.deepEqual(tags('=MAX(B2:B6)', '=MIN(B2:B6)'), { max: 'พ.', min: 'พฤ.', states: ['match', 'match'] });
  // A wrong range still lands on a real day: tagged there, the total goes red.
  assert.deepEqual(tags('=MAX(B2:B3)', '=MIN(B2:B3)'), { max: 'จ.', min: 'อ.', states: ['error', 'error'] });
  // A value equal to no day gets no tag.
  assert.deepEqual(tags('=MAX(B2:B6)+1', '=MIN(B2:B6)+1'), { max: null, min: null, states: ['error', 'error'] });
});

test('scene 2-4: badges follow the cell type from the engine, not the answer', () => {
  const level = getLevel('2-4');
  const kinds = (lvl) => dataRows(lvl, '').map((r) => orderCell(lvl, r.ref));

  assert.deepEqual(kinds(level), ['number', 'number', 'text', 'number', 'blank']);
  // The player's answer changes nothing about what COUNT counts.
  assert.equal(ranAnswers(level, ['=COUNT(B2:B3)'])[0].value, 2);
  assert.deepEqual(dataRows(level, '=COUNT(B2:B3)').map((r) => orderCell(level, r.ref)), kinds(level));
  // The cell's type does.
  const edited = { ...level, sheet: { ...level.sheet, B4: 7, B2: 'ยกเลิก' } };
  assert.deepEqual(kinds(edited), ['text', 'number', 'number', 'number', 'blank']);
});

test('scene config: change a parameter in a fixture and the scene changes with it', () => {
  // 3-2: at 200 the 200 bill touches the line; at 250 it and the 240 bill do not.
  const receipts = sceneConfig(getLevel('3-2'));
  assert.equal(meetsThreshold(200, receipts), true);
  assert.equal(meetsThreshold(200, { ...receipts, threshold: 250 }), false);
  const line = (config) => receiptScale([180, 240, 200, 95, 320], config, 120).line;
  assert.equal(line(receipts), 75);
  assert.equal(line({ ...receipts, threshold: 160 }), 60);

  // 3-1: the crate unit and cap.
  const stock = sceneConfig(getLevel('3-1'));
  assert.equal(crateCount(12, stock), 2);
  assert.equal(crateCount(30, stock), 4);
  assert.equal(crateCount(12, { ...stock, crateUnit: 4 }), 3);
  assert.equal(crateCount(30, { ...stock, crateMax: 3 }), 3);

  // 3-1: a tag's colour meaning is the config's.
  const row = { state: 'match', value: 'พอ' };
  assert.equal(statusTag(row, stock).meaning, 'ok');
  assert.equal(statusTag(row, { ...stock, tags: { พอ: 'lime' } }).meaning, 'lime');

  // 3-5: the range text follows the zone minimums.
  const tiers = sceneConfig(getLevel('3-5'));
  assert.equal(tierRange(800, tiers), 'อยู่ระหว่าง 500–999');
  const lower = { zones: tiers.zones.map((z) => (z.value === 'Silver' ? { ...z, min: 700 } : z)) };
  assert.equal(tierRange(800, lower), 'อยู่ระหว่าง 700–999');
  // Labels read the way the player types them; the engine does not accept ≥.
  assert.deepEqual([0, 1, 2].map((i) => tierLabel(i, tiers)), ['>= 1000', '>= 500', '< 500']);

  // Boss: the same amount fills less of the bar against a higher target.
  const boss = getLevel('boss');
  const results = { D6: { value: 1000, ok: true } };
  assert.ok(Math.abs(bossGoal(boss, [], results, { taskIndex: 2, complete: false }).fill - 0.9) < 1e-9);
  const higher = { ...boss, scene: { ...boss.scene, target: 2000 } };
  assert.ok(Math.abs(bossGoal(higher, [], results, { taskIndex: 2, complete: false }).fill - 0.45) < 1e-9);
});
