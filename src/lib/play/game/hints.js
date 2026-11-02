import { tokenize } from '../engine/tokenize.js';

/**
 * The three-step hint ladder for a task, built from the task data alone (the
 * level JSON carries no hint text):
 *
 *   1. where to type, that it starts with =, and the required function if any;
 *   2. the model's skeleton — cell refs and punctuation kept, everything else
 *      masked: `=B2*C2` → `=B2 _ C2`, `=SUM(B2:B6)` → `=___(B2:B6)`;
 *   3. the full model formula.
 *
 * Each step is { text, formula? } so the UI can set the formula in monospace.
 */

const MASK = '_';
const MASK_WORD = '___';
const MASK_TEXT = '"…"';

export function maskFormula(formula) {
  const text = String(formula ?? '').trim();
  const body = text.startsWith('=') ? text.slice(1) : text;
  const lexed = tokenize(body);
  if (lexed.error) return '=…';
  let out = '=';
  for (const t of lexed.tokens) {
    switch (t.type) {
      case 'ref':
        out += body.slice(t.start, t.end).toUpperCase();
        break;
      case 'func':
      case 'name':
        out += MASK_WORD;
        break;
      case 'str':
        out += MASK_TEXT;
        break;
      case 'op':
        out += ` ${MASK} `;
        break;
      case 'num':
        out += MASK;
        break;
      case 'comma':
        out += ', ';
        break;
      default:
        out += body.slice(t.start, t.end);
    }
  }
  // An op next to a masked number reads `_  _`; one space between masks is enough.
  return out.replace(/ {2,}/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}

export function hintsForTask(task) {
  const target = task.fill || task.anchor;
  const mustUse = (task.mustUse || []).map((f) => String(f).toUpperCase());
  let first = `เริ่มพิมพ์ที่ช่อง ${task.anchor} สูตรต้องขึ้นต้นด้วย =`;
  if (task.fill) first += ` แล้วสูตรจะถูกลากลงให้ครบ ${target}`;
  if (mustUse.length) first += ` · ด่านนี้ต้องใช้ ${mustUse.join(', ')}`;
  return [
    { text: first },
    { text: 'โครงสูตร — ช่องที่ต้องอ้างอิงอยู่ตรงนี้ เติมส่วนที่เป็น _ ให้ครบ', formula: maskFormula(task.model) },
    { text: 'สูตรเต็ม', formula: task.model },
  ];
}
