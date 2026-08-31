import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUND_ROW_STATES, chooseRounds } from '@/lib/pageBuilder/chosenRounds';
import { assembleResolved } from '@/lib/pageBuilder/resolveSectionRefs';
import { dataRefSignature } from '@/lib/pageBuilder/dataRefs';
import { sectionSchema } from '@/lib/schemas/pageBuilder';

/**
 * WHICH ROUNDS A `course_schedule` DRAWS — round 64, steps 2 of
 * docs/course-schedule-selection.md.
 *
 * The whole mode is guarded by one discriminator that no stored document
 * carries, so the assertion that matters most is the NEGATIVE one: absent
 * `source` must take the path it took before any of this existed. Every test
 * here that claims "unchanged" is paired with a control that makes the same
 * comparison come out different, because "unchanged" and "the comparison never
 * ran" print the same result.
 */

const TODAY = '2026-08-31'; // pinned; the module takes todayKey as a parameter

const live = (id, dates, extra = {}) => ({
  _id: id, dates, status: 'open', type: 'classroom', ...extra,
});

const R1 = live('r1', ['2026-09-10', '2026-09-11']);
const R2 = live('r2', ['2026-10-02']);
const R3 = live('r3', ['2026-11-20'], { status: 'nearly_full', type: 'hybrid' });

// ── the upcoming path, which every stored section takes ────────────────────

test('absent `source` returns every row, in fetch order, all live', () => {
  const rows = [R1, R2, R3];
  const out = chooseRounds(rows, { courseId: 'MSE-L1' }, TODAY);

  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.id), ['r1', 'r2', 'r3']);
  assert.deepEqual(out.map((r) => r.state), ['live', 'live', 'live']);
  // The live row is handed through by REFERENCE — the renderer reads status and
  // builds the href off it, so anything less than identity would change what
  // publishes.
  assert.equal(out[0].live, R1);
  assert.equal(out[2].live, R3);
  assert.deepEqual(out[1].dates, ['2026-10-02']);
  assert.equal(out[2].type, 'hybrid');
});

test('an explicit `source: "upcoming"` is identical to absent', () => {
  const rows = [R1, R2];
  assert.deepEqual(
    chooseRounds(rows, { source: 'upcoming' }, TODAY),
    chooseRounds(rows, {}, TODAY)
  );
});

test('CONTROL: the absent-vs-manual comparison can come out different', () => {
  /**
   * The test above claims absent behaves like `upcoming`. That claim is only
   * worth something if the function can be made to answer differently at all —
   * which is the exact failure mode of reading `!== "upcoming"` instead of
   * `=== "manual"`, since absent would then fall through to the new branch and
   * every stored section would silently change.
   */
  const rows = [R1, R2, R3];
  const asStored = chooseRounds(rows, {}, TODAY);
  const asManual = chooseRounds(rows, { source: 'manual', roundIds: ['r2'] }, TODAY);

  assert.notDeepEqual(asStored, asManual, 'the two modes returned the same thing — the '
    + 'discriminator is not being read, so the "unchanged" assertions above are vacuous');
  assert.equal(asManual.length, 1);
  assert.equal(asManual[0].id, 'r2');
});

test('a non-array row set, and every other junk shape, degrades to no rows', () => {
  for (const bad of [undefined, null, {}, 'rows', 7]) {
    assert.deepEqual(chooseRounds(bad, {}, TODAY), []);
    assert.deepEqual(chooseRounds(bad, { source: 'manual', roundIds: ['r1'] }, TODAY).length, 1);
  }
  // ...and a junk CONTENT is the upcoming path, not a throw.
  assert.equal(chooseRounds([R1], undefined, TODAY).length, 1);
  assert.equal(chooseRounds([R1], null, TODAY).length, 1);
});

// ── the manual path: author order ──────────────────────────────────────────

test('manual mode preserves the AUTHOR\'S order, not the fetch order', () => {
  const out = chooseRounds([R1, R2, R3], { source: 'manual', roundIds: ['r3', 'r1'] }, TODAY);
  assert.deepEqual(out.map((r) => r.id), ['r3', 'r1']);
  assert.deepEqual(out.map((r) => r.state), ['live', 'live']);
});

test('CONTROL: sorting the result would be caught', () => {
  /**
   * Round 46 §D.3 measured that array position is the only ordering authority an
   * authored list has, and §I refuses to build a separate ordering. So the order
   * test above must be able to fail — it cannot, if the chosen ids happen to
   * come back in the same order a sort would produce.
   *
   * This picks a selection whose author order and sorted order DIFFER, and
   * asserts the function returns the first. If someone adds a `.sort()`, the
   * test above goes red and this one says why.
   */
  const ids = ['r3', 'r1', 'r2'];
  const out = chooseRounds([R1, R2, R3], { source: 'manual', roundIds: ids }, TODAY);
  const sorted = [...ids].sort();

  assert.notDeepEqual(ids, sorted, 'the fixture no longer discriminates — pick ids whose '
    + 'author order differs from their sorted order');
  assert.deepEqual(out.map((r) => r.id), ids);
  assert.notDeepEqual(out.map((r) => r.id), sorted, 'the result came back sorted — author '
    + 'order is the only ordering authority (round 46 §D.3)');
});

test('the fetch order of the live rows does not leak into the result', () => {
  const forwards = chooseRounds([R1, R2, R3], { source: 'manual', roundIds: ['r3', 'r1'] }, TODAY);
  const backwards = chooseRounds([R3, R2, R1], { source: 'manual', roundIds: ['r3', 'r1'] }, TODAY);
  assert.deepEqual(forwards.map((r) => r.id), backwards.map((r) => r.id));
});

test('a repeated id draws twice — the renderer is not the place that dedupes', () => {
  // Deliberate: a duplicate is an authoring mistake the EDITOR should name (the
  // precedent is course_list's repeated-code warning), not one the page should
  // silently absorb. Silently collapsing it makes the mistake invisible.
  const out = chooseRounds([R1], { source: 'manual', roundIds: ['r1', 'r1'] }, TODAY);
  assert.equal(out.length, 2);
});

test('manual with no ids renders nothing — fail closed, like an unset course', () => {
  assert.deepEqual(chooseRounds([R1, R2], { source: 'manual' }, TODAY), []);
  assert.deepEqual(chooseRounds([R1, R2], { source: 'manual', roundIds: [] }, TODAY), []);
  // blank / non-string ids are skipped rather than drawn as empty rows
  assert.deepEqual(chooseRounds([R1], { source: 'manual', roundIds: ['', null, 7, {}] }, TODAY), []);
});

// ── the three states ───────────────────────────────────────────────────────

test('the state vocabulary is exactly three', () => {
  assert.deepEqual(ROUND_ROW_STATES, ['live', 'elapsed', 'missing']);
});

test('a chosen round the fetch lost is ELAPSED when its snapshot says it began', () => {
  const out = chooseRounds([R1], {
    source: 'manual',
    roundIds: ['gone'],
    roundSnapshots: [{ id: 'gone', dates: ['2026-08-20', '2026-08-21'], type: 'hybrid' }],
  }, TODAY);

  assert.equal(out.length, 1, 'a chosen round was DROPPED — it must render (round 64 amendment)');
  assert.equal(out[0].state, 'elapsed');
  assert.equal(out[0].live, null);
  assert.deepEqual(out[0].dates, ['2026-08-20', '2026-08-21']);
  assert.equal(out[0].type, 'hybrid');
});

test('the elapsed boundary is the round\'s FIRST day, inclusive', () => {
  const at = (dates) => chooseRounds([], {
    source: 'manual', roundIds: ['x'], roundSnapshots: [{ id: 'x', dates }],
  }, TODAY)[0].state;

  // The `=` is the whole point — a round whose first day IS today has begun.
  // Same rule as roundHasStarted, which this delegates to rather than restates.
  assert.equal(at(['2026-08-31']), 'elapsed');
  assert.equal(at(['2026-09-01']), 'missing');
  // ...and the first day is a MIN, never dates[0]: an unsorted array whose
  // earliest day has passed is elapsed even when its first element has not.
  assert.equal(at(['2026-09-05', '2026-08-25']), 'elapsed');
});

test('a chosen round with a FUTURE snapshot, absent upstream, is MISSING not elapsed', () => {
  const out = chooseRounds([R1], {
    source: 'manual',
    roundIds: ['withdrawn'],
    roundSnapshots: [{ id: 'withdrawn', dates: ['2026-12-01'], type: 'classroom' }],
  }, TODAY);
  assert.equal(out[0].state, 'missing');
  assert.deepEqual(out[0].dates, ['2026-12-01']);
});

test('a chosen round with NO snapshot is MISSING and claims nothing', () => {
  const out = chooseRounds([R1], { source: 'manual', roundIds: ['unknown'] }, TODAY);
  assert.equal(out.length, 1);
  assert.equal(out[0].state, 'missing');
  assert.equal(out[0].live, null);
  assert.deepEqual(out[0].dates, []);
  assert.equal(out[0].type, '');
});

test('an unusable todayKey reads as MISSING — the state that claims less', () => {
  for (const bad of [undefined, '', null, 7]) {
    const out = chooseRounds([], {
      source: 'manual', roundIds: ['x'], roundSnapshots: [{ id: 'x', dates: ['2020-01-01'] }],
    }, bad);
    assert.equal(out[0].state, 'missing', 'a caller that cannot say what day it is was '
      + 'allowed to assert a round had ENDED');
  }
});

test('live always wins over a snapshot for the same id', () => {
  /**
   * Round 63 §C.3's rule, made executable. This is what stops the stored copy
   * going stale invisibly: 39 of 88 rounds had their dates mutated in place, and
   * every one of those is still LIVE, so the correction must show.
   */
  const out = chooseRounds([live('r1', ['2026-09-10', '2026-09-11'])], {
    source: 'manual',
    roundIds: ['r1'],
    roundSnapshots: [{ id: 'r1', dates: ['1999-01-01'], type: 'stale' }],
  }, TODAY);

  assert.equal(out[0].state, 'live');
  assert.deepEqual(out[0].dates, ['2026-09-10', '2026-09-11'], 'the STALE snapshot dates won');
  assert.equal(out[0].type, 'classroom', 'the stale snapshot type won');
});

// ── the schema ─────────────────────────────────────────────────────────────

const parseContent = (content) => sectionSchema.parse({
  id: 's1', type: 'course_schedule', content,
}).content;

test('the new keys default to the stored-today behaviour', () => {
  const c = parseContent({ courseId: 'MSE-L1', limit: 1 });
  assert.equal(c.source, 'upcoming');
  assert.deepEqual(c.roundIds, []);
  assert.deepEqual(c.roundSnapshots, []);
  // ...and the two that existed are untouched.
  assert.equal(c.courseId, 'MSE-L1');
  assert.equal(c.limit, 1);
});

test('the shapes actually stored today still parse, and still read as `upcoming`', () => {
  // Measured on this clone, round 63: three sections, limits {0:1, 1:2}.
  for (const stored of [
    { courseId: 'MSE-L1', limit: 1 },
    { courseId: 'VIBE-CODE-L2', limit: 0 },
  ]) {
    const c = parseContent(stored);
    assert.equal(c.source, 'upcoming');
    assert.notEqual(c.source, 'manual');
  }
});

test('`source` accepts exactly the two modes', () => {
  assert.equal(parseContent({ source: 'manual' }).source, 'manual');
  assert.throws(() => parseContent({ source: 'skill' }));
  assert.throws(() => parseContent({ source: '' }));
});

test('a snapshot CANNOT carry a status or a registration url', () => {
  /**
   * Round 63 §C.2: a stored `status` is the seats-left signal, and a stale
   * 'open' on a round that filled is a lie a visitor acts on. §I.1 forbids
   * storing it. Zod's default STRIP is what makes the prohibition executable —
   * the key is deleted at the schema boundary, so no renderer can reach it.
   */
  const c = parseContent({
    source: 'manual',
    roundSnapshots: [{
      id: 'x', dates: ['2026-09-01'], type: 'hybrid',
      status: 'open', signup_url: 'https://ext/signup', seats: 3,
    }],
  });
  const snap = c.roundSnapshots[0];
  assert.deepEqual(Object.keys(snap).sort(), ['dates', 'id', 'type']);
  assert.equal(snap.status, undefined, 'a snapshot kept a status it cannot honestly hold');
  assert.equal(snap.signup_url, undefined, 'a snapshot kept a link to a round that is gone');
});

test('CONTROL: the surrounding content object still passes unknown keys through', () => {
  // So the strip above is a property of the SNAPSHOT shape specifically, not of
  // the parser being strict everywhere — which is what would make it accidental.
  const c = parseContent({ courseId: 'X', somethingNew: 'kept' });
  assert.equal(c.somethingNew, 'kept', 'the content object stopped being passthrough — the '
    + 'snapshot strip is no longer a deliberate exception, it is the house rule');
});

// ── the resolver's cap, and the signature ──────────────────────────────────

const assemble = (content, rows) => assembleResolved(
  [{ id: 's1', type: 'course_schedule', content }],
  new Map(), new Map(),
  { scheduleMap: new Map([[content.courseId, rows]]) }
).s1;

test('`limit` still caps under upcoming — including when absent', () => {
  const rows = [R1, R2, R3];
  assert.equal(assemble({ courseId: 'C', limit: 2 }, rows).length, 2);
  assert.equal(assemble({ courseId: 'C', limit: 2, source: 'upcoming' }, rows).length, 2);
  assert.equal(assemble({ courseId: 'C', limit: 0 }, rows).length, 3);
});

test('`limit` does NOT cap under manual — a leftover cap would fake a deletion', () => {
  /**
   * The failure this prevents is not a short list. `chosenRounds` matches the
   * stored ids against these rows, so a `limit: 1` on a three-round selection
   * would make rounds two and three come back MISSING — a slice presenting
   * itself as an upstream deletion. Two of the three stored sections carry
   * `limit: 1`.
   */
  const rows = [R1, R2, R3];
  const resolved = assemble({ courseId: 'C', limit: 1, source: 'manual' }, rows);
  assert.equal(resolved.length, 3, 'the other mode\'s cap was applied');

  const drawn = chooseRounds(resolved, {
    source: 'manual', roundIds: ['r1', 'r2', 'r3'],
  }, TODAY);
  assert.deepEqual(drawn.map((r) => r.state), ['live', 'live', 'live'],
    'a resolver-side slice made a chosen round look deleted');
});

test('CONTROL: the cap assertion can go the other way', () => {
  // Same rows, same limit, only the discriminator differs. If this pair ever
  // agrees, the branch is not being read.
  const rows = [R1, R2, R3];
  assert.notEqual(
    assemble({ courseId: 'C', limit: 1, source: 'manual' }, rows).length,
    assemble({ courseId: 'C', limit: 1 }, rows).length
  );
});

test('dataRefSignature already keys on `source` — verified, not assumed', () => {
  /**
   * Round 63 §E leaned on this to argue lib/pageBuilder/dataRefs.js needs no
   * change. It reads `c.source ?? ''` for every data-backed type, so switching a
   * schedule's mode already refetches the canvas sample. If that generic read is
   * ever narrowed to course_list, this goes red rather than the canvas going
   * quietly stale.
   */
  const at = (content) => dataRefSignature([{ id: 's1', type: 'course_schedule', content }]);
  assert.notEqual(at({ courseId: 'C' }), at({ courseId: 'C', source: 'manual' }));

  /**
   * MEASURED, and not what was assumed. It reads the RAW field, `c.source ?? ''`
   * — so absent signs as '' and an explicit 'upcoming' signs as 'upcoming', two
   * strings for one meaning:
   *
   *   absent    s1|course_schedule|C|||0||
   *   upcoming  s1|course_schedule|C|||0|upcoming|
   *
   * That is a spare refetch on a change that alters nothing, never a MISSED one,
   * so it is left alone: the signature exists to be conservative, and teaching it
   * the schema's defaults would put a second copy of them in a module whose
   * header says it must not import the resolver.
   */
  assert.notEqual(at({ courseId: 'C' }), at({ courseId: 'C', source: 'upcoming' }));

  /**
   * And the other half of round 63 §G, which is the load-bearing one: `roundIds`
   * is NOT in the signature. Changing the selection must re-DRAW without
   * re-FETCHING — that is what makes the picker's option list free and keeps a
   * network round-trip off every checkbox. If someone adds it here, the editor
   * starts a server action per click.
   */
  assert.equal(
    at({ courseId: 'C', source: 'manual', roundIds: ['a'] }),
    at({ courseId: 'C', source: 'manual', roundIds: ['b', 'c'] }),
    'roundIds entered the data-ref signature — selecting a round now refetches'
  );
});
