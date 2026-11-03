import { shiftFormula } from '../engine/index.js';
import { taskCells } from '../levels/check.js';
import { formulaRefSpans } from './view.js';

/**
 * Pure helpers behind the simulator scene card that replaces the scoreboard on
 * the levels whose data carries a `scene`. No React here.
 */

/** Scene kinds a level's `scene` field may name. */
export const SCENE_KINDS = ['toppings', 'checkout', 'change', 'split', 'delivery', 'vat'];

/** The kind to render for a level, or null for the plain scoreboard. */
export function sceneFor(level) {
  return SCENE_KINDS.includes(level?.scene) ? level.scene : null;
}

/** Drink colours per menu, shared by every coffee scene. `foam: null` = no foam band. */
export const MENU_COLORS = {
  ลาเต้: { from: '#E8C9A0', to: '#B98A5C', foam: '#F6EAD8' },
  อเมริกาโน: { from: '#5A3A24', to: '#2B1A10', foam: null },
  มอคค่า: { from: '#9A6340', to: '#5E3720', foam: '#E9D3BD' },
  ชาเขียว: { from: '#A9CF6E', to: '#6F9A3A', foam: '#E6F2CF' },
  โกโก้: { from: '#A0523C', to: '#6B2F22', foam: '#F0D6C8' },
};
export const menuColor = (name) => MENU_COLORS[name] || MENU_COLORS['ลาเต้'];

/**
 * One row per answer cell of the scene's task, in the state the grid shows it
 * in — read from the same `results` the grid renders, never recomputed:
 *   match   — the cell's result is ok (grid: green)
 *   error   — the cell has a result that is not ok (grid: red)
 *   current — the cell revealed last while the run is still stepping (blue)
 *   shadow  — no result yet (grid: the faint answer ghost)
 * `value` is what the grid shows for the cell, null while it is a shadow.
 */
export function sceneRows(level, results, { running = false } = {}) {
  const task = level.tasks[0];
  const cells = taskCells(task);
  const revealed = cells.filter((ref) => results[ref]);
  const last = running ? revealed[revealed.length - 1] : null;
  return cells.map((ref, i) => {
    const row = Number(ref.replace(/^[A-Z]+/, ''));
    const result = results[ref];
    let state = 'shadow';
    if (result) state = !result.ok ? 'error' : ref === last ? 'current' : 'match';
    return {
      ref,
      row,
      index: i,
      label: level.sheet[`A${row}`] ?? ref,
      expected: task.expected[i],
      value: result ? result.value : null,
      state,
    };
  });
}

/** The row the stage acts out: the current one, else the last solved, else the first. */
export function focusRow(rows) {
  return (
    rows.find((r) => r.state === 'current') ||
    [...rows].reverse().find((r) => r.state === 'match') ||
    rows[0]
  );
}

/** Sum of the rows already matched (the blue current row is not in it yet). */
export const matchedSum = (rows) => rows.reduce((s, r) => s + (r.state === 'match' ? r.value : 0), 0);

/** At most `max` small props in a row; past that the row shows `×{n}` instead. */
export function capProps(n, max = 5) {
  const count = Math.max(0, Math.floor(n));
  return { shown: Math.min(count, max), overflow: count > max ? count : null };
}

/** 1-4: plates under the jar, capped at 3 with `×{people}` for a larger group. */
export const platesFor = (people) => capProps(people, 3);

/**
 * 2-5: per row, the cell the filled-down formula multiplies the price by —
 * the ref that is not on the row's own line. Uses the engine's own fill-down
 * (shiftFormula) and the existing ref spans; no second parser.
 *   { text: '$B$7' | 'B8', cell: 'B7' | 'B8', broken, empty }
 * `broken` = it no longer points at `lockCell`; `empty` = that cell is blank.
 * A row whose formula has no such ref gets null.
 */
export function rateRefs(formula, rows, { lockCell, sheet }) {
  if (!formula) return rows.map(() => null);
  return rows.map((r, i) => {
    const text = shiftFormula(formula, i);
    const { spans } = formulaRefSpans(text);
    for (const s of spans) {
      const raw = text.slice(s.start, s.end);
      const cell = raw.replace(/\$/g, '').toUpperCase();
      if (cell.includes(':') || Number(cell.replace(/^[A-Z]+/, '')) === r.row) continue;
      return { text: raw.toUpperCase(), cell, broken: cell !== lockCell, empty: sheet[cell] === undefined, formula: text };
    }
    return null;
  });
}
