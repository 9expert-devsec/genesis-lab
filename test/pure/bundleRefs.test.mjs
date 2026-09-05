import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectRefs, assembleResolved, bundleCourseCodes, RESOLVED_TYPES,
} from '@/lib/pageBuilder/resolveSectionRefs';
import { dataRefSignature } from '@/lib/pageBuilder/dataRefs';

/**
 * `promotion_bundle`'s half of the resolver walk — the round's riskiest change,
 * because `collectRefs` / `assembleResolved` serve six other types and
 * test/pure/resolveRefs pins the manual course-list path byte-for-byte.
 *
 * The claim this file has to establish is not only "the bundle resolves". It is
 * "the bundle resolves AND the six existing types are untouched", so the
 * regression half is asserted here too rather than left to the older file.
 */

const bundle = (id, items, over = {}) => ({
  id, type: 'promotion_bundle', content: { items, ...over },
});

const item = (id, courseId, roundId) => ({ id, courseId, roundId });

// ── what a bundle references ──────────────────────────────────────────────

test('a bundle contributes its item course codes to BOTH the course and schedule sets', () => {
  const { nodes, courseIds, scheduleCourseIds } = collectRefs([
    bundle('b1', [item('i1', 'MSE-L1', 'r1'), item('i2', 'VIBE-CODE-L2', 'r9')]),
  ]);
  assert.equal(nodes.length, 1);
  assert.deepEqual(courseIds, ['MSE-L1', 'VIBE-CODE-L2']);
  assert.deepEqual(scheduleCourseIds, ['MSE-L1', 'VIBE-CODE-L2']);
});

test('CONTROL: a bundle with no items references nothing — the collection is real', () => {
  // Without this, "both sets contain the codes" could be a walk that adds every
  // course code it can find anywhere.
  const empty = collectRefs([bundle('b1', [])]);
  assert.deepEqual(empty.courseIds, []);
  assert.deepEqual(empty.scheduleCourseIds, []);
  assert.equal(empty.nodes.length, 1, 'the node itself must still be collected');

  // …and an item with a blank code contributes nothing either.
  const blank = collectRefs([bundle('b1', [item('i1', '', 'r1'), item('i2', '   ', '')])]);
  assert.deepEqual(blank.courseIds, []);
});

test('the fetch de-dupes; the ITEMS do not', () => {
  /**
   * The same course twice in one bundle is legitimate — two rounds of it — and
   * the decided scope forbids a uniqueness rule. So the fetch asks once and the
   * resolved list still has two entries.
   */
  const items = [item('i1', 'MSE-L1', 'r1'), item('i2', 'MSE-L1', 'r2')];
  const { nodes, courseIds } = collectRefs([bundle('b1', items)]);
  assert.deepEqual(courseIds, ['MSE-L1'], 'the fetch asked for the same code twice');
  assert.deepEqual(bundleCourseCodes({ items }), ['MSE-L1']);

  const out = assembleResolved(
    nodes,
    new Map([['MSE-L1', { course_id: 'MSE-L1' }]]),
    new Map(),
    { scheduleMap: new Map([['MSE-L1', [{ _id: 'r1' }, { _id: 'r2' }]]]) },
  );
  assert.equal(out.b1.length, 2, 'a repeated course collapsed into one item');
  assert.deepEqual(out.b1.map((e) => e.id), ['i1', 'i2']);
});

// ── what a bundle resolves to ─────────────────────────────────────────────

test('one entry per item, in the author’s order, carrying the course and its rounds', () => {
  const { nodes } = collectRefs([
    bundle('b1', [item('i1', 'MSE-L1', 'r1'), item('i2', 'VIBE-CODE-L2', 'r9')]),
  ]);
  const out = assembleResolved(
    nodes,
    new Map([
      ['MSE-L1', { course_id: 'MSE-L1', course_name: 'Excel' }],
      ['VIBE-CODE-L2', { course_id: 'VIBE-CODE-L2', course_name: 'Vibe' }],
    ]),
    new Map(),
    { scheduleMap: new Map([['MSE-L1', [{ _id: 'r1' }, { _id: 'r2' }]]]) },
  );

  assert.deepEqual(out.b1.map((e) => e.id), ['i1', 'i2']);
  assert.equal(out.b1[0].course.course_name, 'Excel');
  // The WHOLE fetched list, not just the chosen round — the editor's picker
  // reads this map and must see the rounds the author has not picked.
  assert.deepEqual(out.b1[0].rounds.map((r) => r._id), ['r1', 'r2']);
  // A course with no schedule rows resolves to the [] marker, never undefined.
  assert.deepEqual(out.b1[1].rounds, []);
});

test('an unresolvable course keeps its entry, with course: null — it is NOT dropped', () => {
  /**
   * The deliberate departure from `bundle_courses`, which filters. A bundle
   * states one package price computed over N named courses; rendered with N−1
   * of them the price is wrong in a way no reader can detect. Asserted here so
   * nobody "fixes" the inconsistency by adding a filter.
   */
  const { nodes } = collectRefs([
    bundle('b1', [item('i1', 'GONE', 'r1'), item('i2', 'MSE-L1', 'r2')]),
  ]);
  const out = assembleResolved(nodes, new Map([['MSE-L1', { course_id: 'MSE-L1' }]]), new Map());

  assert.equal(out.b1.length, 2, 'an unresolvable course shortened the bundle');
  assert.equal(out.b1[0].course, null);
  assert.equal(out.b1[0].courseId, 'GONE', 'the stored code must survive so the row can be marked');
  assert.notEqual(out.b1[1].course, null);
});

test('CONTROL: bundle_courses still DOES drop one, so the difference above is real', () => {
  /**
   * The two types answer the same input differently, on purpose. If
   * bundle_courses had also stopped filtering, the assertion above would be
   * describing the codebase's uniform behaviour rather than this type's choice.
   */
  const { nodes } = collectRefs([
    { id: 'g1', type: 'bundle_courses', content: { courseIds: ['GONE', 'MSE-L1'] } },
  ]);
  const out = assembleResolved(nodes, new Map([['MSE-L1', { course_id: 'MSE-L1' }]]), new Map());
  assert.equal(out.g1.length, 1, 'bundle_courses stopped failing closed');
  assert.deepEqual(out.g1.map((c) => c.course_id), ['MSE-L1']);
});

test('promotion_bundle is in RESOLVED_TYPES, or the walk would never collect it', () => {
  assert.equal(RESOLVED_TYPES.has('promotion_bundle'), true);
  // CONTROL: the set discriminates — a type that is not data-backed is absent.
  assert.equal(RESOLVED_TYPES.has('heading'), false);
});

test('a bundle nested inside a container is still collected', () => {
  // The walk recurses through container slots; a bundle inside a two_column is
  // an ordinary way to lay a promotion page out.
  const { nodes, courseIds } = collectRefs([
    {
      id: 'c1',
      type: 'two_column',
      content: { left: [bundle('b1', [item('i1', 'MSE-L1', 'r1')])], right: [] },
    },
  ]);
  assert.deepEqual(nodes.map((n) => n.id), ['b1']);
  assert.deepEqual(courseIds, ['MSE-L1']);
});

// ── the signature ─────────────────────────────────────────────────────────

test('the canvas refetches when an item’s COURSE changes, and not when its ROUND does', () => {
  const sig = (items) => dataRefSignature([bundle('b1', items)]);

  const base = [item('i1', 'MSE-L1', 'r1')];
  assert.notEqual(sig(base), sig([item('i1', 'VIBE-CODE-L2', 'r1')]), 'a course change did not refetch');

  /**
   * A round change re-DRAWS without re-FETCHING: the resolver hands over the
   * course's whole round list and the renderer picks from it, so the data is
   * already in hand. Same call chosenRounds.js made for course_schedule's
   * `roundIds`, and stated there.
   */
  assert.equal(sig(base), sig([item('i1', 'MSE-L1', 'r2')]), 'a round change forced a pointless refetch');
});

test('CONTROL: the signature is not simply constant for bundles', () => {
  // If it were, the equality above would prove nothing.
  const sig = (items) => dataRefSignature([bundle('b1', items)]);
  assert.notEqual(sig([]), sig([item('i1', 'MSE-L1', 'r1')]));
  assert.notEqual(
    sig([item('i1', 'A', 'r1')]),
    sig([item('i1', 'A', 'r1'), item('i2', 'B', 'r2')]),
  );
});

// ── the regression half: the six existing types are untouched ─────────────

test('REGRESSION: the six pre-existing resolved types answer exactly as before', () => {
  /**
   * The stop condition for this commit, asserted rather than assumed. Each of
   * the six is driven through the same walk with the same fixtures the older
   * tests use, and the answers are the ones recorded before promotion_bundle
   * existed. A change to the shared chain shows up here as a named type.
   */
  const courseMap = new Map([['A', { course_id: 'A' }], ['B', { course_id: 'B' }]]);
  const instructors = new Map([['x', { instructor_id: 'x' }]]);
  const scheduleMap = new Map([['A', [{ _id: 'r1' }, { _id: 'r2' }]]]);
  const coursesBySkill = new Map([['S1', [{ course_id: 'B' }]]]);

  const sections = [
    { id: 'card', type: 'course_card', content: { courseId: 'A' } },
    { id: 'ins', type: 'instructor_card', content: { instructorId: 'x' } },
    { id: 'sel', type: 'course_selector', content: { courseIds: ['A', 'B'] } },
    { id: 'bun', type: 'bundle_courses', content: { courseIds: ['A', 'ZZZ'] } },
    { id: 'lst', type: 'course_list', content: { source: 'skill', filter: 'S1' } },
    { id: 'sch', type: 'course_schedule', content: { courseId: 'A', limit: 1 } },
  ];
  const { nodes } = collectRefs(sections);
  const out = assembleResolved(nodes, courseMap, instructors, { scheduleMap, coursesBySkill });

  assert.deepEqual(out.card, { course_id: 'A' });
  assert.deepEqual(out.ins, { instructor_id: 'x' });
  assert.deepEqual(out.sel.map((c) => c.course_id), ['A', 'B']);
  assert.deepEqual(out.bun.map((c) => c.course_id), ['A'], 'bundle_courses stopped failing closed');
  assert.deepEqual(out.lst.map((c) => c.course_id), ['B']);
  assert.deepEqual(out.sch.map((r) => r._id), ['r1'], 'course_schedule lost its upcoming-mode limit');

  // A bundle in the SAME tree must not perturb any of them.
  const withBundle = collectRefs([...sections, bundle('b1', [item('i1', 'A', 'r1')])]);
  const out2 = assembleResolved(withBundle.nodes, courseMap, instructors, { scheduleMap, coursesBySkill });
  for (const key of ['card', 'ins', 'sel', 'bun', 'lst', 'sch']) {
    assert.deepEqual(out2[key], out[key], `${key} changed once a bundle shared the tree`);
  }
});

test('CONTROL: that regression sweep can fail — a perturbed fixture is caught', () => {
  // Discrimination for the loop above: the same comparison over answers that
  // genuinely differ must throw, or "nothing changed" means nothing.
  const courseMap = new Map([['A', { course_id: 'A' }]]);
  const nodes = collectRefs([{ id: 'card', type: 'course_card', content: { courseId: 'A' } }]).nodes;
  const out = assembleResolved(nodes, courseMap, new Map());
  const perturbed = assembleResolved(nodes, new Map(), new Map());
  assert.throws(() => assert.deepEqual(perturbed.card, out.card));
  assert.equal(perturbed.card, null);
});
