import {
  evaluateFormula,
  expandRange,
  formulaHasCellRef,
  formulaUsesFunction,
  isError,
  parse,
  shiftFormula,
} from '../engine/index.js';

/**
 * Grade one task. The player's formula goes into the anchor and is filled down
 * over `task.fill`; each filled cell is then visible to the next one, as in a
 * real fill. `filledSoFar` carries earlier tasks' results (boss step 2 sums the
 * D2:D5 that step 1 produced).
 *
 * reason, first match wins: 'error' (not a formula / will not parse) →
 * 'no_cell_ref' (a typed-in answer) → 'must_use' → 'error' (a filled cell
 * evaluates to an error value) → 'mismatch'. Cells are computed whenever the formula parses, so the UI can
 * show what the player's formula did even when it is refused.
 */

const TOLERANCE = 1e-9;

export function valuesEqual(value, expected) {
  if (typeof expected === 'number') {
    return typeof value === 'number' && Math.abs(value - expected) <= TOLERANCE;
  }
  if (typeof expected === 'string') {
    return typeof value === 'string' && value.trim() === expected.trim();
  }
  return value === expected;
}

export function taskCells(task) {
  return task.fill ? expandRange(task.fill) : [String(task.anchor).toUpperCase()];
}

export function checkTask(level, taskId, formula, filledSoFar = {}) {
  const task = level?.tasks?.find((t) => t.id === taskId);
  if (!task) return { pass: false, cells: [], reason: 'error' };
  const text = String(formula ?? '').trim();
  if (parse(text).error) return { pass: false, cells: [], reason: 'error' };

  const sheet = { ...level.sheet, ...filledSoFar };
  const cells = taskCells(task).map((ref, i) => {
    const value = evaluateFormula(shiftFormula(text, i), sheet, { anchor: ref });
    sheet[ref] = value;
    const expected = task.expected[i];
    return { ref, value, expected, ok: !isError(value) && valuesEqual(value, expected) };
  });

  let reason = null;
  if (!formulaHasCellRef(text)) reason = 'no_cell_ref';
  else if ((task.mustUse || []).some((fn) => !formulaUsesFunction(text, fn))) reason = 'must_use';
  else if (cells.some((c) => isError(c.value))) reason = 'error';
  else if (cells.some((c) => !c.ok)) reason = 'mismatch';
  return { pass: reason === null, cells, reason };
}
