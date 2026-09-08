import { test } from 'node:test';
import assert from 'node:assert/strict';

import { earlyBirdDetailHref } from '@/lib/earlyBird/detailHref';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The precedence under test is resolveOwner's, so the
// control below asks IT what a both-fields row is, rather than restating the
// answer here and agreeing with itself.
import { resolveOwner } from '@/lib/earlyBird/ownership';

/**
 * Where the Early Bird banner's ดูรายละเอียด points.
 *
 * ── THE SUBJECT IS THE PRECEDENCE, NOT THE STRING CONCATENATION ─────────
 * A row can carry BOTH `owner_page_id` and `promotion_id` — adopting a released
 * legacy row produces exactly that — and `resolveOwner` reads the page FIRST.
 * A second precedence spelled out in the href resolver would be a silent
 * disagreement, so the control below pins that a both-fields row goes to the
 * PAGE, and asks `resolveOwner` to confirm the fixture really is that shape.
 *
 * The other half is REFUSAL. `publicPageHref` says no for a page with no slug
 * and for one outside its publish window, and every such no must reach the same
 * outcome as "no owner at all": no link. A dead link spends a customer's click
 * before failing; an absent one costs nothing.
 */

const NOW = Date.parse('2026-09-10T00:00:00.000Z');

const OWNER_PAGE = {
  _id: 'page1',
  slug: 'super-sale',
  title: 'ซูเปอร์เซล',
  pageType: 'promotion',
  status: 'published',
  publishStartDate: null,
  publishEndDate: null,
};

const LEGACY_PROMOTION = {
  promotion_id: 'PROMO-9',
  api_slug: 'promo-nine',
  external_url: '',
};

const row = (over = {}) => ({
  course_id: 'MSE-L1',
  owner_page_id: '',
  promotion_id: '',
  ownerPage: null,
  promotion: null,
  ...over,
});

// ── the four outcomes, one case each ──────────────────────────────────────

test('an owning page resolves to /promotions/<slug>', () => {
  const href = earlyBirdDetailHref(
    row({ owner_page_id: 'page1', ownerPage: OWNER_PAGE }), NOW,
  );
  assert.equal(href, '/promotions/super-sale');
  // NOT the bare slug: a promotion page is diverted off it and `/super-sale`
  // answers 308. Asserted separately because a value carrying both would pass
  // an `includes` check.
  assert.notEqual(href, '/super-sale');
});

test('a legacy row resolves to the MSDB promotion it names', () => {
  const href = earlyBirdDetailHref(
    row({ promotion_id: 'PROMO-9', promotion: LEGACY_PROMOTION }), NOW,
  );
  assert.equal(href, '/promotions/promo-nine');
});

test('a legacy row with no api_slug falls to the promotion id, then to external_url', () => {
  /**
   * `/promotions/<promotion_id>` resolves — promotionMode.js records that the
   * route matches a lowercase segment against both `PromotionConfig.url_slug`
   * and a raw `Promotion.promotion_id` — and it is the expression
   * CoursePromoSection's own row already uses. Mirrored rather than reinvented,
   * because the two links can appear on the same page.
   */
  assert.equal(
    earlyBirdDetailHref(row({
      promotion_id: 'PROMO-9',
      promotion: { promotion_id: 'PROMO-9', api_slug: '', external_url: '' },
    }), NOW),
    '/promotions/PROMO-9',
  );
  assert.equal(
    earlyBirdDetailHref(row({
      promotion_id: 'PROMO-9',
      promotion: { promotion_id: '', api_slug: '', external_url: 'https://9expert.co.th/x' },
    }), NOW),
    'https://9expert.co.th/x',
  );
});

test('an unsafe external_url is refused, not rendered', () => {
  /**
   * `external_url` is free text on an MSDB row and reaches an `href`. `safeUrl`
   * is the same allowlist the rich-text walker and the cta buttons use; a
   * `javascript:` here must produce no link rather than a link that runs.
   */
  assert.equal(
    earlyBirdDetailHref(row({
      promotion_id: 'PROMO-9',
      promotion: { promotion_id: '', api_slug: '', external_url: 'javascript:alert(1)' },
    }), NOW),
    null,
  );
});

test('neither owner ⇒ no link', () => {
  assert.equal(earlyBirdDetailHref(row(), NOW), null, 'an unowned row produced a link');
  assert.equal(earlyBirdDetailHref(null, NOW), null, 'a missing row produced a link');
  assert.equal(earlyBirdDetailHref(undefined, NOW), null);
});

// ── refusal: the page wins even when it yields nothing ────────────────────

test('an owning page outside its publish window ⇒ no link', () => {
  const expired = { ...OWNER_PAGE, publishEndDate: '2026-09-01T00:00:00.000Z' };
  const future = { ...OWNER_PAGE, publishStartDate: '2026-10-01T00:00:00.000Z' };
  const draft = { ...OWNER_PAGE, status: 'draft' };

  for (const [name, page] of [['expired', expired], ['not started', future], ['draft', draft]]) {
    assert.equal(
      earlyBirdDetailHref(row({ owner_page_id: 'page1', ownerPage: page }), NOW), null,
      `an ${name} owner page produced a link`,
    );
  }

  // THE CONTROL: the same page inside its window IS linked, so the three
  // refusals above are the window and not a fixture that never resolved.
  const live = {
    ...OWNER_PAGE,
    publishStartDate: '2026-09-01T00:00:00.000Z',
    publishEndDate: '2026-10-01T00:00:00.000Z',
  };
  assert.equal(
    earlyBirdDetailHref(row({ owner_page_id: 'page1', ownerPage: live }), NOW),
    '/promotions/super-sale',
  );
});

test('a page owner that no longer resolves ⇒ no link, and no fall-through', () => {
  /**
   * The page was deleted between the write-through's delete and this read, so
   * the caller's projection came back null. The answer is no link — NOT the
   * legacy promotion the row may still carry, which is the subtle case below.
   */
  assert.equal(
    earlyBirdDetailHref(row({ owner_page_id: 'page1', ownerPage: null }), NOW), null,
  );
});

test('a PAGE-owned row whose page refuses does NOT fall back to its legacy promotion', () => {
  /**
   * The decided case. The row carries a usable `promotion_id`, and the page
   * that owns it is expired. Falling through would quietly send customers to a
   * different promotion, chosen by a field the author stopped using — so "the
   * page wins" has to mean it wins when the answer is inconvenient.
   */
  const expiredOwner = { ...OWNER_PAGE, publishEndDate: '2026-09-01T00:00:00.000Z' };
  const both = row({
    owner_page_id: 'page1', ownerPage: expiredOwner,
    promotion_id: 'PROMO-9', promotion: LEGACY_PROMOTION,
  });
  assert.equal(earlyBirdDetailHref(both, NOW), null,
    'an expired owner page fell through to a legacy promotion');

  // ...and the legacy half really is usable on its own, so the null above is
  // the precedence rather than an unusable promotion fixture.
  assert.equal(
    earlyBirdDetailHref(row({ promotion_id: 'PROMO-9', promotion: LEGACY_PROMOTION }), NOW),
    '/promotions/promo-nine',
  );
});

// ── the precedence control ────────────────────────────────────────────────

test('CONTROL — a row with BOTH fields resolves to the page, matching resolveOwner', () => {
  /**
   * The state adoption produces: `owner_page_id` set, `promotion_id` left as it
   * was. `resolveOwner` is asked what the fixture is, rather than this file
   * asserting the answer it wants — so if that precedence ever flipped, this
   * fails on the SHAPE as well as on the href.
   */
  const both = row({
    owner_page_id: 'page1', ownerPage: OWNER_PAGE,
    promotion_id: 'PROMO-9', promotion: LEGACY_PROMOTION,
  });
  assert.equal(resolveOwner(both), 'page_owned', 'the fixture is not the both-fields shape');
  assert.equal(earlyBirdDetailHref(both, NOW), '/promotions/super-sale');
  assert.notEqual(earlyBirdDetailHref(both, NOW), '/promotions/promo-nine',
    'the legacy promotion won — the precedence is inverted');
});
