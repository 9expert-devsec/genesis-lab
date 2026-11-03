import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXCEL_BEGINNER_LEVELS, getLevel } from '@/lib/play/levels/excel/beginner';
import { checkTask } from '@/lib/play/levels/check';
import { validateLevel } from '@/lib/play/levels/schema';
import { platesFor, rateRefs, sceneFor, sceneRows } from '@/lib/play/game/scene';

/**
 * The simulator scene card: which levels get one, 2-5's broken-reference
 * detection when the player forgets $, and 1-4's plate cap.
 */

test('scene: routed by the level `scene` field — CH.1 and 2-5 only, the rest keep the scoreboard', () => {
  const routed = Object.fromEntries(EXCEL_BEGINNER_LEVELS.map((l) => [l.id, sceneFor(l)]));
  assert.deepEqual(
    Object.entries(routed).filter(([, s]) => s),
    [['1-1', 'toppings'], ['1-2', 'checkout'], ['1-3', 'change'], ['1-4', 'split'], ['1-5', 'delivery'], ['2-5', 'vat']],
  );
  // Unknown kinds fall back to the scoreboard at runtime and fail validation.
  const bad = { ...getLevel('1-1'), scene: 'aquarium' };
  assert.equal(sceneFor(bad), null);
  assert.ok(validateLevel(bad).some((p) => p.startsWith('scene "aquarium"')));
  assert.equal(sceneFor({ ...getLevel('2-1') }), null);
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
