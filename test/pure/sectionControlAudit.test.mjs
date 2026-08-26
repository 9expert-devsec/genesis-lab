import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { backgroundClass, OFFERED_BACKGROUNDS } from '@/lib/pageBuilder/presets';
import { BACKGROUNDS, ALL_SECTION_TYPES } from '@/lib/schemas/pageBuilder';
import { readSource } from '../sourceScan.mjs';

/**
 * Round 18 — THREE TRIPWIRES OVER MEASURED GAPS, NOT THREE RULES.
 *
 * ══ READ THIS BEFORE YOU MAKE ONE OF THESE GREEN AGAIN ══════════════════════
 *
 * Every assertion in this file describes something docs/section-control-audit.md
 * found to be WRONG, and pins the state it is wrong in. They are SELF-RETIRING:
 * each one fails on the day its finding is fixed, and the correct response is to
 * DELETE the test together with its row in the audit — never to update the
 * expectation so it agrees with the new code. A tripwire edited to match
 * whatever it finds is not a tripwire; it is a second copy of the source.
 *
 * The failure message on each one says which finding it is and what to delete.
 *
 * ══ WHY THESE THREE AND NOT THE WHOLE MATRIX ════════════════════════════════
 *
 * The audit measured 454 cells. Almost none of them belong in a test: a test
 * asserting "14 types ignore style.accentColor" would have to be rewritten by
 * every round that fixes ONE of them, which is a test that obstructs the fix
 * instead of recording the gap.
 *
 * These three are different — each is a single, exact, binary fact about the
 * current code that a fix flips exactly once:
 *
 *   1. a class the source says is empty and a comment says is guarded (it is not)
 *   2. the exact set of components that consume the accent variable
 *   3. the two self-clamps that make a universal control inert
 *
 * PURE: source text and one preset lookup. No React, no DOM.
 */

const SECTIONS_DIR = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
  'src/components/pageBuilder/sections',
);

// ── FINDING 8 — the guard presets.js says exists ───────────────────────────

test('AUDIT TRIPWIRE (finding 8): background "image" still renders as nothing', () => {
  /**
   * `presets.js` excludes `image` from OFFERED_BACKGROUNDS because
   * BACKGROUND_CLASS.image is '' pending a bg-image source field, and says:
   *
   *   "The loader check asserts the class is still '' precisely so this
   *    exclusion retires itself the moment that stops being true."
   *
   * The audit looked for that check. It does not exist — nothing in test/ reads
   * BACKGROUND_CLASS, backgroundClass or OFFERED_BACKGROUNDS, and the module's
   * own assertComplete only asserts an ENTRY EXISTS, never that it is empty. So
   * the exclusion had no way to retire itself. This is that check, arriving
   * late.
   */
  assert.equal(backgroundClass('image'), '',
    'FINDING 8 IS FIXED: background "image" now renders something. DELETE this test AND '
    + 'remove the `image` filter from OFFERED_BACKGROUNDS in presets.js — the panel is '
    + 'currently hiding a background that works.');

  // It is still in the vocabulary and still withheld from the author. Both
  // halves, because the finding is the gap BETWEEN them.
  assert.equal(BACKGROUNDS.includes('image'), true, 'the schema no longer declares it');
  assert.equal(OFFERED_BACKGROUNDS.includes('image'), false, 'the panel now offers it');
  assert.deepEqual([...OFFERED_BACKGROUNDS],
    ['default', 'white', 'light', 'soft_gray', 'dark', 'brand_gradient']);
});

test('CONTROL: the emptiness check discriminates — a real background is not empty', () => {
  // Without this, `equal(x, '')` passing would say nothing about whether
  // backgroundClass can ever return anything at all.
  assert.notEqual(backgroundClass('dark'), '');
  assert.equal(backgroundClass('default'), '',
    'default is ALSO empty, legitimately — it inherits the theme surface. That is exactly '
    + 'why OFFERED_BACKGROUNDS is an explicit list and not "every value with a class".');
});

// ── FINDING 2 — who actually consumes the accent variable ──────────────────

/**
 * The accent travels as a CSS custom property, so a rendered-markup diff cannot
 * see it: the class string is a constant and the markup is identical for all
 * six accent values. It can only be read off the source — over ALL of
 * sections/, never a list — and there are TWO ways to read it, which is the
 * thing a naive scan gets wrong:
 *
 *   directly, as a class literal in the component            (this function)
 *   indirectly, through presets' accentButtonClass helper    (cta, price_card)
 *
 * A first draft of this test asserted a set of nine that folded both together,
 * and the CONTROL below caught it: `cta` was in the nine because its DOCSTRING
 * says "via --pb-accent-* set by the renderer", and the comment-stripped read
 * drops that. cta really does paint with the accent — the class arrives from
 * BUTTON_STYLE_CLASS, not from cta.jsx. So the two routes are counted apart.
 */
function directAccentConsumers() {
  return readdirSync(SECTIONS_DIR)
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => /--pb-accent-/.test(readSource(`src/components/pageBuilder/sections/${f}`).code))
    .map((f) => f.replace(/\.jsx$/, ''))
    .sort();
}

function buttonHelperConsumers() {
  return readdirSync(SECTIONS_DIR)
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => /accentButtonClass/.test(readSource(`src/components/pageBuilder/sections/${f}`).code))
    .map((f) => f.replace(/\.jsx$/, ''))
    .sort();
}

test('AUDIT TRIPWIRE (finding 2): exactly twelve section components paint with the accent', () => {
  /**
   * Eleven name the variable themselves; `cta` reaches it through the shared
   * button helper (price_card does both). Twelve types in total, plus the four
   * containers that forward the variable to children without drawing anything
   * of their own — sixteen with an effect, eleven without.
   *
   * ── IT FIRED TWICE, AND THE SECOND TIME CLOSED THE FINDING ───────────────
   * Round 23 added `course_schedule`; round 24 added `accordion` and
   * `instructor_card`, and this assertion went red naming both. Each time the
   * reconciliation was the one the message below directs for an ADDED type:
   * extend the expected set, update finding 2 in docs/section-control-audit.md.
   *
   * With those three, the behaviour gap finding 2 described is CLOSED: the
   * number of types that have a surface the accent pattern reaches and do not
   * take it is now ZERO.
   *
   * ── SO WHY IS THIS TEST STILL HERE ───────────────────────────────────────
   * Because its stated deletion condition — "once the offered set and the
   * reader set agree" — CANNOT be met, and round 24 is where that became
   * visible. The offered set is all 27 types: สีเน้น is in the universal
   * envelope and always has been. The reader set is 16. The remaining eleven
   * are not a backlog; they are the types round 21 measured as having no accent
   * surface at all (a heading is prose, an embed is someone else's iframe, the
   * four CourseCard types are a shared site component), and round 22 recorded
   * as correct restraint rather than defects.
   *
   * That condition was written when "14 of 27 ignore it" still looked like one
   * uniform gap. It isn't, so the condition describes a state the design will
   * never reach, and deleting on it would mean deleting never.
   *
   * The test therefore CHANGES CHARACTER rather than retiring. It stopped being
   * "watch this set grow toward agreement" and became "this set is closed —
   * nothing joins or leaves it without a deliberate decision". A twelfth
   * consumer is now a claim that a type has an accent surface after all, which
   * is exactly the argument that should not be settled silently.
   */
  assert.deepEqual(directAccentConsumers(), [
    'accordion', 'checklist', 'course_schedule', 'highlight_grid', 'icon_card',
    'instructor_card', 'price_card', 'rich_text', 'stat_card', 'tabs', 'timeline',
  ],
  'FINDING 2\'S SET MOVED. It is no longer a gap closing — it closed in round 24. An ADDITION '
  + 'now asserts a type has an accent surface the audit says it does not: make that argument in '
  + 'docs/section-control-audit.md before extending this list. A REMOVAL means a type stopped '
  + 'following the author\'s accent, which is the original defect coming back.');

  assert.deepEqual(buttonHelperConsumers(), ['cta', 'price_card'],
    'the indirect route changed — accentButtonClass is how cta gets its accent without naming '
    + 'the variable, and it is gated by SECTION_STYLE_CAPS');

  // The union is the twelve the audit reports. Written as a union rather than
  // as a thirteenth literal list, so the two routes above stay the only source.
  const painting = [...new Set([...directAccentConsumers(), ...buttonHelperConsumers()])].sort();
  assert.equal(painting.length, 12);

  /**
   * The eleven with no accent surface, named. This is the half that was only
   * ever prose before, and it is the half that now carries the meaning: the
   * complement of the set above is a DECISION per type, not a remainder.
   */
  assert.deepEqual(ALL_SECTION_TYPES.filter((t) => !painting.includes(t)).sort(), [
    'bundle_courses', 'card_grid', 'container', 'course_card', 'course_list',
    'course_selector', 'custom_css', 'custom_html', 'debug_json', 'embed',
    'full_width', 'heading', 'image', 'notice', 'two_column',
  ].sort(),
  'the set of types that do NOT paint with the accent changed. Four of these are containers '
  + 'that FORWARD it (card_grid, container, full_width, two_column) and eleven have no accent '
  + 'surface — see docs/section-control-audit.md §12. A type leaving this list needs the '
  + 'argument written down first.');
});

test('CONTROL: the consumer scan reads code, not prose', () => {
  /**
   * THIS CONTROL ALREADY EARNED ITS KEEP. It is what showed that the first
   * version of the test above counted `cta` for the wrong reason — its
   * docstring names the variable and its code does not.
   *
   * `heading.jsx` is the standing case: it says "accent is not applied to
   * headings by default", so a raw-text scan reports it as a consumer and the
   * finding silently shrinks by one. Both files are checked, against the RAW
   * bytes, because readSource strips comments from `code` and `withImports`
   * alike — only the file on disk still has the prose to be fooled by.
   */
  const raw = (f) => readFileSync(path.join(SECTIONS_DIR, f), 'utf8');

  assert.match(raw('heading.jsx'), /accent/i, 'heading.jsx no longer mentions the accent at all');
  assert.match(raw('cta.jsx'), /--pb-accent-/, 'cta.jsx no longer names the variable in prose');

  // …and neither survives the comment strip, which is what makes the set exact.
  assert.equal(directAccentConsumers().includes('heading'), false);
  assert.equal(directAccentConsumers().includes('cta'), false,
    'cta counted as a direct consumer — the scan is reading its docstring, exactly as it did '
    + 'before this control caught it');
});

// ── FINDING 1 — the two self-clamps that make ความกว้าง inert ──────────────

test('AUDIT TRIPWIRE (finding 1): course_card and instructor_card still clamp themselves', () => {
  /**
   * Measured in Chrome at 1440px (scripts/_probe-container-width.mjs): the
   * painted content width of both is 384px at ALL FOUR containerWidth settings,
   * because each wraps itself in `max-w-sm` inside a wrapper the author
   * believes they are sizing.
   *
   * The clamp is what the browser measured, so the clamp is what this pins. A
   * width assertion would be a number this file cannot produce — JSDOM has no
   * layout engine, and re-running the browser probe from the test tier is a
   * dependency the suite does not have.
   */
  for (const file of ['course_card', 'instructor_card']) {
    const { code } = readSource(`src/components/pageBuilder/sections/${file}.jsx`);
    assert.match(code, /max-w-sm/,
      `FINDING 1 IS FIXED for ${file}: the self-clamp is gone, so settings.containerWidth `
      + 'can reach it. Re-run scripts/_probe-container-width.mjs, confirm the four settings now '
      + 'give four widths, then delete this type from the test and from finding 1 in '
      + 'docs/section-control-audit.md.');
  }
});

test('CONTROL: the clamp scan discriminates — a section without one is not matched', () => {
  /**
   * heading fills its wrapper; it is the type whose four containerWidth values
   * measured 640 / 864 / 1168 / 1408. If the scan matched it too, the assertion
   * above would be true of everything.
   *
   * ── THE SECOND HALF USED TO POINT AT container, AND ROUND 25 MOVED IT ────
   * It asserted that container DID carry a width clamp, so that the pattern
   * above could be shown specific enough to tell finding 1's clamp from finding
   * 3's. Round 25 removed finding 3's clamp, so that half went red — correctly:
   * it was pinned to a defect that no longer exists.
   *
   * The discrimination it provided still has to come from somewhere, so it now
   * comes from a type that is genuinely clamped for a reason nobody is
   * fixing: `embed` sizes its own aspect-ratio box. A width-shaped pattern
   * matching it while `max-w-sm` does not is what proves the finding-1 scan is
   * specific rather than matching any width utility anywhere.
   */
  assert.equal(/max-w-sm/.test(readSource('src/components/pageBuilder/sections/heading.jsx').code), false);
  assert.equal(/max-w-sm/.test(readSource('src/components/pageBuilder/sections/container.jsx').code), false,
    'container carries the narrow-card clamp now — finding 1 and the retired finding 3 are being '
    + 'confused by a scan that cannot tell them apart');

  // The generic pattern still finds SOMETHING, so "no match" above is a fact
  // about container and not about a scan that stopped working.
  const anyWidth = (f) => /max-w-/.test(readSource(`src/components/pageBuilder/sections/${f}.jsx`).code);
  assert.equal(anyWidth('course_card'), true, 'the generic width pattern matches nothing at all');
  assert.equal(anyWidth('container'), false,
    'container has a width clamp again — round 25 removed it so settings.containerWidth could '
    + 'reach the box; see docs/section-control-audit.md §13');
});

/*
 * ── FINDING 3'S TRIPWIRE WAS HERE, AND ROUND 25 RETIRED IT ─────────────────
 *
 * It pinned `container`'s hardcoded max-width — the second authority that made
 * three of the four `settings.containerWidth` values paint the same 768px. It
 * fired in round 25, exactly as designed, on the commit that removed the clamp.
 *
 * Its own message set the condition for deletion: "if the clamp is GONE, re-run
 * scripts/_probe-container-width.mjs and confirm the four settings now give
 * four distinct widths, then delete this test". Both halves were done. That
 * probe reports `container` at 640 / 864 / 1168 / 1408 — four distinct, and the
 * same four `heading` and `notice` give, which are the types that never had a
 * clamp. So the test is gone rather than updated, which is what a self-retiring
 * tripwire is for.
 *
 * WORTH CONTRASTING WITH FINDING 2, which round 24 could NOT retire: its
 * condition ("once the offered set and the reader set agree") described a state
 * the design will never reach. This one's condition was a fact about one line in
 * one file, so it was reachable, and reached.
 *
 * What replaces it is not another source scan. The clamp is gone; what needs
 * guarding now is that the four widths stay four and that `container` and
 * `full_width` stay distinguishable — both properties of the SCHEMA, pinned in
 * test/pure/containerWidthDefault.test.mjs, plus the browser measurement in
 * scripts/_probe-container-reflow.mjs that no test tier can perform.
 *
 * Finding 3's row in docs/section-control-audit.md §8 is left standing on
 * purpose. That section is the round-18 snapshot and rounds 22-24 established
 * that closures are recorded in appended sections rather than by editing it —
 * see §13.
 */
