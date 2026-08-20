import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkSources, readSource, blankStringBodies } from '../sourceScan.mjs';

/**
 * A DESTRUCTURED PROP MUST NOT BE NAMED AFTER A BROWSER GLOBAL.
 *
 * ── THE DEFECT THIS IS BUILT FROM ───────────────────────────────────────────
 * FilterPanel took the date range as a prop named `window`:
 *
 *     export function FilterPanel({ window, course = '', … }) {
 *
 * That binding SHADOWS THE GLOBAL for the whole component body. The reposition
 * effect then threw `window.addEventListener is not a function` on mount — the
 * prop is a plain `{from,to,custom,swapped}` object, a real object with no such
 * method — and the panel could not mount at all. It shipped that way.
 *
 * The half that did NOT throw is why this is a guard rather than a check at the
 * call site: the same body read `window.innerWidth` for its viewport, got
 * `undefined`, and fed NaN geometry into `anchoredMenuPosition` in silence. A
 * shadow breaks EVERY use of the global in scope, and only the ones that CALL
 * something announce themselves.
 *
 * ── WHY A SOURCE SCAN, AND WHY THIS SHAPE IS ACTUALLY VISIBLE TO ONE ────────
 * The throw is effect-only. The render tier is `renderToStaticMarkup`, which
 * never runs an effect, and `createRoot` is banned here for leaking
 * `globalThis.window` across the shared process (it once broke twenty-eight
 * render tests). No tier that exists could have seen the failure.
 *
 * But the CAUSE is not effect-only. It is a name in a binding position, which
 * is the one thing a text scanner reads well. This guard does not attempt the
 * defect; it attempts the shape that makes the defect possible, and it closes
 * that shape. See "WHAT THIS CANNOT SEE" for everything it leaves open.
 *
 * ── SCOPE: `'use client'` FILES ONLY, AND THAT IS A DELIBERATE NARROWING ────
 * Browser globals are only reachable in client code, so a shadow only bites
 * there. Scanning server modules too would cost more than it buys: `location`
 * on a venue record and `document` on a Mongo row are legitimate names, and a
 * guard that flags them earns an exemption list, which is how guards die.
 *
 * THE GAP THAT LEAVES: a shared module with no directive, imported BY a client
 * component, runs as client code and is not scanned. The shadow would be just
 * as real there. The directive is a proxy for "is this client code", and it is
 * the only proxy a text scanner has.
 *
 * ── THE NAME LIST, AND WHY IT IS SHORT ──────────────────────────────────────
 * Two conditions, both required:
 *   1. the global is an OBJECT whose members a client component plausibly
 *      reaches BARE — `document.querySelector`, `navigator.clipboard`,
 *      `location.search`, `localStorage.getItem`;
 *   2. the name is not a plausible domain noun in this repo.
 *
 * Condition 2 was MEASURED, not assumed. Scanning every candidate global across
 * all of src/ found these already shadowed, every one of them legitimately:
 *
 *     name    18 files      open    15 files      status   9 files
 *     history  5 files      origin   3 files      event    1 file
 *
 * `history` is the instructive one: `window.history` is real API, but `history`
 * is also what an audit trail is called on three screens here, and bare
 * `history.pushState` is not how anyone writes it. Guarding it would redden
 * five non-defects on day one and teach the next reader to suppress this file.
 *
 * Excluded for the same reason — no hits today, but the same collision risk and
 * near-zero value: `top`, `self`, `parent`, `length`, `close`, `focus`,
 * `scroll`, `frames`. Nobody calls bare `close()` meaning `window.close()`.
 *
 * The seven below had ZERO shadows across all of src/ when this landed, client
 * and server alike, so the guard starts clean and every future hit is news.
 */
const GUARDED_GLOBALS = [
  'window',
  'document',
  'location',
  'navigator',
  'screen',
  'localStorage',
  'sessionStorage',
];

/**
 * WHAT THIS CANNOT SEE — stated at the guard, per the standing rule that a
 * shape check says so rather than reading as behavioural coverage.
 *
 *  · A SHADOW CREATED ANY OTHER WAY. `function window() {}`, `class window`,
 *    `import { window } from …`, `catch (window)`, a bare `let window`, or an
 *    assignment-destructure `({ window } = props)` in a function body. Only
 *    parameter patterns and const/let/var declarations are read. Each of those
 *    is rarer than the prop case and none has shipped here; the prop case has.
 *  · SOMETHING REPLACING `globalThis.window` AT RUNTIME. Ruled out for this
 *    defect, and a different failure entirely — it is the reason `createRoot`
 *    is banned in this suite, and no source scan would find it.
 *  · EVERY OTHER EFFECT-ONLY DEFECT. This closes ONE SHAPE, not the class. A
 *    `useEffect` that throws for any other reason is still invisible to every
 *    tier here and this file does not change that. It is not a substitute for
 *    the mount coverage the suite does not have, and must not be read as one.
 *  · MEANING THAT NEEDS A PARSER. This brace-matches; it does not parse.
 */

// ── Reading binding positions out of source text ────────────────────────────

/** Index of the `}` closing the `{` at `open`, or -1. */
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

function skipWs(s, i) {
  let j = i;
  while (j < s.length && /\s/.test(s[j])) j += 1;
  return j;
}

/** Split a pattern body on its TOP-LEVEL commas only. */
function splitTop(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * The names a destructuring pattern body BINDS.
 *
 * The `a: b` case is the one that matters and is easy to get backwards: it
 * binds `b`, NOT `a`. `{ window: dateWindow }` introduces no shadow at all and
 * must not be reported — it is a legitimate fix for this very defect, and a
 * guard that flagged it would forbid its own remedy. There is a control below.
 */
function boundNames(body, acc = []) {
  for (const part of splitTop(body)) {
    const p = part.trim();
    if (!p || p.startsWith('...')) continue;

    const colon = p.indexOf(':');
    const brace = p.indexOf('{');

    if (colon !== -1 && (brace === -1 || colon < brace)) {
      const rhs = p.slice(colon + 1).trim();
      if (rhs.startsWith('{')) {                 // `a: { window }` — nested pattern
        const end = matchBrace(rhs, 0);
        if (end !== -1) boundNames(rhs.slice(1, end), acc);
        continue;
      }
      const m = /^([A-Za-z_$][\w$]*)/.exec(rhs);
      if (m) acc.push(m[1]);
      continue;
    }

    const m = /^([A-Za-z_$][\w$]*)/.exec(p);
    if (m) acc.push(m[1]);
    if (brace !== -1) {                          // `{ a: { window } }` reached bare
      const end = matchBrace(p, brace);
      if (end !== -1) boundNames(p.slice(brace + 1, end), acc);
    }
  }
  return acc;
}

/**
 * Every destructuring PATTERN in already-scrubbed source.
 *
 * ── THE DISCRIMINATOR, WHICH IS THE WHOLE DIFFICULTY ────────────────────────
 * `{ window }` in an ARGUMENT is a shorthand READ of the global, not a binding:
 *
 *     activeSummary({ window, course })     // reads it — must NOT be reported
 *     function activeSummary({ window })    // binds it — MUST be reported
 *
 * Both are `({ … })` in text, and the pre-fix FilterPanel contained BOTH on
 * adjacent lines. What separates them is what follows the closing paren: a
 * parameter list is followed by `=>` or the function body's `{`, while a call
 * is followed by `;`, `)`, `,` or `}`. That single test is also what lets the
 * `,` position in below — `function f(a, { window })` — without dragging every
 * `foo(a, { window })` call site along with it.
 */
function destructuringPatterns(code) {
  const out = [];
  for (let i = 0; i < code.length; i += 1) {
    let open = -1;
    let kind = null;

    if (code[i] === '(' || code[i] === ',') {
      const j = skipWs(code, i + 1);
      if (code[j] === '{') { open = j; kind = 'param'; }
    } else if (/[A-Za-z_$]/.test(code[i]) && !/[\w$.]/.test(code[i - 1] ?? ' ')) {
      const m = /^(?:const|let|var)\b/.exec(code.slice(i, i + 6));
      if (m) {
        const j = skipWs(code, i + m[0].length);
        if (code[j] === '{') { open = j; kind = 'decl'; }
      }
    }
    if (open === -1) continue;

    const close = matchBrace(code, open);
    if (close === -1) continue;

    let k = skipWs(code, close + 1);

    if (kind === 'param') {
      // `({ … } = {}) =>` — a defaulted pattern is still a pattern.
      if (code[k] === '=' && code[k + 1] !== '=') {
        const eq = skipWs(code, k + 1);
        if (code[eq] !== '{') continue;
        const end = matchBrace(code, eq);
        if (end === -1) continue;
        k = skipWs(code, end + 1);
      }
      // Walk any trailing parameters to the paren that closes the list. Bounded
      // on `;` and newline rather than run to EOF: an unbalanced `(` earlier in
      // the file must not let this swallow the rest of the source and report a
      // pattern that is not there.
      while (k < code.length && code[k] !== ')' && code[k] !== ';' && code[k] !== '\n') k += 1;
      if (code[k] !== ')') continue;
      k = skipWs(code, k + 1);
      if (!(code[k] === '{' || code.startsWith('=>', k))) continue;
    } else if (code[k] !== '=' || code[k + 1] === '=') {
      continue;
    }

    out.push(code.slice(open + 1, close));
  }
  return out;
}

/**
 * Every shadow in one file, as `{global, rel}` rows.
 *
 * `blankStringBodies` layered on `code` because the subject is an IDENTIFIER,
 * not text: a log line or a doc string that happens to contain `({ window })`
 * names it without binding it. That layering is what sourceScan's own header
 * prescribes for identifier guards, and there is a control for it.
 */
function shadowsIn(src) {
  const code = blankStringBodies(src.code);
  const found = [];
  for (const body of destructuringPatterns(code)) {
    for (const bound of boundNames(body)) {
      if (GUARDED_GLOBALS.includes(bound)) found.push({ global: bound, rel: src.rel });
    }
  }
  return found;
}

const isClientComponent = (src) => /^\s*(['"])use client\1/.test(src.code.trimStart());

const CLIENT_SOURCES = walkSources('src').filter(isClientComponent);

// ── The claim ───────────────────────────────────────────────────────────────

test('the scan actually reaches the client components', () => {
  // A scan over zero files passes every assertion below it. This is the vacuity
  // floor, not a census — it exists so a broken directive match or a renamed
  // source root cannot read as "no shadows found".
  assert.ok(
    CLIENT_SOURCES.length >= 150,
    `only ${CLIENT_SOURCES.length} 'use client' files found — the scan is not reaching src/`
  );
});

test('no client component destructures a prop named after a browser global', () => {
  const shadows = CLIENT_SOURCES.flatMap(shadowsIn);
  assert.deepEqual(
    shadows.map((s) => `${s.rel}: ${s.global}`).sort(),
    [],
    'a destructured binding shadows a browser global for its whole scope — every '
    + 'use of that global in the same function silently becomes a property read on '
    + 'the prop, and only the ones that CALL something throw. Rename the binding '
    + '(`window` → `dateWindow`), or alias it at the pattern (`{ window: dateWindow }`), '
    + 'which binds no `window` at all.'
  );
});

// ── Controls ────────────────────────────────────────────────────────────────
//
// The first two run against the REAL FilterPanel source rather than a fixture,
// so they track the file they were written for. If its signature is ever
// reshaped past what this scanner reads, the revert control goes green when it
// should be red — and says so here, at the guard, rather than silently.

const FILTER_PANEL = 'src/app/admin/registrations/_components/FilterPanel.jsx';

/**
 * TWO, AND THE SECOND ONE IS THE ARGUMENT FOR THIS FILE.
 *
 * This control was written expecting ONE hit and the scanner returned two. The
 * scanner was right. The pre-fix source bound `window` in two places:
 *
 *     function activeSummary({ window, course, courseLabel }) {   // line 106
 *     export function FilterPanel({ window, course = '', … }) {   // line 121
 *
 * Only the second one ever threw, because only the second one went on to call
 * `window.addEventListener`. `activeSummary` reads nothing but its own prop, so
 * its shadow was harmless THAT DAY and invisible in every direction — no throw,
 * no wrong pixel, nothing for a reviewer to notice. It would have stayed that
 * way until somebody added a `document.` or a `navigator.` inside it.
 *
 * That is the whole case for scanning names instead of waiting for symptoms,
 * and it is why the guard flags a shadow whether or not the file currently uses
 * the global. Assert the count exactly, not `>= 1`: a floor here would have
 * hidden the second one and the finding with it.
 */
test('CONTROL: putting the `window` prop back into FilterPanel reddens the scan', () => {
  const real = readSource(FILTER_PANEL);
  const reverted = { ...real, code: real.code.replace(/\bdateWindow\b/g, 'window') };

  assert.notEqual(real.code, reverted.code, 'FilterPanel no longer has a `dateWindow` to revert');
  assert.deepEqual(
    shadowsIn(reverted).map((s) => `${s.rel}: ${s.global}`),
    [`${FILTER_PANEL}: window`, `${FILTER_PANEL}: window`],
    'the pre-fix source bound `window` twice — activeSummary and FilterPanel'
  );
});

test('CONTROL: renaming an innocent prop does NOT redden the scan', () => {
  const real = readSource(FILTER_PANEL);
  const renamed = { ...real, code: real.code.replace(/\bdateWindow\b/g, 'dateRange') };

  assert.notEqual(real.code, renamed.code, 'FilterPanel no longer has a `dateWindow` to rename');
  assert.deepEqual(shadowsIn(renamed), [], 'a non-colliding prop name must not be reported');
});

test('CONTROL: the real FilterPanel, as it stands, is clean', () => {
  assert.deepEqual(shadowsIn(readSource(FILTER_PANEL)), []);
});

/**
 * The shapes the discriminator has to separate. Fixtures rather than real files,
 * because most of them do not occur in this repo — the point is that the scanner
 * tells them apart, not that anybody wrote them.
 */
const DISCRIMINATION = [
  // Bindings — must be reported.
  { why: 'a destructured parameter binds', src: 'function F({ window, course }) { return 1; }', expect: ['window'] },
  { why: 'an arrow parameter binds', src: 'const f = ({ document }) => document;', expect: ['document'] },
  { why: 'a const declaration binds', src: 'const { location } = props;', expect: ['location'] },
  { why: 'a second parameter binds', src: 'function F(a, { navigator }) { return a; }', expect: ['navigator'] },
  { why: 'a defaulted pattern binds', src: 'const f = ({ screen } = {}) => screen;', expect: ['screen'] },
  { why: 'a nested pattern binds', src: 'function F({ opts: { localStorage } }) { return 1; }', expect: ['localStorage'] },
  { why: 'a default value does not hide the binding', src: "function F({ window = null }) { return 1; }", expect: ['window'] },

  // Reads and lookalikes — must NOT be reported.
  { why: 'an ARGUMENT is a read, not a binding', src: 'activeSummary({ window, course });', expect: [] },
  { why: 'an alias binds the NEW name only', src: 'function F({ window: dateWindow }) { return dateWindow; }', expect: [] },
  { why: 'a spread argument is a read', src: 'render({ ...{ document } });', expect: [] },
  { why: 'a same-named PROPERTY is not a binding', src: 'const o = { window: 1, screen: 2 };', expect: [] },
  { why: 'a rest element is not a named binding', src: 'function F({ ...window }) { return 1; }', expect: [] },
];

for (const { why, src, expect } of DISCRIMINATION) {
  test(`discrimination: ${why}`, () => {
    assert.deepEqual(shadowsIn({ rel: 'fixture', code: src }).map((s) => s.global), expect);
  });
}

test('CONTROL: a string containing the binding shape is not read as code', () => {
  // The `blankStringBodies` layer. Without it this reports `window` and the
  // guard would redden on prose — including the prose in this very file.
  const src = 'const msg = "function F({ window }) { return 1; }";';
  assert.deepEqual(shadowsIn({ rel: 'fixture', code: src }).map((s) => s.global), []);
});

test('CONTROL: an unguarded global is deliberately NOT reported', () => {
  // `history` is out of GUARDED_GLOBALS on purpose (see the header). If this
  // ever starts reporting, someone widened the list without re-reading why it
  // is narrow, and five legitimate `history` props go red with it.
  const src = 'function F({ history }) { return history; }';
  assert.deepEqual(shadowsIn({ rel: 'fixture', code: src }).map((s) => s.global), []);
});
