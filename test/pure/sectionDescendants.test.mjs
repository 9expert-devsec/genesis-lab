import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDescendants } from '@/lib/pageBuilder/sectionDescendants';
import { CONTAINER_SLOTS, slotsOf } from '@/lib/pageBuilder/containerSlots';

/**
 * What the delete confirmation is allowed to CLAIM.
 *
 * The dialog says "…and the N sections inside it". N is this function, so N
 * being wrong is the dialog lying at the exact moment the author is deciding
 * whether to lose work that cannot be undone. Every case below is a shape the
 * tree really produces.
 *
 * Each assertion is written to DISCRIMINATE — the count for a given fixture is
 * different under each plausible wrong implementation (first-slot-only,
 * immediate-children-only, counting the node itself), so a break in any of
 * those directions reddens rather than coincidentally agreeing.
 */

const leaf = (type = 'heading') => ({ type, content: { text: 'x' } });
const container = (type, content) => ({ type, content });

// ── empty container ─────────────────────────────────────────────────────────

test('an empty container has no descendants', () => {
  assert.equal(countDescendants(container('container', { children: [] })), 0);
  // A container whose slot key is absent entirely — the shape a freshly added
  // section can have before anything is put in it.
  assert.equal(countDescendants(container('container', {})), 0);
  assert.equal(countDescendants(container('two_column', { left: [], right: [] })), 0);
});

// ── one slot ────────────────────────────────────────────────────────────────

test('a single-slot container counts its children', () => {
  const one = container('container', { children: [leaf()] });
  const three = container('card_grid', { children: [leaf(), leaf('image'), leaf('cta')] });
  assert.equal(countDescendants(one), 1);
  assert.equal(countDescendants(three), 3);
});

test('CONTROL: the count excludes the section itself', () => {
  // 1 not 2 for a container holding one leaf. This is the assertion that fails
  // if the recursion ever starts counting the node it was handed — the dialog
  // would then say "1 section inside" for an EMPTY container.
  assert.equal(countDescendants(container('container', { children: [leaf()] })), 1);
  assert.equal(countDescendants(leaf()), 0);
});

// ── both slots of two_column ────────────────────────────────────────────────

test('two_column counts BOTH slots, not just the first', () => {
  const s = container('two_column', {
    left: [leaf(), leaf('image')],
    right: [leaf('cta')],
  });
  // 3, not 2 — a first-slot-only reader would say 2 for this exact fixture.
  assert.equal(countDescendants(s), 3);
});

test('CONTROL: the two_column fixture really has two DIFFERENT slots populated', () => {
  // Anchors the assertion above: if two_column ever stopped being a two-slot
  // container, "3" would be measuring something else entirely and the test
  // would still read as if it covered both sides.
  assert.deepEqual(slotsOf('two_column'), ['left', 'right']);
  assert.equal(CONTAINER_SLOTS.two_column.length, 2);
  const asymmetric = container('two_column', { left: [leaf(), leaf()], right: [leaf()] });
  // Deliberately asymmetric, so first-slot-only and second-slot-only give
  // DIFFERENT wrong answers (2 and 1) and neither can be mistaken for right.
  assert.notEqual(asymmetric.content.left.length, asymmetric.content.right.length);
});

// ── nested depth ────────────────────────────────────────────────────────────

test('nesting is counted all the way down, across slot kinds', () => {
  //  two_column
  //    left:  container → [ heading, card_grid → [ image, cta ] ]
  //    right: heading
  const deep = container('two_column', {
    left: [
      container('container', {
        children: [
          leaf(),
          container('card_grid', { children: [leaf('image'), leaf('cta')] }),
        ],
      }),
    ],
    right: [leaf()],
  });
  // container(1) + heading(1) + card_grid(1) + image(1) + cta(1) + heading(1)
  assert.equal(countDescendants(deep), 6);
  // …and an immediate-children-only reader would say 2 for the same fixture,
  // which is what makes this case worth its own test.
  assert.notEqual(deep.content.left.length + deep.content.right.length, 6);
});

test('CONTROL: the nested fixture is genuinely deeper than one level', () => {
  const deep = container('container', {
    children: [container('container', { children: [leaf()] })],
  });
  assert.equal(countDescendants(deep), 2);
  // Same tree flattened to one level counts 2 as well — so depth alone is not
  // what this proves. The discriminating pair is the ASYMMETRIC one below:
  // 3 nested vs 3 flat both give 3, but nested-with-extra-siblings does not.
  const flat = container('container', { children: [leaf(), leaf()] });
  assert.equal(countDescendants(flat), 2);
  const nestedPlus = container('container', {
    children: [leaf(), container('container', { children: [leaf(), leaf()] })],
  });
  assert.equal(countDescendants(nestedPlus), 4);
  assert.equal(nestedPlus.content.children.length, 2); // immediate-only would say 2
});

// ── a non-container leaf ────────────────────────────────────────────────────

test('a non-container section has 0 descendants', () => {
  for (const type of ['heading', 'rich_text', 'image', 'cta', 'checklist', 'notice']) {
    assert.equal(countDescendants({ type, content: { text: 'x' } }), 0, type);
  }
});

test('an item-based block is NOT a container, even holding an items array', () => {
  // timeline / tabs / accordion own their data; containerSlots deliberately
  // excludes them, so their items are NOT sections and must not be counted as
  // "nested sections about to be deleted".
  const tabs = { type: 'tabs', content: { items: [{ label: 'a' }, { label: 'b' }] } };
  assert.equal(slotsOf('tabs'), null);
  assert.equal(countDescendants(tabs), 0);
});

test('CONTROL: junk input counts 0 rather than throwing', () => {
  // The dialog renders before anything validates the row, so an undefined or
  // half-built section must not take the panel down.
  assert.equal(countDescendants(null), 0);
  assert.equal(countDescendants(undefined), 0);
  assert.equal(countDescendants({}), 0);
  assert.equal(countDescendants({ type: 'container', content: { children: null } }), 0);
});
