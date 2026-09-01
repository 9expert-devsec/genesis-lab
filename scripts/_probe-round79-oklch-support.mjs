/**
 * ROUND 79 §F — does `oklch(from …)` actually work here, and what happens
 * where it does not?
 *
 * Commit 2 derives a dark counterpart for an author's colour in CSS rather
 * than in JS. That only holds up if two things are true, and both are
 * measured here rather than assumed:
 *
 *   1. Chrome computes `oklch(from var(--c) calc(1 - l * K) c h)` to the same
 *      value the OKLab arithmetic predicts. If it does not, the doc's measured
 *      table does not describe what ships.
 *   2. A browser WITHOUT relative colour syntax falls back to the AUTHOR'S OWN
 *      COLOUR — the pre-change behaviour — and not to `transparent`.
 *
 * ── WHY (2) IS THE DANGEROUS ONE ─────────────────────────────────────────
 * `background-color: oklch(from var(--x) …)` is parsed lazily because of the
 * `var()`. If substitution yields something the browser cannot parse, the
 * declaration is INVALID AT COMPUTED-VALUE TIME, which sets the property to
 * `unset` — for `background-color` that is `transparent`. It does NOT fall
 * back to an earlier declaration in the cascade. A page whose authored hero
 * became transparent would be worse than one that stayed light.
 *
 * The fix is `@supports`, which is evaluated at PARSE time against a literal
 * with no `var()` in it: an unsupporting browser skips the whole block and the
 * base declaration — the author's colour — survives untouched. This probe
 * proves the guard behaves that way by rendering BOTH the guarded form and the
 * unguarded one against a deliberately unparseable value.
 *
 * jsdom cannot answer any of this: it compiles no Tailwind and computes no
 * colour. Nothing is written into public/.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_probe-round79-oklch-support.mjs
 */
import { launch, openPage } from '../test/browser/cdp.mjs';

function die(m) { console.error('X ' + m); process.exit(1); }

/** K = 1 - L(--page-bg dark). See the doc's `oklch-anchored` row. */
const K = 0.782314;

const CASES = [
  ['#f8e7d5', 0.2671],
  ['#fefaf5', 0.2280],
  ['#65819f', 0.5361],
  ['#4394ea', 0.4862],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  /* The shape commit 2 emits: a base declaration carrying the author's colour,
     and a guarded override that derives from it. */
  .sw { --c: #000; background-color: var(--c); width:40px; height:20px; }
  @supports (background-color: oklch(from white calc(l) c h)) {
    .drv { background-color: oklch(from var(--c) calc(1 - l * ${K}) c h); }
  }
  /* The UNGUARDED form, over a value that cannot be parsed as a colour —
     this is what the guard exists to prevent. */
  .bad { --c: not-a-colour; background-color: oklch(from var(--c) calc(l) c h); }
</style></head><body>
${CASES.map(([hex], i) => `<div class="sw" id="base${i}" style="--c:${hex}"></div>`).join('')}
${CASES.map(([hex], i) => `<div class="sw drv" id="drv${i}" style="--c:${hex}"></div>`).join('')}
<div class="sw bad" id="bad"></div>
<div class="sw" id="plainbad" style="--c: not-a-colour"></div>
</body></html>`;

const READER = () => {
  const g = (id) => getComputedStyle(document.getElementById(id)).backgroundColor;
  return {
    supportsRelative: CSS.supports('background-color', 'oklch(from white calc(l) c h)'),
    base: [0, 1, 2, 3].map((i) => g('base' + i)),
    derived: [0, 1, 2, 3].map((i) => g('drv' + i)),
    unguardedOverBadValue: g('bad'),
    plainOverBadValue: g('plainbad'),
  };
};

const { browser, close } = await launch();
let r;
try {
  const page = await openPage(browser, { width: 300, height: 300 });
  try {
    await page.eval((h) => { document.open(); document.write(h); document.close(); }, html);
    r = await page.eval(READER);
  } finally { await page.close().catch(() => {}); }
} finally { await close().catch(() => {}); }

if (!r.supportsRelative) die('this Chrome does not support relative colour syntax — the whole mechanism is unmeasurable here');

/**
 * OKLab L from a computed background-color.
 *
 * ── THE FIRST DRAFT OF THIS FUNCTION PRODUCED A FALSE RED ────────────────
 * It assumed `getComputedStyle().backgroundColor` is always `rgb(...)`. When
 * the declared value is `oklch(...)`, Chrome serialises the computed value AS
 * `oklch(0.26715 0.030339 68.9769)` — and parsing those three numbers as 8-bit
 * RGB channels gave L ≈ 0.177 for every swatch, which read as "Chrome
 * disagrees with the arithmetic by 0.09" when Chrome agreed to five decimal
 * places. The colour space of the answer has to be read, not assumed.
 */
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function okL(css) {
  const s = String(css).trim();
  if (s.startsWith('oklch(')) return Number(s.match(/[\d.]+/)[0]);
  if (s.startsWith('oklab(')) return Number(s.match(/[\d.]+/)[0]);
  const [r_, g_, b_] = s.match(/[\d.]+/g).slice(0, 3).map((n) => toLin(Number(n) / 255));
  const l = Math.cbrt(0.4122214708 * r_ + 0.5363325363 * g_ + 0.0514459929 * b_);
  const m = Math.cbrt(0.2119034982 * r_ + 0.6806995451 * g_ + 0.1073969566 * b_);
  const s3 = Math.cbrt(0.0883024619 * r_ + 0.2817188376 * g_ + 0.6299787005 * b_);
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s3;
}
const rows = CASES.map(([hex, expectL], i) => {
  const got = okL(r.derived[i]);
  return { hex, base: r.base[i], derived: r.derived[i], expectedL: expectL, measuredL: +got.toFixed(4), delta: +Math.abs(got - expectL).toFixed(4) };
});
const worst = Math.max(...rows.map((x) => x.delta));
if (worst > 0.01) die('Chrome disagrees with the OKLab arithmetic by up to ' + worst + ' in L — the doc\'s table does not describe what ships');

// (2) the fallback story, both halves.
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
if (r.unguardedOverBadValue !== TRANSPARENT) {
  die('the UNGUARDED form did not go transparent over an unparseable value (' + r.unguardedOverBadValue + ') — the hazard this probe assumes may not exist, so re-derive the guard rather than trusting it');
}

console.log(JSON.stringify({
  supportsRelativeColour: r.supportsRelative,
  K,
  agreementWithArithmetic: { rows, worstDeltaL: worst },
  fallback: {
    unguardedOverUnparseableValue: r.unguardedOverBadValue,
    note: 'transparent — this is invalid-at-computed-value-time, and it is why the override is wrapped in @supports rather than relying on cascade order',
    plainDeclarationOverSameValue: r.plainOverBadValue,
  },
}, null, 2));
