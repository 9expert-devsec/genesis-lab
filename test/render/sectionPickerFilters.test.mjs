import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import {
  SectionPickerBody, GROUPS, pillsOf, visibleGroups,
} from '@/components/pageBuilder/editor/SectionPicker';
import {
  LAYOUT_TYPES, CONTENT_TYPES, CARD_TYPES, DYNAMIC_TYPES, ADVANCED_TYPES,
} from '@/lib/schemas/pageBuilder';
import { labelOf } from '@/lib/pageBuilder/sectionLabels';
import { isContainer } from '@/lib/pageBuilder/containerSlots';

/**
 * The add-section picker's SEARCH + GROUP-PILL layer, rendered.
 *
 * ── WHY THIS FILE CAN RENDER AT ALL, AND WHAT THAT COST ────────────────────
 * `SectionPicker` puts its contents inside a Radix `Dialog.Portal`, which
 * renders NOTHING under renderToStaticMarkup — a portal has no server output.
 * Rounds 5/6 hit this and moved the affected claims into the fs tier as source
 * scans with discrimination controls (see the closing note in
 * test/render/draftVisibility.test.mjs and the header of
 * test/fs/pageBuilderDeleteConfirm.test.mjs).
 *
 * A source scan cannot state THIS round's claims. "Typing 'การ์ด' leaves exactly
 * these five buttons and no group headers for the other four" is an assertion
 * about a computed DOM, not about the shape of an expression, and face three of
 * defect 7 (sourceScan.mjs's header) is precisely what a text probe over a
 * filter expression would walk into: `query`, `activeGroup` and `.filter` all
 * survive an inverted condition unchanged.
 *
 * So the portal was moved OUT of the way rather than worked around: the picker's
 * contents are now `SectionPickerBody`, exported, portal-free, and taking
 * `query`/`activeGroup` as PROPS instead of owning them. Every assertion below
 * is over real DOM at a real filter value. `SectionPicker` itself — the Radix
 * shell and the useState that feeds the body — is still portal-bound and still
 * unrenderable here; what this file does NOT prove is that the shell wires its
 * two setters to the body's two callbacks, and that remains a source claim.
 *
 * ── WHY ELEMENT BOUNDARIES AND EXACT SETS, NEVER SUBSTRINGS ────────────────
 * Thai negates and qualifies by PREFIX, and these labels overlap by design:
 * 'การ์ด' is a prefix of 'การ์ดราคา', 'การ์ดคอร์ส', 'การ์ดสถิติ', 'การ์ดไอคอน' and
 * 'การ์ดผู้สอน', and it is also a whole group title. A markup.includes() would
 * report almost anything present. Every assertion reads one element's exact
 * textContent or an exact, sorted set of `data-type` values.
 *
 * Static markup into JSDOM, never createRoot: the runner is isolation:'none'
 * and one leaked React root breaks unrelated files.
 */

const DEV = true;
const NON_DEV = false;

function bodyDoc({ query = '', activeGroup = 'all', canUseAdvanced = DEV } = {}) {
  const markup = renderToStaticMarkup(createElement(SectionPickerBody, {
    query,
    activeGroup,
    canUseAdvanced,
    onQueryChange: () => {},
    onGroupChange: () => {},
    onPick: () => {},
  }));
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

/** Every type the picker actually drew, as a sorted exact set. */
const typesIn = (doc) =>
  [...doc.querySelectorAll('[data-testid="picker-type"]')].map((b) => b.getAttribute('data-type')).sort();

/** Every group header the picker actually drew, by stable key, in draw order. */
const groupKeysIn = (doc) =>
  [...doc.querySelectorAll('[data-testid="picker-group"]')].map((g) => g.getAttribute('data-group-key'));

const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

// ── 0. the harness is not vacuous ───────────────────────────────────────────

test('CONTROL: an unfiltered render draws all five groups and all 27 types', () => {
  // Every "narrows to X" assertion below is a subtraction from this. If the
  // unfiltered render were empty, each of them would pass against nothing.
  const doc = bodyDoc();
  assert.deepEqual(groupKeysIn(doc), ['content', 'layout', 'card', 'dynamic', 'advanced']);
  assert.deepEqual(
    typesIn(doc),
    [...CONTENT_TYPES, ...LAYOUT_TYPES, ...CARD_TYPES, ...DYNAMIC_TYPES, ...ADVANCED_TYPES].sort(),
  );
  assert.equal(doc.querySelector('[data-testid="picker-empty"]'), null,
    'the empty-state row rendered alongside a full catalogue');
});

// ── 1. search narrows ───────────────────────────────────────────────────────

test('a query matching ONE label leaves exactly that type, in exactly its own group', () => {
  // 'ไทม์ไลน์' (timeline) is the whole label and shares no prefix with any
  // sibling, so the expected answer is a single type in a single group.
  const doc = bodyDoc({ query: 'ไทม์ไลน์' });
  assert.deepEqual(typesIn(doc), ['timeline']);
  assert.deepEqual(groupKeysIn(doc), ['layout']);
  assert.equal(text(doc.querySelector('[data-testid="picker-type"]')), labelOf('timeline'));
});

test('a query matching a shared Thai substring returns EVERY label carrying it, across groups', () => {
  /**
   * The counterpart to the test above, and the reason a lower bound would be
   * worthless here. 'การ์ด' appears in all five CARD_TYPES labels — but it is
   * not confined to that group: card_grid is labelled 'กริดการ์ด', a LAYOUT
   * type whose name contains the string. Search matches labelOf(), not the
   * category, so the honest expected answer is six types in two groups.
   *
   * This was written expecting five in one group and went red on card_grid,
   * which is the finding rather than the bug: an author typing 'การ์ด' is
   * looking for card-ish things and the grid of cards is one. It is also
   * exactly why the pill and the query have to AND rather than OR — see item 3
   * below, which uses this same overlap.
   *
   * Exact set, so a filter that silently stopped matching any one of the six
   * reddens.
   */
  const doc = bodyDoc({ query: 'การ์ด' });
  assert.deepEqual(typesIn(doc), [...CARD_TYPES, 'card_grid'].sort());
  assert.deepEqual(groupKeysIn(doc), ['layout', 'card'], 'the groups are drawn out of GROUPS order');
  // …and the one layout type it reached is the one whose LABEL carries the
  // string, not the whole layout group.
  assert.ok(labelOf('card_grid').includes('การ์ด'));
  assert.equal(labelOf('highlight_grid').includes('การ์ด'), false);
});

test('search is case-insensitive where the label is ASCII, which is why folding is kept', () => {
  // Thai is caseless, so `.toLowerCase()` would be pure decoration if the four
  // ASCII-bearing labels did not exist. They do, and this is what needs it.
  assert.deepEqual(typesIn(bodyDoc({ query: 'html' })), ['custom_html']);
  assert.deepEqual(typesIn(bodyDoc({ query: 'HTML' })), ['custom_html']);
  assert.deepEqual(typesIn(bodyDoc({ query: 'json' })), ['debug_json']);
});

test('a query matching NOTHING draws no groups at all — not empty headers', () => {
  const doc = bodyDoc({ query: 'zzzzไม่มีอะไรตรงzzzz' });
  assert.deepEqual(groupKeysIn(doc), [], 'a group header rendered with no types under it');
  assert.deepEqual(typesIn(doc), []);
  // …and the author is told so, rather than being shown a blank dialog.
  assert.equal(text(doc.querySelector('[data-testid="picker-empty"]')), 'ไม่พบชนิด section ที่ตรงกับคำค้นหา');
});

test('CONTROL: the empty case is reachable ONLY through the filter, not by rendering nothing', () => {
  // The assertion above would pass identically if SectionPickerBody had simply
  // stopped drawing groups. Same component, one prop apart, opposite answers.
  assert.equal(groupKeysIn(bodyDoc({ query: 'zzzzไม่มีอะไรตรงzzzz' })).length, 0);
  assert.equal(groupKeysIn(bodyDoc({ query: '' })).length, GROUPS.length);
});

test('whitespace-only and empty queries are the same thing: no filter', () => {
  assert.deepEqual(typesIn(bodyDoc({ query: '   ' })), typesIn(bodyDoc({ query: '' })));
});

// ── 2. the group pills narrow ───────────────────────────────────────────────

test('selecting การ์ด shows exactly CARD_TYPES and no other group', () => {
  const doc = bodyDoc({ activeGroup: 'card' });
  assert.deepEqual(typesIn(doc), [...CARD_TYPES].sort());
  assert.deepEqual(groupKeysIn(doc), ['card']);
});

test('each pill narrows to exactly its own exported list', () => {
  const expected = {
    content: CONTENT_TYPES, layout: LAYOUT_TYPES, card: CARD_TYPES,
    dynamic: DYNAMIC_TYPES, advanced: ADVANCED_TYPES,
  };
  for (const group of GROUPS) {
    const doc = bodyDoc({ activeGroup: group.key });
    assert.deepEqual(groupKeysIn(doc), [group.key], `the ${group.key} pill drew another group too`);
    assert.deepEqual(typesIn(doc), [...expected[group.key]].sort(),
      `the ${group.key} pill does not show exactly its own exported list`);
  }
});

test('ทั้งหมด shows every group again', () => {
  assert.deepEqual(groupKeysIn(bodyDoc({ activeGroup: 'all' })), GROUPS.map((g) => g.key));
});

test('the active pill carries this codebase’s selected-state treatment, and exactly one does', () => {
  const doc = bodyDoc({ activeGroup: 'card' });
  const pills = [...doc.querySelectorAll('[data-testid="picker-pill"]')];
  const active = pills.filter((p) => p.getAttribute('data-active') === 'true');
  assert.equal(active.length, 1, 'more than one pill, or none, read as selected');
  assert.equal(active[0].getAttribute('data-group-key'), 'card');
  assert.equal(active[0].getAttribute('aria-pressed'), 'true');
  // PublishDialog's selected status row is `border-9e-action/40 bg-9e-action/10`.
  // Reused verbatim rather than a second active convention invented here.
  const cls = active[0].getAttribute('class');
  assert.ok(cls.includes('border-9e-action/40'), 'the active pill lost the shared selected border');
  assert.ok(cls.includes('bg-9e-action/10'), 'the active pill lost the shared selected fill');
  // CONTROL: an inactive pill does NOT carry it, so the check above is not
  // matching a class every pill has.
  const inactive = pills.find((p) => p.getAttribute('data-active') === 'false');
  assert.equal(inactive.getAttribute('aria-pressed'), 'false');
  assert.equal(inactive.getAttribute('class').includes('bg-9e-action/10'), false);
});

// ── 3. search AND pill combine — AND, never OR ──────────────────────────────

test('a query matching a type OUTSIDE the active group hides it', () => {
  /**
   * 'ไทม์ไลน์' is a LAYOUT type. With the การ์ด pill active it must vanish
   * entirely — an OR would have shown it, or shown the layout group beside the
   * card one. The expected answer is: nothing at all, because no CARD_TYPES
   * label contains 'ไทม์ไลน์'.
   */
  const doc = bodyDoc({ query: 'ไทม์ไลน์', activeGroup: 'card' });
  assert.deepEqual(typesIn(doc), []);
  assert.deepEqual(groupKeysIn(doc), []);

  /**
   * The sharper case, using item 1's overlap. Unfiltered, 'การ์ด' reaches SIX
   * types in two groups. With the การ์ด pill active it must reach exactly the
   * five that live in that group — card_grid is dropped despite matching the
   * text, because it is in layout. An OR would have kept it; so would a pill
   * that only reordered rather than restricted.
   */
  const both = bodyDoc({ query: 'การ์ด', activeGroup: 'card' });
  assert.deepEqual(typesIn(both), [...CARD_TYPES].sort());
  assert.deepEqual(groupKeysIn(both), ['card']);
  assert.equal(typesIn(both).includes('card_grid'), false,
    'a text match outside the active group survived the pill — the two filters are ORing');
});

test('CONTROL: that same query and that same pill each show something on their own', () => {
  // Without this, the empty answer above is indistinguishable from a filter
  // that returns nothing for every input.
  assert.deepEqual(typesIn(bodyDoc({ query: 'ไทม์ไลน์', activeGroup: 'all' })), ['timeline']);
  assert.deepEqual(typesIn(bodyDoc({ query: '', activeGroup: 'card' })), [...CARD_TYPES].sort());
});

test('a query INSIDE the active group still narrows within it', () => {
  // The other direction of the AND: the pill does not swallow the query.
  const doc = bodyDoc({ query: 'การ์ดราคา', activeGroup: 'card' });
  assert.deepEqual(typesIn(doc), ['price_card']);
  assert.deepEqual(groupKeysIn(doc), ['card']);
});

// ── 4. the Advanced split ───────────────────────────────────────────────────

test('a NON-developer sees one locked summary row and NOT ONE advanced button', () => {
  const doc = bodyDoc({ canUseAdvanced: NON_DEV });
  const summary = doc.querySelector('[data-testid="picker-advanced-locked"]');
  assert.ok(summary, 'the collapsed Advanced row is missing for a non-developer');
  assert.ok(text(summary).startsWith('ต้องมีสิทธิ์ developer'),
    'the collapsed row dropped the existing tier framing');

  // The claim that matters: the four buttons are ABSENT FROM THE DOM, not
  // merely disabled. An exact set, so a single survivor reddens this.
  const drawn = new Set(typesIn(doc));
  for (const type of ADVANCED_TYPES) {
    assert.equal(drawn.has(type), false, `${type} still rendered as its own button for a non-developer`);
  }
  // …and everything else still did render, so this is a collapse, not a wipe.
  assert.deepEqual(
    typesIn(doc),
    [...CONTENT_TYPES, ...LAYOUT_TYPES, ...CARD_TYPES, ...DYNAMIC_TYPES].sort(),
  );
  // The group header itself stays — the author must still learn the tier exists.
  assert.deepEqual(groupKeysIn(doc), ['content', 'layout', 'card', 'dynamic', 'advanced']);
});

test('a DEVELOPER sees every advanced type as its own button, in the same grid as everything else', () => {
  const doc = bodyDoc({ canUseAdvanced: DEV });
  assert.equal(doc.querySelector('[data-testid="picker-advanced-locked"]'), null,
    'a developer was shown the locked summary row — the collapse is pointed the wrong way');
  const drawn = new Set(typesIn(doc));
  for (const type of ADVANCED_TYPES) {
    assert.ok(drawn.has(type), `${type} is not offered to a developer`);
  }
  // In whatever state typeState already computes — unchanged logic, just
  // visible. Today every advanced type is renderable, so that state is 'add'.
  const advanced = [...doc.querySelectorAll('[data-testid="picker-type"]')]
    .filter((b) => ADVANCED_TYPES.includes(b.getAttribute('data-type')));
  assert.equal(advanced.length, ADVANCED_TYPES.length);
  assert.deepEqual([...new Set(advanced.map((b) => b.getAttribute('data-state')))], ['add']);
});

test('CONTROL: the two tiers differ ONLY in the advanced group', () => {
  // Discrimination: same component, one boolean apart. Everything outside
  // ADVANCED_TYPES must be byte-identical between the tiers, or the collapse is
  // reaching further than it claims to.
  const dev = typesIn(bodyDoc({ canUseAdvanced: DEV })).filter((t) => !ADVANCED_TYPES.includes(t));
  const nonDev = typesIn(bodyDoc({ canUseAdvanced: NON_DEV })).filter((t) => !ADVANCED_TYPES.includes(t));
  assert.deepEqual(dev, nonDev);
  assert.ok(dev.length > 0, 'both tiers drew nothing, so the comparison is vacuous');
});

test('the ขั้นสูง pill still works for a non-developer, and still collapses', () => {
  const doc = bodyDoc({ activeGroup: 'advanced', canUseAdvanced: NON_DEV });
  assert.deepEqual(groupKeysIn(doc), ['advanced']);
  assert.deepEqual(typesIn(doc), []);
  assert.ok(doc.querySelector('[data-testid="picker-advanced-locked"]'));
});

// ── 5. the fail-closed invariant, in the new layout ─────────────────────────
//
// The invariant itself — that only 'add' reaches onPick — is owned by
// test/render/sectionTypeCoverage.test.mjs, which is where the `'soon'` branch
// and its measurement live. It is EXTENDED there rather than restated here, so
// there is one file to read when the rule is questioned. What belongs here is
// the layout-local half: that the new grid did not lose the disabled attribute
// on its way through the restyle.

test('every button the new layout draws is disabled iff its computed state is not "add"', () => {
  const doc = bodyDoc({ canUseAdvanced: NON_DEV });
  const buttons = [...doc.querySelectorAll('[data-testid="picker-type"]')];
  assert.ok(buttons.length > 0, 'no buttons drawn — the check below is vacuous');
  for (const b of buttons) {
    const state = b.getAttribute('data-state');
    assert.equal(
      b.hasAttribute('disabled'), state !== 'add',
      `${b.getAttribute('data-type')} is state=${state} but disabled=${b.hasAttribute('disabled')}`,
    );
  }
});

// ── 6. the container hint survived the denser card ──────────────────────────

test('a container type in "add" state still says it can hold nested sections', () => {
  const doc = bodyDoc();
  const containers = [...doc.querySelectorAll('[data-testid="picker-type"]')]
    .filter((b) => isContainer(b.getAttribute('data-type')));
  assert.ok(containers.length > 0, 'no container type was drawn at all');
  for (const b of containers) {
    assert.equal(b.getAttribute('data-state'), 'add', 'a container type is no longer offerable');
    assert.ok(b.textContent.includes('ใส่ section ซ้อนข้างในได้'),
      `${b.getAttribute('data-type')} lost the nesting hint in the new card layout`);
  }
});

test('CONTROL: the hint is on containers ONLY — it is not on every card', () => {
  // Otherwise the assertion above would pass on a layout that printed the line
  // under all 27 labels.
  const doc = bodyDoc();
  const withHint = [...doc.querySelectorAll('[data-testid="picker-type"]')]
    .filter((b) => b.textContent.includes('ใส่ section ซ้อนข้างในได้'))
    .map((b) => b.getAttribute('data-type')).sort();
  assert.deepEqual(withHint, LAYOUT_TYPES.filter(isContainer).sort());
});

// ── 7. the pills are DERIVED from GROUPS ────────────────────────────────────

test('the rendered pill row is exactly "ทั้งหมด" plus one pill per GROUPS entry, in order', () => {
  const doc = bodyDoc();
  const keys = [...doc.querySelectorAll('[data-testid="picker-pill"]')].map((p) => p.getAttribute('data-group-key'));
  assert.deepEqual(keys, ['all', ...GROUPS.map((g) => g.key)]);
  const titles = [...doc.querySelectorAll('[data-testid="picker-pill"]')].map(text);
  assert.deepEqual(titles, ['ทั้งหมด', ...GROUPS.map((g) => g.title)]);
});

test('CONTROL: pillsOf GROWS with its input — a sixth group yields a sixth pill', () => {
  /**
   * THE POINT OF THIS FILE'S ITEM 7, and the reason `pillsOf` takes a parameter
   * at all. The assertion above counts six pills against a five-entry GROUPS;
   * five strings typed by hand would satisfy it exactly as well, and would then
   * disagree with the grid the first time a sixth category is exported.
   *
   * So the derivation is put through the same function the component calls,
   * with a SIXTH group it has never seen. A hardcoded list cannot pass this;
   * only reading the argument can.
   *
   * (Verified end-to-end as well: a sixth entry temporarily appended to GROUPS
   * in the source produced a sixth pill AND a sixth group in the rendered DOM,
   * and was reverted. This control is the permanent, non-invasive half.)
   */
  const sixth = { key: 'sixth', title: 'กลุ่มที่หก', types: ['heading'] };
  const grown = pillsOf([...GROUPS, sixth]);
  assert.deepEqual(grown.map((p) => p.key), ['all', ...GROUPS.map((g) => g.key), 'sixth']);
  assert.equal(grown.length, GROUPS.length + 2);

  // …and the reverse direction, so this is not just "the array got longer":
  // fewer groups in, fewer pills out.
  assert.deepEqual(pillsOf([]).map((p) => p.key), ['all']);
  assert.deepEqual(pillsOf().map((p) => p.key), ['all', ...GROUPS.map((g) => g.key)]);
});

test('GROUPS maps 1:1 onto the five exported *_TYPES lists, by identity', () => {
  /**
   * Not a re-statement of sectionTypeCoverage's source scan — that one reads
   * TEXT (`types: CARD_TYPES` appears in the file). This reads the VALUE, so a
   * group that was re-pointed at a copy, a slice, or a reordering of the export
   * reddens here even though the text is unchanged. Identity (`===`), because a
   * copy is exactly the drift the pills are supposed to be immune to.
   */
  const byKey = Object.fromEntries(GROUPS.map((g) => [g.key, g.types]));
  assert.deepEqual(Object.keys(byKey).sort(), ['advanced', 'card', 'content', 'dynamic', 'layout']);
  assert.equal(byKey.content, CONTENT_TYPES);
  assert.equal(byKey.layout, LAYOUT_TYPES);
  assert.equal(byKey.card, CARD_TYPES);
  assert.equal(byKey.dynamic, DYNAMIC_TYPES);
  assert.equal(byKey.advanced, ADVANCED_TYPES);
});

// ── 8. visibleGroups, directly — the shape under the DOM ────────────────────

test('visibleGroups drops narrowed-to-nothing groups rather than emptying them', () => {
  // The rendered tests above prove the header does not appear. This proves WHY:
  // the group is not in the list at all, so no layout change can resurrect it.
  // 'การ์ด' survives in two groups (card_grid is 'กริดการ์ด' — see item 1), and
  // each survivor is narrowed to only its matching members, not passed whole.
  const groups = visibleGroups('การ์ด', 'all');
  assert.deepEqual(groups.map((g) => g.key), ['layout', 'card']);
  assert.deepEqual(groups[0].types, ['card_grid'], 'the layout group was passed through unnarrowed');
  assert.deepEqual(groups[1].types, [...CARD_TYPES]);
  assert.ok(groups.every((g) => g.types.length > 0));
  // The other three are GONE, not present-and-empty.
  assert.equal(groups.length, 2);
});

test('CONTROL: visibleGroups does not MUTATE the exported lists it filters', () => {
  // `.filter` returns a new array, but a future `.splice`-based narrowing would
  // quietly shorten CARD_TYPES for every other importer in the app.
  const before = [...CARD_TYPES];
  visibleGroups('การ์ดราคา', 'card');
  visibleGroups('zzz', 'all');
  assert.deepEqual([...CARD_TYPES], before);
});
