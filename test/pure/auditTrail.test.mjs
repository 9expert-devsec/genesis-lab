import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIT_TRAIL_PAGE_SIZE, AUDIT_TRAIL_SORT, AUDIT_TRAIL_FIELDS, AUDIT_ACTION_VALUES,
  AUDIT_TRAIL_NOTE, AUDIT_TRAIL_EMPTY,
  buildPageAuditQuery, auditActionLabel, auditActorName, auditRowLine,
  encodeAuditTrailCursor, parseAuditTrailCursor,
} from '@/lib/pageBuilder/auditTrail';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * Round 38 — the audit trail's rules, without a database.
 *
 * `PageAuditLog` has been written to since round 2 and read from by nothing.
 * The read path this round adds is thin BY MEASUREMENT rather than by
 * impatience: what the stored rows can honestly answer is narrower than the
 * schema suggests, and most of this file is about what is deliberately NOT
 * built on top of them.
 */

// ── the projection ──────────────────────────────────────────────────────────

/**
 * The fields a projection string would ship, as a set.
 *
 * Written as a helper so the control below can hand it a WIDENED string and
 * prove the check would notice. A pin that can only ever see the current value
 * cannot fail for the reason it exists.
 */
function shippedFields(projection) {
  return new Set(String(projection).split(/\s+/).filter(Boolean));
}

/**
 * The four fields the projection must never carry, each with the measurement
 * that decided it. Named individually so a failure says WHICH one came back.
 */
const EXCLUDED_FIELDS = Object.freeze({
  before:
    'a presence flag, not a value — 18 of 20 stored draft.save rows are '
    + '{hadDraft:true} -> {hasDraft:true}, and 23 of 25 update rows have the two halves identical',
  after:
    'the other half of the same presence flag — shipping it invites a caller to '
    + 'render a change arrow between two identical strings',
  sectionId:
    'empty on 55 of 55 stored rows; every action that sets it is one of the six '
    + 'section.* values with no live caller',
  field:
    'empty on 55 of 55 stored rows, for the same reason as sectionId',
});

test('the projection ships three fields and excludes four by name', () => {
  assert.deepEqual([...shippedFields(AUDIT_TRAIL_FIELDS)].sort(),
    ['action', 'actor', 'createdAt']);

  for (const [name, why] of Object.entries(EXCLUDED_FIELDS)) {
    assert.equal(shippedFields(AUDIT_TRAIL_FIELDS).has(name), false,
      `the audit-trail projection now ships '${name}'. It is excluded because it is ${why}. `
      + 'See lib/pageBuilder/auditTrail.js before widening it.');
  }
  // pageType is excluded too, but for a different reason — it is a per-row copy
  // of a query parameter rather than a field that would mislead.
  assert.equal(shippedFields(AUDIT_TRAIL_FIELDS).has('pageType'), false);
});

test('CONTROL: the same check DOES name an excluded field when one is added', () => {
  // Without this, the assertion above passes for a checker that looks at nothing.
  const widened = `${AUDIT_TRAIL_FIELDS} before after`;
  const leaked = Object.keys(EXCLUDED_FIELDS).filter((f) => shippedFields(widened).has(f));
  assert.deepEqual(leaked, ['before', 'after']);
});

test('the projection has ONE definition and the action reads it', () => {
  // `.code`, not `.raw` — the projection must be in the executed source, not in
  // a comment describing what it used to be.
  const { code: action } = readSource('src/lib/actions/pageBuilder.js');
  assert.match(action, /\.select\(AUDIT_TRAIL_FIELDS\)/,
    'getPageAuditLog restates its projection instead of reading the one declaration');
  assert.equal(action.includes(".select('action actor createdAt')"), false,
    'the projection is inlined in the action — it must come from auditTrail.js');
});

test('the read is gated on the SAME key every other page read uses', () => {
  const { code } = readSource('src/lib/actions/pageBuilder.js');
  const body = code.slice(code.indexOf('export async function getPageAuditLog'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);
  assert.ok(fn.includes('getPageAuditLog'), 'the function was not found in the action layer');
  assert.match(fn, /await requireAdmin\('pages'\)/,
    "getPageAuditLog is ungated, or gated on a key other than 'pages'. In a 'use server' "
    + 'module every export is a POST endpoint, and this one returns who did what to a page.');
  assert.match(fn, /await dbConnect\(\)/);

  // …and the gate is reached BEFORE the query, not after it.
  assert.ok(fn.indexOf("requireAdmin('pages')") < fn.indexOf('PageAuditLog.find'),
    'the trail is read before the caller is authorised');
});

test('CONTROL: the same slicer sees an UNGATED function', () => {
  // Without this, the gate check above passes for a slicer that returns the
  // whole file — where some other export's requireAdmin would satisfy it.
  const code = 'export async function getPageAuditLog(id) {\n  return [];\n}\n';
  const body = code.slice(code.indexOf('export async function getPageAuditLog'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);
  assert.equal(/await requireAdmin\('pages'\)/.test(fn), false);
});

// ── the query and its cursor ────────────────────────────────────────────────

test('buildPageAuditQuery refuses a missing id rather than reading every page', () => {
  assert.equal(buildPageAuditQuery(), null);
  for (const bad of [undefined, null, '']) {
    assert.equal(buildPageAuditQuery({ pageId: bad }), null,
      'a blank pageId produced a filter — that filter would match every page in the collection');
  }
  // And a cursor cannot smuggle one past the check.
  assert.equal(buildPageAuditQuery({ pageId: '', cursor: '2026-01-01T00:00:00.000Z|x' }), null);
});

test('without a cursor the filter is the page id alone', () => {
  assert.deepEqual(buildPageAuditQuery({ pageId: 'p1' }), { pageId: 'p1' });
  // pageType is deliberately NOT a second key — see the module note.
  assert.equal('pageType' in buildPageAuditQuery({ pageId: 'p1' }), false);
});

test('a cursor pages on the COMPOUND key, both halves', () => {
  const at = new Date('2026-08-01T10:00:00.000Z');
  const cursor = encodeAuditTrailCursor({ createdAt: at, _id: 'row7' });
  assert.equal(cursor, '2026-08-01T10:00:00.000Z|row7');

  const filter = buildPageAuditQuery({ pageId: 'p1', cursor });
  assert.equal(filter.pageId, 'p1');
  assert.deepEqual(filter.$or, [
    { createdAt: { $lt: at } },
    { createdAt: at, _id: { $lt: 'row7' } },
  ]);
});

test('the sort and the cursor agree — both are (createdAt, _id) descending', () => {
  assert.deepEqual({ ...AUDIT_TRAIL_SORT }, { createdAt: -1, _id: -1 });
  // If the sort ever loses its tie-break, the second $or clause above stops
  // being reachable and the boundary silently skips a row.
  assert.equal(Object.keys(AUDIT_TRAIL_SORT).length, 2,
    'the sort dropped a key — a cursor on a non-unique key skips or repeats rows');
});

test('an unparseable cursor is IGNORED, not turned into an empty result', () => {
  for (const junk of ['', 'nonsense', 'no-pipe-here', '|', 'notadate|row7']) {
    const filter = buildPageAuditQuery({ pageId: 'p1', cursor: junk });
    assert.deepEqual(filter, { pageId: 'p1' },
      `the cursor '${junk}' produced a filter clause — a bad cursor must show the first page, `
      + 'not an empty trail that reads as "nothing ever happened here"');
  }
  assert.equal(parseAuditTrailCursor('nonsense'), null);
});

// ── the vocabulary ──────────────────────────────────────────────────────────

test('all nineteen stored action values have a Thai name', () => {
  // The model's own comment lists the vocabulary; these are the nineteen values
  // the action layer can write, live caller or not. A stored row must render
  // whatever verb it was filed under.
  assert.deepEqual([...AUDIT_ACTION_VALUES].sort(), [
    'create', 'delete', 'draft.backup', 'draft.discard', 'draft.save', 'duplicate',
    'preview.enable', 'preview.expiry', 'preview.regenerate', 'preview.revoke',
    'publish', 'section.add', 'section.delete', 'section.duplicate', 'section.reorder',
    'section.toggle', 'section.update', 'status', 'update',
  ]);
  for (const action of AUDIT_ACTION_VALUES) {
    const label = auditActionLabel(action);
    assert.notEqual(label, action, `${action} falls through to its raw token`);
    assert.equal(/[฀-๿]/.test(label), true, `${action}'s label is not Thai`);
  }
});

test('an UNKNOWN action renders its raw token rather than vanishing', () => {
  // readAuditLog.js made the same call: the field is free-form by design, and a
  // fixed list that dropped a verb invented later would hide exactly the row
  // somebody was looking for.
  assert.equal(auditActionLabel('promotion.link'), 'promotion.link');
  assert.equal(auditActionLabel(''), '');
  assert.equal(auditActionLabel(null), '');
});

test('a row reads as action, then who, then when', () => {
  const row = { action: 'publish', actor: { id: 'u1', name: 'Yanisa P.' } };
  assert.equal(auditRowLine(row, '28 ส.ค. 2569 08:31'),
    'เผยแพร่ โดย Yanisa P. เมื่อ 28 ส.ค. 2569 08:31');
});

test('an ANONYMOUS actor drops the clause instead of inventing a name', () => {
  // Round 26 declined the preview dialog's "created by" line on this ground and
  // draftSaverLine repeats it: an invented placeholder looks like data.
  const row = { action: 'draft.save', actor: { id: '', name: '' } };
  assert.equal(auditActorName(row), '');
  assert.equal(auditRowLine(row, '1 ม.ค.'), 'บันทึกฉบับร่าง เมื่อ 1 ม.ค.');
  assert.equal(auditRowLine({ action: 'draft.save' }, ''), 'บันทึกฉบับร่าง');
  // The row still renders — only the name is withheld.
  assert.notEqual(auditRowLine(row, '1 ม.ค.'), '');
});

test('a row with no action renders NOTHING — there is no verb to report', () => {
  assert.equal(auditRowLine({ actor: { name: 'Yanisa P.' } }, '1 ม.ค.'), '');
});

test('the module formats no date of its own', () => {
  // whenText is a parameter for the reason restoreWarning's is: toLocaleString
  // is timezone-dependent, so a self-formatting function could only be asserted
  // by value on the machine that wrote the assertion.
  const { code: src } = readSource('src/lib/pageBuilder/auditTrail.js');
  assert.equal(/toLocaleString|toLocaleDate|Intl\.DateTimeFormat/.test(src), false,
    'auditTrail.js formats a date — that makes its strings untestable by value');
});

// ── what is DECLINED, asserted as an absence ────────────────────────────────

/**
 * The three questions the stored rows cannot answer, and the source that
 * answers each instead.
 *
 * Shaped like round 27's JSON-LD claim vocabulary, and for the same reason: the
 * failure worth catching is a later round adding one of these back without
 * adding the data behind it. Round 18's lesson is that a surface claiming
 * something nothing can verify is worse than no surface.
 */
const DECLINED = Object.freeze([
  {
    what: 'a version number beside a publish row',
    evidence:
      'no audit row carries a versionNumber or a version id, so a publish row cannot be '
      + 'joined to the version it published — 1 publish row against 3 stored versions, '
      + 'the other two filed under update and status',
    answeredBy: 'PageVersion.actor + versionNumber (round 36)',
    vocabulary: ['versionNumber', 'versionName', 'เวอร์ชัน'],
  },
  {
    what: 'ผู้แก้ไขล่าสุด, from the trail',
    evidence:
      'draft.savedBy on the live document already answers it (round 34) and is STATE '
      + 'rather than an inference over the newest row of a class',
    answeredBy: 'editorStatus.draftSaverLine',
    vocabulary: ['แก้ไขล่าสุด', 'savedBy', 'updatedBy'],
  },
  {
    what: 'what changed in a given action',
    evidence:
      'before/after are presence flags — 18 of 20 draft.save rows are true -> true '
      + 'and 23 of 25 update rows are identical on both halves',
    answeredBy: 'nothing — the stored shape cannot support it',
    vocabulary: ['before', 'after', 'diff', 'เปลี่ยนจาก'],
  },
]);

test('the trail declines all three, and its own source uses none of their vocabulary', () => {
  // `.code` — every declination is DISCUSSED at length in the comments, which is
  // the point of them. What must be absent is the EXECUTED half.
  const { code } = readSource('src/lib/pageBuilder/auditTrail.js');
  for (const { what, evidence, vocabulary } of DECLINED) {
    for (const term of vocabulary) {
      assert.equal(code.includes(term), false,
        `auditTrail.js's CODE names '${term}', which belongs to the declined surface `
        + `"${what}". It was declined because ${evidence}.`);
    }
  }
});

test('CONTROL: the same scan DOES catch a declined surface reappearing', () => {
  // Without this, the assertion above passes for a scan that sees nothing.
  const fake = "export const line = (v) => `เวอร์ชัน ${v.versionNumber}`;\n";
  const caught = DECLINED[0].vocabulary.filter((t) => fake.includes(t));
  assert.deepEqual(caught, ['versionNumber', 'เวอร์ชัน']);
});

test('CONTROL: `.code` is not an empty string', () => {
  // The scan above would pass vacuously if the scrubbed source came out blank —
  // this file's comments are far longer than its code, which is exactly the
  // shape that makes a vacuous pass plausible.
  const { code } = readSource('src/lib/pageBuilder/auditTrail.js');
  assert.ok(code.includes('AUDIT_TRAIL_FIELDS'), 'the scrubber removed live code');
  assert.ok(code.includes('buildPageAuditQuery'), 'the scrubber removed live code');
  assert.ok(code.includes('auditRowLine'), 'the scrubber removed live code');
});

// ── J: exactly ONE source answers "ผู้แก้ไขล่าสุด" ──────────────────────────

/**
 * Three fields have looked like the answer to this question across the arc.
 * Round 33 measured `page.updatedBy` frozen at creation and left a tripwire.
 * Round 34 surfaced `draft.savedBy` and shipped the sentence. Round 38 declines
 * the audit trail's `draft.save` rows. Exactly one producer of the sentence is
 * allowed to exist, and this is what says so.
 */
const SAVER_SENTENCE = 'แก้ไขล่าสุดโดย';

/** Every src file whose EXECUTED source builds that sentence. */
function saverSentenceOwners(extra = []) {
  return [...walkSources('src'), ...extra]
    .filter((f) => f.code.includes(SAVER_SENTENCE))
    .map((f) => f.rel);
}

test('exactly ONE module produces the ผู้แก้ไขล่าสุด sentence', () => {
  assert.deepEqual(saverSentenceOwners(), ['src/lib/pageBuilder/editorStatus.js'],
    'a second module now writes the "last edited by" sentence. Round 34 made '
    + 'draft.savedBy its one source; two sources for one fact is the shape rounds '
    + '21-25 spent four rounds removing.');
});

test('CONTROL: the same scan catches a second source of that sentence', () => {
  // Without this, the assertion above passes for a scan that matches nothing.
  // The second source is HANDED to the walk rather than written to disk — the
  // rule being pinned is "exactly one", so the control has to produce a two.
  const planted = { rel: 'src/lib/pageBuilder/auditTrail.js', code: `x = '${SAVER_SENTENCE} y';` };
  assert.deepEqual(saverSentenceOwners([planted]), [
    'src/lib/pageBuilder/editorStatus.js',
    'src/lib/pageBuilder/auditTrail.js',
  ], 'the scan cannot see a second source at all');
});

// ── the two sentences the surface renders ───────────────────────────────────

test('the note says what the trail does NOT record', () => {
  // Without it, an author reads a run of บันทึกฉบับร่าง rows and concludes the
  // trail is a change log that lost their changes.
  assert.equal(AUDIT_TRAIL_NOTE,
    'บันทึกนี้เก็บว่ามีการดำเนินการอะไรกับหน้านี้ ใครทำ และเมื่อใด — ไม่ได้เก็บว่าเนื้อหาเปลี่ยนไปอย่างไร');
  assert.equal(AUDIT_TRAIL_EMPTY, 'ยังไม่มีการดำเนินการที่บันทึกไว้สำหรับหน้านี้');
  assert.notEqual(AUDIT_TRAIL_NOTE, AUDIT_TRAIL_EMPTY);
});

test('the page size is its own number, not the version list display cap', () => {
  // MAX_VERSION_ROWS caps a list that grows once per publish. This paginates a
  // collection that grows once per autosave tick and that nothing prunes.
  assert.equal(AUDIT_TRAIL_PAGE_SIZE, 25);
  const { code: action } = readSource('src/lib/actions/pageBuilder.js');
  assert.match(action, /\.limit\(AUDIT_TRAIL_PAGE_SIZE \+ 1\)/,
    'the read no longer fetches one extra row — it must learn hasMore without a countDocuments');
  assert.equal(/getPageAuditLog[\s\S]{0,900}MAX_VERSION_ROWS/.test(action), false,
    'the audit read borrowed the version list DISPLAY cap — they bound different things');
});
