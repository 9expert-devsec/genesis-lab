import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionSchema, ALL_SECTION_TYPES, CONTAINER_WIDTHS } from '@/lib/schemas/pageBuilder';
import { settingsSchema, settingsWithContainerWidth } from '@/lib/schemas/sections/base';
import { newSection } from '@/lib/pageBuilder/newSection';
import { containerWidthClass } from '@/lib/pageBuilder/presets';

/**
 * ROUND 25 — `container` starts narrow by DEFAULT instead of by a clamp.
 *
 * ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
 * `container.jsx` hardcoded a max-width. That is a second authority over what
 * `settings.containerWidth` already owns, and it won: measured in Chrome, the
 * four settings painted 640 / 768 / 768 / 768, so three of them were
 * indistinguishable and the author had no way to learn why.
 *
 * The component could not defer to the setting — SectionRenderer passes it
 * `content`, `style`, `layout`, `domId`, `inEditor` and `data`, never
 * `settings`. So the type's narrowness moved to the schema, where it is a
 * STARTING POINT an author can overrule rather than a ceiling they cannot.
 *
 * ── WHAT THIS FILE CAN AND CANNOT SEE ──────────────────────────────────────
 * It is pure: schema parsing and one preset lookup. It proves which VALUE each
 * type starts at and which max-width class that value maps to. It cannot prove
 * a painted pixel — that the four values now produce four different widths on
 * screen is scripts/_probe-container-reflow.mjs, which measures real Chrome
 * with real compiled Tailwind, and it is named here because a class-string
 * check is exactly what would have passed on the broken version.
 */

const widthOf = (type) => newSection(type).settings.containerWidth;

// ── A — the per-type default, and the base default for everyone else ───────

test('container starts at small; every other type starts at the base large', () => {
  assert.equal(widthOf('container'), 'small');

  const others = ALL_SECTION_TYPES.filter((t) => t !== 'container');
  assert.equal(others.length, 26);
  const distinct = [...new Set(others.map(widthOf))];
  assert.deepEqual(distinct, ['large'],
    `types other than container start at ${distinct.join(', ')} — the per-type default was meant `
    + 'to apply to container ALONE');

  // Named explicitly, because full_width is the type container must stay
  // distinct from and a silent change to it would look like success here.
  assert.equal(widthOf('full_width'), 'large');
});

test('the override REPLACES the base default rather than layering over it', () => {
  /**
   * The point of item A, and the reason this is a test rather than a comment:
   * "two defaults for one field" is the same second-authority shape this round
   * exists to remove, so it matters that there is exactly ONE.
   *
   * `.extend()` overwrites a key, so the container member's shape carries only
   * `small`. The base's `large` is not consulted at parse time and is not
   * present in that member at all — asserted by reading both shapes, not by
   * observing that the parse happens to come out right.
   */
  const memberOf = (t) => sectionSchema.options.find((o) => o.shape.type.value === t);
  const defaultIn = (member) => member.shape.settings.removeDefault().shape.containerWidth._def.defaultValue();

  assert.equal(defaultIn(memberOf('container')), 'small');
  assert.equal(defaultIn(memberOf('full_width')), 'large');

  // The shared schema is untouched — the override is per member, not a mutation.
  assert.equal(settingsSchema.removeDefault().shape.containerWidth._def.defaultValue(), 'large',
    'the base settings schema itself was changed — that would move every type, not container');

  // …and the rest of the envelope survived the unwrap/rewrap intact.
  const parsed = sectionSchema.parse({ id: 'x', type: 'container' }).settings;
  assert.deepEqual(parsed, {
    containerWidth: 'small', spacingTop: 'medium', spacingBottom: 'medium',
    background: 'default', visibility: 'all',
  }, 'rebuilding the settings block for container dropped or changed a sibling field');
});

test('CONTROL: swapping the two defaults is caught, and named', () => {
  /**
   * Discrimination for both tests above. The helper is called with the wrong
   * value and the resulting member must disagree with what the real schema
   * produces — otherwise "container is small" says nothing about whether the
   * override does any work.
   */
  const swapped = settingsWithContainerWidth('large');
  assert.equal(swapped.removeDefault().shape.containerWidth._def.defaultValue(), 'large');
  assert.notEqual(
    swapped.removeDefault().shape.containerWidth._def.defaultValue(),
    settingsWithContainerWidth('small').removeDefault().shape.containerWidth._def.defaultValue(),
  );
  assert.throws(() => assert.equal(swapped.parse({}).containerWidth, 'small'));

  // And the helper really is what decides — a member built with it takes its
  // value, so a swap at the call site would land here rather than nowhere.
  assert.equal(settingsWithContainerWidth('full').parse({}).containerWidth, 'full');
});

// ── B — the two types stay distinguishable, at their defaults ──────────────

test('container and full_width start at DIFFERENT widths, mapping to different classes', () => {
  /**
   * The clamp was the only thing separating these two types; deleting it alone
   * would have merged them. This is what proves the distinction survived being
   * moved into the schema.
   *
   * The class lookup matters as much as the value: two different values that
   * mapped to the same max-width would be a distinction on paper only. The
   * PAINTED difference (640 vs 1168) is the probe's, measured.
   */
  assert.notEqual(widthOf('container'), widthOf('full_width'));
  assert.notEqual(containerWidthClass(widthOf('container')), containerWidthClass(widthOf('full_width')));
  assert.equal(containerWidthClass('small'), 'max-w-2xl');
  assert.equal(containerWidthClass('large'), 'max-w-[1200px]');
});

test('CONTROL: identical defaults WOULD collapse the distinction, and this catches it', () => {
  /**
   * The rejected option, reproduced: give container the base default and the
   * two types become indistinguishable at every level this file can see. If
   * that state passed the assertion above, the assertion would be proving
   * nothing.
   */
  const collapsed = settingsWithContainerWidth('large').parse({}).containerWidth;
  assert.equal(collapsed, widthOf('full_width'));
  assert.throws(() => assert.notEqual(collapsed, widthOf('full_width')),
    'a container defaulting to full_width\'s width must break the distinction check');
  assert.equal(containerWidthClass(collapsed), containerWidthClass(widthOf('full_width')));
});

// ── The four settings map to four distinct classes ─────────────────────────

test('all four width settings map to four DISTINCT max-width classes', () => {
  /**
   * `presets.js` was measured correct in round 21 and is untouched here; this
   * asserts the property the fix depends on — that the four values were always
   * four different boxes, and the clamp was what collapsed them.
   *
   * A class check ALONE would have passed before this round too, which is
   * precisely why it is not the evidence: the painted widths are in
   * scripts/_probe-container-reflow.mjs (640 / 864 / 1168 / 1408 after,
   * 640 / 768 / 768 / 768 before).
   */
  const classes = CONTAINER_WIDTHS.map(containerWidthClass);
  assert.deepEqual(classes, ['max-w-2xl', 'max-w-4xl', 'max-w-[1200px]', 'max-w-none']);
  assert.equal(new Set(classes).size, 4);
});

// ── C — existing documents keep what was persisted ─────────────────────────

test('a stored containerWidth survives the parse untouched — the new default cannot rewrite it', () => {
  /**
   * ── THE QUESTION THAT DECIDES WHETHER PUBLISHED PAGES MOVE ───────────────
   * Measured against the real database: all 38 stored sections carry an
   * explicit `settings.containerWidth`, none sparse. `newSection` mints by
   * parsing through this union, so the default is materialised at creation and
   * persisted — which means the per-type default governs NEW containers only.
   *
   * A stored container therefore keeps its value, and what changes for it is
   * the CLAMP going away: a stored `large` painted 768 and now paints 1168.
   * That is the migration risk, and it is why the blast radius was re-counted
   * (zero containers exist).
   */
  for (const w of CONTAINER_WIDTHS) {
    const stored = sectionSchema.parse({ id: 's', type: 'container', settings: { containerWidth: w } });
    assert.equal(stored.settings.containerWidth, w,
      `a stored container with containerWidth "${w}" was rewritten by the new default`);
  }

  // Only an ABSENT value takes the default — both shapes a sparse document
  // could have.
  assert.equal(sectionSchema.parse({ id: 's', type: 'container' }).settings.containerWidth, 'small');
  assert.equal(sectionSchema.parse({ id: 's', type: 'container', settings: {} }).settings.containerWidth, 'small');
});

test('CONTROL: the stored-value check would notice a default that DID overwrite', () => {
  /**
   * Discrimination. `newSection` fills every field, so a round trip through the
   * schema must preserve a deliberately non-default width — if parsing were
   * resetting it, this comes back as the default instead.
   */
  const minted = newSection('container');
  assert.equal(minted.settings.containerWidth, 'small');

  const edited = { ...minted, settings: { ...minted.settings, containerWidth: 'full' } };
  assert.equal(sectionSchema.parse(edited).settings.containerWidth, 'full');
  assert.notEqual(sectionSchema.parse(edited).settings.containerWidth, minted.settings.containerWidth);
});
