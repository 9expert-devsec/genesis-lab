import { parse } from './parse.js';
import { evaluateAst } from './evaluate.js';
import { tokenize } from './tokenize.js';

/**
 * Public API of the 9Expert Play formula engine. Only what the Excel Beginner
 * levels need: + - * /, comparisons, refs/ranges ($-locked or not), and
 * SUM AVERAGE MIN MAX COUNT PRODUCT IF LEFT RIGHT MID LEN UPPER LOWER.
 *
 * Nothing here throws. A formula that will not parse evaluates to
 * `{ error: '#ERROR!', key }` with a short key ('unclosed_paren',
 * 'unknown_token', …) for the UI to turn into Thai copy; a runtime failure is
 * `{ error: '#VALUE!' | '#DIV/0!' | '#NAME?' | '#NUM!' | '#CIRC!' }`.
 */

export { parse } from './parse.js';
export { expandRange, parseRef } from './refs.js';

export const isError = (v) => v !== null && typeof v === 'object' && 'error' in v;

/** `anchor` is the cell the formula lives in; reading it back is #CIRC!. */
export function evaluateFormula(formula, sheet, { anchor } = {}) {
  const parsed = parse(formula);
  if (parsed.error) return { error: '#ERROR!', key: parsed.error };
  return evaluateAst(parsed.ast, sheet, { anchor });
}

function lex(formula) {
  const text = String(formula ?? '');
  const at = text.indexOf('=');
  if (at === -1 || text.slice(0, at).trim() !== '') return null;
  const lexed = tokenize(text.slice(at + 1));
  return lexed.error ? null : { text, offset: at + 1, tokens: lexed.tokens };
}

/**
 * Fill down by `rowOffset`: relative rows move, `$`-locked rows stay, columns
 * never move (fill is vertical only). Everything else — spacing, case, string
 * literals — is kept byte for byte. A formula that does not tokenize comes back
 * unchanged so evaluation reports its error.
 */
export function shiftFormula(formula, rowOffset) {
  const lexed = lex(formula);
  if (!lexed || !rowOffset) return String(formula ?? '');
  let out = '';
  let cursor = 0;
  for (const t of lexed.tokens) {
    if (t.type !== 'ref' || t.ref.rowAbs) continue;
    const start = lexed.offset + t.start;
    const end = lexed.offset + t.end;
    const { col, colAbs, row } = t.ref;
    const original = lexed.text.slice(start, end);
    const colText = original.slice(colAbs ? 1 : 0, (colAbs ? 1 : 0) + col.length);
    out += lexed.text.slice(cursor, start) + `${colAbs ? '$' : ''}${colText}${row + rowOffset}`;
    cursor = end;
  }
  return out + lexed.text.slice(cursor);
}

export function formulaUsesFunction(formula, name) {
  const lexed = lex(formula);
  const want = String(name).toUpperCase();
  return !!lexed && lexed.tokens.some((t) => t.type === 'func' && t.name === want);
}

export function formulaHasCellRef(formula) {
  const lexed = lex(formula);
  return !!lexed && lexed.tokens.some((t) => t.type === 'ref');
}
