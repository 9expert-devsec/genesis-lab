import { parseRef } from './refs.js';

/**
 * Formula text (with or without the leading `=`) → tokens, each carrying its
 * source span so shiftFormula can rewrite refs in place and keep the player's
 * own spacing and case.
 *
 * Returns { tokens } or { error: key }. Keys are short and stable so the UI can
 * map them to Thai copy.
 */

const OPS = ['<=', '>=', '<>', '+', '-', '*', '/', '=', '<', '>'];
const NUM_RE = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/;
const WORD_RE = /^\$?[A-Za-z_][A-Za-z0-9_.]*\$?[0-9]*/;

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let text = '';
      for (;;) {
        if (j >= src.length) return { error: 'unclosed_string' };
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            text += '"';
            j += 2;
            continue;
          }
          break;
        }
        text += src[j];
        j += 1;
      }
      tokens.push({ type: 'str', value: text, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    const rest = src.slice(i);
    const num = NUM_RE.exec(rest);
    if (num) {
      tokens.push({ type: 'num', value: Number(num[0]), start: i, end: i + num[0].length });
      i += num[0].length;
      continue;
    }
    const word = WORD_RE.exec(rest);
    if (word) {
      const text = word[0];
      const end = i + text.length;
      const ref = parseRef(text);
      if (ref && src[end] !== '(') {
        tokens.push({ type: 'ref', ref, start: i, end });
      } else if (text.includes('$')) {
        return { error: 'unknown_token' };
      } else if (src[end] === '(') {
        tokens.push({ type: 'func', name: text.toUpperCase(), start: i, end });
      } else {
        tokens.push({ type: 'name', name: text.toUpperCase(), start: i, end });
      }
      i = end;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ type: 'op', value: op, start: i, end: i + op.length });
      i += op.length;
      continue;
    }
    const punct = { '(': 'lparen', ')': 'rparen', ',': 'comma', ':': 'colon' }[ch];
    if (punct) {
      tokens.push({ type: punct, start: i, end: i + 1 });
      i += 1;
      continue;
    }
    return { error: 'unknown_token' };
  }
  return { tokens };
}
