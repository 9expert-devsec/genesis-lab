import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BRAND_PALETTE, paletteByKey, formatRgb, formatCmyk } from '@/lib/brand/palette';

/**
 * THE PARITY GUARD between src/lib/brand/palette.js and tailwind.config.js.
 *
 * /logo-page PRINTS the brand colours — hex, RGB, CMYK, role — as the
 * authoritative reference anyone in the company copies a value out of. The
 * theme those same colours style the site with lives in tailwind.config.js.
 * Two lists of the same six numbers, in two files, with nothing between them.
 *
 * The failure this exists for is silent in both directions and cannot be seen
 * on either screen alone: a designer moves `9e.brand` half a step in the config
 * and every button follows it, while the swatch on /logo-page keeps printing
 * the old hex and keeps being copied into print work. Nothing 404s, nothing
 * throws, no test goes red — the page is simply lying, and the lie is the whole
 * point of the page.
 *
 * ── HOW IT READS, AND WHY IT MATTERS ────────────────────────────────────────
 * BOTH SIDES ARE READ, NEITHER IS RETYPED. The config is `require`d as the real
 * CommonJS module Tailwind itself loads — not regexed, not re-declared — and
 * the palette is imported. A third hardcoded copy of `#2486FF` inside this file
 * would make the test agree with itself: change the config AND the palette
 * together and the test would go red for no reason; change neither and it
 * proves nothing about either.
 *
 * The MAPPING is the one thing this file does not own. Each palette entry
 * carries its own `tailwindKey` — `'brand'`, `'action'`, … — pointing at its
 * counterpart in the `9e` group. That is a NAME, not a value: the hex is still
 * resolved from the config at run time. Keeping it in the palette means adding
 * a seventh colour is one edit in one file, and the test picks it up.
 *
 * ── A COLOUR WITH NO `9e-*` COUNTERPART ─────────────────────────────────────
 * `tailwindKey: null` is legitimate — a print-only ink, say, that the site never
 * renders. Such a colour is NOT silently skipped: the second test names every
 * one of them in its diagnostic output, so an unmapped colour is visible in the
 * run rather than absent from it, and it asserts that at least one colour IS
 * mapped. Without that floor, setting every `tailwindKey` to null would empty
 * the parity test's loop and leave it passing over nothing at all — the
 * classic vacuous green.
 */

const require = createRequire(import.meta.url);
const tailwindConfig = require('../../tailwind.config.js');

/** The `9e` colour group as Tailwind itself resolves it. */
const NINE_E = tailwindConfig.theme.extend.colors['9e'];

const mapped = BRAND_PALETTE.filter((c) => c.tailwindKey !== null);
const unmapped = BRAND_PALETTE.filter((c) => c.tailwindKey === null);

test('every brand colour with a 9e-* counterpart matches the theme, hex for hex', () => {
  for (const color of mapped) {
    const themeHex = NINE_E[color.tailwindKey];

    assert.equal(
      typeof themeHex,
      'string',
      `palette "${color.key}" points at 9e-${color.tailwindKey}, which does not exist ` +
        `in tailwind.config.js. Either the token was renamed or the pointer is a typo — ` +
        `a dangling pointer must not read as "no counterpart".`,
    );

    // Case-insensitively: the config writes #2486FF, and a future edit writing
    // #2486ff is the same colour, not a drift. The VALUE is what this guards.
    assert.equal(
      themeHex.toUpperCase(),
      color.hex.toUpperCase(),
      `${color.name} has drifted: palette.js says ${color.hex}, ` +
        `tailwind.config.js 9e-${color.tailwindKey} says ${themeHex}. ` +
        `/logo-page prints the palette value, so whichever is wrong is being ` +
        `copied into real work right now.`,
    );
  }
});

test('the mapping is not empty, and unmapped colours are named rather than skipped', (t) => {
  assert.ok(
    mapped.length > 0,
    'no palette colour claims a 9e-* counterpart, so the parity loop above ran ' +
      'over an empty list and asserted nothing.',
  );

  if (unmapped.length) {
    t.diagnostic(
      `${unmapped.length} brand colour(s) have NO 9e-* counterpart and are not ` +
        `parity-checked: ${unmapped.map((c) => `${c.name} (${c.hex})`).join(', ')}`,
    );
  } else {
    t.diagnostic('all brand colours have a 9e-* counterpart; none skipped');
  }

  assert.equal(
    mapped.length + unmapped.length,
    BRAND_PALETTE.length,
    'every colour is either checked or named — none falls between the two',
  );
});

test('the palette is the six guideline colours, and the state inks are NOT among them', () => {
  assert.equal(BRAND_PALETTE.length, 6);

  // State Deep and State Light are logo INK variants, not brand colours. Adding
  // them to a grid headed "ระบบสีของแบรนด์" would teach eight brand colours
  // where the guideline defines six.
  const hexes = BRAND_PALETTE.map((c) => c.hex.toUpperCase());
  assert.ok(!hexes.includes('#5E6A7E'), 'State Deep is a logo variant, not a brand colour');
  assert.ok(!hexes.includes('#B7C3D4'), 'State Light is a logo variant, not a brand colour');
});

test('every entry carries the full record the page has to print', () => {
  for (const color of BRAND_PALETTE) {
    assert.match(color.hex, /^#[0-9A-F]{6}$/, `${color.key}: hex is uppercase #RRGGBB`);
    assert.equal(color.rgb.length, 3, `${color.key}: RGB triplet`);
    assert.equal(color.cmyk.length, 4, `${color.key}: CMYK quadruplet`);
    assert.ok(color.role.length > 0, `${color.key}: has a Thai role sentence`);
    assert.ok(color.name.length > 0, `${color.key}: has a display name`);
  }
});

test('the RGB triplet is the hex, decoded — not a second, independently typed value', () => {
  // This is what catches the guideline PDF's own misprint (Nine Blue and Action
  // Blue printed with triplets ending in 225 where both hexes end in FF). The
  // hex is verified against the theme above; deriving the check for RGB from it
  // means the two can never disagree in this file either.
  for (const color of BRAND_PALETTE) {
    const fromHex = [1, 3, 5].map((i) => parseInt(color.hex.slice(i, i + 2), 16));
    assert.deepEqual(
      color.rgb,
      fromHex,
      `${color.name}: RGB ${color.rgb.join(', ')} does not decode from ${color.hex} ` +
        `(expected ${fromHex.join(', ')})`,
    );
  }
});

test('keys are unique, and paletteByKey covers every colour', () => {
  const keys = BRAND_PALETTE.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate key would collapse a React list');
  assert.deepEqual(Object.keys(paletteByKey).sort(), [...keys].sort());
});

test('the formatters produce the strings the guideline prints', () => {
  assert.equal(formatRgb(paletteByKey['nine-blue']), 'RGB 36, 134, 255');
  assert.equal(formatCmyk(paletteByKey['nine-blue']), 'CMYK 86, 47, 0, 0');
  assert.equal(formatCmyk(paletteByKey['deep-navy']), 'CMYK 69, 36, 0, 84');
});
