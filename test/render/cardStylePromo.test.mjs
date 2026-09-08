import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { cardSurfaceClass, SECTION_STYLE_CAPS } from '@/lib/pageBuilder/presets';
import { CARD_STYLES, styleSchema } from '@/lib/schemas/sections/base';
import { CARD_STYLE_LABELS } from '@/lib/pageBuilder/presetLabels';
import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';
import { StatCardSection } from '@/components/pageBuilder/sections/stat_card';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';

/**
 * ── ROUND 59 COMMIT 3: `promo`, THE SIXTH cardStyle ───────────────────────
 * docs/promo-card-style.md §A1 and §I step 2.
 *
 * Round 58's cardStyleValues.test.mjs already covers the GENERIC properties and
 * covers `promo` automatically the moment it is declared: non-empty, pairwise
 * distinct, identical across all three readers, absent/null/unknown still
 * falling back to plain. Proved by control — setting `promo: ''` reddens its
 * inert-value test by name, and setting it to an existing value reddens its
 * distinctness test. None of that is repeated here.
 *
 * This file asserts the things SPECIFIC to `promo`, which round 58's guard
 * cannot know about:
 *
 *  1. It is the composite — an edge AND a surface AND a lift at once, which is
 *     the whole reason a sixth value exists rather than a sixth class (§A1).
 *  2. It is OPAQUE. §G's defect: on a section with a custom gradient background
 *     the card was transparent and the parent's colour showed through. `border`
 *     and `shadow` paint no surface at all, so this is the property that fixes
 *     it and it must not silently regress to a border-only value.
 *  3. It answers ONE theme axis. A card that paints its own surface must also
 *     own the text on it, or it inherits a colour chosen for a different
 *     surface — measured at 1.05:1 before the text token was added.
 *  4. It reaches all three readers and no non-reader (§I), and it is a legal
 *     schema value with a label.
 */
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const READERS = Object.entries(SECTION_STYLE_CAPS)
  .filter(([, props]) => props.includes('cardStyle'))
  .map(([type]) => type);

test('`promo` is a declared value with a label', () => {
  assert.ok(CARD_STYLES.includes('promo'), 'promo is not in the enum');
  assert.ok(CARD_STYLE_LABELS.promo, 'promo has no label — the control would show a raw key');
  assert.equal(styleSchema.parse({ cardStyle: 'promo' }).cardStyle, 'promo',
    'the schema rejects promo — a stored card could never carry it');
});

test('`promo` is the COMPOSITE — edge AND surface AND lift, which no other value is', () => {
  const cls = cardSurfaceClass('price_card', { cardStyle: 'promo' });
  const has = {
    edge:    /\bborder\b/.test(cls),
    surface: /\bbg-/.test(cls),
    lift:    /\bshadow-/.test(cls),
  };
  for (const [part, present] of Object.entries(has)) {
    assert.ok(present, `promo has no ${part} — it is not the composite the sixth value exists to be`);
  }
  // And the point of §A1: no PRE-EXISTING value carries more than one of them.
  for (const v of CARD_STYLES.filter((x) => x !== 'promo')) {
    const other = cardSurfaceClass('price_card', { cardStyle: v });
    const parts = [/\bborder\b/, /\bbg-/, /\bshadow-/].filter((re) => re.test(other)).length;
    assert.ok(parts <= 1,
      `"${v}" already combines ${parts} treatments — §A1's premise for adding promo no longer holds`);
  }
});

test('`promo` is OPAQUE — §G, the parent background must not show through', () => {
  const cls = cardSurfaceClass('price_card', { cardStyle: 'promo' });
  assert.match(cls, /\bbg-\[var\(--surface\)\]/,
    'promo paints no surface, so a coloured section background shows through the card');
  // The two values that DO paint are literal light hexes; promo must not be a
  // third of those. A token, not a colour (round 30 / round 39).
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(cls),
    'a raw hex reached the class map — a source colour, which round 30 put out of bounds');
});

test('`promo` owns the text on the surface it paints — the two theme axes', () => {
  /**
   * `--surface` answers the SITE theme (`.dark`); the text a card inherits is
   * set by the PAGE theme (THEME[t].pageClass). Where they disagree, a
   * surface-only promo measured 1.05:1 and 1.13:1 — unreadable. Both halves
   * must come from the same axis.
   */
  const cls = cardSurfaceClass('price_card', { cardStyle: 'promo' });
  assert.match(cls, /\btext-\[var\(--text-primary\)\]/,
    'promo paints a surface but inherits its text colour from the other theme axis');
});

test('§I — `promo` reaches every reader identically and no non-reader', () => {
  const expected = cardSurfaceClass(READERS[0], { cardStyle: 'promo' });
  assert.notEqual(expected, '', 'the first reader does not honour promo');
  for (const type of READERS) {
    assert.equal(cardSurfaceClass(type, { cardStyle: 'promo' }), expected,
      `${type} resolves promo differently — the map is supposed to be shared`);
  }
  for (const type of ['heading', 'cta', 'course_card']) {
    assert.equal(cardSurfaceClass(type, { cardStyle: 'promo' }), '',
      `${type} does not declare cardStyle but promo reached it`);
  }
});

test('§I — all three readers actually RENDER the promo surface, none breaks', () => {
  const cases = [
    ['price_card', PriceCardSection, { title: 'ราคาพิเศษ', price: '15,120 บาท', features: ['เอกสาร'] }],
    ['stat_card', StatCardSection, { value: '1,200+', label: 'ผู้เรียน', icon: 'Users' }],
    ['icon_card', IconCardSection, { title: 'เอกสาร', description: 'ไฟล์ PDF', icon: 'FileText' }],
  ];
  for (const [name, Component, content] of cases) {
    const plain = renderToStaticMarkup(Component({ content, style: { cardStyle: 'plain' } }));
    const html = renderToStaticMarkup(Component({ content, style: { cardStyle: 'promo' } }));
    assert.notEqual(html, plain, `${name} renders promo identically to plain — it does not read it`);
    const root = doc(html).querySelector('div');
    assert.match(root.getAttribute('class'), /bg-\[var\(--surface\)\]/,
      `${name} did not put the promo surface on its own root`);
    // The card must still render its content — a surface that swallowed the
    // body would pass every class assertion above.
    assert.ok(root.textContent.trim().length > 0, `${name} renders no content under promo`);
  }
});

test('ADDITIVE — every pre-existing input resolves exactly as before', () => {
  /**
   * The full statement is measured against the pre-change module in
   * scripts/_measure-round59-card-style-additive.mjs (66 inputs, 0 differing).
   * What is pinned HERE is the property that makes it true and could regress in
   * one edit: the five original values, and the three absent-ish shapes, still
   * resolve to what they always did.
   */
  /**
   * ── ROUND 79 CHANGED ONE ENTRY, AND THE CLAIM BEHIND IT ────────────────
   * `filled` was `bg-9e-ice` — #F8FAFD, a literal with no `.dark` form. Round
   * 79 made a section's custom background derive to a DARK surface in dark
   * mode, which made the section's text light, and a `filled` card on it then
   * painted #F8FAFD under #F8FAFD text. Measured on the live page mid-round:
   * the author's price card went 16.64 to 1.00.
   *
   * It now reads `--pb-bg-light`, round 78's own variable, whose `:root` value
   * is #F8FAFD — BYTE-IDENTICAL to `bg-9e-ice`. So what round 59 was pinning
   * here — that adding `promo` did not change what the other five PAINT — is
   * still true in light mode, and is asserted as such by
   * test/fs/presetBackgroundThemeAware.test.mjs against the stylesheet.
   * What moved is the class STRING, and only because the colour now has two
   * values instead of one.
   */
  /**
   * ── ROUND 80-FIX CHANGED THE OTHER HALF OF THOSE SAME TWO ──────────────
   * `filled` and `gradient` now also carry `text-[var(--text-primary)]`.
   *
   * WHAT THIS TEST PINS IS UNAFFECTED, and the distinction is the reason the
   * strings can move without the claim moving. Round 59's claim is that adding
   * `promo` did not change what the other five PAINT — the `bg-` half — and
   * that is still exactly true: `--pb-bg-light` and `bg-9e-gradient-subtle` are
   * byte-identical to what they were, and the ONLY addition is on the text
   * axis, which `promo` was already on.
   *
   * WHY THE TEXT AXIS MOVED. Round 80 made a section declare `text-9e-ice`
   * whenever the author's background is dark, and inheritance carried it into
   * any descendant naming no colour — so a `filled` price_card rendered its
   * title and `features` rows in the light token on its own light surface.
   * Invisible, on a live promotion hero. The block above this map already
   * recorded the same shape for round 79; round 80 made it reachable in
   * general, so the report became a fix. presets.js states it at the values.
   *
   * `plain`, `border` and `shadow` are unchanged and MUST be: they paint no
   * surface, so their text SHOULD inherit the section's.
   */
  const EXPECTED = {
    plain: '',
    border: 'border border-[var(--surface-border)]',
    shadow: 'shadow-9e-md',
    filled: 'bg-[var(--pb-bg-light)] text-[var(--text-primary)] [--pb-text-muted:var(--9e-slate-dp-50)]',
    gradient: 'bg-9e-gradient-subtle text-[var(--text-primary)] [--pb-text-muted:var(--9e-slate-dp-50)]',
  };
  /**
   * ── ROUND A-fix 3 ADDED THE SECOND TOKEN TO THE SAME TWO ───────────────
   * `--pb-text-muted` joins the `--text-primary` pin above, and for the same
   * reason: WHOEVER PAINTS THE SURFACE OWNS BOTH TOKENS ON IT. A section with
   * an authored background now hands its muted ink DOWN, so a card that paints
   * over that surface has to hand it back — otherwise the card's muted lines
   * are coloured for a surface the card is covering.
   *
   * The claim this test was written for is still untouched: what these values
   * PAINT is unchanged, and the assertions below read the paint half on its own
   * so a token edit can never be mistaken for a surface edit.
   */
  // The paint half, asserted SEPARATELY from the whole string, so a future edit
  // to the text axis cannot be mistaken for a change to what these two paint.
  assert.equal(EXPECTED.filled.split(' ')[0], 'bg-[var(--pb-bg-light)]');
  assert.equal(EXPECTED.gradient.split(' ')[0], 'bg-9e-gradient-subtle');
  for (const [value, cls] of Object.entries(EXPECTED)) {
    for (const type of READERS) {
      assert.equal(cardSurfaceClass(type, { cardStyle: value }), cls,
        `adding promo changed what "${value}" means on ${type}`);
    }
  }
  for (const shape of [undefined, null, {}, { accentColor: 'brand_blue' }, { cardStyle: undefined }]) {
    assert.equal(cardSurfaceClass('price_card', shape), '',
      'a stored shape with no cardStyle stopped resolving to the plain treatment');
  }
});

test('CONTROL — the assertions above FAIL against a border-only promo', () => {
  /**
   * The shape this commit could plausibly have shipped, and the one §G rejects:
   * an edge with no surface. Every promo-specific predicate must reject it, or
   * a green run here says nothing about opacity.
   */
  const borderOnly = 'border border-[var(--surface-border)]';
  assert.ok(!/\bbg-/.test(borderOnly), 'the opacity check does not discriminate');
  assert.ok(!/\btext-\[var\(--text-primary\)\]/.test(borderOnly), 'the text-axis check does not discriminate');
  assert.ok(!/\bshadow-/.test(borderOnly), 'the composite check does not discriminate');
  // …and against round 58's originally-proposed gradient promo, which is
  // opaque but light-only and sets no text colour.
  const gradientPromo = 'border border-[var(--surface-border)] bg-9e-gradient-subtle shadow-9e-lg';
  assert.ok(!/\bbg-\[var\(--surface\)\]/.test(gradientPromo),
    'the theme-aware-surface check would have passed round 58 step 2 unchanged');
  assert.ok(!/\btext-\[var\(--text-primary\)\]/.test(gradientPromo),
    'the text-axis check would have passed round 58 step 2 unchanged');
});
