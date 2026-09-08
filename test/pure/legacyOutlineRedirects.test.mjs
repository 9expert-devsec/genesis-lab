import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTLINE_REDIRECT_ROWS,
  PERMANENT,
  encodeSource,
  outlineRedirectEntries,
} from '@/lib/legacyOutlineRedirects.mjs';

/**
 * The legacy course-outline redirect table, checked as DATA.
 *
 * Deliberately in the pure tier: nothing here imports next.config.mjs. The
 * claims below are about the table itself — its size, its status code, its
 * encoding rule — and they hold whether or not the config has been wired to it.
 * The SEAM (does the config actually carry these entries?) is a different claim
 * and lives in test/fs/skillSlugRedirects.test.mjs, because it is about two
 * files agreeing rather than about one file being right.
 *
 * ── WHY THE COUNTS ARE WRITTEN OUT ─────────────────────────────────────────
 * 151 and 162 are numbers a human decided, not numbers derived here. Deriving
 * the expected entry count from the rows would pass for an empty table, which
 * is exactly the false green this suite has been bitten by before.
 */

test('the table is 151 rows — the reviewed size of the batch', () => {
  // 159 were supplied; 8 are HELD because their destination files do not exist
  // (four courses, both languages). See the module header.
  assert.equal(OUTLINE_REDIRECT_ROWS.length, 151);
});

test('the table expands to 162 entries — 151 rows plus 11 encoded twins', () => {
  assert.equal(outlineRedirectEntries().length, 162);
});

test('CONTROL: dropping one space-free row moves both counts', () => {
  // Drops the FIRST row, which is space-free, so it costs exactly one entry.
  // Dropping the LAST would cost two — it is a career-path row and those all
  // carry a space. Asserted rather than assumed, because "one row is one entry"
  // is only true for space-free rows.
  const [first, ...short] = OUTLINE_REDIRECT_ROWS;
  assert.ok(!first.source.includes(' '), 'the first row gained a space; pick another');
  assert.equal(short.length, 150);
  assert.equal(outlineRedirectEntries(short).length, 161);
});

test('every source is unique, and so is every destination', () => {
  // One legacy URL cannot redirect to two places, and two legacy URLs sharing a
  // destination would mean the mapping sheet collapsed two courses into one.
  const sources = OUTLINE_REDIRECT_ROWS.map((r) => r.source);
  const destinations = OUTLINE_REDIRECT_ROWS.map((r) => r.destination);
  assert.equal(new Set(sources).size, sources.length, 'a source appears twice');
  assert.equal(new Set(destinations).size, destinations.length, 'a destination appears twice');
});

test('CONTROL: a duplicated source IS detected', () => {
  const dupes = ['/a', '/a'];
  assert.notEqual(new Set(dupes).size, dupes.length);
});

// ── the status code ─────────────────────────────────────────────────────────

test('every entry is TEMPORARY — none is a 308', () => {
  // A permanent redirect published to a URL printed on a flyer is cached in
  // browsers and effectively unrecallable. These stay 307 until someone
  // deliberately flips PERMANENT.
  assert.equal(PERMANENT, false);
  assert.deepEqual(outlineRedirectEntries().filter((e) => e.permanent !== false), []);
});

test('CONTROL: a single permanent entry IS reported', () => {
  const poisoned = outlineRedirectEntries().map((e, i) => (i === 7 ? { ...e, permanent: true } : e));
  assert.equal(poisoned.filter((e) => e.permanent !== false).length, 1);
});

// ── the encoding rule ───────────────────────────────────────────────────────

test('both spellings exist for every source containing a space, and only those', () => {
  // Next matches the RAW pathname and its matcher is LITERAL, so a space-bearing
  // source needs its %20 twin or it matches nothing a browser sends. Asserted in
  // BOTH directions — every spaced row has a twin, and no twin exists for a row
  // that never needed one.
  const entries = outlineRedirectEntries();
  const sources = new Set(entries.map((e) => e.source));
  const spaced = OUTLINE_REDIRECT_ROWS.filter((r) => r.source.includes(' '));
  assert.equal(spaced.length, 11);
  for (const row of spaced) {
    assert.ok(sources.has(row.source), `decoded spelling missing for ${row.source}`);
    assert.ok(sources.has(encodeSource(row.source)), `encoded spelling missing for ${row.source}`);
  }
  assert.equal(
    entries.filter((e) => e.source.includes('%20')).length, 11,
    'an encoded rule exists for a source that has no space'
  );
});

test('CONTROL: a source with a space and no twin is caught', () => {
  const rows = [{ source: '/images/a b.pdf', destination: '/files/course-outline/x.pdf' }];
  const withoutTwin = outlineRedirectEntries(rows).filter((e) => !e.source.includes('%20'));
  assert.equal(withoutTwin.length, 1);
  assert.ok(!new Set(withoutTwin.map((e) => e.source)).has('/images/a%20b.pdf'));
});

test('encodeSource touches spaces and nothing else', () => {
  assert.equal(encodeSource('/a b.pdf'), '/a%20b.pdf');
  assert.equal(encodeSource('/a-b_c.d~e/f.pdf'), '/a-b_c.d~e/f.pdf');
});

test('an unreviewed encodable character THROWS rather than being guessed at', () => {
  // The same posture as assertNoUnreviewedInvalidChars in legacyPublicId.js: a
  // generic encoder would invent a mapping nobody reviewed at the moment nobody
  // is watching.
  assert.throws(
    () => outlineRedirectEntries([{ source: '/images/a&b.pdf', destination: '/files/course-outline/x.pdf' }]),
    /needs a percent-encoded spelling nobody has reviewed/
  );
});

test('CONTROL: the reviewed characters do NOT throw', () => {
  // Without this, assertOnlyReviewedEncodables could throw on everything and the
  // test above would still pass.
  assert.equal(
    outlineRedirectEntries([{ source: '/images/a b-c.pdf', destination: '/files/course-outline/x.pdf' }]).length,
    2
  );
});

// ── shape of the batch ──────────────────────────────────────────────────────

test('no destination is also a source (no chain, no loop)', () => {
  const sources = new Set(outlineRedirectEntries().map((e) => e.source));
  assert.deepEqual(outlineRedirectEntries().filter((e) => sources.has(e.destination)), []);
});

test("CONTROL: a row pointing at another row's source IS reported", () => {
  // Pairs with the test above — a chain detector returning [] for everything
  // would satisfy it forever, and this batch is far too long to eyeball.
  const rows = [
    { source: '/images/a.pdf', destination: '/files/course-outline/x.pdf' },
    { source: '/images/b.pdf', destination: '/images/a.pdf' },
  ];
  const entries = outlineRedirectEntries(rows);
  const sources = new Set(entries.map((e) => e.source));
  assert.deepEqual(
    entries.filter((e) => sources.has(e.destination)).map((e) => e.source),
    ['/images/b.pdf']
  );
});

test('every destination is an INTERNAL course-outline path', () => {
  // Off-site destinations were ruled out when the Redirect Panel was scoped, and
  // it is why the ten career-path PDFs were re-hosted rather than pointed at
  // Cloudinary. A row that slipped an absolute URL through would send a customer
  // off the site entirely.
  for (const { destination } of OUTLINE_REDIRECT_ROWS) {
    assert.ok(
      destination.startsWith('/files/course-outline/'),
      `${destination} is not an internal course-outline path`
    );
    assert.ok(destination.endsWith('.pdf'), `${destination} is not a .pdf`);
  }
});

test('CONTROL: an off-site destination is rejected by that check', () => {
  const offsite = 'https://res.cloudinary.com/ddva7xvdt/raw/upload/x.pdf';
  assert.ok(!offsite.startsWith('/files/course-outline/'));
});

test('every source is under a legacy delivery root', () => {
  // /sites/default/files and /images are both in LEGACY_ROOTS. A source outside
  // them would not be a legacy URL at all, and would also silently widen the
  // reserved-path parity set in src/lib/courses/reservedPaths.js.
  for (const { source } of OUTLINE_REDIRECT_ROWS) {
    assert.ok(
      source.startsWith('/sites/default/files/') || source.startsWith('/images/'),
      `${source} is not under a legacy delivery root`
    );
  }
});

test('the batch occupies exactly two top-level segments', () => {
  // This is the number reservedPaths.js has to mirror — it compares FIRST
  // segments only, so 162 rules cost two entries there, not 162. If a future
  // batch adds a third root, this goes red and names it.
  const segments = [...new Set(OUTLINE_REDIRECT_ROWS.map((r) => r.source.split('/').filter(Boolean)[0]))].sort();
  assert.deepEqual(segments, ['images', 'sites']);
});
