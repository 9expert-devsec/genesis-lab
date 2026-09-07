import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGroupCollapse,
  isGroupExpanded,
  toggleGroup,
} from '@/lib/admin/navGroupCollapse';

/**
 * Per-group sidebar collapse: reading untrusted storage, and deciding what is
 * on screen from it.
 *
 * ── WHY THE MALFORMED CASES GET THE MOST TESTS ──────────────────────────────
 * `localStorage.getItem('admin-sidebar-groups')` is not a value this code
 * wrote; it is a value SOME version of this code wrote, in SOME browser, and it
 * comes back years later. It can be absent, empty, half-written, JSON of the
 * wrong shape, or edited by hand in devtools. Every one of those has to land on
 * "all groups expanded", because the alternative is a TypeError thrown inside a
 * render — which in a client component takes out the whole sidebar, on every
 * page, for that one person, until they think to clear site data.
 *
 * The default matters as much as the failure mode: absent means EXPANDED. That
 * is the behaviour that shipped, and a first load that surprises you with a
 * folded menu is worse than a long rail.
 */

const IDS = ['overview', 'registrations', 'courses', 'layout', 'content', 'system'];

// ── parse: the shapes that must all mean "nothing stored" ───────────────────
const NOTHING_STORED = [
  ['null (key absent)', null],
  ['undefined', undefined],
  ['empty string', ''],
  ['not JSON at all', '{oh no'],
  ['half-written JSON', '{"courses":tr'],
  ['JSON null', 'null'],
  ['a JSON array', '["courses"]'],
  ['a JSON number', '42'],
  ['a JSON string', '"courses"'],
  ['a number, not a string', 42],
  ['an object, not a string', { courses: true }],
];

for (const [name, raw] of NOTHING_STORED) {
  test(`parseGroupCollapse: ${name} → {} (all expanded), no throw`, () => {
    assert.deepEqual(parseGroupCollapse(raw, IDS), {});
  });
}

test('parseGroupCollapse: a well-formed map survives intact', () => {
  const raw = JSON.stringify({ courses: true, content: false });
  assert.deepEqual(parseGroupCollapse(raw, IDS), { courses: true, content: false });
});

test('parseGroupCollapse: unknown ids are dropped, known ones kept', () => {
  // What a removed or renamed group leaves behind. Forgetting the stale entry
  // is right; discarding the whole map with it would silently reset the four
  // preferences that were still valid.
  const raw = JSON.stringify({ courses: true, 'old-group': true, '': true });
  assert.deepEqual(parseGroupCollapse(raw, IDS), { courses: true });
});

test('parseGroupCollapse: non-boolean values are dropped, not coerced', () => {
  // '1', 1 and 'yes' all mean "collapsed" to someone; none of them is what this
  // code writes, so none of them is guessed at.
  const raw = JSON.stringify({ courses: 1, content: 'yes', layout: null, system: true });
  assert.deepEqual(parseGroupCollapse(raw, IDS), { system: true });
});

test('parseGroupCollapse: a missing id list keeps nothing rather than everything', () => {
  // Fail closed: with no whitelist there is no id that can be validated, so the
  // honest answer is the default, not "trust it all".
  assert.deepEqual(parseGroupCollapse(JSON.stringify({ courses: true })), {});
  assert.deepEqual(parseGroupCollapse(JSON.stringify({ courses: true }), []), {});
});

// ── isGroupExpanded ─────────────────────────────────────────────────────────
test('isGroupExpanded: absent means expanded — the default is all-open', () => {
  assert.equal(isGroupExpanded('courses', {}), true);
  assert.equal(isGroupExpanded('courses', { content: true }), true);
  assert.equal(isGroupExpanded('courses', undefined), true);
  assert.equal(isGroupExpanded('courses', null), true);
});

test('isGroupExpanded: an explicit true collapses, an explicit false does not', () => {
  assert.equal(isGroupExpanded('courses', { courses: true }), false);
  assert.equal(isGroupExpanded('courses', { courses: false }), true);
});

test('isGroupExpanded: the ACTIVE group is expanded whatever is stored', () => {
  // The rule that stops a user landing on a page whose own menu row is hidden.
  assert.equal(isGroupExpanded('courses', { courses: true }, 'courses'), true);
  // …and only that group. Being on a courses page does not unfold content.
  assert.equal(isGroupExpanded('content', { content: true }, 'courses'), false);
});

test('isGroupExpanded: forcing the active group open does NOT rewrite the map', () => {
  // "Force-expand for display" — the preference has to survive the visit, or
  // navigating through a folded group would quietly unfold it forever.
  const stored = { courses: true };
  const before = JSON.stringify(stored);
  assert.equal(isGroupExpanded('courses', stored, 'courses'), true);
  assert.equal(JSON.stringify(stored), before, 'the stored map was mutated');
});

// ── toggleGroup ─────────────────────────────────────────────────────────────
test('toggleGroup: inverts what was ON SCREEN and returns a new object', () => {
  const stored = { content: true };
  const next = toggleGroup(stored, 'courses', true);
  assert.deepEqual(next, { content: true, courses: true });
  assert.deepEqual(stored, { content: true }, 'the input must not be mutated');
  assert.deepEqual(toggleGroup(next, 'courses', false), { content: true, courses: false });
});

test('toggleGroup: clicking the ACTIVE group records the preference for later', () => {
  // It cannot close while you are in it — isGroupExpanded still forces it open —
  // but the click is not lost: the preference applies the moment you leave.
  // Toggling on the STORED value instead of the displayed one would make the
  // click a no-op for exactly the group the user is looking at.
  const stored = { courses: true };
  const displayed = isGroupExpanded('courses', stored, 'courses'); // true, forced
  const next = toggleGroup(stored, 'courses', displayed);
  assert.equal(next.courses, true, 'still collapsed in the stored preference');
  assert.equal(isGroupExpanded('courses', next, 'courses'), true, 'still open while you are here');
  assert.equal(isGroupExpanded('courses', next, 'content'), false, 'folded once you leave');
});

// ── round trip, the way the component uses it ───────────────────────────────
test('a toggle round-trips through JSON and the parser', () => {
  const stored = toggleGroup({}, 'layout', true);
  const raw = JSON.stringify(stored);
  assert.deepEqual(parseGroupCollapse(raw, IDS), { layout: true });
  assert.equal(isGroupExpanded('layout', parseGroupCollapse(raw, IDS)), false);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: a naive JSON.parse throws on the inputs handled above', () => {
  // The malformed table is only meaningful if those strings are actually
  // hostile. Two of them kill a bare JSON.parse, and the third gets past it and
  // fails later on `.["courses"]` of a non-object.
  assert.throws(() => JSON.parse('{oh no'));
  assert.throws(() => JSON.parse('{"courses":tr'));
  assert.equal(JSON.parse('null'), null);
});
