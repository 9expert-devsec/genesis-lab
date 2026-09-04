import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPromotionPage,
  isStandalonePromotion,
  isLinkedPromotion,
  slugMatchesPromotion,
  shouldRenderPromotionPage,
  promotionDetailTarget,
  selectVisiblePromotionPages,
  promotionPageToCard,
  orderedPromotionCards,
} from '@/lib/pages/promotionMode';

// Promotion mode Phase 1 — the pure discriminator + slug-collision rule. No DB.

// ── The discriminator (the self-retiring assertion the brief named) ──────────
test('standalone: pageType=promotion + EMPTY promotionId', () => {
  const page = { pageType: 'promotion', promotionId: '' };
  assert.equal(isStandalonePromotion(page), true);
  assert.equal(isLinkedPromotion(page), false);
});
test('linked: pageType=promotion + NON-EMPTY promotionId', () => {
  const page = { pageType: 'promotion', promotionId: 'abc123' };
  assert.equal(isLinkedPromotion(page), true);
  assert.equal(isStandalonePromotion(page), false);
});
test('whitespace-only promotionId still counts as standalone', () => {
  assert.equal(isStandalonePromotion({ pageType: 'promotion', promotionId: '   ' }), true);
});

// CONTROL: a non-promotion pageType is NEITHER — proves the check keys on
// pageType, not on promotionId alone (a `landing` page with a stray promotionId
// must not be mistaken for a linked promotion).
test('control: a non-promotion page classifies as neither, even with a promotionId', () => {
  const page = { pageType: 'landing', promotionId: 'abc123' };
  assert.equal(isPromotionPage(page), false);
  assert.equal(isStandalonePromotion(page), false);
  assert.equal(isLinkedPromotion(page), false);
});

// ── The slug-collision rule (pure core of checkPromotionSlugAvailable) ───────
test('slugMatchesPromotion: collides with a PromotionConfig.url_slug', () => {
  assert.equal(slugMatchesPromotion('songkran-2026', { urlSlugs: ['songkran-2026'], promotionIds: [] }), true);
});
test('slugMatchesPromotion: collides with a raw Promotion.promotion_id', () => {
  assert.equal(slugMatchesPromotion('692eb3f3aa', { urlSlugs: [], promotionIds: ['692eb3f3aa'] }), true);
});
test('slugMatchesPromotion: no collision → false (allowed)', () => {
  assert.equal(slugMatchesPromotion('brand-new', { urlSlugs: ['songkran-2026'], promotionIds: ['692eb3f3aa'] }), false);
});
test('slugMatchesPromotion: case-insensitive + ignores empty/nulls', () => {
  assert.equal(slugMatchesPromotion('Songkran-2026', { urlSlugs: ['songkran-2026'] }), true);
  assert.equal(slugMatchesPromotion('', { urlSlugs: [''], promotionIds: [null] }), false);
});

// ── Phase 2: detail-route precedence (builder-first → msdb → notfound) ───────
const NOW = 1_700_000_000_000;          // fixed clock for determinism
const within = { start: NOW - 1000, end: NOW + 1000 };
const visiblePromo = { pageType: 'promotion', status: 'published', publishStartDate: within.start, publishEndDate: within.end };
const expiredPromo = { pageType: 'promotion', status: 'published', publishStartDate: NOW - 2000, publishEndDate: NOW - 1000 };
const draftPromo   = { pageType: 'promotion', status: 'draft' };

/**
 * An Advanced HTML promotion, as the detail route sees it: no publish window at
 * all (CustomPage has neither date field), so `isPubliclyVisible` reduces to
 * `status === 'published'`. That reduction is asserted directly below rather
 * than assumed, because the whole three-way precedence rests on it.
 */
const visibleCustom = { pageType: 'promotion', status: 'published' };
const draftCustom   = { pageType: 'promotion', status: 'draft' };

test('a CustomPage-shaped promotion is judged by status alone — no dates needed', () => {
  assert.equal(shouldRenderPromotionPage(visibleCustom, NOW), true,
    'a published Advanced HTML promotion is not visible — the shared predicate must '
    + 'treat absent publish windows as open, or its detail route 404s');
  assert.equal(shouldRenderPromotionPage(draftCustom, NOW), false);
});

test('target: visible promotion builder page → builder (wins over custom AND MSDB)', () => {
  assert.equal(promotionDetailTarget(visiblePromo, visibleCustom, { promotion: {} }, NOW), 'builder');
});
test('target: no builder, visible custom page → custom (wins over MSDB)', () => {
  assert.equal(promotionDetailTarget(null, visibleCustom, { promotion: {} }, NOW), 'custom');
});
test('target: no builder + no custom + MSDB hit → msdb', () => {
  assert.equal(promotionDetailTarget(null, null, { promotion: {} }, NOW), 'msdb');
});
test('target: expired/draft promotion page + no MSDB → notfound (not msdb)', () => {
  assert.equal(promotionDetailTarget(expiredPromo, null, null, NOW), 'notfound');
  assert.equal(promotionDetailTarget(draftPromo, null, null, NOW), 'notfound');
  assert.equal(promotionDetailTarget(null, draftCustom, null, NOW), 'notfound');
});
test('target: an UNPUBLISHED custom promotion falls through to MSDB rather than 404ing early', () => {
  // The precedence is "visible page wins", not "a page with this slug exists".
  assert.equal(promotionDetailTarget(null, draftCustom, { promotion: {} }, NOW), 'msdb');
});

// CONTROL: a NON-promotion page at a /promotions/ slug must NOT resolve as its
// own kind — proves the route keys on isPromotionPage, not "any page with this
// slug". It falls through to MSDB (or notfound). Asserted for BOTH collections,
// because the custom branch is new and could have been written to key on
// existence alone.
test('control: a non-promotion page does NOT win the detail route, either kind', () => {
  const visibleLanding = { pageType: 'landing', status: 'published', publishStartDate: within.start, publishEndDate: within.end };
  const visibleGeneral = { pageType: 'general', status: 'published' };
  assert.equal(shouldRenderPromotionPage(visibleLanding, NOW), false);
  assert.equal(shouldRenderPromotionPage(visibleGeneral, NOW), false);
  assert.equal(promotionDetailTarget(visibleLanding, null, { promotion: {} }, NOW), 'msdb');
  assert.equal(promotionDetailTarget(null, visibleGeneral, { promotion: {} }, NOW), 'msdb');
  assert.equal(promotionDetailTarget(visibleLanding, visibleGeneral, null, NOW), 'notfound');
});

// ── Phase 2: bare-slug diversion predicate ───────────────────────────────────
// isPromotionPage is the redirect gate: a promotion page (visible or NOT) is
// diverted off /<slug>. Control: a non-promotion page is not diverted.
test('bare-slug redirect gate: promotion page is diverted regardless of visibility', () => {
  assert.equal(isPromotionPage(visiblePromo), true);
  assert.equal(isPromotionPage(draftPromo), true); // even a draft diverts (never renders at bare slug)
});
test('control: a non-promotion builder page is NOT diverted (renders in place)', () => {
  assert.equal(isPromotionPage({ pageType: 'landing' }), false);
});

// ── Phase 3: grid union — select/gate/sort, adapter, ordering ────────────────
const promoPage = (over = {}) => ({
  pageType: 'promotion', status: 'published',
  publishStartDate: within.start, publishEndDate: within.end, ...over,
});

test('selectVisiblePromotionPages: gates to visible promotion pages, sorts by promotionOrder asc', () => {
  const pages = [
    promoPage({ slug: 'b', promotionOrder: 2 }),
    promoPage({ slug: 'a', promotionOrder: 1 }),
    expiredPromo,                                   // dropped (not visible)
    promoPage({ slug: 'c', pageType: 'landing' }),  // dropped (not a promotion)
  ];
  const out = selectVisiblePromotionPages(pages, NOW);
  assert.deepEqual(out.map((p) => p.slug), ['a', 'b']);
});

// CONTROL: the gate keys on isPromotionPage AND visibility — a visible NON-promotion
// page and a non-visible promotion page are BOTH excluded (neither alone passes).
test('control: gate excludes a visible non-promotion AND an invisible promotion', () => {
  const visibleLanding = promoPage({ slug: 'x', pageType: 'landing' });
  assert.equal(selectVisiblePromotionPages([visibleLanding], NOW).length, 0);
  assert.equal(selectVisiblePromotionPages([draftPromo], NOW).length, 0);
  assert.equal(selectVisiblePromotionPages([promoPage({ slug: 'ok' })], NOW).length, 1);
});

test('promotionPageToCard: maps to the card shape, link is /promotions/<slug> (NOT bare)', () => {
  const card = promotionPageToCard({
    _id: 'ID1', slug: 'songkran', title: 'Songkran', promotionCover: 'https://cdn/c.jpg',
    publishStartDate: within.start, publishEndDate: within.end,
  }, 'builder');
  assert.equal(card.href, '/promotions/songkran');
  assert.notEqual(card.href, '/songkran');          // control: not the bare slug
  assert.equal(card.title, 'Songkran');
  assert.equal(card.cover, 'https://cdn/c.jpg');
  assert.equal(card.start, within.start);
  assert.equal(card.source, 'builder');
  assert.equal(card.key, 'builder:ID1');
});
test('promotionPageToCard: empty cover stays empty (no invented fallback)', () => {
  assert.equal(promotionPageToCard({ slug: 's', title: 'T' }, 'builder').cover, '');
});

/**
 * `source` NAMESPACES THE KEY, and it is a required argument because of this
 * case: an `_id` is unique within a collection and nothing makes it unique
 * across two. Two pages of different types sharing an id must still be two
 * cards.
 */
test('promotionPageToCard: the source namespaces the key, so two collections cannot collide', () => {
  const same = { _id: 'SHARED', slug: 's', title: 'T' };
  assert.equal(promotionPageToCard(same, 'builder').key, 'builder:SHARED');
  assert.equal(promotionPageToCard(same, 'custom').key, 'custom:SHARED');
  assert.notEqual(
    promotionPageToCard(same, 'builder').key,
    promotionPageToCard(same, 'custom').key,
    'one _id in two collections produces one React key — the source prefix is not applied'
  );
});

test('orderedPromotionCards: builder block ENTIRELY before MSDB block', () => {
  const builder = [{ key: 'b1', source: 'builder' }, { key: 'b2', source: 'builder' }];
  const msdb = [{ key: 'm1', source: 'msdb' }, { key: 'm2', source: 'msdb' }];
  const merged = orderedPromotionCards(builder, msdb);
  const lastBuilder = merged.findLastIndex((c) => c.source === 'builder');
  const firstMsdb = merged.findIndex((c) => c.source === 'msdb');
  assert.ok(lastBuilder < firstMsdb, 'every builder card precedes every MSDB card');
});

// CONTROL: block-ordering DOMINATES the numeric order across sources — a builder
// promo with a HIGHER promotionOrder than another builder promo still precedes ALL
// MSDB promos (proves we are NOT interleaving the two sources by promotionOrder).
test('control: a high-promotionOrder builder promo still precedes all MSDB promos', () => {
  const pages = [promoPage({ slug: 'low', promotionOrder: 1 }), promoPage({ slug: 'high', promotionOrder: 999 })];
  const builderCards = selectVisiblePromotionPages(pages, NOW)
    .map((p) => promotionPageToCard(p, 'builder'));
  const msdbCards = [{ key: 'msdb:z', source: 'msdb' }];
  const merged = orderedPromotionCards(builderCards, msdbCards);
  assert.deepEqual(merged.map((c) => c.source), ['builder', 'builder', 'msdb']);
  // within builder block still promotionOrder asc:
  assert.deepEqual(merged.slice(0, 2).map((c) => c.href), ['/promotions/low', '/promotions/high']);
});

// ── THE GENESIS UNION: two collections, ONE interleaved block ────────────────

/**
 * The ruling this round implements: builder promotions and Advanced HTML
 * promotions sort TOGETHER on promotionOrder, because both are Genesis-owned
 * pages carrying the same admin-controlled field. The admin interleaves them
 * himself; the code does not decide which collection wins.
 *
 * This is the assertion that would go red if the grid ever went back to sorting
 * each half separately and concatenating — which produces two blocks and looks
 * identical for any fixture where the orders happen not to cross.
 */
const customPromoPage = (over = {}) => ({
  pageType: 'promotion', status: 'published', ...over,
});

test('the union INTERLEAVES the two collections on promotionOrder', () => {
  const pages = [
    // Deliberately crossing: the fixture is worthless if either half is already
    // ahead of the other everywhere.
    { ...promoPage({ slug: 'builder-2', promotionOrder: 2 }), promotionSource: 'builder' },
    { ...promoPage({ slug: 'builder-4', promotionOrder: 4 }), promotionSource: 'builder' },
    { ...customPromoPage({ slug: 'custom-1', promotionOrder: 1 }), promotionSource: 'custom' },
    { ...customPromoPage({ slug: 'custom-3', promotionOrder: 3 }), promotionSource: 'custom' },
  ];
  const cards = selectVisiblePromotionPages(pages, NOW)
    .map((p) => promotionPageToCard(p, p.promotionSource));

  assert.deepEqual(cards.map((c) => c.href), [
    '/promotions/custom-1', '/promotions/builder-2',
    '/promotions/custom-3', '/promotions/builder-4',
  ], 'the two collections did not interleave — this is the two-blocks shape the ruling rejects');
  assert.deepEqual(cards.map((c) => c.source), ['custom', 'builder', 'custom', 'builder']);
});

test('CONTROL: sorting the halves SEPARATELY produces a different, blocked order', () => {
  /**
   * The shape this replaced, run through the same helpers, so the assertion
   * above is proved to discriminate rather than merely to match. Two sorted
   * lists concatenated are two blocks however neatly each one is sorted.
   */
  const builders = [
    promoPage({ slug: 'builder-2', promotionOrder: 2 }),
    promoPage({ slug: 'builder-4', promotionOrder: 4 }),
  ];
  const customs = [
    customPromoPage({ slug: 'custom-1', promotionOrder: 1 }),
    customPromoPage({ slug: 'custom-3', promotionOrder: 3 }),
  ];
  const blocked = [
    ...selectVisiblePromotionPages(builders, NOW).map((p) => promotionPageToCard(p, 'builder')),
    ...selectVisiblePromotionPages(customs, NOW).map((p) => promotionPageToCard(p, 'custom')),
  ];
  assert.deepEqual(blocked.map((c) => c.source), ['builder', 'builder', 'custom', 'custom'],
    'the control does not actually produce the blocked shape it is controlling for');
  assert.notDeepEqual(blocked.map((c) => c.href),
    ['/promotions/custom-1', '/promotions/builder-2', '/promotions/custom-3', '/promotions/builder-4'],
    'per-half sorting and union sorting give the same answer for this fixture, so the '
    + 'interleaving assertion above proves nothing');
});

test('the union gate drops an unpublished custom promotion, keeping card and detail in step', () => {
  // A visible card must always imply a live detail: the same predicate that gates
  // this grid is the one promotionDetailTarget uses.
  const pages = [
    { ...customPromoPage({ slug: 'live', promotionOrder: 1 }), promotionSource: 'custom' },
    { ...customPromoPage({ slug: 'hidden', promotionOrder: 2, status: 'draft' }), promotionSource: 'custom' },
    { ...customPromoPage({ slug: 'not-a-promo', promotionOrder: 3, pageType: 'general' }), promotionSource: 'custom' },
  ];
  const out = selectVisiblePromotionPages(pages, NOW);
  assert.deepEqual(out.map((p) => p.slug), ['live']);
});

test('a custom promotion card carries NO dates — absent, never invented', () => {
  const card = promotionPageToCard(
    { _id: 'C1', slug: 'sale', title: 'Sale', promotionCover: '' }, 'custom');
  assert.equal(card.start, null, 'a start date appeared on a page type that has no publish window');
  assert.equal(card.end, null);
  assert.equal(card.key, 'custom:C1');
  assert.equal(card.href, '/promotions/sale');
});

test('the Genesis block still precedes MSDB entirely, whatever the orders are', () => {
  // The block boundary the ruling KEEPS. A custom promo at order 999 still comes
  // before an MSDB row, because the two scales are not reconciled.
  const genesis = [
    { ...customPromoPage({ slug: 'last', promotionOrder: 999 }), promotionSource: 'custom' },
    { ...promoPage({ slug: 'first', promotionOrder: 1 }), promotionSource: 'builder' },
  ];
  const genesisCards = selectVisiblePromotionPages(genesis, NOW)
    .map((p) => promotionPageToCard(p, p.promotionSource));
  const merged = orderedPromotionCards(genesisCards, [{ key: 'msdb:z', source: 'msdb' }]);
  assert.deepEqual(merged.map((c) => c.source), ['builder', 'custom', 'msdb']);
});
