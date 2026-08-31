import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { nonPlainValues, isBoundarySafe, describeNonPlain } from '../plainValue.mjs';
import { assembleResolved } from '@/lib/pageBuilder/resolveSectionRefs';
import { chooseRounds } from '@/lib/pageBuilder/chosenRounds';
import { sectionSchema, draftContentSchema } from '@/lib/schemas/pageBuilder';
import { sanitizePageForTier, renumberSections } from '@/lib/pages/tierSanitize';

/**
 * NOTHING CLIENT-REACHABLE MAY CARRY A MONGOOSE OR BSON VALUE.
 *
 * ── WHY THIS EXISTS AS A TEST AND NOT A SCRIPT ────────────────────────────
 * Round 62 chased a `Cannot access _bsontype on the server` error, wrote a walk
 * of exactly this shape as a one-off probe, cleared all 32 exported actions with
 * it, and deleted the probe afterwards at the author's request. The audit was
 * correct. Deleting it is why round 66 had to build the instrument again from
 * nothing before it could say anything.
 *
 * A guard against a whole CLASS of defect belongs where it runs every time. The
 * walk now lives in test/plainValue.mjs and this file points it at the values
 * this codebase actually hands across the boundary.
 *
 * ── WHAT IT CAN AND CANNOT SEE, SAID PLAINLY ──────────────────────────────
 * It can see a non-plain value in any structure it is HANDED. It cannot call
 * the Server Actions themselves — they open with `requireAdmin('pages')`, which
 * needs credentials, bcrypt and TOTP — so the actions whose returns are built
 * from literals are covered by reading those literals, and the ones whose
 * returns are DATA-DEPENDENT are covered by driving their data path here with
 * values shaped like production's.
 *
 * The data-dependent one is the one that matters. `resolveBuilderSectionData`
 * returns whatever `resolveSectionData` assembled out of MSDB and local Mongo,
 * so its safety is a property of the ROWS, not of the code — an audit that reads
 * `return await resolveSectionData(...)` cannot answer it, and round 62's could
 * not. This drives `assembleResolved` with rows carrying planted ObjectIds and
 * asserts the answer.
 *
 * ── AND WHAT ROUND 66 CONCLUDED, SO THE NEXT READER DOES NOT RE-CHASE IT ──
 * The reported error was NOT a value in this repo. Two `next dev` servers were
 * running against one `.next` directory (no `distDir` override), so the second
 * to start rebuilt the manifests under the first, and the server answering the
 * action held a module map that no longer matched them. A value then arrives as
 * Next's "temporary client reference" proxy, and the first property anything
 * touches on it throws BY NAME — which is `_bsontype`, because
 * `mongoose/lib/helpers/isBsonType` duck-types every value it casts by reading
 * exactly that. The BSON word in the message is the symptom, not the cause.
 *
 * These assertions still earn their place: they are what makes the "clean"
 * finding permanent instead of a note in a report.
 */

const oid = () => new ObjectId('507f1f77bcf86cd799439011');

// ── the walk itself, and its controls ──────────────────────────────────────

test('CONTROL — the walk finds a planted ObjectId, and names it `_bsontype`', () => {
  /**
   * Without this, every "clean" below is equally consistent with a walk that
   * returns [] for anything. The planted value is nested, so a shallow check
   * cannot pass this either.
   */
  const hits = nonPlainValues({ a: 1, deep: { list: [{ ok: 'yes' }, { bad: oid() }] } });
  assert.equal(hits.length, 1, 'the walk missed a planted ObjectId');
  assert.equal(hits[0].kind, '_bsontype');
  assert.equal(hits[0].path, 'deep.list[1].bad', 'the report must name the path, not just the fact');
  assert.equal(hits[0].detail, 'ObjectId');
});

test('CONTROL — the walk finds the other shapes that break the boundary', () => {
  const cases = [
    ['Date', { when: new Date() }, 'non-plain-prototype'],
    ['Map', { m: new Map() }, 'non-plain-prototype'],
    ['Set', { s: new Set() }, 'non-plain-prototype'],
    ['Buffer', { b: Buffer.from('x') }, 'non-plain-prototype'],
    ['function', { f: () => {} }, 'function'],
    ['class instance', { c: new (class Widget {})() }, 'non-plain-prototype'],
  ];
  for (const [label, value, kind] of cases) {
    const hits = nonPlainValues(value);
    assert.equal(hits.length, 1, `the walk missed a planted ${label}`);
    assert.equal(hits[0].kind, kind, `${label} was classified as ${hits[0].kind}`);
  }
  // A cycle is a boundary defect too, and must be reported rather than hang.
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  assert.ok(nonPlainValues(cyclic).some((h) => h.kind === 'cycle'), 'a cycle went unreported');
});

test('CONTROL — plain data passes, so the walk is not simply always dirty', () => {
  assert.ok(isBoundarySafe({
    ok: true,
    updatedAt: '2026-08-31T04:24:40.972Z',
    sections: [{ id: 'a', type: 'rich_text', content: { doc: { type: 'doc', content: [] } } }],
    nested: [[1, 2], [null, undefined], 'ก'],
  }));
  assert.deepEqual(nonPlainValues(null), []);
  assert.deepEqual(nonPlainValues('ก'), []);
  assert.deepEqual(nonPlainValues([]), []);
});

// ── the data-dependent path: what the canvas is handed ─────────────────────

/**
 * `resolveBuilderSectionData` is the one action whose return is a function of
 * upstream DATA rather than of its own code, so it is the one an audit cannot
 * clear. These drive its assembly step directly.
 */
const scheduleSection = (content) => ({ id: 's1', type: 'course_schedule', content });
const assemble = (nodes, derived, courseMap = new Map()) =>
  assembleResolved(nodes, courseMap, new Map(), derived);

test('the resolved map is boundary-safe for the shapes MSDB really returns', () => {
  // Round 63 measured a live round at 9 keys with a POPULATED course sub-object.
  // These arrive over HTTP through aiFetch, so their ids are strings — asserted
  // here rather than assumed, because that is the whole reason they are safe.
  const rows = [{
    _id: '692e9b32d2a522899d55f83e',
    course: { _id: '68d4f8c3581cb35029059815', course_id: 'VIBE-CODE-L2', skills: ['a', 'b'] },
    dates: ['2026-09-03T00:00:00.000Z'],
    status: 'open', type: 'hybrid', signup_url: 'https://x/y',
    createdAt: '2025-12-02T07:54:26.948Z', updatedAt: '2026-03-24T06:59:53.266Z', __v: 1,
  }];
  const resolved = assemble(
    [scheduleSection({ courseId: 'VIBE-CODE-L2', limit: 0 })],
    { scheduleMap: new Map([['VIBE-CODE-L2', rows]]) },
  );
  const hits = nonPlainValues(resolved);
  assert.deepEqual(hits, [], 'the canvas would be handed a non-plain value:\n' + describeNonPlain(hits));
});

test('CONTROL — a raw ObjectId in a resolved row IS caught', () => {
  /**
   * The failure this file exists to prevent, planted. If `listSchedulesByCourse`
   * ever stopped going over HTTP — or a local-Mongo source were added to the
   * resolver without `.lean()` + serialise — the rows would carry real
   * ObjectIds, and the canvas action would return them to a client component.
   * That is the shape of the error round 62 and round 66 both chased.
   */
  const rows = [{ _id: oid(), dates: ['2026-09-03'], status: 'open', type: 'hybrid' }];
  const resolved = assemble(
    [scheduleSection({ courseId: 'C', limit: 0 })],
    { scheduleMap: new Map([['C', rows]]) },
  );
  const hits = nonPlainValues(resolved);
  assert.equal(hits.length, 1, 'a raw ObjectId in a resolved row went unnoticed');
  assert.equal(hits[0].kind, '_bsontype');
  assert.equal(hits[0].path, 's1[0]._id');
});

test('round 64\'s chosen-rounds path adds nothing non-plain, in either mode', () => {
  /**
   * Round 66 opened by suspecting this, because round 64 stores round `_id`s and
   * `_bsontype` is BSON's marker. It is not the cause, and the reason is
   * structural rather than lucky: `roundIds` is `z.array(z.string())`, so an
   * ObjectId cannot survive the parse, and `roundSnapshots` is the one object in
   * that schema that is NOT `.passthrough()`, so unknown keys are stripped.
   * Both modes are driven here so the finding does not have to be re-derived.
   */
  const rows = [{ _id: 'r1', dates: ['2026-12-01'], status: 'open', type: 'hybrid' }];
  for (const content of [
    { courseId: 'C', limit: 0 },
    { courseId: 'C', source: 'upcoming', roundIds: [], roundSnapshots: [] },
    { courseId: 'C', source: 'manual', roundIds: ['r1'] },
    { courseId: 'C', source: 'manual', roundIds: ['gone'],
      roundSnapshots: [{ id: 'gone', dates: ['2026-01-01'], type: 'hybrid' }] },
  ]) {
    const drawn = chooseRounds(rows, content, '2026-08-31');
    const hits = nonPlainValues(drawn);
    assert.deepEqual(hits, [], `chooseRounds returned a non-plain value for ${JSON.stringify(content)}:\n`
      + describeNonPlain(hits));
  }
});

test('the schema refuses an ObjectId where round 64 stores round ids', () => {
  // `z.array(z.string())` is what makes the ObjectId question moot rather than
  // merely unobserved. Asserted so a future widening to z.any() is loud.
  const parse = (content) => sectionSchema.safeParse({ id: 's1', type: 'course_schedule', content });
  assert.equal(parse({ source: 'manual', roundIds: ['ok'] }).success, true);
  assert.equal(parse({ source: 'manual', roundIds: [oid()] }).success, false,
    'an ObjectId parsed into roundIds — it would then be stored and returned');
  // ...and a snapshot cannot smuggle one in through an unknown key.
  const parsed = parse({
    source: 'manual',
    roundSnapshots: [{ id: 'x', dates: ['2026-01-01'], type: 'h', _id: oid() }],
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(nonPlainValues(parsed.data), [],
    'a snapshot carried an ObjectId through an unknown key — the strip is not holding');
});

// ── the save path, minus auth and the write ────────────────────────────────

test('saveDraftContent\'s pipeline keeps the payload plain, and its return is plain', () => {
  /**
   * The action itself cannot be called here (requireAdmin). Its BODY is
   * reproduced: parse -> sanitise -> renumber, over a page shaped like the one
   * that was reported failing — a course_schedule with round 64's fields, a
   * rich_text, a highlight_grid.
   *
   * `savedAt: new Date()` is deliberately NOT asserted plain: it is constructed
   * server-side, written to Mongo, and never returned. What crosses back is
   * `{ok, updatedAt: <string>}`, and THAT is what is asserted.
   */
  // DRAFT_CONTENT_KEYS is the schema's own list, so a key added there makes
  // this fixture fail loudly rather than silently testing a narrower object.
  const patch = {
    title: 'Early Bird Claude Code',
    sections: [
      { id: 'a', type: 'course_schedule', sortOrder: 0,
        content: { courseId: 'VIBE-CODE-L2', limit: 0, source: 'upcoming', roundIds: [], roundSnapshots: [] } },
      { id: 'b', type: 'rich_text', sortOrder: 1,
        content: { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ก' }] }] } } },
      { id: 'c', type: 'highlight_grid', sortOrder: 2, content: { items: [{ title: 'x', text: 'y' }] } },
    ],
  };

  const parsed = draftContentSchema.safeParse(patch);
  assert.ok(parsed.success, 'the reported page\'s shape no longer parses: '
    + JSON.stringify(parsed.error?.issues?.[0]));
  assert.deepEqual(nonPlainValues(parsed.data), [], 'the parse introduced a non-plain value');

  const sanitized = sanitizePageForTier(parsed.data, parsed.data, true);
  sanitized.sections = renumberSections(sanitized.sections);
  const hits = nonPlainValues(sanitized);
  assert.deepEqual(hits, [], 'sanitise/renumber introduced a non-plain value:\n' + describeNonPlain(hits));

  // The shape that actually crosses back to the client.
  assert.ok(isBoundarySafe({ ok: true, updatedAt: new Date().toISOString() }));
  assert.ok(isBoundarySafe({ ok: false, error: 'บันทึกฉบับร่างไม่สำเร็จ' }));
  // ...and the shape it must NOT become, so the assertion above can fail.
  assert.equal(nonPlainValues({ ok: true, updatedAt: new Date() }).length, 1,
    'returning the raw Date would not be caught — check the walk');
});
