import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXCEL_BEGINNER_LEVELS, getLevel } from '@/lib/play/levels/excel/beginner';
import { checkTask } from '@/lib/play/levels/check';
import { validateLevel } from '@/lib/play/levels/schema';

/**
 * Every Excel Beginner level, graded by the real checker: the model and each
 * alternative pass, each listed reject fails for its stated reason, and a
 * typed-in answer fails as no_cell_ref. Boss tasks run in order, each seeing
 * the cells the previous ones filled.
 *
 * The expected values in the level files were computed in advance from the
 * approved level document. A disagreement here is a finding about the engine
 * or the data — report it, do not edit the expected value to match.
 */

const literal = (v) => (typeof v === 'string' ? `="${v}"` : `=${v}`);
const toFilled = (result) => Object.fromEntries(result.cells.map((c) => [c.ref, c.value]));
const show = (r) => JSON.stringify({ reason: r.reason, cells: r.cells.map((c) => [c.ref, c.value]) });

test('the index holds 16 levels in play order with unique ids', () => {
  assert.deepEqual(
    EXCEL_BEGINNER_LEVELS.map((l) => l.id),
    ['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '3-4', '3-5', 'boss'],
  );
});

for (const level of EXCEL_BEGINNER_LEVELS) {
  test(`level ${level.id} ${level.title}: valid, model + alternatives pass, rejects and typed answers fail`, () => {
    assert.deepEqual(validateLevel(level), []);
    let filled = {};
    for (const task of level.tasks) {
      const at = `${level.id}/${task.id}`;
      const model = checkTask(level, task.id, task.model, filled);
      assert.equal(model.pass, true, `${at} model ${task.model}: ${show(model)}`);

      for (const alt of task.alternatives) {
        const r = checkTask(level, task.id, alt, filled);
        assert.equal(r.pass, true, `${at} alternative ${alt}: ${show(r)}`);
      }
      for (const { formula, reason } of task.rejects) {
        const r = checkTask(level, task.id, formula, filled);
        assert.equal(r.pass, false, `${at} reject ${formula} passed`);
        assert.equal(r.reason, reason, `${at} reject ${formula}: ${show(r)}`);
      }
      const typed = checkTask(level, task.id, literal(task.expected[0]), filled);
      assert.equal(typed.pass, false, `${at} typed answer passed`);
      assert.equal(typed.reason, 'no_cell_ref', `${at} typed answer: ${show(typed)}`);

      filled = { ...filled, ...toFilled(model) };
    }
  });
}

test('2-5: =B2*B7 fails as mismatch — filled down, row 3 reads the empty B8', () => {
  const r = checkTask(getLevel('2-5'), 't1', '=B2*B7');
  assert.equal(r.pass, false);
  assert.equal(r.reason, 'mismatch');
  assert.equal(r.cells[0].ok, true);
  assert.deepEqual(r.cells.slice(1).map((c) => c.value), [0, 0, 0]);
});

test('2-1: =B2+B3+B4+B5+B6 gets the right total but fails as must_use', () => {
  const r = checkTask(getLevel('2-1'), 't1', '=B2+B3+B4+B5+B6');
  assert.equal(r.pass, false);
  assert.equal(r.reason, 'must_use');
  assert.equal(r.cells[0].value, 4890);
});
