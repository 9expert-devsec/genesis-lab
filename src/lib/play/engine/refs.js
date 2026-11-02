/**
 * Cell-reference helpers shared by the engine and the level checker. Pure — no
 * imports — so the play modules stay testable on their own.
 */

const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)$/;

/** "B$7" → { col: 'B', row: 7, colAbs: false, rowAbs: true }; null when not a ref. */
export function parseRef(text) {
  const m = REF_RE.exec(String(text).trim());
  if (!m) return null;
  const row = Number(m[4]);
  if (row < 1) return null;
  return { col: m[2].toUpperCase(), row, colAbs: m[1] === '$', rowAbs: m[3] === '$' };
}

/** Sheet key for a parsed ref, `$` dropped: { col: 'B', row: 7 } → "B7". */
export function refKey(ref) {
  return `${ref.col}${ref.row}`;
}

export function colToNum(col) {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Every key a from/to pair covers, row by row then column by column. */
export function expandRefs(from, to) {
  const c1 = colToNum(from.col);
  const c2 = colToNum(to.col);
  const r1 = Math.min(from.row, to.row);
  const r2 = Math.max(from.row, to.row);
  const out = [];
  for (let r = r1; r <= r2; r += 1) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) out.push(`${numToCol(c)}${r}`);
  }
  return out;
}

/** "D2:D6" → ['D2', …, 'D6']; a single ref → [ref]; null when malformed. */
export function expandRange(text) {
  const parts = String(text).split(':');
  if (parts.length > 2) return null;
  const from = parseRef(parts[0]);
  const to = parts.length === 2 ? parseRef(parts[1]) : from;
  if (!from || !to) return null;
  return expandRefs(from, to);
}
