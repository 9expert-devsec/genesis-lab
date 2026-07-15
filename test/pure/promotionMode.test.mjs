import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPromotionPage,
  isStandalonePromotion,
  isLinkedPromotion,
  slugMatchesPromotion,
  shouldRenderBuilderPromotion,
  promotionDetailTarget,
  selectVisiblePromotionPages,
  builderPromotionToCard,
  orderedPromotionCards,
} from '@/lib/pageBuilder/promotionMode';

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

test('target: visible promotion builder page → builder (wins over MSDB)', () => {
  assert.equal(promotionDetailTarget(visiblePromo, { promotion: {} }, NOW), 'builder');
});
test('target: no builder + MSDB hit → msdb', () => {
  assert.equal(promotionDetailTarget(null, { promotion: {} }, NOW), 'msdb');
});
test('target: expired/draft promotion builder page + no MSDB → notfound (not msdb)', () => {
  assert.equal(promotionDetailTarget(expiredPromo, null, NOW), 'notfound');
  assert.equal(promotionDetailTarget(draftPromo, null, NOW), 'notfound');
});

// CONTROL: a NON-promotion builder page at a /promotions/ slug must NOT resolve
// as 'builder' — proves the route keys on isPromotionPage, not "any builder page
// with this slug". It falls through to MSDB (or notfound).
test('control: a non-promotion builder page does NOT win the detail route', () => {
  const visibleLanding = { pageType: 'landing', status: 'published', publishStartDate: within.start, publishEndDate: within.end };
  assert.equal(shouldRenderBuilderPromotion(visibleLanding, NOW), false);
  assert.equal(promotionDetailTarget(visibleLanding, { promotion: {} }, NOW), 'msdb');
  assert.equal(promotionDetailTarget(visibleLanding, null, NOW), 'notfound');
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

test('builderPromotionToCard: maps to the card shape, link is /promotions/<slug> (NOT bare)', () => {
  const card = builderPromotionToCard({
    _id: 'ID1', slug: 'songkran', title: 'Songkran', promotionCover: 'https://cdn/c.jpg',
    publishStartDate: within.start, publishEndDate: within.end,
  });
  assert.equal(card.href, '/promotions/songkran');
  assert.notEqual(card.href, '/songkran');          // control: not the bare slug
  assert.equal(card.title, 'Songkran');
  assert.equal(card.cover, 'https://cdn/c.jpg');
  assert.equal(card.start, within.start);
  assert.equal(card.source, 'builder');
});
test('builderPromotionToCard: empty cover stays empty (no invented fallback)', () => {
  assert.equal(builderPromotionToCard({ slug: 's', title: 'T' }).cover, '');
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
  const builderCards = selectVisiblePromotionPages(pages, NOW).map(builderPromotionToCard);
  const msdbCards = [{ key: 'msdb:z', source: 'msdb' }];
  const merged = orderedPromotionCards(builderCards, msdbCards);
  assert.deepEqual(merged.map((c) => c.source), ['builder', 'builder', 'msdb']);
  // within builder block still promotionOrder asc:
  assert.deepEqual(merged.slice(0, 2).map((c) => c.href), ['/promotions/low', '/promotions/high']);
});
