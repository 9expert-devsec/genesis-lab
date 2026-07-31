import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readSourceForScanning } from '../sourceScan.mjs';
import { compareLocalFaqs } from '@/lib/localFaqList';
import { compareFeaturedRows } from '@/lib/featuredListOrder';

// This admin now has TWO tie conventions, on purpose:
//
//   featured-* + tnhs   { sort_order: 1,     createdAt: -1 }  newest to the TOP
//   LocalFaq            { display_order: 1,  createdAt:  1 }  newest to the BOTTOM
//
// Both are defensible — a promo list wants the new thing visible, a hand-ordered
// FAQ document must not have its sequence rearranged under the author. What is
// NOT defensible is the two drifting apart by accident, or a client comparator
// disagreeing with the server query it is supposed to mirror. That second
// failure is silent: the list looks right until the next page load moves a row.
//
// WHAT THIS CANNOT SEE: it compares the SORT SPEC as text against the
// comparator's BEHAVIOUR on fixtures. It cannot prove Mongo implements that spec
// the way the fixtures assume, and it cannot see a `.sort()` built from a
// variable somewhere else.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const read = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

/**
 * RAW text, comments included — and the distinction matters enough to name:
 *
 *   an assertion about what the CODE DOES must read the scrubbed text, or prose
 *   about the code can satisfy it (that is the whole point of sourceScan.mjs);
 *
 *   an assertion that a REASON IS DOCUMENTED must read the raw text, because
 *   the reason IS a comment and the scrubber deletes it.
 *
 * This test file needs both. The first draft used the scrubbed reader for the
 * "is it explained" test and it failed for exactly this reason.
 */
const readRaw = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const ids = (rows) => rows.map((r) => r._id);
const at = (iso) => new Date(iso).toISOString();

// ── the server specs, read from source ─────────────────────────────

test('LocalFaq reads with { display_order: 1, createdAt: 1 }', () => {
  const src = read('src/lib/local-faqs/getLocalFaqs.js');
  assert.ok(
    src.includes('const DISPLAY_SORT = { display_order: 1, createdAt: 1 };'),
    'the sort is declared once, so the three queries cannot drift apart'
  );
  assert.ok(!/\.sort\(\{ display_order: 1 \}\)/.test(src), 'no query still sorts without the tie-break');
});

test('the featured family reads with { sort_order: 1, createdAt: -1 }', () => {
  for (const f of [
    'src/lib/actions/featured-courses.js',
    'src/lib/actions/featured-online-courses.js',
    'src/lib/actions/nav-featured-online-courses.js',
    'src/lib/actions/featured-reviews.js',
    'src/lib/actions/tnhs-courses.js',
  ]) {
    assert.ok(read(f).includes('.sort({ sort_order: 1, createdAt: -1 })'), f);
  }
});

test('the two conventions are DIFFERENT, and that is the point', () => {
  // If someone "harmonises" them, this goes red and they have to read the
  // reasoning before deciding — which is the whole purpose of pinning it.
  const faq = read('src/lib/local-faqs/getLocalFaqs.js');
  const featured = read('src/lib/actions/featured-courses.js');
  assert.ok(faq.includes('createdAt: 1'), 'FAQ: oldest first within a tie');
  assert.ok(featured.includes('createdAt: -1'), 'featured: newest first within a tie');
});

test('the divergence is EXPLAINED where the query lives', () => {
  // A convention nobody wrote down is one the next person will unify.
  // RAW read: the explanation is a comment, and `read` deletes comments.
  const src = readRaw('src/lib/local-faqs/getLocalFaqs.js');
  assert.ok(/DIVERGES/.test(src), 'the divergence is named');
  assert.ok(/featured/i.test(src), 'and says what it diverges FROM');
});

// ── the client comparators match their server specs ────────────────

const TIED = [
  { _id: 'older', order: 1, createdAt: at('2026-01-01T00:00:00Z') },
  { _id: 'newer', order: 1, createdAt: at('2026-06-01T00:00:00Z') },
];

test('compareLocalFaqs puts the OLDER row first within a tie', () => {
  const rows = TIED.map((r) => ({ _id: r._id, display_order: r.order, createdAt: r.createdAt }));
  assert.deepEqual(ids([...rows].sort(compareLocalFaqs)), ['older', 'newer']);
});

test('compareFeaturedRows puts the NEWER row first within a tie', () => {
  const rows = TIED.map((r) => ({ _id: r._id, sort_order: r.order, createdAt: r.createdAt }));
  assert.deepEqual(ids([...rows].sort(compareFeaturedRows)), ['newer', 'older']);
});

test('CONTROL: the two comparators genuinely disagree on the same tie', () => {
  // Pairs with the two tests above. If one comparator were copied over the
  // other, both would still be internally consistent and both tests could be
  // rewritten to pass — this is the assertion that notices.
  const faqRows = TIED.map((r) => ({ _id: r._id, display_order: r.order, createdAt: r.createdAt }));
  const featRows = TIED.map((r) => ({ _id: r._id, sort_order: r.order, createdAt: r.createdAt }));
  assert.notDeepEqual(
    ids([...faqRows].sort(compareLocalFaqs)),
    ids([...featRows].sort(compareFeaturedRows))
  );
});

test('CONTROL: with NO tie the two agree — the divergence is only the tie-break', () => {
  // Proves the difference is scoped to equal keys and not a wholesale
  // disagreement about ordering.
  const faqRows = [
    { _id: 'b', display_order: 2, createdAt: at('2026-01-01T00:00:00Z') },
    { _id: 'a', display_order: 1, createdAt: at('2026-06-01T00:00:00Z') },
  ];
  const featRows = faqRows.map((r) => ({ _id: r._id, sort_order: r.display_order, createdAt: r.createdAt }));
  assert.deepEqual(ids([...faqRows].sort(compareLocalFaqs)), ['a', 'b']);
  assert.deepEqual(ids([...featRows].sort(compareFeaturedRows)), ['a', 'b']);
});
