import { evaluateFormula, expandRange, shiftFormula } from '../engine/index.js';
import { taskCells, valuesEqual } from '../levels/check.js';
import { displayValue, formulaRefSpans } from './view.js';

/**
 * Pure helpers behind the simulator scene card that replaces the scoreboard on
 * the levels whose data carries a `scene`. No React here.
 */

/** Scene kinds a level's `scene` field may name. */
export const SCENE_KINDS = [
  'toppings', 'checkout', 'change', 'split', 'delivery', 'vat',
  'stock', 'receipts', 'discount', 'iced', 'tiers', 'boss',
  'tipjar', 'average', 'podium', 'spike',
];

/** Kinds whose rows are input data (see dataRows), not one answer per row. */
export const DATA_SCENE_KINDS = ['tipjar', 'average', 'podium', 'spike'];

/**
 * `scene` is a kind name, or `{ kind, ...config }` for a scene with parameters.
 * These kinds take a config, with these keys required.
 */
export const SCENE_CONFIG_KEYS = {
  stock: ['threshold', 'crateUnit', 'crateMax', 'tags', 'countTag'],
  receipts: ['threshold', 'tags', 'countTag'],
  discount: ['threshold', 'amount'],
  iced: ['match', 'amount'],
  tiers: ['zones'],
  boss: ['target', 'targetAt', 'steps'],
  tipjar: ['data', 'coinUnit', 'coinMax'],
  average: ['data', 'coinUnit', 'coinMax'],
  podium: ['data', 'coinUnit', 'coinMax'],
  spike: ['data'],
};

const sceneKind = (scene) => (typeof scene === 'string' ? scene : scene?.kind);

/** The kind to render for a level, or null for the plain scoreboard. */
export function sceneFor(level) {
  const kind = sceneKind(level?.scene);
  return SCENE_KINDS.includes(kind) ? kind : null;
}

/** The level's scene parameters; empty for a scene named by kind alone. */
export const sceneConfig = (level) => (level?.scene && typeof level.scene === 'object' ? level.scene : {});

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

// ── CH.3 and the boss. Thresholds, amounts and targets come from the level's
// scene config, never from here.

/** The status tag a row shows: `meaning` picks its colour from the config. */
export function statusTag(row, config) {
  if (row.state === 'shadow') return { meaning: null, text: '?', state: row.state };
  const text = displayValue(row.value);
  return { meaning: config.tags[text] ?? 'neutral', text, state: row.state };
}

/** Matched rows whose answer carries the tag the total counts. */
export const countTagged = (rows, config) =>
  rows.filter((r) => r.state === 'match' && statusTag(r, config).meaning === config.countTag).length;

/** 3-1: crates on the shelf for a stock level. */
export const crateCount = (stock, config) => Math.min(config.crateMax, Math.ceil(stock / config.crateUnit));

/** 3-2 / 3-3: does the bill reach the level's threshold? Equal counts. */
export const meetsThreshold = (bill, config) => bill >= config.threshold;

/** 3-2: receipt heights and the threshold line on one scale, tallest = `maxHeight`. */
export function receiptScale(bills, config, maxHeight) {
  const unit = maxHeight / Math.max(config.threshold, ...bills);
  return { line: config.threshold * unit, heights: bills.map((b) => b * unit) };
}

/** 3-5: index of the zone a result cell names, -1 when it names none. */
export function tierZone(value, config) {
  if (typeof value !== 'string') return -1;
  const want = value.trim().toLowerCase();
  return config.zones.findIndex((z) => z.value.toLowerCase() === want);
}

/**
 * 3-5: per zone, the rows standing in it. A row with a result stands where its
 * result cell says, right or wrong; a shadow row is the ghost of the answer.
 */
export function tierPlacement(rows, config) {
  return config.zones.map((_, i) =>
    rows.filter((r) => tierZone(r.state === 'shadow' ? r.expected : r.value, config) === i),
  );
}

/** 3-5: `>= 1000` for a zone, `< 500` for the last one, as the player types them. Zones run highest first. */
export function tierLabel(i, config) {
  const { zones } = config;
  return i < zones.length - 1 ? `>= ${zones[i].min}` : `< ${zones[i - 1].min}`;
}

/** 3-5: the range an amount really falls in, as a phrase for the total box. */
export function tierRange(amount, config) {
  const { zones } = config;
  const i = zones.findIndex((z) => amount >= z.min);
  if (i <= 0) return `อยู่ในช่วง ${zones[0].min} ขึ้นไป`;
  return `อยู่ระหว่าง ${zones[i].min}–${zones[i - 1].min - 1}`;
}

/** Boss: match / current / shadow per step, from where the player has got to. */
export const bossSteps = (level, { taskIndex, complete }) =>
  level.tasks.map((_, i) => (complete || i < taskIndex ? 'match' : i === taskIndex ? 'current' : 'shadow'));

/**
 * Boss goal bar: step 2's result once it has passed, the matched step-1 rows
 * before that. `fill` is 0..1 of the bar, scaled so the target sits at `targetAt`.
 */
export function bossGoal(level, rows, results, { taskIndex, complete }) {
  const { target, targetAt } = sceneConfig(level);
  const passed = complete || taskIndex > 1;
  const value = passed ? results[level.tasks[1].anchor]?.value ?? matchedSum(rows) : matchedSum(rows);
  return { value, fill: Math.min(1, (value / target) * targetAt) };
}

// ── CH.2 summaries. One answer cell (2-3: two) from rows of input data, so the
// rows carry no answer state; the answer's lives in the total box.

/**
 * The level's data rows. `inRange` = the formula that ran references the row's
 * cell, read from the grid's own ref spans; before a run, the whole data range.
 * `value` is the raw sheet cell, undefined when blank.
 */
export function dataRows(level, formula) {
  const cells = expandRange(sceneConfig(level).data);
  const referenced = new Set(formula ? formulaRefSpans(formula).cells : cells);
  return cells.map((ref, index) => {
    const row = Number(ref.replace(/^[A-Z]+/, ''));
    return { ref, row, index, label: level.sheet[`A${row}`] ?? ref, value: level.sheet[ref], inRange: referenced.has(ref) };
  });
}

/**
 * One answer cell, in sceneRows' states read from the grid's `results`. `running`
 * is this cell's own run: blue while it reveals, with no value until it lands.
 */
export function answerState(results, ref, { running = false } = {}) {
  const result = results[ref];
  if (!result) return { ref, value: null, state: running ? 'current' : 'shadow' };
  return { ref, value: result.value, state: !result.ok ? 'error' : running ? 'current' : 'match' };
}

/** Coins in a day's stack; 0 draws one dashed outline instead. */
export const stackCoins = (value, config) => Math.min(config.coinMax, Math.round(value / config.coinUnit));

/** The same day as a few small coins on its row. */
export const rowCoins = (value, config) => Math.ceil(stackCoins(value, config) / 2);

/** Height of a value on the stacks' scale, kept on the stage for a wild answer. */
export const coinHeight = (value, config, step) => Math.max(0, Math.min(config.coinMax + 1, value / config.coinUnit)) * step;

/** 2-2: what the right average divides, for the total box. */
export function averageParts(rows) {
  const days = rows.filter((r) => typeof r.value === 'number');
  return { sum: days.reduce((s, r) => s + r.value, 0), count: days.length };
}

/**
 * 2-2: the 0 day to point at, only for the mistake of not counting it: a wrong
 * answer equal to the data's sum over its non-zero days. Any other wrong answer
 * has some other cause, so null.
 */
export function zeroDay(rows, answer) {
  const zero = rows.find((r) => r.value === 0);
  if (!zero || answer.state !== 'error') return null;
  const nonZero = rows.filter((r) => typeof r.value === 'number' && r.value !== 0).length;
  return valuesEqual(answer.value, averageParts(rows).sum / nonZero) ? zero : null;
}

/** 2-3: the row each answer's value sits on, null when it equals no day. */
export function podiumTags(rows, [max, min]) {
  const on = (answer) => (answer.value === null ? null : rows.find((r) => r.value !== undefined && valuesEqual(answer.value, r.value)) ?? null);
  return { max: on(max), min: on(min) };
}

/** 2-4: what the cell is, asked of the engine's own COUNT; not the player's answer. */
export function orderCell(level, ref) {
  if (evaluateFormula(`=COUNT(${ref})`, level.sheet) === 1) return 'number';
  const value = level.sheet[ref];
  return value === undefined || value === '' ? 'blank' : 'text';
}
