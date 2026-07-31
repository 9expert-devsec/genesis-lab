import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldShowPinBadge, isPositioned } from '@/lib/articlePositioning';
import { compareArticlesForPublicOrder, assignArticleRanks } from '@/lib/articleRank';

// `isPinnedOnArticlePage` used to decide BOTH where an article sorted and
// whether it wore a pin badge, so a chosen position always came with a brand.
// `showPinBadge` now owns the badge and nothing else; the cascade in
// src/lib/actions/articles.js is untouched.
//
// The whole feature is the SEPARATION, so most of these assert two things at
// once: what the badge does AND that the ordering did not move with it.

const art = (over) => ({
  _id: over._id ?? 'a',
  active: true,
  isPinnedOnArticlePage: false,
  pinOrder: 0,
  publishedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

/** An article as it comes back from `.lean()` before this field existed. */
function legacyDoc(over) {
  const a = art(over);
  delete a.showPinBadge; // the key is ABSENT, not false
  return a;
}

// ── 1 ─────────────────────────────────────────────────────────────────────

test('positioned + showPinBadge true → badge shows', () => {
  const a = art({ isPinnedOnArticlePage: true, showPinBadge: true });
  assert.equal(shouldShowPinBadge(a), true);
});

// ── 2 — the feature itself ────────────────────────────────────────────────

test('positioned + showPinBadge false → badge hidden, and it STILL sorts into the top block', () => {
  const quiet = art({ _id: 'quiet', isPinnedOnArticlePage: true, showPinBadge: false, pinOrder: 1, publishedAt: '2001-01-01T00:00:00.000Z' });
  const recent = art({ _id: 'recent', isPinnedOnArticlePage: false, publishedAt: '2026-12-31T00:00:00.000Z' });

  // half one: no badge
  assert.equal(shouldShowPinBadge(quiet), false, 'the badge must be off');

  // half two: the position is untouched — it still outranks a far newer article
  assert.equal(isPositioned(quiet), true, 'it is still in the positioned block');
  assert.ok(
    compareArticlesForPublicOrder(quiet, recent) < 0,
    'turning the badge off must not move the article',
  );
  const ranks = new Map(assignArticleRanks([recent, quiet]).map((x) => [x._id, x.rank]));
  assert.equal(ranks.get('quiet'), 1, 'it is still rank 1 despite being newest-last by date');
  assert.equal(ranks.get('recent'), 2);
});

// ── 3 — the .lean() incident ──────────────────────────────────────────────

test('positioned + showPinBadge ABSENT → badge shows (the .lean() case: ~200 existing articles predate the field and would otherwise lose their badge on deploy)', () => {
  const existing = legacyDoc({ isPinnedOnArticlePage: true });
  assert.equal('showPinBadge' in existing, false, 'fixture must actually be missing the key');
  assert.equal(existing.showPinBadge, undefined);

  assert.equal(
    shouldShowPinBadge(existing), true,
    'absent must mean ON. `getArticles` reads with .lean(), so Mongoose defaults are ' +
    'NOT applied, and serialize() drops undefined keys — every pre-existing article ' +
    'arrives without this key. A truthiness check here strips every badge in production ' +
    'the moment this deploys, with no migration having run.',
  );
});

// ── 4 — badge on, no position ─────────────────────────────────────────────
// DECISION: allowed to be stored, but has no public effect. Not prevented (that
// would mean demote silently erasing the admin's preference, and would block
// setting it before promoting); not silent (the admin list says so in amber).

test('NOT positioned + showPinBadge true → no badge: the value is stored but the badge is gated on positioning', () => {
  const a = art({ isPinnedOnArticlePage: false, showPinBadge: true });
  assert.equal(shouldShowPinBadge(a), false);
  assert.equal(a.showPinBadge, true, 'the stored preference survives — it is not cleared');
});

// ── 5 ─────────────────────────────────────────────────────────────────────
// This is the case that forces the positioning gate. `undefined !== false` is
// TRUE, so a helper keyed on showPinBadge alone would put a pin badge on every
// legacy article in the collection, positioned or not.

test('NOT positioned + showPinBadge ABSENT → no badge', () => {
  const a = legacyDoc({ isPinnedOnArticlePage: false });
  assert.equal(shouldShowPinBadge(a), false);
});

// ── controls ──────────────────────────────────────────────────────────────

test('CONTROL: the helper discriminates on BOTH fields, not just one', () => {
  const pos = (p, b) => shouldShowPinBadge(art({ isPinnedOnArticlePage: p, showPinBadge: b }));
  // varying the badge field alone changes the answer …
  assert.notEqual(pos(true, true), pos(true, false), 'badge field is live');
  // … and so does varying the position field alone
  assert.notEqual(pos(true, true), pos(false, true), 'positioning field is live');
});

test('CONTROL: absent and false are genuinely different inputs here', () => {
  const absent = legacyDoc({ isPinnedOnArticlePage: true });
  const explicit = art({ isPinnedOnArticlePage: true, showPinBadge: false });
  assert.notEqual(
    shouldShowPinBadge(absent), shouldShowPinBadge(explicit),
    'if these ever agree, the undefined-means-ON rule has been lost',
  );
});
