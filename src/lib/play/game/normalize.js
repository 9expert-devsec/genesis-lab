import { tokenize } from '../engine/tokenize.js';

/**
 * A formula's comparison form: refs and function names upper-cased, spaces
 * outside string literals dropped, text inside quotes kept exactly. Used to
 * hide the player's own formula from the "other formulas that also work" list,
 * so `=sum( b2:b6 )` and `=SUM(B2:B6)` count as the same.
 *
 * A formula that does not tokenize falls back to trim + strip spaces + upper
 * case — still good enough to compare against a known-good alternative.
 */
export function normalizeFormula(formula) {
  const text = String(formula ?? '').trim();
  const body = text.startsWith('=') ? text.slice(1) : text;
  const lexed = tokenize(body);
  if (lexed.error) return text.replace(/\s+/g, '').toUpperCase();
  let out = '=';
  for (const t of lexed.tokens) {
    switch (t.type) {
      case 'ref':
        out += `${t.ref.colAbs ? '$' : ''}${t.ref.col}${t.ref.rowAbs ? '$' : ''}${t.ref.row}`;
        break;
      case 'func':
      case 'name':
        out += t.name;
        break;
      case 'str':
        out += `"${t.value.replace(/"/g, '""')}"`;
        break;
      case 'num':
        out += String(t.value);
        break;
      default:
        out += body.slice(t.start, t.end);
    }
  }
  return out;
}

export function sameFormula(a, b) {
  return normalizeFormula(a) === normalizeFormula(b);
}
