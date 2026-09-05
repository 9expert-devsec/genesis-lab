import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  assert.match(note, /LEGS, NOT REQUESTS/, 'the cost is no longer stated in the schema comment');
  assert.match(note, /getRoundRegistrationSummary/, 'the deciding argument (seat accounting) is gone');
  assert.match(note, /rename/i, 'the second silent-breakage reader is no longer named');
  assert.match(note, /distinct/, 'the note no longer says how to count requests instead of legs');
  assert.match(note, /ONE EDIT PER LEG/, 'the per-leg admin edit cost is no longer recorded');
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

test('the counts action warns against narrowing itself', () => {
  // The other place a reader lands: someone looking at an inflated ทั้งหมด card
  // arrives at the counts, not at the model.
  const code = read(ACTIONS);
  const start = code.indexOf('THESE NUMBERS COUNT LEGS, NOT REQUESTS');
  assert.notEqual(start, -1, 'the counts action no longer warns about the leg semantics');
  assert.match(code.slice(start, start + 1400), /models\/RegisterPublic/, 'the pointer to the full reasoning is gone');
});
