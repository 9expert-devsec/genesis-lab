import { tokenize } from './tokenize.js';

/**
 * Formula → AST. Precedence, lowest first: comparison, + -, * /, unary minus.
 * Returns { ast } or { error: key }.
 *
 * Arity is checked here for the functions the engine knows, the way Excel
 * refuses `=IF(A1)` at entry. An unknown function still parses and evaluates
 * to #NAME?, which is also what Excel does.
 */

export const ARITY = {
  SUM: [1, 255],
  AVERAGE: [1, 255],
  MIN: [1, 255],
  MAX: [1, 255],
  COUNT: [1, 255],
  PRODUCT: [1, 255],
  IF: [2, 3],
  LEFT: [1, 2],
  RIGHT: [1, 2],
  MID: [3, 3],
  LEN: [1, 1],
  UPPER: [1, 1],
  LOWER: [1, 1],
};

const CMP = new Set(['=', '<>', '<', '>', '<=', '>=']);
const ADD = new Set(['+', '-']);
const MUL = new Set(['*', '/']);

class ParseError {
  constructor(key) {
    this.key = key;
  }
}

export function parse(formula) {
  const text = String(formula ?? '').trim();
  if (!text.startsWith('=')) return { error: 'missing_equals' };
  const lexed = tokenize(text.slice(1));
  if (lexed.error) return { error: lexed.error };
  const tokens = lexed.tokens;
  if (tokens.length === 0) return { error: 'empty' };

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const fail = (key) => {
    throw new ParseError(key);
  };
  const isOp = (t, set) => t && t.type === 'op' && set.has(t.value);

  function expression() {
    let left = additive();
    while (isOp(peek(), CMP)) {
      const op = next().value;
      left = { type: 'bin', op, left, right: additive() };
    }
    return left;
  }

  function additive() {
    let left = multiplicative();
    while (isOp(peek(), ADD)) {
      const op = next().value;
      left = { type: 'bin', op, left, right: multiplicative() };
    }
    return left;
  }

  function multiplicative() {
    let left = unary();
    while (isOp(peek(), MUL)) {
      const op = next().value;
      left = { type: 'bin', op, left, right: unary() };
    }
    return left;
  }

  function unary() {
    if (isOp(peek(), ADD)) {
      const op = next().value;
      const arg = unary();
      return op === '-' ? { type: 'neg', arg } : arg;
    }
    return primary();
  }

  function primary() {
    const t = next();
    if (!t) fail('unexpected_end');
    switch (t.type) {
      case 'num':
        return { type: 'num', value: t.value };
      case 'str':
        return { type: 'str', value: t.value };
      case 'name':
        return { type: 'name', name: t.name };
      case 'ref': {
        if (peek()?.type !== 'colon') return { type: 'ref', ref: t.ref };
        next();
        const to = next();
        if (!to || to.type !== 'ref') fail('bad_range');
        return { type: 'range', from: t.ref, to: to.ref };
      }
      case 'func':
        return call(t.name);
      case 'lparen': {
        const inner = expression();
        if (peek()?.type !== 'rparen') fail(peek() ? 'unexpected_token' : 'unclosed_paren');
        next();
        return inner;
      }
      case 'rparen':
        return fail('unexpected_paren');
      default:
        return fail('unexpected_token');
    }
  }

  function call(name) {
    next(); // the `(` the tokenizer saw after the name
    const args = [];
    if (peek()?.type === 'rparen') {
      next();
    } else {
      for (;;) {
        args.push(expression());
        const t = next();
        if (!t) fail('unclosed_paren');
        if (t.type === 'rparen') break;
        if (t.type !== 'comma') fail('unexpected_token');
      }
    }
    const arity = ARITY[name];
    if (arity && (args.length < arity[0] || args.length > arity[1])) fail('bad_arg_count');
    return { type: 'call', name, args };
  }

  try {
    const ast = expression();
    if (pos < tokens.length) {
      return { error: tokens[pos].type === 'rparen' ? 'unexpected_paren' : 'unexpected_token' };
    }
    return { ast, tokens };
  } catch (e) {
    if (e instanceof ParseError) return { error: e.key };
    throw e;
  }
}
