import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backgroundClass, themeSurface } from '@/lib/pageBuilder/presets';
import { BACKGROUNDS } from '@/lib/schemas/sections/base';
import { PAGE_THEMES } from '@/lib/schemas/pageBuilder';

/**
 * ROUND 78 — THE ASSERTION WHOSE ABSENCE LET THE DEFECT SHIP.
 *
 * `BACKGROUND_CLASS` resolved to literal Tailwind colours (`bg-white`,
 * `bg-9e-ice`, `bg-9e-slate-lt-800`, `bg-9e-navy`) and `THEME.pageClass` did
 * the same. Every one is a raw brand hex that globals.css declares ONCE, with
 * no `.dark` counterpart — so a published Page Builder page rendered an opaque
 * light slab on a dark canvas, and every existing test passed, because every
 * existing test asked what the CLASS STRING was.
 *
 * Nothing could catch that except reading the STYLESHEET and asking what each
 * key resolves to in each theme. That is what this file does, and it makes two
 * claims that must both hold:
 *
 *   1. LIGHT IS UNCHANGED. Each key's `:root` value is byte-identical to the
 *      literal it replaced. This is the safety property of the whole change —
 *      it is not a re-palette.
 *   2. DARK IS DIFFERENT. Each key resolves to a different value under
 *      `.dark`. A key that does not has silently gone back to being a literal.
 *
 * Each has a CONTROL, because "every key passed" and "the loop never ran" print
 * the same nothing.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * COMMENTS ARE STRIPPED FIRST, and the first draft of this file proves why.
 *
 * The `.dark` declarations carry trailing notes like
 * `--pb-bg-white: #0D1B2A;   /* = --page-bg : the ground *​/`. A declaration
 * regex run over the raw text matches `--page-bg : the ground …` INSIDE that
 * comment and swallows the next real declaration with it, so `--pb-bg-light`
 * was never captured and the dark-mode assertion failed against a stylesheet
 * that was correct. The red was the parser, not the source.
 */
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of one top-level rule block, by selector. */
function blockDecls(selector) {
  const start = CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `globals.css has no top-level \`${selector} {\` block`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  assert.notEqual(end, -1, `unterminated \`${selector}\` block`);
  const out = new Map();
  for (const m of CSS.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim().toUpperCase());
  }
  return out;
}
const LIGHT = blockDecls(':root');
const DARK = blockDecls('.dark');

/**
 * THE LITERALS AS THEY WERE BEFORE ROUND 78, transcribed from the pre-change
 * source. This is the only place in the repo that records them, and it is the
 * fixture the light-mode claim is checked against — a value copied out of
 * today's globals.css would make claim 1 vacuously true.
 */
const LIGHT_BEFORE_ROUND_78 = {
  white:     '#FFFFFF',   // was bg-white
  light:     '#F8FAFD',   // was bg-9e-ice
  soft_gray: '#F1F3F6',   // was bg-9e-slate-lt-800
  dark:      '#0D1B2A',   // was bg-9e-navy
};
/** The variable each key now reads. */
const VAR_FOR = {
  white: '--pb-bg-white',
  light: '--pb-bg-light',
  soft_gray: '--pb-bg-soft-gray',
  dark: '--pb-bg-dark',
};

// ── 1. LIGHT MODE IS BYTE-IDENTICAL ────────────────────────────────────────

test('every converted preset key still renders its exact pre-round-78 light value', () => {
  let checked = 0;
  for (const [key, was] of Object.entries(LIGHT_BEFORE_ROUND_78)) {
    const cls = backgroundClass(key);
    const varName = VAR_FOR[key];
    assert.equal(cls, `bg-[var(${varName})]`,
      `\`${key}\` no longer reads ${varName}; it resolves to "${cls}"`);
    assert.ok(LIGHT.has(varName), `globals.css :root does not declare ${varName}`);
    assert.equal(LIGHT.get(varName), was,
      `\`${key}\` CHANGED WHAT IT PAINTS IN LIGHT MODE: ${varName} is ${LIGHT.get(varName)}, `
      + `but the literal it replaced was ${was}. Round 78's rule is that the light rendering does `
      + 'not move — this is a re-palette, which is a different decision.');
    checked += 1;
  }
  assert.equal(checked, 4, 'the loop did not check all four converted keys');
});

test('CONTROL: the light-value check names a key when its value moves', () => {
  /**
   * Without this, the assertion above could be comparing a value to itself.
   * A deliberately wrong expectation must fail, and must fail NAMING the key.
   */
  assert.throws(
    () => assert.equal(LIGHT.get('--pb-bg-white'), '#FEFEFE',
      '`white` CHANGED WHAT IT PAINTS IN LIGHT MODE'),
    /white/,
    'the comparison cannot see a changed light value',
  );
  // …and the real value is not the wrong one, so the check above is meaningful.
  assert.notEqual(LIGHT.get('--pb-bg-white'), '#FEFEFE');
});

// ── 2. DARK MODE IS DIFFERENT ──────────────────────────────────────────────

test('every converted preset key resolves DIFFERENTLY under .dark', () => {
  let checked = 0;
  for (const key of Object.keys(LIGHT_BEFORE_ROUND_78)) {
    const varName = VAR_FOR[key];
    assert.ok(DARK.has(varName),
      `globals.css .dark does not declare ${varName}, so \`${key}\` paints its LIGHT colour on a `
      + 'dark page — the exact defect round 78 fixed.');
    assert.notEqual(DARK.get(varName), LIGHT.get(varName),
      `${varName} is ${DARK.get(varName)} in BOTH themes, so \`${key}\` has gone back to being a `
      + 'literal in all but name.');
    checked += 1;
  }
  assert.equal(checked, 4);
});

test('CONTROL: a key left as a literal is named by the check above', () => {
  /**
   * `brand_gradient` is the real case — it is deliberately NOT converted, and
   * it therefore resolves the same in both themes. Running the dark check
   * against it must FAIL, which proves the check discriminates rather than
   * passing on everything.
   */
  assert.equal(backgroundClass('brand_gradient'), 'bg-9e-gradient-hero',
    'brand_gradient was converted after all — then it needs a dark counterpart and its own row');
  assert.equal(DARK.has('--pb-bg-brand-gradient'), false,
    'a --pb-bg-brand-gradient appeared; the exclusion in presets.js is now wrong');
  // The literal it paints has no .dark form — that is what "unconverted" means.
  for (const raw of ['--9e-action', '--9e-air']) {
    assert.ok(LIGHT.has(raw), `${raw} is not declared in :root`);
    assert.equal(DARK.has(raw), false,
      `${raw} gained a .dark value, so brand_gradient is no longer theme-invariant and the `
      + 'reason presets.js gives for leaving it alone has stopped being true');
  }
});

// ── 3. THE PAGE SHELL, WHICH IS WHAT THE AUTHOR ACTUALLY SAW ──────────────

test('every page theme paints its shell through theme-aware variables', () => {
  /**
   * All 63 live sections in the corpus carry `background: default`, whose class
   * is ''. So the slab the author reported was never BACKGROUND_CLASS at all —
   * it was THEME.pageClass, inherited. Converting one without the other would
   * have changed nothing on the page that prompted this.
   */
  let checked = 0;
  for (const theme of PAGE_THEMES) {
    const { pageClass } = themeSurface(theme);
    const bg = /bg-\[var\((--[\w-]+)\)\]/.exec(pageClass);
    assert.ok(bg, `theme "${theme}" paints its shell with a literal: "${pageClass}"`);
    assert.ok(DARK.has(bg[1]) && DARK.get(bg[1]) !== LIGHT.get(bg[1]),
      `theme "${theme}" reads ${bg[1]}, which does not change under .dark`);
    checked += 1;
  }
  assert.equal(checked, PAGE_THEMES.length);
  assert.ok(checked >= 7, 'PAGE_THEMES shrank — the sweep is checking fewer themes than it did');
});

test('corporate_navy keeps a literal text colour, and that is correct', () => {
  /**
   * It is a dark band in BOTH themes, so its text must be light in both.
   * `--text-primary` is #0D1B2A in light, which would be navy on navy. The one
   * place the old literal is still right is the one place it is kept — pinned
   * so a later sweep does not "finish the job" and break it.
   */
  const { pageClass } = themeSurface('corporate_navy');
  assert.match(pageClass, /text-9e-ice/,
    'corporate_navy stopped using a literal light text colour; --text-primary would paint navy '
    + 'on navy in LIGHT mode');
  assert.equal(/text-\[var\(--text-primary\)\]/.test(pageClass), false);
});

// ── 4. NOTHING ELSE IN THE TABLE MOVED ────────────────────────────────────

test('the keys that paint nothing still paint nothing', () => {
  for (const key of ['default', 'image']) {
    assert.equal(backgroundClass(key), '',
      `\`${key}\` started painting something; it is the inherit/TODO case`);
  }
  // And the enum is fully covered, so a new key cannot arrive unmeasured.
  const covered = new Set([...Object.keys(LIGHT_BEFORE_ROUND_78), 'brand_gradient', 'default', 'image']);
  assert.deepEqual([...BACKGROUNDS].sort(), [...covered].sort(),
    'BACKGROUNDS changed — a new preset background exists that this file says nothing about');
});
