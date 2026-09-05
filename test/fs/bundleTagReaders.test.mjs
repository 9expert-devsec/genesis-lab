import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Comment-stripped source, for the NEGATIVE assertions only. A "this string is
// absent" claim over raw source cannot tell code from prose about code — see
// the note at the เลขอ้างอิง test, which failed on its own explanation.
import { readSource } from '../sourceScan.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const ACTIONS = 'src/lib/actions/registrations.js';
const TABLE = 'src/app/admin/registrations/_components/PublicTable.jsx';
const DETAIL = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const MODEL = 'src/models/RegisterPublic.js';

/**
 * THE TAG HAS READERS, AND THIS IS WHAT SAYS SO.
 *
 * The standing rule in this repo is that no schema field ships without a named
 * reader — "a tag nothing reads is the failure this repo keeps removing". The
 * bundle tag is the case where that rule bites hardest, because the field is
 * ALREADY USEFUL to a person querying Mongo by hand, so it would be easy to add
 * it, mean to surface it, and never do so. Three rows in the admin list would
 * then look like three unrelated registrations forever, and nothing would fail.
 *
 * ── WHY A PROJECTION GUARD AND NOT ONLY A RENDER TEST ────────────────────
 * The render test hands `PublicTable` a row that already has a `bundle` key, so
 * it cannot see the query. `listRegistrations` is where a bundle row loses its
 * tag — a field left out of `.select()` arrives as `undefined`, the chip is not
 * drawn, and every render assertion stays green. That is the exact failure this
 * table's own projection note describes ("one that is a SUBSET renders
 * undefined, and this whole table was blank because a public-shaped render was
 * fed an in-house-shaped projection").
 */

test('the public list projection carries `bundle`', () => {
  const code = read(ACTIONS);
  const selects = [...code.matchAll(/\.select\('([^']*)'\)/g)].map((m) => m[1]);
  const publicSelect = selects.find((s) => s.includes('coordinator') && s.includes('courseName'));
  assert.ok(publicSelect, 'the public list projection is gone or has been rewritten');
  assert.ok(
    publicSelect.split(/\s+/).includes('bundle'),
    `the bundle tag left the list projection — a leg would render unchipped. Projection: "${publicSelect}"`,
  );
});

test('CONTROL: the projection reader can tell a present field from an absent one', () => {
  const code = read(ACTIONS);
  const selects = [...code.matchAll(/\.select\('([^']*)'\)/g)].map((m) => m[1]);
  const publicSelect = selects.find((s) => s.includes('coordinator') && s.includes('courseName'));
  // A field that IS in it, and one that deliberately is NOT (payment left in
  // round 3, with its columns).
  assert.equal(publicSelect.split(/\s+/).includes('courseName'), true);
  assert.equal(publicSelect.split(/\s+/).includes('payment'), false);
});

test('the table READS it — the projection and the render are the same list', () => {
  const table = read(TABLE);
  assert.match(table, /bundle=\{row\.bundle\}/, 'the row no longer hands its bundle to the course cell');
  assert.match(table, /data-testid="bundle-leg-chip"/, 'the chip is gone');
});

test('the detail screen reads it too — the card that says what this row IS', () => {
  const detail = read(DETAIL);
  assert.match(detail, /doc\.bundle/, 'the detail screen no longer reads the bundle tag');
  assert.match(detail, /label="แพ็กเกจ"/, 'the แพ็กเกจ row is gone');
});

test('CONTROL: those probes would not match a file that lacks them', () => {
  // Point the same three probes at a file that certainly has none of them.
  const unrelated = read('src/lib/refNo.js');
  assert.equal(/bundle=\{row\.bundle\}/.test(unrelated), false);
  assert.equal(/data-testid="bundle-leg-chip"/.test(unrelated), false);
  assert.equal(/label="แพ็กเกจ"/.test(unrelated), false);
});

test('every field on the tag has a reader in the source, by name', () => {
  /**
   * The four fields, each grepped for OUTSIDE the model and the builder that
   * writes it. A field whose only mentions are the declaration and the write is
   * a field nothing reads.
   *
   * `pageId`/`sectionId` are read by the request guard (they are the pair it
   * resolves) and shown, by implication, through the หลักสูตร card's name.
   * `requestId` groups the legs. `name` is drawn twice.
   */
  const readers = {
    pageId: ['src/lib/registration/bundleRequest.js'],
    sectionId: ['src/lib/registration/bundleRequest.js'],
    requestId: ['src/lib/registration/build-public.js'],
    name: [TABLE, DETAIL],
  };
  for (const [field, files] of Object.entries(readers)) {
    const seen = files.some((f) => read(f).includes(field));
    assert.equal(seen, true, `no reader found for bundle.${field}`);
  }
});

test('the schema comment carries the cost, not just the shape', () => {
  /**
   * The round's ruling: a future reader meets the inflated count BEFORE they
   * meet the reasoning, so the reasoning has to be where they land. This
   * asserts the two load-bearing statements are actually present, because a
   * comment is the entire mechanism preventing someone from "fixing" the count
   * by filtering bundle rows out of it — and comments are the one thing no
   * other test can protect.
   */
  const model = read(MODEL);
  const start = model.indexOf('THIS ROW IS ONE LEG OF A BUNDLE');
  assert.notEqual(start, -1, 'the bundle field lost its explanation');
  const note = model.slice(start, model.indexOf('bundle: { type: BundleSchema', start));

  /**
   * ── REWRITTEN WITH THE ROUND THAT REVERSED ITS SUBJECT ──────────────────
   *
   * This used to assert `LEGS, NOT REQUESTS` — that every count on the admin
   * screens meant legs. That was true and is no longer: the list shows one row
   * per request, so the counts moved with it. The note was rewritten in the
   * same commit as the code, which is the standing rule for a comment whose
   * premise changes.
   *
   * What is asserted is the same PROPERTY at the new position: the note must
   * still say which of the two things this collection stores, which the screens
   * count, and which readers still legitimately count legs — because those are
   * the three facts a reader meeting an unexpected number needs, and a comment
   * is the only mechanism protecting them.
   */
  assert.match(note, /THE STORAGE IS \*\*LEGS\*\*/,
    'the note no longer says what the collection holds');
  assert.match(note, /THE ADMIN SCREENS COUNT \*\*REQUESTS\*\*/,
    'the note no longer says what the screens count');
  assert.match(note, /getRoundRegistrationSummary/, 'the seat-accounting reader is gone');
  assert.match(note, /rename/i, 'the second silent-breakage reader is no longer named');
  assert.match(note, /ONE EDIT PER LEG/, 'the per-leg admin edit cost is no longer recorded');
  assert.match(note, /foldRequests/,
    'the note does not say HOW the fold is done, so the next reader may redo it in JavaScript');
  assert.match(note, /straddling a\s*\n?\s*\*?\s*page boundary/i,
    'the pagination hazard — the reason the fold is a grouping — is no longer recorded');
});

test('CONTROL: the reversed claim is NOT still in the schema note', () => {
  /**
   * The old sentence and the new one are contradictory, so both being present
   * would mean the rewrite was additive and the note now says two things. This
   * is the assertion that would catch a merge putting the old paragraph back.
   */
  const model = read(MODEL);
  const start = model.indexOf('THIS ROW IS ONE LEG OF A BUNDLE');
  const note = model.slice(start, model.indexOf('bundle: { type: BundleSchema', start));
  assert.equal(/COUNTS ACROSS THE REGISTRATION SCREENS MEAN \*\*LEGS, NOT REQUESTS\*\*/.test(note), false,
    'the superseded "counts mean legs" ruling is back beside the one that replaced it');
});

test('CONTROL: the comment probe is reading the note, not the whole file', () => {
  const model = read(MODEL);
  const start = model.indexOf('THIS ROW IS ONE LEG OF A BUNDLE');
  const note = model.slice(start, model.indexOf('bundle: { type: BundleSchema', start));
  /**
   * Bounded, and it does NOT contain text from elsewhere in the file — so a
   * match above is the note saying it rather than the file saying it somewhere.
   *
   * The upper bound was 8000 and the note now runs to ~8100: the per-leg admin
   * EDIT cost was added beside the count cost, the first time anyone met it. The
   * bound is raised deliberately rather than removed — its job is to catch the
   * slice swallowing the rest of the file, and an unbounded slice would assert
   * nothing. Raise it again if the note genuinely grows; do not delete it.
   */
  assert.ok(note.length > 500 && note.length < 10000, `the slice is ${note.length} chars — the bounds moved`);
  assert.equal(note.includes('AttendeeSchema'), false, 'the slice has swallowed the attendee note');
});

test('the counts action states which of the two things it counts', () => {
  /**
   * The other place a reader lands: someone looking at a number that surprises
   * them arrives at the counts, not at the model. It has to say what it counts,
   * that this REVERSED (so the old note is not re-applied from memory), what is
   * still counted in legs, and where the full reasoning lives.
   */
  const code = read(ACTIONS);
  const start = code.indexOf('THESE NUMBERS COUNT REQUESTS, NOT LEGS');
  assert.notEqual(start, -1, 'the counts action no longer says what it counts');
  const note = code.slice(start, start + 2000);
  assert.match(note, /IT USED TO BE THE OPPOSITE/, 'the reversal is not recorded, so it reads as always-was');
  assert.match(note, /getRoundRegistrationSummary/, 'the seats-and-rooms exception is not named');
  assert.match(note, /models\/RegisterPublic/, 'the pointer to the full reasoning is gone');
});

test('CONTROL: the counts-action probe is reading the note, not the file', () => {
  const code = read(ACTIONS);
  const start = code.indexOf('THESE NUMBERS COUNT REQUESTS, NOT LEGS');
  const note = code.slice(start, start + 2000);
  // Bounded, and it does not reach the neighbouring action's docstring.
  assert.equal(note.includes('export async function'), false,
    'the 2000-char slice has run past the end of the note');
  assert.ok(note.length > 500, `the slice is only ${note.length} chars`);
});

// ── THE DETAIL SCREEN TELLS THE TRUTH ABOUT A LEG OF A PACKAGE ─────────────

const DETAIL_PAGE = 'src/app/admin/registrations/[id]/page.jsx';
const FOLD = 'src/lib/registrations/foldRequests.js';

/**
 * TWO THINGS THIS SCREEN GOT WRONG FOR A NON-MARKER LEG, and both are about an
 * admin being able to trust what is in front of them.
 */

test('the เลขอ้างอิง is the REQUEST’s number, not the leg’s', () => {
  /**
   * The confirmation email quotes `refNo(requestId)` — one number for the whole
   * package. The screen showed `refNo(doc._id)`, which for any leg that is not
   * the marker is a different number, so an admin reading it down the phone was
   * reading something the customer could not find anywhere.
   *
   * `requestKeyOf` rather than a local `doc.bundle?.requestId ?? doc._id`: the
   * list groups by that function, and a second spelling would be two
   * definitions of "which request is this" that agree only until one moves.
   */
  /**
   * READ COMMENT-STRIPPED. The first draft asserted `refNo(doc._id)` was absent
   * from the raw file and failed — on the explanatory comment ABOVE the fixed
   * line, which quotes the defect it describes. A negative assertion over raw
   * source cannot tell code from prose about code, and weakening it to a
   * narrower literal would have kept the bug reachable through any other call
   * site.
   */
  const detail = readSource(DETAIL);
  assert.ok(detail.code.includes('const referenceNumber = refNo(requestKeyOf(doc))'),
    'the reference number is not derived from the shared request key');
  assert.ok(!detail.code.includes('refNo(doc._id)'),
    'refNo(doc._id) is back — a non-marker leg would show a number the customer cannot see');
  assert.ok(detail.code.includes('value={mono(referenceNumber)}'),
    'the ข้อมูลระบบ row no longer renders the derived reference number');
});

test('the TAB TITLE quotes the same number', () => {
  // The place an admin is most likely to read a number off while on the phone.
  const page = read(DETAIL_PAGE);
  assert.ok(page.includes('requestKeyOf(doc)'),
    'generateMetadata still titles the tab with the URL id');
});

test('CONTROL: requestKeyOf really is the list’s grouping key', () => {
  // Without this, "it uses the shared function" is satisfied by any function
  // with that name anywhere.
  const fold = read(FOLD);
  assert.ok(fold.includes('export function requestKeyOf'), 'requestKeyOf is not exported from the fold module');
  assert.ok(fold.includes('export const REQUEST_KEY_EXPR'), 'the fold module is not the grouping-key module');
});

test('DELETING ONE LEG NAMES THE PACKAGE, THE COUNT AND THE COURSE', () => {
  /**
   * Not hypothetical. On 2026-09-05 five legs of two requests were deleted one
   * at a time, in under five minutes, with nothing on screen saying a package
   * was being broken up.
   *
   * The ability to delete one leg is deliberate and is kept — the legs are
   * genuinely separate registrations. The silence is what is fixed.
   */
  /**
   * ── THE CONTROL MOVED, THE CLAIM DID NOT ─────────────────────────────────
   * It was `handleDelete` in the "•••" menu. Once the request view stopped
   * having a current leg, "ลบใบสมัครนี้" had no referent — so the control moved
   * into the package table, beside the course it removes, as `handleDeleteLeg`.
   * The three things it must name are unchanged, because the reason it must
   * name them is unchanged: every leg of a request shares a coordinator and a
   * date, so the course is the only fact telling them apart.
   */
  const detail = read(DETAIL);
  const at = detail.indexOf('const handleDeleteLeg');
  assert.notEqual(at, -1, 'the per-course delete handler is gone');
  const body = detail.slice(at, detail.indexOf('startTransition', at));

  assert.ok(body.includes('bundleLegs.length'), 'the confirmation does not say how many courses there are');
  assert.ok(body.includes('doc.bundle?.name'), 'the confirmation does not name the package');
  assert.ok(body.includes('leg?.courseName'), 'the confirmation does not say WHICH course is being deleted');
  assert.ok(body.includes('referenceNumber'), 'the confirmation quotes the wrong reference number');
  assert.ok(body.includes('หลักสูตรสุดท้าย'),
    'the confirmation does not warn when this is the LAST course of the request');
});

test('the per-course delete is rendered once per course, and takes that leg', () => {
  const detail = readSource(DETAIL);
  assert.match(detail.code, /onDelete=\{handleDeleteLeg\}/,
    'the package table is not wired to the per-course delete');
  assert.match(detail.code, /onClick=\{\(\) => onDelete\(leg\)\}/,
    'the row button does not pass its own leg — it would delete the wrong course');
  assert.ok(!detail.code.includes('currentId'),
    'the package table still takes a current leg');
});

test('CONTROL: the handleDelete slice is that function and not the file', () => {
  const detail = read(DETAIL);
  const at = detail.indexOf('const handleDelete');
  const body = detail.slice(at, detail.indexOf('startTransition', at));
  assert.ok(body.length > 200 && body.length < 3000, `the slice is ${body.length} chars`);
  assert.equal(body.includes('handleSaveRound'), false, 'the slice has run into a neighbouring handler');
});

test('the siblings are FETCHED, or the count in that sentence is always zero', () => {
  const page = read(DETAIL_PAGE);
  assert.ok(page.includes('getBundleRequestLegs(doc.bundle?.requestId)'),
    'the detail page does not fetch the request’s legs');
  assert.ok(page.includes('bundleLegs={bundleLegs}'),
    'the legs are fetched and not handed to the screen');
  // …in the SAME round as the rounds lookup, not as a serial await.
  assert.ok(page.includes('Promise.all(['), 'the two lookups are serial');
});

test('an ORDINARY registration pays nothing for any of this', () => {
  const actions = read(ACTIONS);
  const at = actions.indexOf('export async function getBundleRequestLegs');
  assert.notEqual(at, -1, 'getBundleRequestLegs is gone');
  const body = actions.slice(at, actions.indexOf('\nexport ', at + 1));
  assert.ok(body.includes("if (!id) return [];"),
    'the sibling lookup queries even when there is no request id');
});
