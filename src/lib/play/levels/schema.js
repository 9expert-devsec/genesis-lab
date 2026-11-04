import { ARITY } from '../engine/parse.js';
import { expandRange, parseRef } from '../engine/refs.js';
import { DATA_SCENE_KINDS, SCENE_CONFIG_KEYS, sceneConfig, sceneFor } from '../game/scene.js';

/**
 * Structural check for one level. Returns a list of human-readable problems;
 * an empty list means the level is well-formed. It does not grade the model
 * answers — test/pure/play/levels.test.mjs runs them through the checker.
 */

const FORMATS = new Set(['percent', '2dp']);
const REJECT_REASONS = new Set(['no_cell_ref', 'must_use', 'mismatch', 'error']);
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const isPlainRef = (k) => {
  const r = parseRef(k);
  return !!r && !r.colAbs && !r.rowAbs && k === `${r.col}${r.row}`;
};

function checkTask(task, i, level, problems) {
  const at = `tasks[${i}]${task && task.id ? ` (${task.id})` : ''}`;
  const push = (msg) => problems.push(`${at}: ${msg}`);
  if (!task || typeof task !== 'object') return push('not an object');
  if (!nonEmpty(task.id)) push('id missing');
  if (!isPlainRef(task.anchor)) push(`anchor "${task.anchor}" is not a cell ref like D2`);

  let cells = isPlainRef(task.anchor) ? [task.anchor] : [];
  if (task.fill !== undefined) {
    const [from, to] = String(task.fill).split(':');
    cells = expandRange(task.fill) || [];
    if (!to || !isPlainRef(from) || !isPlainRef(to)) push(`fill "${task.fill}" is not a range like D2:D6`);
    else if (from !== task.anchor) push(`fill must start at the anchor ${task.anchor}`);
    else if (parseRef(from).col !== parseRef(to).col) push('fill must be one column (fill is vertical only)');
    else if (parseRef(to).row <= parseRef(from).row) push('fill must run downward');
  }
  for (const ref of cells) {
    if (level.sheet && level.sheet[ref] !== undefined) push(`${ref} is an answer cell but the sheet pre-fills it`);
  }

  if (!Array.isArray(task.expected)) push('expected must be an array');
  else {
    if (task.expected.length !== cells.length) {
      push(`expected has ${task.expected.length} values for ${cells.length} cell(s)`);
    }
    if (task.expected.some((v) => !['number', 'string', 'boolean'].includes(typeof v))) {
      push('expected values must be numbers, text or booleans');
    }
  }

  if (!nonEmpty(task.model) || !task.model.trim().startsWith('=')) push('model must be a formula starting with =');
  for (const key of ['alternatives', 'mustUse', 'rejects']) {
    if (task[key] !== undefined && !Array.isArray(task[key])) push(`${key} must be an array`);
  }
  for (const alt of task.alternatives || []) {
    if (!nonEmpty(alt) || !alt.trim().startsWith('=')) push(`alternative "${alt}" is not a formula`);
  }
  for (const fn of task.mustUse || []) {
    if (!ARITY[String(fn).toUpperCase()]) push(`mustUse "${fn}" is not a function the engine knows`);
  }
  for (const r of task.rejects || []) {
    if (!r || !nonEmpty(r.formula)) push('reject without a formula');
    else if (!REJECT_REASONS.has(r.reason)) push(`reject "${r.formula}" has unknown reason "${r.reason}"`);
  }
}

export function validateLevel(level) {
  const problems = [];
  if (!level || typeof level !== 'object') return ['level is not an object'];

  const isBoss = level.id === 'boss';
  if (!isBoss && !/^[1-9]-[1-9][0-9]*$/.test(String(level.id))) problems.push(`id "${level.id}" is not "<chapter>-<order>" or "boss"`);
  if (!nonEmpty(level.program)) problems.push('program missing');
  if (!nonEmpty(level.series)) problems.push('series missing');
  if (!Number.isInteger(level.chapter) || level.chapter < 1 || level.chapter > 4) problems.push('chapter must be 1..4');
  if (isBoss !== (level.chapter === 4)) problems.push('the boss, and only the boss, is chapter 4');
  if (!Number.isInteger(level.order) || level.order < 1) problems.push('order must be a positive integer');
  if (!isBoss && level.id !== `${level.chapter}-${level.order}`) problems.push(`id "${level.id}" does not match chapter ${level.chapter} / order ${level.order}`);
  for (const key of ['title', 'story', 'learn']) {
    if (!nonEmpty(level[key])) problems.push(`${key} missing`);
  }

  if (!level.sheet || typeof level.sheet !== 'object' || Array.isArray(level.sheet)) problems.push('sheet must be an object');
  else {
    for (const [k, v] of Object.entries(level.sheet)) {
      if (!isPlainRef(k)) problems.push(`sheet key "${k}" is not a cell ref like A1`);
      if (typeof v !== 'number' && typeof v !== 'string') problems.push(`sheet ${k} must be a number or text`);
    }
  }

  if (level.format !== undefined) {
    if (!level.format || typeof level.format !== 'object') problems.push('format must be an object');
    else {
      for (const [k, v] of Object.entries(level.format)) {
        if (!expandRange(k)) problems.push(`format key "${k}" is not a ref or range`);
        if (!FORMATS.has(v)) problems.push(`format "${v}" for ${k} is not one of ${[...FORMATS].join(', ')}`);
      }
    }
  }

  // Optional simulator scene. Scenes act out a fill-down task row by row, and
  // only the boss scene follows later steps as well; a data scene instead reads
  // its rows from `data` and answers single cells, one per task.
  if (level.scene !== undefined) {
    const kind = sceneFor(level);
    if (!kind) problems.push(`scene "${level.scene?.kind ?? level.scene}" is not a known scene kind`);
    else {
      const tasks = Array.isArray(level.tasks) ? level.tasks : [];
      const config = sceneConfig(level);
      if (DATA_SCENE_KINDS.includes(kind)) {
        if (tasks.some((t) => t?.fill)) problems.push('a data scene answers single cells, not a fill-down');
        if (config.data !== undefined && !expandRange(config.data)) problems.push(`scene "${kind}" data is not a range`);
      } else if (!tasks[0]?.fill || (kind !== 'boss' && tasks.length !== 1)) problems.push('a scene level must have exactly one fill-down task');
      for (const key of SCENE_CONFIG_KEYS[kind] || []) {
        if (config[key] === undefined) problems.push(`scene "${kind}" config is missing ${key}`);
      }
    }
  }

  if (!Array.isArray(level.tasks) || level.tasks.length === 0) problems.push('tasks must be a non-empty array');
  else {
    const ids = level.tasks.map((t) => t && t.id);
    if (new Set(ids).size !== ids.length) problems.push('task ids must be unique');
    level.tasks.forEach((t, i) => checkTask(t, i, level, problems));
  }
  return problems;
}
