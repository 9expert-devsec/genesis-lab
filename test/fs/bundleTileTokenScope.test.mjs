import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readSource, ROOT } from '../sourceScan.mjs';

/**
 * ── EVERY TOKEN THE LIGHT TILE READS IS RE-DECLARED ON THE LIGHT TILE ──────
 *
 * THE DEFECT THIS EXISTS FOR, in the shape it actually shipped. A Navy
 * `promotion_bundle` card scopes `dark` onto itself, and its course tiles carry
 * `.pb-bundle-tile-light` to put the semantic tokens BACK to light values so a
 * light tile sitting on the navy renders as a light-surface element. That block
 * listed nine tokens. The tile subtree read TEN: the `ลำดับที่ N` order tag is
 * `bg-[var(--surface-muted)]`, and `--surface-muted` was the one nobody had
 * re-declared — so the card's `dark` scope handed the tag a #1A2D42 slab, under
 * the #465469 ink the block DID pin, at 1.82:1 measured, on a light tile.
 *
 * WHY THE EXISTING GUARDS DID NOT CATCH IT, which is the whole argument for
 * this file. `bundleCardSurface` sweeps the rendered markup for active `dark:`
 * UTILITIES inside the tile — the other half of the light scope — and the tag
 * carries none: it is tokens only, which is exactly what the repo asks for. A
 * missing token re-declaration is invisible to a markup sweep (the class string
 * is correct), invisible to a render test (jsdom resolves no cascade), and
 * invisible to the arbitrary-value guard (the class compiles to a perfectly
 * good rule reading a perfectly real variable). Only the CSS and the component
 * read TOGETHER say anything is wrong, and that is what this does.
 *
 * ── THE TWO WAYS A TOKEN IS ALLOWED TO REACH THE TILE ─────────────────────
 *   1. `.pb-bundle-tile-light` re-declares it. The whole point of the block.
 *   2. It is THEME-INVARIANT — declared in globals.css and never overridden
 *      under `.dark`. Then light and dark resolve the same value and there is
 *      nothing for the card's `dark` scope to flip.
 * Anything else is the defect above, and the message names the token.
 *
 * ── WHY `promotion_bundle.jsx` IS SLICED AND THE OTHER TWO ARE NOT ────────
 * `BundleRoundCarousel` and `ScheduleCard` render wholly INSIDE a tile, so the
 * whole file is in scope. `promotion_bundle.jsx` is not: the same file draws the
 * card's LEFT column, which sits directly on the navy and whose tokens must
 * follow the card — `--pb-accent-fill` and `--pb-accent-on` are there, and
 * pinning those to light would be the opposite bug. So only `BundleItemCard`'s
 * body is scanned, and the slice boundaries are asserted before use: a renamed
 * function would otherwise silently scan nothing and pass.
 */

const TILE_CLASS = 'pb-bundle-tile-light';

/** Comment-stripped, because a var named in PROSE is not a var the tile reads. */
const bundleSrc = readSource('src/components/pageBuilder/sections/promotion_bundle.jsx');
const carouselSrc = readSource('src/components/pageBuilder/sections/BundleRoundCarousel.jsx');
const chipSrc = readSource('src/components/ScheduleCard.jsx');

/**
 * COMMENTS STRIPPED FIRST, and it is load-bearing exactly as it is on the JS
 * side of this suite. This stylesheet DISCUSSES its own selectors at length:
 * `.pb-bundle-tile-light` is named in a `:root` comment four hundred lines
 * above the block itself, so an `indexOf` over the raw text lands in prose and
 * then reads the NEXT brace it finds — which, when this was first written,
 * handed the test the `.dark` block and reported the tile's surface as #132638.
 */
const css = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8')
  .replace(/\r\n?/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations inside the first block with exactly this selector. */
function blockBody(selector) {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `globals.css has no \`${selector} {\` block at the start of a line`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  assert.ok(open > at && close > open, `${selector} block is not readable`);
  return css.slice(open + 1, close);
}

/** Every custom-property NAME declared in that block. */
function declaredIn(selector) {
  return new Set([...blockBody(selector).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
}

const pinnedOnTile = declaredIn(`.${TILE_CLASS}`);
const flippedByDark = declaredIn('.dark');

/** The tokens a source string CONSUMES — `var(--x)`, never `--x:`. */
function varsRead(code) {
  return new Set([...code.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map((m) => m[1]));
}

/** `BundleItemCard`'s body alone — see the note above for why. */
function itemCardBody() {
  const start = bundleSrc.code.indexOf('function BundleItemCard(');
  const end = bundleSrc.code.indexOf('export function PromotionBundleSection(');
  assert.ok(start >= 0, 'BundleItemCard is gone or renamed — the slice would scan nothing');
  assert.ok(end > start, 'PromotionBundleSection no longer follows BundleItemCard — fix the slice');
  return bundleSrc.code.slice(start, end);
}

const SUBTREE = [
  ['BundleItemCard (the tile itself)', itemCardBody()],
  ['BundleRoundCarousel', carouselSrc.code],
  ['ScheduleCard (the round chip)', chipSrc.code],
];

test('every token the tile subtree reads is pinned on the tile or theme-invariant', () => {
  const leaks = [];
  for (const [where, code] of SUBTREE) {
    for (const name of varsRead(code)) {
      if (pinnedOnTile.has(name)) continue;
      // Not overridden under `.dark` → light and dark resolve the same value and
      // the card's scope has nothing to flip.
      if (!flippedByDark.has(name)) continue;
      leaks.push(`${name} (read by ${where})`);
    }
  }
  assert.deepEqual(
    leaks,
    [],
    `These tokens FLIP under .dark and are not re-declared by .${TILE_CLASS}, so a Navy ` +
      'card paints their DARK values on its deliberately light course tile:\n  ' +
      `${leaks.join('\n  ')}\n` +
      `Add each to the .${TILE_CLASS} block in src/app/globals.css — at the tile ` +
      'boundary, not as a hard-coded colour on the element, which would then be a ' +
      "bright slab on the สีขาว card's dark tile.",
  );
});

test('the order tag reads --surface-muted, and the tile pins it BELOW its own surface', () => {
  // The specific defect, pinned so the general sweep above cannot go quietly
  // vacuous if the tag ever stops painting itself from a token.
  assert.match(
    itemCardBody(),
    /bg-\[var\(--surface-muted\)\]/,
    'the ลำดับที่ tag no longer paints itself from --surface-muted',
  );
  const tile = blockBody(`.${TILE_CLASS}`);
  const surface = /--surface:\s*(#[0-9a-f]{6})/i.exec(tile)?.[1]?.toUpperCase();
  const muted = /--surface-muted:\s*(#[0-9a-f]{6})/i.exec(tile)?.[1]?.toUpperCase();
  assert.equal(surface, '#F8FAFD', "the tile's own surface changed — re-measure the pill");
  assert.ok(muted, `.${TILE_CLASS} does not pin --surface-muted`);
  assert.notEqual(
    muted,
    surface,
    "the pill is the same colour as the tile, so there is no pill: :root's --surface-muted " +
      "is #F8FAFD, which is this tile's OWN surface. It needs the next step down.",
  );
});

test('CONTROL: the sweep DOES report a token the tile fails to re-declare', () => {
  // Without this, "no leaks" could be true of any input — including a scan that
  // found no `var()` at all because a slice boundary moved.
  const pretend = varsRead('className="bg-[var(--surface-divider)] text-[var(--text-muted)]"');
  const found = [...pretend].filter((n) => !pinnedOnTile.has(n) && flippedByDark.has(n));
  assert.deepEqual(
    found.sort(),
    ['--surface-divider', '--text-muted'],
    'two tokens that .dark overrides and the tile does not pin must be reported',
  );
});

test('CONTROL: the subtree scan really read something from each of its three files', () => {
  // The vacuity check for the slice and for comment stripping: a scan of an
  // empty string passes the sweep above for the wrong reason.
  for (const [where, code] of SUBTREE) {
    assert.ok(varsRead(code).size > 0, `${where} contributed no tokens — the scan is empty`);
  }
  // And the slice is a SLICE: the left column's accent tokens are outside it.
  const body = itemCardBody();
  assert.doesNotMatch(body, /--pb-accent-fill/, 'the slice reached the left column');
  assert.match(bundleSrc.code, /--pb-accent-fill/, 'the left column lost the token the slice excludes');
});
