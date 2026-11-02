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

/**
 * The display form Excel gives a formula on Enter: refs and function names
 * upper-cased, everything else — spacing, text inside quotes — kept byte for
 * byte. Unlike normalizeFormula it does not strip spaces, so the input still
 * reads as what the player typed. Untokenizable input comes back trimmed only.
 */
export function displayFormula(formula) {
  const text = String(formula ?? '').trim();
  if (!text.startsWith('=')) return text;
  const lexed = tokenize(text.slice(1));
  if (lexed.error) return text;
  let out = '';
  let cursor = 0;
  for (const t of lexed.tokens) {
    if (t.type !== 'ref' && t.type !== 'func' && t.type !== 'name') continue;
    const start = t.start + 1;
    const end = t.end + 1;
    out += text.slice(cursor, start) + text.slice(start, end).toUpperCase();
    cursor = end;
  }
  return out + text.slice(cursor);
}

export function sameFormula(a, b) {
  return normalizeFormula(a) === normalizeFormula(b);
}
