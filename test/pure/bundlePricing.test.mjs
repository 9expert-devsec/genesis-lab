import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discountPercent, isInvertedPrice } from '@/lib/pageBuilder/bundlePricing';
import { publishBlockers } from '@/lib/pageBuilder/publishReadiness';

/**
 * The derived percentage, the inverted-price rule, and the publish refusal
 * built on it.
 *
 * Both functions have two readers each and the pairs must not be able to
 * disagree — the renderer's chip with the editor's preview, and the editor's
 * warning with `publishBlockers`. That is why they are one module and why the
 * refusal is asserted here beside the predicate rather than in isolation.
 */

// ── the percentage ────────────────────────────────────────────────────────

test('the reference pair from the real promotion page gives exactly 20%', () => {
  // docs/promotion-page-coverage.md: page A's bundle is 40,800 → 32,640 with a
  // "ลด 20%" chip. Hand-checked: 32640/40800 = 0.8.
  assert.equal(discountPercent(40800, 32640), 20);
});

test('a percentage is rounded to whole, and rounded rather than floored', () => {
  /**
   * 19.6% is nearer 20 than 19; flooring would systematically understate every
   * offer by up to a point.
   *
   * ── THE EXACT .5 BOUNDARY IS NOT ASSERTED, AND THAT IS DELIBERATE ────────
   * The first version of this test claimed `discountPercent(1000, 805) === 20`
   * on the arithmetic that 1 − 805/1000 is exactly 19.5%. It is not, in
   * binary: the expression evaluates to 19.499999999999996, so `Math.round`
   * answers 19. The test was wrong, not the function.
   *
   * Pinning a .5 case would mean pinning an artefact of float representation
   * that varies with which pair produces it — 19.5 from (1000, 805) rounds
   * down, and a different pair landing on the same nominal half could round up.
   * Nothing about a marketing chip needs a decided answer there, so the cases
   * below are the ones that are unambiguous in both arithmetics, and the
   * round-vs-floor claim is made where the two genuinely differ.
   */
  assert.equal(discountPercent(1000, 804), 20, '19.6% must round up, not floor to 19');
  assert.equal(Math.floor((1 - 804 / 1000) * 100), 19, 'the control: flooring WOULD give 19');

  assert.equal(discountPercent(1000, 900), 10);
  assert.equal(discountPercent(3, 2), 33, '33.3% rounds down, which floor also gives');
  assert.equal(discountPercent(1000, 1), 100);
});

test('null for every pair that cannot honestly produce a number', () => {
  assert.equal(discountPercent(null, 32640), null, 'unset list');
  assert.equal(discountPercent(40800, null), null, 'unset net');
  assert.equal(discountPercent(null, null), null);
  assert.equal(discountPercent(undefined, undefined), null);
  assert.equal(discountPercent(0, 0), null, 'a zero list price has no percentage');
  assert.equal(discountPercent(0, 100), null);
  // No negative discount. The page must not print `ลด -8%` while the editor is
  // warning about the same pair.
  assert.equal(discountPercent(10000, 12000), null);
});

test('equal prices are 0%, which is honest — and distinct from null', () => {
  /**
   * A bundle sold at its list price has no discount, which is odd but true.
   * It is NOT the same answer as "these prices cannot be compared", and both
   * readers guard on `> 0` rather than on truthiness — a `!discount` check
   * would collapse the two and is the reason this case is pinned.
   */
  assert.equal(discountPercent(10000, 10000), 0);
  assert.notEqual(discountPercent(10000, 10000), discountPercent(null, null));
});

test('CONTROL: the function is not simply returning null, or a constant', () => {
  assert.notEqual(discountPercent(40800, 32640), null);
  assert.notEqual(discountPercent(40800, 32640), discountPercent(1000, 900));
});

// ── the inverted-price rule ───────────────────────────────────────────────

test('inverted is net ABOVE list, and nothing else', () => {
  assert.equal(isInvertedPrice(10000, 12000), true);
  assert.equal(isInvertedPrice(40800, 32640), false);
  assert.equal(isInvertedPrice(10000, 10000), false, 'an equal pair is not inverted');
});

test('a HALF-TYPED pair is not inverted — the case the whole design is for', () => {
  /**
   * An author types one number before the other, so "net set, list not yet" is
   * a normal intermediate state. It must not warn, must not block, and above
   * all must not stop the page autosaving — which is why this rule is not a zod
   * `.refine()` on the section content.
   */
  assert.equal(isInvertedPrice(null, 32640), false);
  assert.equal(isInvertedPrice(40800, null), false);
  assert.equal(isInvertedPrice(undefined, undefined), false);
  assert.equal(isInvertedPrice(null, null), false);
});

test('CONTROL: the naive predicate WOULD fire on a half-typed pair', () => {
  /**
   * Discrimination. `null > 10` is false in JS, so the unset-LIST case happens
   * to be safe — but `netPrice > listPrice` with an unset NET is the one that
   * bites the other way, and a comparison written without the isPrice guards
   * gives a different answer somewhere. Shown rather than argued.
   */
  const naive = (l, n) => !(n <= l); // a plausible "is it inverted" one-liner
  assert.equal(naive(null, 32640), true, 'the naive form calls a half-typed pair inverted');
  assert.notEqual(naive(null, 32640), isInvertedPrice(null, 32640));
  // …and the two agree on the cases that are actually decidable.
  assert.equal(naive(10000, 12000), isInvertedPrice(10000, 12000));
  assert.equal(naive(40800, 32640), isInvertedPrice(40800, 32640));
});

// ── the publish refusal ───────────────────────────────────────────────────

const bundle = (content, over = {}) => ({ id: 's1', type: 'promotion_bundle', content, ...over });
const page = (sections) => ({ title: 'Promo', slug: 'promo', sections });
const messages = (sections, status = 'published') =>
  publishBlockers(page(sections), status).map((b) => b.message);

test('a bundle with an inverted pair blocks the publish, and names itself', () => {
  const msgs = messages([bundle({ name: 'Bundle 1', listPrice: 10000, netPrice: 12000 })]);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Bundle 1/);
  assert.match(msgs[0], /ราคาสุทธิสูงกว่าราคาปกติ/);
});

test('an unnamed bundle is identified by its position instead', () => {
  const msgs = messages([bundle({ listPrice: 10000, netPrice: 12000 })]);
  assert.match(msgs[0], /ลำดับที่ 1/);
});

test('ONE blocker per bad bundle — a page with several says which', () => {
  /**
   * Not one summary blocker. A promotion page carries several bundles, and "a
   * bundle has bad prices" on a page with four tells the author to check all
   * four.
   */
  const msgs = messages([
    bundle({ name: 'A', listPrice: 40800, netPrice: 32640 }),
    bundle({ name: 'B', listPrice: 100, netPrice: 200 }),
    bundle({ name: 'C', listPrice: 100, netPrice: 300 }),
  ]);
  assert.equal(msgs.length, 2);
  assert.match(msgs[0], /“B”/);
  assert.match(msgs[1], /“C”/);
});

test('a bundle nested inside a container is reached', () => {
  // A promotion_bundle inside a two_column is an ordinary layout; a top-level
  // check would let it through.
  const msgs = messages([
    {
      id: 'c1',
      type: 'two_column',
      content: { left: [], right: [bundle({ name: 'Nested', listPrice: 1, netPrice: 2 })] },
    },
  ]);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Nested/);
});

test('a DISABLED bundle is still checked', () => {
  // Same call the section-count check makes. A hidden bundle is one an author
  // re-enables later, probably without re-reading its prices.
  const msgs = messages([bundle({ name: 'Hidden', listPrice: 1, netPrice: 2 }, { enabled: false })]);
  assert.equal(msgs.length, 1);
});

test('CONTROL: good, equal and half-typed bundles block nothing', () => {
  assert.deepEqual(messages([bundle({ name: 'A', listPrice: 40800, netPrice: 32640 })]), []);
  assert.deepEqual(messages([bundle({ name: 'A', listPrice: 100, netPrice: 100 })]), []);
  assert.deepEqual(messages([bundle({ name: 'A', netPrice: 32640 })]), []);
  assert.deepEqual(messages([bundle({ name: 'A', listPrice: 40800 })]), []);
  assert.deepEqual(messages([bundle({})]), []);
  // …and a page with no bundles at all is unaffected.
  assert.deepEqual(messages([{ id: 'h', type: 'heading', content: { text: 'hi' } }]), []);
});

test('DRAFT is never blocked — a half-finished bundle saves and parks freely', () => {
  /**
   * The distinction that makes publishBlockers the right door rather than a zod
   * refine. The same page that cannot be published can be saved, closed and
   * archived without complaint.
   */
  const bad = [bundle({ name: 'A', listPrice: 100, netPrice: 200 })];
  for (const status of ['draft', 'closed', 'archived']) {
    assert.deepEqual(messages(bad, status), [], `${status} was blocked`);
  }
  // CONTROL: the same page IS blocked for the two public states, so the loop
  // above is about the status rather than about the page being fine.
  for (const status of ['published', 'scheduled']) {
    assert.equal(messages(bad, status).length, 1, `${status} was not blocked`);
  }
});

test('the pre-existing page-level blockers are untouched', () => {
  /**
   * The widening added a walk beside three checks that were already here. This
   * is the regression half: each of the three still fires on its own input, and
   * the bundle walk adds nothing to a page that has no bundle.
   */
  assert.deepEqual(
    publishBlockers({ title: '', slug: 'x', sections: [{ id: 'a', type: 'heading' }] }, 'published')
      .map((b) => b.field),
    ['title'],
  );
  assert.deepEqual(
    publishBlockers({ title: 'T', slug: '', sections: [{ id: 'a', type: 'heading' }] }, 'published')
      .map((b) => b.field),
    ['slug'],
  );
  assert.deepEqual(
    publishBlockers({ title: 'T', slug: 'x', sections: [] }, 'published').map((b) => b.field),
    ['sections'],
  );
  // A ready page is still ready.
  assert.deepEqual(
    publishBlockers({ title: 'T', slug: 'x', sections: [{ id: 'a', type: 'heading' }] }, 'published'),
    [],
  );
  // A missing/undefined sections array must not throw the new walk.
  assert.deepEqual(
    publishBlockers({ title: 'T', slug: 'x' }, 'published').map((b) => b.field),
    ['sections'],
  );
});

test('CONTROL: the regression sweep can fail — a bad page yields a different field list', () => {
  assert.throws(() =>
    assert.deepEqual(
      publishBlockers({ title: '', slug: '', sections: [] }, 'published').map((b) => b.field),
      ['title'],
    ),
  );
  assert.deepEqual(
    publishBlockers({ title: '', slug: '', sections: [] }, 'published').map((b) => b.field),
    ['title', 'slug', 'sections'],
  );
});

test('the editor warning and the publish refusal read the SAME predicate', () => {
  /**
   * Asserted behaviourally over a grid of pairs rather than by reading imports:
   * whatever the panel warns on must be exactly what refuses to publish, or an
   * author meets one without the other.
   */
  const pairs = [
    [40800, 32640], [10000, 12000], [10000, 10000], [null, 32640], [40800, null],
    [null, null], [0, 0], [0, 100], [100, 0],
  ];
  for (const [l, n] of pairs) {
    const blocked = messages([bundle({ name: 'A', listPrice: l, netPrice: n })]).length > 0;
    assert.equal(
      blocked,
      isInvertedPrice(l, n),
      `the blocker and the predicate disagree about (${l}, ${n})`,
    );
  }
  // CONTROL: the grid contains both answers, so the loop is not comparing two
  // constant falses.
  assert.equal(pairs.some(([l, n]) => isInvertedPrice(l, n)), true);
  assert.equal(pairs.some(([l, n]) => !isInvertedPrice(l, n)), true);
});
