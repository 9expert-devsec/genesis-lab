import { tokenize } from '../engine/tokenize.js';
import { colToNum, expandRange, expandRefs, numToCol, parseRef } from '../engine/refs.js';
import { parse, shiftFormula, isError } from '../engine/index.js';
import { taskCells } from '../levels/check.js';
import { sameFormula } from './normalize.js';

/**
 * Pure helpers the level page renders from. No React here, so each one can be
 * tested without a DOM.
 */

/** Columns and rows the grid needs: every sheet value and every answer cell. */
export function gridBounds(level) {
  const keys = [...Object.keys(level.sheet || {}), ...level.tasks.flatMap(taskCells)];
  let maxCol = 1;
  let maxRow = 1;
  for (const k of keys) {
    const r = parseRef(k);
    if (!r) continue;
    maxCol = Math.max(maxCol, colToNum(r.col));
    maxRow = Math.max(maxRow, r.row);
  }
  return {
    cols: Array.from({ length: maxCol }, (_, i) => numToCol(i + 1)),
    rows: Array.from({ length: maxRow }, (_, i) => i + 1),
  };
}

/** `{ "C2:C5": "2dp" }` → `{ C2: "2dp", …, C5: "2dp" }`. */
export function formatMap(level) {
  const out = {};
  for (const [range, fmt] of Object.entries(level.format || {})) {
    for (const k of expandRange(range) || []) out[k] = fmt;
  }
  return out;
}

export function displayValue(value, fmt) {
  if (value === undefined || value === null || value === '') return '';
  if (isError(value)) return value.error;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (fmt === 'percent') return `${+(value * 100).toFixed(2)}%`;
    if (fmt === '2dp') return value.toFixed(2);
    return String(+value.toFixed(10));
  }
  return String(value);
}

/**
 * Where the refs sit in what the player has typed, for the blue colouring in
 * the input and the matching outlines on the grid. Positions index into the
 * full input text (leading `=` included). Half-typed input that does not
 * tokenize yet (an open quote) gives no spans rather than wrong ones.
 */
export function formulaRefSpans(text) {
  const src = String(text ?? '');
  const at = src.indexOf('=');
  if (at === -1 || src.slice(0, at).trim() !== '') return { spans: [], cells: [] };
  const lexed = tokenize(src.slice(at + 1));
  if (lexed.error) return { spans: [], cells: [] };
  const offset = at + 1;
  const spans = [];
  const cells = new Set();
  const toks = lexed.tokens;
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (t.type !== 'ref') continue;
    const colon = toks[i + 1];
    const to = toks[i + 2];
    if (colon?.type === 'colon' && to?.type === 'ref') {
      spans.push({ start: offset + t.start, end: offset + to.end });
      for (const k of expandRefs(t.ref, to.ref)) cells.add(k);
      i += 2;
    } else {
      spans.push({ start: offset + t.start, end: offset + t.end });
      cells.add(`${t.ref.col}${t.ref.row}`);
    }
  }
  return { spans, cells: [...cells] };
}

/** Function names for the quick-keys row: each task's mustUse, then those in its model. */
export function levelFunctions(level) {
  const out = [];
  const add = (n) => {
    const name = String(n).toUpperCase();
    if (!out.includes(name)) out.push(name);
  };
  for (const task of level.tasks) {
    (task.mustUse || []).forEach(add);
    const lexed = tokenize(String(task.model).replace(/^\s*=/, ''));
    for (const t of lexed.tokens || []) if (t.type === 'func') add(t.name);
  }
  return out;
}

/**
 * "Other formulas that also work" for the complete card: the model and every
 * alternative, minus whatever the player actually typed. The model is in the
 * pool on purpose — a player who found an alternative should see the model.
 */
export function secretFormulas(task, playerFormula) {
  const pool = [task.model, ...(task.alternatives || [])];
  const out = [];
  for (const f of pool) {
    if (playerFormula && sameFormula(f, playerFormula)) continue;
    if (out.some((g) => sameFormula(g, f))) continue;
    out.push(f);
  }
  return out;
}

const PARSE_MESSAGES = {
  missing_equals: 'สูตรต้องขึ้นต้นด้วยเครื่องหมาย =',
  empty: 'พิมพ์สูตรต่อจากเครื่องหมาย = ก่อนนะ',
  unclosed_paren: 'วงเล็บยังปิดไม่ครบ ลองนับวงเล็บเปิด ( กับปิด ) ให้เท่ากัน',
  unexpected_paren: 'มีวงเล็บปิด ) เกินมา',
  unclosed_string: 'ข้อความต้องอยู่ในเครื่องหมายคำพูด "…" ให้ครบทั้งเปิดและปิด',
  unexpected_end: 'สูตรจบกลางทาง ลองดูว่ามีเครื่องหมายค้างอยู่ท้ายสูตรไหม',
  unexpected_token: 'มีบางอย่างในสูตรวางผิดตำแหน่ง ลองเช็กเครื่องหมายและจุลภาค ,',
  unknown_token: 'มีตัวอักษรที่ Excel ไม่รู้จักในสูตร',
  bad_range: 'ช่วงเซลล์ต้องเขียนแบบ B2:B6',
  bad_arg_count: 'จำนวนค่าในฟังก์ชันไม่ครบหรือเกิน เช่น IF ต้องมี 2–3 ค่า',
};

const VALUE_ERROR_MESSAGES = {
  '#DIV/0!': 'สูตรหารด้วยศูนย์หรือช่องว่าง',
  '#VALUE!': 'สูตรเอาข้อความไปบวกลบคูณหาร ลองอ้างอิงช่องที่เป็นตัวเลข',
  '#NAME?': 'ชื่อฟังก์ชันไม่ถูกต้อง ลองเช็กการสะกด',
  '#CIRC!': 'สูตรอ้างอิงช่องของตัวเอง ลองอ้างอิงช่องอื่น',
};

const FALLBACK = 'สูตรยังมีจุดผิด ลองเช็กวงเล็บและเครื่องหมาย';

/**
 * The ALMOST THERE copy for a failed checkTask result:
 * { headline, detail?, formula?, got?, want? }. For a mismatch the shifted
 * formula of the first wrong row is given, since that is the one that produced
 * the wrong value.
 */
export function failureMessage(result, formula, task) {
  const fmt = (v) => displayValue(v);
  switch (result.reason) {
    case 'mismatch': {
      const wrong = result.cells.filter((c) => !c.ok);
      const first = wrong[0];
      const row = result.cells.indexOf(first);
      return {
        headline: `เกือบแล้ว! ยังไม่ตรง ${wrong.length} ช่อง`,
        formula: shiftFormula(String(formula).trim(), row),
        got: fmt(first.value),
        want: fmt(first.expected),
        ref: first.ref,
      };
    }
    case 'must_use':
      return { headline: `ผลถูกแล้ว แต่ด่านนี้ต้องใช้ ${(task.mustUse || []).join(', ')}` };
    case 'no_cell_ref':
      return { headline: 'ลองอ้างอิงช่อง เช่น B2 แทนการพิมพ์ตัวเลขตรงๆ' };
    default: {
      const parsed = parse(String(formula ?? '').trim());
      if (parsed.error) return { headline: PARSE_MESSAGES[parsed.error] || FALLBACK };
      const bad = result.cells.find((c) => isError(c.value));
      return { headline: (bad && VALUE_ERROR_MESSAGES[bad.value.error]) || FALLBACK };
    }
  }
}
