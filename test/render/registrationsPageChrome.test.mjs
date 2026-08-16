import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Lock } from 'lucide-react';
import { RegistrationsClient } from '@/app/admin/registrations/_components/RegistrationsClient';
import {
  INHOUSE_STATUSES,
  PUBLIC_STATUSES,
  isSystemSet,
  statusLabel,
} from '@/lib/registrations/statuses';

/**
 * THE PAGE CHROME AROUND THE TABLE: the source toggle, the overview strip and
 * the list panel's own header and footer.
 *
 * ── WHAT THIS FILE CAN AND CANNOT PROVE ─────────────────────────────────────
 * `renderToStaticMarkup`, so every branch here is proven to be a FUNCTION OF THE
 * PROPS and nothing more. It cannot prove the navigation defect is fixed — that
 * needs a surviving instance re-rendered with changed props, which needs
 * `createRoot`, which this suite forbids because it leaks `globalThis.window`
 * across the shared process and once broke twenty-eight render tests. The guard
 * that reddens on THAT is the source scan in test/fs/urlFilterNoState.
 *
 * ── ELEMENT BOUNDARIES, NOT TEXT ────────────────────────────────────────────
 * Every text assertion below matches `>label<` — the whole text content of an
 * element. Thai negates by PREFIX (ไม่-) and compounds by suffix with no
 * separator, so a bare `includes('ยกเลิก')` is satisfied by 'ยกเลิกไม่ได้', and
 * `includes('ทั้งหมด')` by half a dozen unrelated strings on this screen.
 *
 * The same rule is what makes the COUNTING assertions below meaningful: "this
 * label appears in exactly one element" is a claim text matching cannot make at
 * all.
 */

const EMPTY  = { items: [], page: 1, pageCount: 1, total: 0, pageSize: 20 };
const FILLED = { items: [], page: 2, pageCount: 4, total: 74, pageSize: 20 };

/**
 * Deliberately DISTINCT non-zero numbers, so a badge or a card reading the wrong
 * key cannot coincidentally land on the right value.
 */
const INHOUSE_COUNTS = { total: 9, pending: 6, quoted: 2, cancelled: 1 };
const PUBLIC_COUNTS  = { total: 39, pending: 30, confirmed: 4, paid: 5, cancelled: 1 };
const TOTALS_ON_PUBLIC  = { public: 39, inhouse: 9 };
const TOTALS_ON_INHOUSE = { inhouse: 9, public: 39 };

function render(props) {
  return renderToStaticMarkup(createElement(RegistrationsClient, {
    initialData: EMPTY,
    status: 'all',
    q: '',
    range: 'all',
    lastEdited: {},
    ...props,
  }));
}

const publik  = render({ source: 'public',  counts: PUBLIC_COUNTS,  sourceTotals: TOTALS_ON_PUBLIC });
const inhouse = render({ source: 'inhouse', counts: INHOUSE_COUNTS, sourceTotals: TOTALS_ON_INHOUSE, courseNames: {} });

/** `>text<` — the whole text content of an element, so a prefix cannot match. */
const showsExactly = (markup, text) => markup.includes(`>${text}<`);

/** How many ELEMENTS have exactly this text content. */
const countExact = (markup, text) => markup.split(`>${text}<`).length - 1;

// ── 1. The source toggle carries a count for BOTH tabs ──────────────────────

/**
 * THE BADGE ON THE TAB THAT IS NOT SELECTED IS THE WHOLE POINT.
 *
 * The selected tab's number is `counts.total`, which the strip already had. The
 * other one needed a query of its own, and the brief was explicit that it joins
 * the existing `Promise.all` rather than becoming a serial await — asserted at
 * source level in test/fs/registrationsFilterWiring.
 *
 * Here the claim is narrower and is the one a reader can check: BOTH numbers are
 * on screen, and they are different numbers.
 */
test('the toggle shows a count on the selected tab AND on the other one', () => {
  assert.ok(showsExactly(publik, '39'), 'the selected (public) tab has no count');
  assert.ok(showsExactly(publik, '9'),  'the unselected (in-house) tab has no count');
  assert.ok(showsExactly(inhouse, '9'),  'the selected (in-house) tab has no count');
  assert.ok(showsExactly(inhouse, '39'), 'the unselected (public) tab has no count');
});

test('CONTROL: the two toggle counts are distinct, so neither could stand in for the other', () => {
  // Without this, both assertions above could be satisfied by one number
  // rendered twice — which is exactly what a badge wired to `counts.total` for
  // both tabs would produce.
  assert.notEqual(TOTALS_ON_PUBLIC.public, TOTALS_ON_PUBLIC.inhouse,
    'the fixture uses one number for both sources — the control is inert');
});

test('a missing total renders 0 rather than removing the badge', () => {
  // A badge that disappeared at zero would change the tab's width and leave the
  // reader unable to tell "none" from "not asked".
  const noTotals = render({ source: 'public', counts: PUBLIC_COUNTS });
  assert.ok(showsExactly(noTotals, '0'), 'a tab with no total rendered no badge at all');
});

// ── 2. The status chip row is GONE ──────────────────────────────────────────

/**
 * ONE ELEMENT PER STATUS LABEL, NOT TWO.
 *
 * Until this commit each status label rendered twice: once as a summary card and
 * once, fifteen lines below, as a filter chip pointing at the same URL. Both
 * controls navigated to `?status=<value>`, both showed a selected state, and the
 * ทั้งหมด chip did exactly what the ทั้งหมด card does.
 *
 * A COUNT rather than a negative, because a negative cannot distinguish "the
 * chips are gone" from "the cards are gone too" — and losing the cards would
 * leave the screen with no status filter at all while satisfying any
 * `!includes('chip')` assertion perfectly.
 */
test('each status label appears in exactly ONE element — the card, not a card and a chip', () => {
  for (const { label } of PUBLIC_STATUSES) {
    assert.equal(countExact(publik, label), 1,
      `the label ${label} renders ${countExact(publik, label)} times on the public screen — `
      + 'a second control for the same filter is back');
  }
  for (const { label } of INHOUSE_STATUSES) {
    assert.equal(countExact(inhouse, label), 1,
      `the label ${label} renders ${countExact(inhouse, label)} times on the in-house screen`);
  }
});

test('ทั้งหมด appears once as a card and once as a range chip — and nowhere else', () => {
  /**
   * The one label that legitimately renders twice, and the reason the test above
   * is written per-status rather than over every label on the page.
   *
   * `ทั้งหมด` is the ALL_FILTER card's label AND the 'all' range chip's label.
   * They are different controls answering different questions — one clears the
   * status filter, the other widens the date window — and they have always both
   * been there. Pinning the number at 2 means the status-chip row cannot come
   * back under this word either.
   */
  assert.equal(countExact(publik, 'ทั้งหมด'), 2,
    'ทั้งหมด renders a number of times other than the status card + the range chip');
});

// ── 3. The lock is on the CARD, and it is derived ───────────────────────────

/**
 * lucide stamps `lucide-<kebab icon name>` on every icon it renders.
 * Probed rather than assumed — see the control below.
 */
const LOCK_PROBE = 'lucide-lock';

test('the public strip locks exactly one card, and it is the system-set status', () => {
  const locked = PUBLIC_STATUSES.filter((s) => isSystemSet(s.value, 'public'));
  assert.deepEqual(locked.map((s) => s.value), ['paid'],
    'the transition table no longer resolves to `paid` alone — re-read the ruling before widening this');

  assert.equal(
    publik.split(LOCK_PROBE).length - 1, locked.length,
    `expected ${locked.length} lock glyph(s) on the public strip`,
  );
});

/**
 * IN-HOUSE HAS NO LOCK, AND THAT IS A DERIVED FACT RATHER THAN A GAP.
 *
 * `paid` is not in the in-house vocabulary at all — an engagement is settled
 * off-platform with no Omise charge — so there is no state its admins are shut
 * out of, and `isSystemSet` returns false for all three of its values.
 */
test('the in-house strip locks nothing', () => {
  assert.deepEqual(INHOUSE_STATUSES.filter((s) => isSystemSet(s.value, 'inhouse')), []);
  assert.equal(inhouse.includes(LOCK_PROBE), false, 'a lock reached the in-house strip');
});

test('CONTROL: the lock probe DOES match a real Lock render', () => {
  // Otherwise both assertions above pass against a probe that matches nothing,
  // and the in-house one would be green with a lock on every card.
  const real = renderToStaticMarkup(createElement(Lock, { className: 'h-[11px] w-[11px]' }));
  assert.ok(real.includes(LOCK_PROBE), `lucide no longer stamps ${LOCK_PROBE} — update the probe`);
});

/**
 * THE LOCK IS NOT IN THE LABEL. This is the mockup element that is ruled out.
 *
 * The design writes it inline as `ชำระแล้ว 🔒`. The label comes from the shared
 * module and must stay the label byte for byte, or the list cell, the summary
 * card and the detail header stop agreeing about what a status is called.
 * `showsExactly` is what proves it: the card's label element contains the label
 * and nothing else.
 */
test('the status label element contains the label and nothing else — no glyph welded in', () => {
  for (const { value, label } of PUBLIC_STATUSES) {
    assert.ok(showsExactly(publik, label), `${value} has no element whose entire text is its label`);
  }
  assert.equal(publik.includes('🔒'), false, 'a lock glyph is in the text, not in an element of its own');
});

/**
 * The sentence that goes with the lock, and it names the status through the
 * MODULE rather than in words.
 */
test('the overview sub-line says the cards filter, and names the locked status from the module', () => {
  assert.ok(publik.includes('คลิกการ์ดเพื่อกรองรายการตามสถานะ'), 'the public sub-line lost the card-filter sentence');
  assert.ok(inhouse.includes('คลิกการ์ดเพื่อกรองรายการตามสถานะ'), 'the in-house sub-line lost it');

  // Derived, so a relabel in the module follows here without this test changing.
  const lockedLabel = statusLabel('paid');
  assert.ok(publik.includes(`${lockedLabel} ระบบกำหนดให้เอง`),
    'the public sub-line does not explain the lock');
  assert.equal(inhouse.includes('ระบบกำหนดให้เอง'), false,
    'the in-house sub-line explains a lock it does not have');
});

// ── 4. No empty element where an optional line was dropped ──────────────────

/**
 * THE DEFECT THAT WAS INVISIBLE TO TEXT MATCHING TWICE.
 *
 * A dropped optional line that leaves its wrapper behind renders an element with
 * no content — a 16px gap the reader reads as a rendering fault, and one that
 * every `includes('…')` assertion in this suite is structurally blind to,
 * because the text it is looking for is absent in BOTH the correct and the
 * broken version.
 *
 * So this asserts on ELEMENTS. `<p …></p>` with nothing between the tags is the
 * shape, and it must not occur anywhere in the render.
 *
 * ── ONE EXEMPTION, DECLARED IN THE MARKUP RATHER THAN IN THIS MATCHER ───────
 * A DECORATIVE element is legitimately empty: the summary card's 4px accent bar
 * is a rule, and a rule has no text. That is a real distinction and it must be
 * made somewhere — the question is where.
 *
 * It is made in the COMPONENT, with `aria-hidden="true"`, and this matcher
 * simply honours it. Writing the exemption here instead (say, "unless the class
 * contains `w-0`") would put the list of blessed empty elements in the test,
 * where it would grow by one every time somebody wanted a green run — which is
 * how a guard becomes decoration. Requiring `aria-hidden` costs the component an
 * attribute it should carry anyway, and it cannot be added by accident.
 *
 * This is measured, not assumed: before the attribute existed, this test failed
 * on the accent bar. That failure is what the exemption is for, and the control
 * below pins that an UNDECLARED empty element still reddens.
 */
const EMPTY_ELEMENT = /<(p|span|div)\b(?![^>]*aria-hidden="true")[^>]*><\/\1>/;

test('no empty <p>/<span>/<div> is emitted on either source', () => {
  for (const [name, markup] of [['public', publik], ['in-house', inhouse]]) {
    const m = EMPTY_ELEMENT.exec(markup);
    assert.equal(m, null,
      `the ${name} render emits an empty element: ${m?.[0]}. An optional line was dropped `
      + 'but its wrapper was not — text matching cannot see this, which is why it shipped twice. '
      + 'If the element is genuinely decorative, mark it aria-hidden="true" and say why.');
  }
});

test('the footer states nothing rather than "แสดง 1–0 จาก 0" on an empty list', () => {
  assert.equal(publik.includes('แสดง'), false, 'the empty list still claims to be showing rows');
});

test('the footer states the window when there ARE rows, and pages when there are pages', () => {
  // The positive half. Without it the assertion above is satisfied by a footer
  // that never renders anything at all.
  const filled = render({ source: 'public', counts: PUBLIC_COUNTS, sourceTotals: TOTALS_ON_PUBLIC, initialData: FILLED });
  assert.ok(filled.includes('แสดง 21–40 จาก 74 รายการ'),
    'the footer does not state the page window');
  assert.ok(filled.includes('aria-label="ถัดไป"'), 'a 4-page list rendered no pager');
});

test('the pager is ABSENT on a single page, not rendered disabled', () => {
  assert.equal(publik.includes('aria-label="ถัดไป"'), false,
    'a one-page list still draws a pager — a control that goes nowhere');
});

test('CONTROL: the empty-element matcher fires on the shape it forbids', () => {
  // Every assertion in section 4 is a negative. Point the matcher at the exact
  // markup a dropped-line-with-a-surviving-wrapper produces.
  assert.match('<td><p class="h-[16px] text-[12px]"></p></td>', EMPTY_ELEMENT);
  assert.match('<span class="x"></span>', EMPTY_ELEMENT);
  // …and NOT at an element that legitimately has content, or the assertions
  // above would be failing for the wrong reason on any real page.
  assert.equal(EMPTY_ELEMENT.test('<p class="x">ทั้งหมด</p>'), false);
  assert.equal(EMPTY_ELEMENT.test('<span/>'), false);
});

test('CONTROL: the aria-hidden exemption is narrow — it blesses ONE element, not a class of them', () => {
  /**
   * The exemption is the part of this guard most likely to be abused, so it is
   * measured from both sides.
   *
   * An empty element WITHOUT the attribute still reddens — otherwise the
   * exemption would have quietly turned the whole section into decoration. And
   * the attribute has to be on the element ITSELF: a matcher that looked
   * anywhere in the markup would be switched off by one decorative bar
   * elsewhere on the page.
   */
  assert.equal(EMPTY_ELEMENT.test('<span aria-hidden="true" class="w-0 border-l-4"></span>'), false,
    'the declared-decorative form must be exempt, or the accent bar cannot exist');
  assert.match('<span class="w-0 border-l-4"></span>', EMPTY_ELEMENT);
  assert.match('<span aria-hidden="false" class="x"></span>', EMPTY_ELEMENT);
  // The attribute on a NEIGHBOUR does not launder the empty element beside it.
  assert.match('<span aria-hidden="true"></span><p class="y"></p>', EMPTY_ELEMENT);

  // And the real render contains exactly one declared-decorative empty element —
  // the accent bar, once per card — so the exemption is not being leaned on.
  const decorative = publik.match(/<span aria-hidden="true"[^>]*><\/span>/g) ?? [];
  assert.equal(decorative.length, PUBLIC_STATUSES.length + 1,
    `expected one accent bar per card (${PUBLIC_STATUSES.length + 1}), found ${decorative.length}`);
});

// ── 5. The two renders really are different documents ───────────────────────

test('CONTROL: the in-house and public renders are not the same markup', () => {
  assert.notEqual(inhouse, publik, 'both sources rendered identically — the fixtures are not distinct');
  assert.ok(inhouse.length > 1000 && publik.length > 1000, 'a render collapsed to near-nothing');
});
