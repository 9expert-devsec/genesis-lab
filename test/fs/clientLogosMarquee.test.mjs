import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Marquee behaviour that rendered markup cannot see.
 *
 * The colour fix touched the slot inside MarqueeRow. Pause-on-hover is wired
 * through React event props and the scroll through requestAnimationFrame —
 * neither survives renderToStaticMarkup, so the render tier can assert the
 * mask and the geometry but not these. Source-level guards are the only
 * thing standing between a future edit and a marquee that silently stops
 * pausing.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SRC = readFileSync(
  path.join(ROOT, 'src/components/portfolio/ClientLogosSection.jsx'), 'utf8'
);

test('pause-on-hover is still wired to the row container', () => {
  assert.match(SRC, /onMouseEnter=\{pause\}/);
  assert.match(SRC, /onMouseLeave=\{resume\}/);
  assert.match(SRC, /pausedRef\.current = true/);
  assert.match(SRC, /pausedRef\.current = false/);
});

test('the animation loop and its reduced-motion opt-out survive', () => {
  assert.match(SRC, /requestAnimationFrame\(step\)/);
  assert.match(SRC, /cancelAnimationFrame/);
  assert.match(SRC, /prefers-reduced-motion: reduce/);
});

test('the triple-copy track that makes the loop seamless is intact', () => {
  assert.match(SRC, /\[\.\.\.logos, \.\.\.logos, \.\.\.logos\]/);
  assert.match(SRC, /scrollWidth \/ 3/);
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
