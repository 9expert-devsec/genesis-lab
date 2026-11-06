import { expandRefs, refKey } from './refs.js';

/**
 * AST + sheet → value. Values are numbers, strings, booleans, or an error
 * object `{ error: '#VALUE!' }`. An empty cell reads as `null` internally and
 * becomes 0 at the top, as Excel shows `=A1` on an empty A1.
 *
 * Errors are values, never throws: the first error an operand produces is the
 * result, the way Excel propagates them.
 */

const err = (code) => ({ error: code });
const isErr = (v) => v !== null && typeof v === 'object' && 'error' in v;

function readCell(sheet, key) {
  const v = sheet[key];
  if (v === undefined || v === null || v === '') return null;
  return v;
}

function toNumber(v) {
  if (isErr(v)) return v;
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (s !== '' && Number.isFinite(Number(s))) return Number(s);
  return err('#VALUE!');
}

function toBool(v) {
  if (isErr(v)) return v;
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toUpperCase();
  if (s === 'TRUE') return true;
  if (s === 'FALSE') return false;
  return err('#VALUE!');
}

/** A value as Excel's text functions read it: `LEFT(12345,2)` sees "12345". */
function toText(v) {
  if (isErr(v)) return v;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(+v.toPrecision(15));
  return String(v);
}

/** A character count or position: truncated toward zero; below `min` is #VALUE!. */
function toCount(v, min) {
  const n = toNumber(v);
  if (isErr(n)) return n;
  const whole = Math.trunc(n);
  return whole < min ? err('#VALUE!') : whole;
}

// Excel orders numbers < text < booleans; an empty cell takes the other side's type.
const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);

function compare(op, a, b) {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  let c;
  if (rank(a) !== rank(b)) c = rank(a) - rank(b);
  else if (typeof a === 'string') {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    c = x < y ? -1 : x > y ? 1 : 0;
  } else c = Number(a) - Number(b);
  switch (op) {
    case '=': return c === 0;
    case '<>': return c !== 0;
    case '<': return c < 0;
    case '>': return c > 0;
    case '<=': return c <= 0;
    default: return c >= 0;
  }
}

function arith(op, a, b) {
  const x = toNumber(a);
  if (isErr(x)) return x;
  const y = toNumber(b);
  if (isErr(y)) return y;
  let r;
  if (op === '+') r = x + y;
  else if (op === '-') r = x - y;
  else if (op === '*') r = x * y;
  else {
    if (y === 0) return err('#DIV/0!');
    r = x / y;
  }
  return Number.isFinite(r) ? r : err('#NUM!');
}

/**
 * The numbers an aggregate sees. Cells reached by a ref or range keep only
 * real numbers (text, booleans and empties are skipped); a value typed straight
 * into the call is coerced, so `SUM("a")` is #VALUE! while SUM over a text cell
 * is not. COUNT passes `lenient` and simply skips what would not coerce.
 */
function collectNumbers(args, ctx, lenient) {
  const out = [];
  for (const node of args) {
    if (node.type === 'ref' || node.type === 'range') {
      const keys = node.type === 'ref' ? [refKey(node.ref)] : expandRefs(node.from, node.to);
      for (const key of keys) {
        if (key === ctx.anchor) return err('#CIRC!');
        const v = readCell(ctx.sheet, key);
        if (isErr(v)) {
          if (lenient) continue;
          return v;
        }
        if (typeof v === 'number') out.push(v);
      }
      continue;
    }
    const v = evalNode(node, ctx);
    if (v === null) continue;
    const n = toNumber(v);
    if (isErr(n)) {
      if (lenient) continue;
      return n;
    }
    out.push(n);
  }
  return out;
}

const AGGREGATES = {
  SUM: (ns) => ns.reduce((s, n) => s + n, 0),
  AVERAGE: (ns) => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : err('#DIV/0!')),
  MIN: (ns) => (ns.length ? Math.min(...ns) : 0),
  MAX: (ns) => (ns.length ? Math.max(...ns) : 0),
  PRODUCT: (ns) => (ns.length ? ns.reduce((p, n) => p * n, 1) : 0),
  COUNT: (ns) => ns.length,
};

function cut(ctx, text, n, take) {
  const s = toText(evalNode(text, ctx));
  if (isErr(s)) return s;
  const count = n ? toCount(evalNode(n, ctx), 0) : 1;
  return isErr(count) ? count : take(s, count);
}

function mapText(ctx, text, fn) {
  const s = toText(evalNode(text, ctx));
  return isErr(s) ? s : fn(s);
}

/** Each returns TEXT except LEN. A count reaches `take` already validated. */
const TEXT_FNS = {
  LEFT: (ctx, [text, n]) => cut(ctx, text, n, (s, c) => s.slice(0, c)),
  RIGHT: (ctx, [text, n]) => cut(ctx, text, n, (s, c) => (c === 0 ? '' : s.slice(-c))),
  MID: (ctx, [text, start, n]) => {
    const s = toText(evalNode(text, ctx));
    if (isErr(s)) return s;
    const from = toCount(evalNode(start, ctx), 1);
    if (isErr(from)) return from;
    const count = toCount(evalNode(n, ctx), 0);
    if (isErr(count)) return count;
    return s.slice(from - 1, from - 1 + count);
  },
  LEN: (ctx, [text]) => mapText(ctx, text, (s) => s.length),
  UPPER: (ctx, [text]) => mapText(ctx, text, (s) => s.toUpperCase()),
  LOWER: (ctx, [text]) => mapText(ctx, text, (s) => s.toLowerCase()),
};

function callFn(node, ctx) {
  if (node.name === 'IF') {
    const cond = toBool(evalNode(node.args[0], ctx));
    if (isErr(cond)) return cond;
    if (cond) return evalNode(node.args[1], ctx);
    return node.args.length === 3 ? evalNode(node.args[2], ctx) : false;
  }
  if (TEXT_FNS[node.name]) return TEXT_FNS[node.name](ctx, node.args);
  const fn = AGGREGATES[node.name];
  if (!fn) return err('#NAME?');
  const ns = collectNumbers(node.args, ctx, node.name === 'COUNT');
  return isErr(ns) ? ns : fn(ns);
}

function evalNode(node, ctx) {
  switch (node.type) {
    case 'num':
    case 'str':
      return node.value;
    case 'name':
      return err('#NAME?');
    case 'ref': {
      const key = refKey(node.ref);
      if (key === ctx.anchor) return err('#CIRC!');
      return readCell(ctx.sheet, key);
    }
    case 'range':
      // No spill and no implicit intersection: a bare range is not a value here.
      return err('#VALUE!');
    case 'neg': {
      const v = toNumber(evalNode(node.arg, ctx));
      return isErr(v) ? v : -v;
    }
    case 'bin': {
      const a = evalNode(node.left, ctx);
      const b = evalNode(node.right, ctx);
      if (['+', '-', '*', '/'].includes(node.op)) return arith(node.op, a, b);
      return compare(node.op, a, b);
    }
    case 'call':
      return callFn(node, ctx);
    default:
      return err('#VALUE!');
  }
}

export function evaluateAst(ast, sheet, { anchor } = {}) {
  const ctx = { sheet: sheet || {}, anchor: anchor ? String(anchor).toUpperCase().replace(/\$/g, '') : null };
  const v = evalNode(ast, ctx);
  return v === null ? 0 : v;
}
