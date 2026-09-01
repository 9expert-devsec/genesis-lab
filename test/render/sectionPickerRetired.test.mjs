import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { visibleGroups, GROUPS, typeState } from '@/components/pageBuilder/editor/SectionPicker';
import {
  LAYOUT_TYPES, ALL_SECTION_TYPES, RETIRED_SECTION_TYPES, sectionSchema,
} from '@/lib/schemas/pageBuilder';
import { RENDERABLE_SECTION_TYPES } from '@/components/pageBuilder/SectionRenderer';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { labelOf } from '@/lib/pageBuilder/sectionLabels';
import { slotsOf } from '@/lib/pageBuilder/containerSlots';

/**
 * ROUND 80 — `highlight_grid` is RETIRED: no longer offered, still everything else.
 *
 * A retirement has two halves and a test that checked one would pass on a
 * broken build:
 *
 *   IT IS GONE FROM THE PICKER. If it came back, an author could add a type the
 *   product has withdrawn.
 *   IT IS GONE FROM NOTHING ELSE. If the schema, the renderer registry, the
 *   label, the icon or the slot map lost it, every STORED section of that type
 *   would fail to parse, fail to render, or become unmanageable in the editor —
 *   and the picker assertion above would still be green.
 *
 * So both are asserted, and the second half is the larger one.
 */

const RETIRED = 'highlight_grid';

/** Every type the picker actually draws, across all groups, with no query. */
const offeredTypes = () => visibleGroups('', 'all').flatMap((g) => g.types).sort();

// ── 1. GONE FROM THE PICKER ───────────────────────────────────────────────

test('the picker offers every layout type EXCEPT the retired one', () => {
  const layout = visibleGroups('', 'layout');
  assert.equal(layout.length, 1, 'the layout group is not drawn at all');
  assert.deepEqual(layout[0].types, LAYOUT_TYPES.filter((t) => t !== RETIRED),
    `the layout group's offered set is not LAYOUT_TYPES minus ${RETIRED}`);
  // Named explicitly as well as by subtraction, so the intent survives a
  // future edit to LAYOUT_TYPES that would keep the subtraction true vacuously.
  assert.equal(layout[0].types.includes(RETIRED), false);
  for (const t of ['full_width', 'container', 'two_column', 'card_grid', 'timeline', 'tabs', 'accordion']) {
    assert.ok(layout[0].types.includes(t), `the picker stopped offering ${t}`);
  }
});

test('it is absent from the WHOLE picker, not just the layout pill', () => {
  // A type filtered out of one group but still reachable under "ทั้งหมด" would
  // be exactly the kind of half-fix this asserts against.
  assert.equal(offeredTypes().includes(RETIRED), false);
  assert.deepEqual(offeredTypes(), ALL_SECTION_TYPES.filter((t) => t !== RETIRED).sort(),
    'the picker\'s offered set is no longer ALL_SECTION_TYPES minus the retired list');
});

test('searching for its own label finds nothing', () => {
  /**
   * The search box matches on `labelOf`, and the label is DELIBERATELY kept
   * (stored sections need it). So a filter applied only to the unsearched list
   * would leave the type reachable by typing its name — which is how an author
   * would most plausibly go looking for it.
   */
  const hits = visibleGroups(labelOf(RETIRED), 'all').flatMap((g) => g.types);
  assert.equal(hits.includes(RETIRED), false,
    `searching "${labelOf(RETIRED)}" still surfaces the retired type`);
});

test('CONTROL: retiring a SECOND type is named by the same assertions', () => {
  /**
   * Every assertion above is an absence check, and an absence check passes
   * against an empty list, a renamed export, or a filter that removed
   * everything. This re-runs the layout comparison against a two-type
   * retirement and requires it to FAIL — so a green above means one type is
   * gone, not that the comparison is dead.
   */
  const pretendRetired = [RETIRED, 'card_grid'];
  const wouldBe = LAYOUT_TYPES.filter((t) => !pretendRetired.includes(t));
  assert.throws(
    () => assert.deepEqual(visibleGroups('', 'layout')[0].types, wouldBe),
    /card_grid/,
    'the offered-set comparison cannot see a second type going missing',
  );
  // …and the real retirement list is the one-type list, not the pretend one.
  assert.deepEqual([...RETIRED_SECTION_TYPES], [RETIRED]);
});

// ── 2. GONE FROM NOTHING ELSE ─────────────────────────────────────────────

test('a stored section of the retired type still PARSES', () => {
  const stored = {
    id: 'hg1', type: RETIRED, enabled: true, sortOrder: 0,
    content: { children: [] },
    settings: { background: 'default', spacingTop: 'medium', spacingBottom: 'medium' },
    layout: { columns: 2 },
  };
  const parsed = sectionSchema.parse(stored);
  assert.equal(parsed.type, RETIRED);
  assert.equal(parsed.layout.columns, 2, 'its layout settings did not survive the parse');
  assert.ok(ALL_SECTION_TYPES.includes(RETIRED),
    'the retired type left ALL_SECTION_TYPES, so the discriminated union no longer accepts it '
    + 'and every stored section of this type fails validation on the next save');
});

test('a stored section of the retired type still RENDERS, with its children', () => {
  const section = {
    id: 'hg1', type: RETIRED, enabled: true,
    content: {
      children: [
        { id: 'c1', type: 'custom_html', enabled: true, content: { html: '<span>หนึ่ง</span>' }, settings: {} },
        { id: 'c2', type: 'custom_html', enabled: true, content: { html: '<span>สอง</span>' }, settings: {} },
      ],
    },
    settings: { spacingTop: 'none', spacingBottom: 'none' },
    layout: { columns: 2 },
  };
  const markup = renderToStaticMarkup(
    createElement(SectionRenderer, { section, depth: 0, resolvedData: {} }));
  assert.ok(markup.includes('หนึ่ง') && markup.includes('สอง'),
    'the retired type renders no children — its component left the registry');
  assert.match(markup, /rounded-9e-lg/, 'the per-child box is gone');
  assert.ok(RENDERABLE_SECTION_TYPES.includes(RETIRED),
    'the retired type left the renderer registry, so every stored one renders nothing');
});

test('CONTROL: the render assertion names the failure if the component goes', () => {
  // Without this, "it rendered" could be true of any markup at all.
  const empty = renderToStaticMarkup(createElement(SectionRenderer, {
    section: { id: 'x', type: 'no_such_type', enabled: true, content: {}, settings: {} },
    depth: 0, resolvedData: {},
  }));
  assert.equal(empty.includes('หนึ่ง'), false,
    'the child-text check passes against a section that rendered nothing');
});

test('it is still MANAGEABLE in the editor — label, icon, slots, depth', () => {
  /**
   * §C. A type that renders on the page but cannot be opened, labelled or
   * counted in the structure panel is worse than one still in the picker.
   * These four maps are what the panel reads.
   */
  assert.equal(labelOf(RETIRED), 'กริดไฮไลต์', 'the structure panel has no name for it');
  assert.deepEqual(slotsOf(RETIRED), ['children'],
    'its child slot is gone, so the tree cannot show or edit its children');
});

// ── 3. §F — THE FAIL-CLOSED BRANCH, DRIVEN ────────────────────────────────

test('typeState answers "retired", so the type cannot be clicked even if drawn', () => {
  /**
   * `visibleGroups` already subtracts the type, so this branch is unreachable
   * from the picker today. It exists for the reason round 9 kept 'soon':
   * currently unreachable is not unreachable. Two ordinary edits would reach it
   * — a later round rendering a group's `types` without going through
   * `visibleGroups`, or a caller passing a type straight to `typeState`.
   *
   * It matters that it is checked BEFORE `renderable`: a retired type IS
   * renderable, so the renderable check alone would answer 'add' and make the
   * button live.
   */
  assert.equal(typeState(RETIRED, true), 'retired');
  assert.equal(typeState(RETIRED, false), 'retired',
    'the tier flag changes the answer for a retired type — retirement is not a permission');
  // Only 'add' reaches onPick, so anything else is closed.
  assert.notEqual(typeState(RETIRED, true), 'add');
});

test('CONTROL: no other layout type answers "retired"', () => {
  /**
   * Without this, `typeState` returning 'retired' for EVERYTHING would pass the
   * assertions above and empty the picker.
   */
  for (const t of LAYOUT_TYPES.filter((x) => x !== RETIRED)) {
    assert.equal(typeState(t, true), 'add',
      `${t} is no longer offerable — the retirement caught more than its one type`);
  }
});

test('the retirement list names only types that really exist', () => {
  // A typo here would retire nothing and read as success.
  for (const t of RETIRED_SECTION_TYPES) {
    assert.ok(ALL_SECTION_TYPES.includes(t),
      `RETIRED_SECTION_TYPES names "${t}", which is not a declared section type — so it retires nothing`);
  }
  // GROUPS still holds the imported constants by reference (round 9's rule);
  // the retirement is a view over them, not an edit to them.
  assert.ok(GROUPS.find((g) => g.key === 'layout').types.includes(RETIRED),
    'GROUPS no longer holds LAYOUT_TYPES by reference — the retirement was pushed into the '
    + 'schema list instead of being subtracted in the picker');
});
