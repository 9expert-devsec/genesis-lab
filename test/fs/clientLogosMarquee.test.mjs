import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Marquee behaviour that rendered markup cannot see.
 *
 * LOGO-MARQUEE round: the motion moved from a requestAnimationFrame loop (main
 * thread — it stuttered under hydration, and wrapped at `scrollWidth / 3`, one
 * 48px gap short of the real period, so every loop jumped 16px) to a CSS
 * @keyframes animation on the compositor. Pause-on-hover and the
 * reduced-motion stop are CSS rules now, which renderToStaticMarkup cannot
 * exercise — so these source guards pin them, in the component AND in
 * globals.css.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SRC = readFileSync(
  path.join(ROOT, 'src/components/portfolio/ClientLogosSection.jsx'), 'utf8'
);
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');

test('the motion is a CSS animation: no rAF loop, no effect, no client JS left', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  for (const gone of ['requestAnimationFrame', 'cancelAnimationFrame', 'useEffect', 'useRef', 'scrollWidth', "'use client'"]) {
    assert.ok(!code.includes(gone), `"${gone}" is back in the marquee`);
  }
  assert.match(code, /marquee-track marquee-track--\$\{direction === 'right' \? 'right' : 'left'\}/);
  assert.match(code, /marqueeTrackVars\(logos\.length, speed\)/, 'the duration/shift vars are not set from the geometry');
  assert.match(CSS, /@keyframes marquee-to-left\s*\{[\s\S]*?translate3d\(var\(--marquee-shift\), 0, 0\)/);
  assert.match(CSS, /@keyframes marquee-to-right\s*\{[\s\S]*?from\s*\{ transform: translate3d\(var\(--marquee-shift\), 0, 0\); \}/);
  assert.match(CSS, /\.marquee-track--left\s*\{ animation: marquee-to-left\s+var\(--marquee-duration\) linear infinite; \}/);
  assert.match(CSS, /\.marquee-track--right \{ animation: marquee-to-right var\(--marquee-duration\) linear infinite; \}/);
});

test('pause-on-hover survives, as animation-play-state on the row', () => {
  assert.match(SRC, /className="marquee-row /);
  assert.match(CSS, /\.marquee-row:hover \.marquee-track \{ animation-play-state: paused; \}/);
});

test('the reduced-motion opt-out survives: no animation at all', () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{\s*\.marquee-track \{ animation: none; \}\s*\}/);
});

test('each copy carries its trailing gap, so one copy IS the period (no 16px seam)', () => {
  // gap-12 between a copy's logos AND pr-12 after its last — copies abut.
  assert.match(SRC, /<div key=\{copy\} className="flex shrink-0 items-center gap-12 pr-12">/);
  assert.match(SRC, /Array\.from\(\{ length: copies \}/);
});

test('the marquee logos load eagerly; the About wall keeps lazy', () => {
  assert.match(SRC, /loading="eager"/);
  assert.match(SRC, /export function ClientLogoImage\(\{ logo, className, loading = 'lazy' \}\)/);
  assert.match(SRC, /decoding="async"/);
});

/**
 * THE ACTUAL DEFECT, pinned. The white knockout (`brightness-0 invert`) is
 * intended — it is the wall. What was wrong was `opacity-40`, which turned
 * the wall into ghosts, and `opacity-70` dulling light mode.
 *
 * This scans class strings AND expression-built class names. An earlier
 * version matched only `className="..."` literals; once the component moved
 * to a conditional `className={...}` that guard passed vacuously while the
 * filters were right there in the file. Strip comments, then scan the code.
 */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments name these utilities
  .replace(/\/\/[^\n]*/g, ' ');

test('no opacity reduction is reintroduced — that was the defect', () => {
  for (const banned of ['opacity-40', 'opacity-70', 'opacity-100', 'grayscale']) {
    assert.ok(!CODE.includes(banned), `"${banned}" dulls the wall; full opacity is the point`);
  }
});

test('CONTROL: the knockout filter IS present, and dark-scoped', () => {
  // Without this the test above is satisfiable by a component that applies no
  // treatment at all — which is the other way to get this wrong.
  assert.match(CODE, /dark:brightness-0/, 'the white knockout is the dark-mode treatment');
  assert.match(CODE, /dark:invert/);
  assert.ok(
    !/(^|[\s'"`+])brightness-0/.test(CODE.replace(/dark:brightness-0/g, '')),
    'the knockout must never apply in light mode'
  );
});

test('the exception is read from the record, not a name list', () => {
  assert.match(CODE, /keepColorOnDark/, 'the opt-out must be data on the logo');
  // A name-matching array would break the first time a company is renamed.
  assert.ok(
    !/\[\s*'[A-Z][^']*'\s*,\s*'[A-Z][^']*'/.test(CODE.replace(/ROW_A_NAMES[\s\S]*?\];/, '')),
    'no hardcoded company-name array may drive the colour treatment'
  );
});

/**
 * Not in scope for the colour work, but recorded so it cannot be lost:
 * the marquee is aria-hidden, and the accessible name list lives in a
 * separate sr-only paragraph. If someone removes that paragraph while the
 * marquee stays aria-hidden, the client list becomes genuinely invisible to
 * screen readers.
 */
test('the sr-only company list still backs the aria-hidden marquee', () => {
  assert.match(SRC, /aria-hidden="true"/);
  assert.match(SRC, /className="sr-only"/);
  assert.match(SRC, /rowA\.concat\(rowB\)\.map\(l => l\.company_name\)\.join/);
});
