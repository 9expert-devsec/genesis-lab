import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The rail's scrollbar rules are SCOPED, and they are painted from tokens.
 *
 * ══ WHY A SCROLLBAR RULE NEEDS ITS OWN GUARD ════════════════════════════════
 * `::-webkit-scrollbar` is a pseudo-element like any other, and the shortest
 * way to write one is the one with the widest blast radius:
 *
 *     ::-webkit-scrollbar-thumb { background: #7E8898; }
 *
 * That restyles EVERY scrollbar in the application — every admin table, every
 * dialog, the page itself, and eventually the public site — in the colours of a
 * dark sidebar they have nothing to do with. It throws no error, breaks no
 * build, fails no render test, and looks in review exactly like the scoped
 * version with four characters missing. Same for a `scrollbar-color` on `*`,
 * `html`, `body` or `:root`.
 *
 * So this file's subject is the SELECTOR, not the colour. It reads every
 * scrollbar declaration in globals.css and asks who it lands on.
 *
 * ── IT COVERS THE WHOLE STYLESHEET, NOT JUST THE RAIL'S BLOCK ───────────────
 * A guard that only looked at the rail's own rules could not see the global one
 * somebody adds three hundred lines further down — which is the failure. The
 * two pre-existing scrollbar utilities in this file (.scrollbar-hide,
 * .no-native-scrollbar) are class-scoped and pass on their own merits; they are
 * not exempted, because an exemption list is how the next global rule gets in.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * CSS text. It does not know that .admin-rail-scroll is applied to the nav (a
 * render test does that), and it cannot tell you the bar is legible on a real
 * screen. Named as unverified in the round report.
 */

const CSS_REL = 'src/app/globals.css';
const CSS = readSource(CSS_REL).raw;

/** Comments out — this file's matchers are about selectors, and the rail's
 *  comments discuss selectors by name. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every rule whose body or selector concerns a scrollbar, as { selector, body }.
 *
 * Bounded on `}` and matched over the comment-stripped source. The selector is
 * everything back to the previous `}` or `{`, trimmed — good enough for a flat
 * stylesheet, and this one is flat apart from `@layer base` and two `@media`
 * blocks, none of which contain a scrollbar rule (asserted below).
 */
function scrollbarRules(code) {
  const out = [];
  for (const m of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const body = m[2];
    if (/scrollbar/i.test(selector) || /scrollbar-(width|color|gutter)\s*:/i.test(body)) {
      out.push({ selector, body });
    }
  }
  return out;
}

const RULES = scrollbarRules(CODE);

/**
 * The selector shapes that reach every scrollbar in the application.
 *
 * ONE constant, used by both the guard and its control — they were written as
 * two copies and the copies disagreed. `(?![\w-])` rather than `\b`, and the
 * control is what found it: `\b` after `*` asserts a word boundary AFTER a
 * character that is not a word character, so the bare universal selector — the
 * widest shape on the list — silently did not match. A lookahead for "not a
 * name character" is the right question and answers it at end-of-string too.
 */
const GLOBAL_SELECTOR = /^(\*|html|body|:root)(?![\w-])|^::-webkit-scrollbar/;

test('the scan found the scrollbar rules — it is not reporting on an empty list', () => {
  // Every assertion below is a "for each rule" loop, and all of them pass
  // triumphantly over zero rules. There are three utilities in this file today
  // (.scrollbar-hide, .no-native-scrollbar, .admin-rail-scroll) across a
  // handful of rules; the floor is deliberately low so adding one is not a
  // reason to edit this number, but zero is not survivable.
  assert.ok(RULES.length >= 6, `only ${RULES.length} scrollbar rules found — the scan is wrong`);
  assert.ok(RULES.some((r) => r.selector.includes('.admin-rail-scroll')),
    'the rail has no scrollbar rule at all — this whole file is guarding nothing');
});

// ── D6.4a: SCOPE ────────────────────────────────────────────────────────────
test('no scrollbar rule is declared globally', () => {
  // The four shapes that reach everything. A bare pseudo-element selector is
  // the one to watch — it is what you get by deleting the class from the front,
  // which is the likeliest way this breaks.
  const offenders = RULES.filter((r) => GLOBAL_SELECTOR.test(r.selector)).map((r) => r.selector);
  assert.deepEqual(offenders, [],
    'a scrollbar rule is declared on a global selector. It restyles every scrollbar '
    + 'in the admin and on the public site, silently — scope it to the container '
    + 'that owns the scroll, the way .admin-rail-scroll does');
});

test('every scrollbar rule is anchored to a class', () => {
  // The other direction, and it catches what the deny-list above cannot: a
  // selector like `aside ::-webkit-scrollbar` or `main div` is neither on the
  // list nor scoped to anything a component opted into.
  for (const { selector } of RULES) {
    assert.match(selector, /^\.[\w-]+/,
      `"${selector}" does not start with a class. A scrollbar rule has to be opted `
      + 'into by the element that owns the scroll container, not inherited by shape');
  }
});

test('CONTROL: the scope matcher really does catch the global shapes', () => {
  // Without this, a regex that matched nothing would report [] forever and the
  // guard above would be a decoration. Local fixtures, so the control stays
  // green while the real assertion goes red.
  const fixture = `
    ::-webkit-scrollbar { width: 10px; }
    * { scrollbar-width: thin; }
    body::-webkit-scrollbar-thumb { background: #000; }
    html { scrollbar-color: red blue; }
    .ok::-webkit-scrollbar { width: 10px; }
  `;
  const found = scrollbarRules(fixture);
  assert.equal(found.length, 5, `the fixture parsed as ${found.length} rules`);
  assert.deepEqual(
    found.filter((r) => GLOBAL_SELECTOR.test(r.selector)).map((r) => r.selector),
    ['::-webkit-scrollbar', '*', 'body::-webkit-scrollbar-thumb', 'html'],
  );
});

// ── D6.4b: COLOUR COMES FROM TOKENS ─────────────────────────────────────────
test('the rail scrollbar rules carry no hex literal', () => {
  // The same rule as the rest of the rail, at the one tier that can see it:
  // these declarations live in a stylesheet, so test/fs/adminRailTheme's scan
  // over the COMPONENT files cannot reach them.
  const rail = RULES.filter((r) => r.selector.includes('.admin-rail-scroll'));
  assert.ok(rail.length >= 4, `only ${rail.length} rail scrollbar rules — the filter is wrong`);
  const offenders = [];
  for (const { selector, body } of rail) {
    for (const hit of body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) offenders.push(`${selector} → ${hit[0]}`);
  }
  assert.deepEqual(offenders, [],
    'a raw colour is back in the rail scrollbar. Colour comes from the '
    + '--admin-rail-scroll-* tokens; if neither fits, ADD one in the :root block '
    + 'beside them — never inline it here');
});

test('every colour in the rail scrollbar rules is a --admin-rail-* var()', () => {
  // The positive claim, and it is not the same as "no hex". A named colour
  // (`grey`), an `rgb(...)`, or a var() pointing at a theme-aware token would
  // all pass the hex guard above and all put a colour on the rail that the
  // token set does not govern.
  const COLOUR_PROPS = /(^|;)\s*(background|background-color|border|border-color|color|scrollbar-color)\s*:\s*([^;]+)/gi;
  const rail = RULES.filter((r) => r.selector.includes('.admin-rail-scroll'));
  let checked = 0;
  for (const { selector, body } of rail) {
    for (const m of body.matchAll(COLOUR_PROPS)) {
      checked += 1;
      const value = m[3].trim();
      const vars = [...value.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((x) => x[1]);
      assert.ok(vars.length > 0,
        `${selector} { ${m[2]}: ${value} } names a colour directly rather than a token`);
      for (const name of vars) {
        assert.match(name, /^--admin-rail-/,
          `${selector} reads ${name}. The rail paints from --admin-rail-* only; anything `
          + 'else can be redeclared under .dark and would flip the bar with the theme');
      }
    }
  }
  assert.ok(checked >= 4, `only ${checked} colour declarations swept — the property list is wrong`);
});

test('the rail scrollbar reads BOTH of its tokens, and they are declared', () => {
  // Two tokens were added for this. If one were never read, it would sit in
  // globals.css forever looking load-bearing, and the guards above would all
  // pass over the half that is used.
  const rail = RULES.filter((r) => r.selector.includes('.admin-rail-scroll'))
    .map((r) => r.body).join('\n');
  for (const token of ['--admin-rail-scroll-track', '--admin-rail-scroll-thumb']) {
    assert.ok(rail.includes(`var(${token})`), `${token} is declared but the rules never read it`);
    assert.match(CODE, new RegExp(`${token}\\s*:`), `${token} is read but never declared`);
  }
});

// ── D3: the affordance itself ───────────────────────────────────────────────
test('the bar is not hidden, not hairline-thin, and not hover-only', () => {
  // The three ways a "themed" scrollbar quietly becomes no scrollbar. The admin
  // has to see at a glance that the list scrolls and where in it they are —
  // same affordance as the default, different clothes.
  const rail = RULES.filter((r) => r.selector.includes('.admin-rail-scroll'));
  const bar = rail.find((r) => /::-webkit-scrollbar$/.test(r.selector));
  assert.ok(bar, 'no ::-webkit-scrollbar width rule on the rail');
  assert.ok(!/display\s*:\s*none/.test(bar.body), 'the rail scrollbar is hidden');
  const width = Number((bar.body.match(/width\s*:\s*(\d+)px/) ?? [])[1]);
  assert.ok(width >= 8, `the rail scrollbar is ${width}px wide — that is a hairline, not a control`);
  for (const { selector } of rail) {
    assert.ok(!/:hover/.test(selector),
      `"${selector}" makes part of the bar hover-only; a thumb that appears on hover `
      + 'cannot say where you are in the list before you reach for it');
  }
  const wide = rail.find((r) => /^\.admin-rail-scroll$/.test(r.selector));
  assert.ok(wide && /scrollbar-width\s*:\s*thin/.test(wide.body),
    'Firefox gets no scrollbar-width, so it keeps the pale default bar');
  assert.ok(wide && /scrollbar-color\s*:/.test(wide.body),
    'Firefox gets no scrollbar-color, so it keeps the pale default colours');
});

test('the gutter is reserved, and the collapsed rail reserves it on BOTH edges', () => {
  // D3 asks for a stable gutter so rows do not shift sideways as the list
  // crosses the scrolling threshold. At 64px a one-edge gutter would instead
  // shift the whole icon column 5px off the rail's centre line — permanently,
  // and out of line with the header and footer — so the collapsed state uses
  // `both-edges`. Two declarations, one requirement; asserting only the first
  // would let the second be dropped as redundant.
  const base = RULES.find((r) => /^\.admin-rail-scroll$/.test(r.selector));
  assert.match(base.body, /scrollbar-gutter\s*:\s*stable/, 'the expanded rail reserves no gutter');
  const centred = RULES.find((r) => /admin-rail-scroll-centred/.test(r.selector));
  assert.ok(centred, 'the collapsed rail has no gutter rule of its own');
  assert.match(centred.body, /scrollbar-gutter\s*:\s*stable both-edges/,
    'the collapsed gutter is one-edged, which puts the icon column off the rail centre');
});
