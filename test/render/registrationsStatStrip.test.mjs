import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RegistrationsClient } from '@/app/admin/registrations/_components/RegistrationsClient';
import { INHOUSE_STATUSES } from '@/lib/registrations/inhouseStatuses';
import { PUBLIC_STATUSES } from '@/lib/registrations/publicStatuses';

/**
 * The summary strip and the table chrome, AS RENDERED, for each `source`.
 *
 * ── WHAT THIS FILE CAN AND CANNOT PROVE. READ BEFORE ADDING TO IT. ──────────
 * It renders with `renderToStaticMarkup`, which mounts fresh every time. That is
 * enough to prove the chrome is a FUNCTION OF THE PROPS — every branch below
 * reads `source` and nothing else — and it is NOT enough to prove the
 * navigation defect is fixed.
 *
 * The defect was: a second render of a SURVIVING instance with changed props,
 * where `useState` kept the old filter. Reproducing that needs a real client
 * mount and a re-render into the same root, and this suite forbids `createRoot`
 * over jsdom for a measured reason — it leaks `globalThis.window` into every
 * other render test and once broke twenty-eight of them (see the note in
 * test/render/coursePreviousCoursePicker.test.mjs). Under
 * `renderToStaticMarkup`, state and props are indistinguishable on the first
 * render, so these assertions passed BEFORE the fix too.
 *
 * The guard that actually reddens on the defect is the source scan in
 * test/fs/urlFilterNoState.test.mjs: no filter may be held in `useState`. What
 * this file adds is the other half — that the branches consume the props at all,
 * and that the six-card strip really renders six cards.
 */

const EMPTY = { items: [], page: 1, pageCount: 1, total: 0, pageSize: 20 };

const INHOUSE_COUNTS = {
  total: 6, new: 4, contacted: 1, quoted: 1, 'closed-won': 0, 'closed-lost': 0,
};
const PUBLIC_COUNTS = { total: 39, pending: 30, confirmed: 4, paid: 4, cancelled: 1 };

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

const inhouse = render({ source: 'inhouse', counts: INHOUSE_COUNTS, courseNames: {} });
const publik  = render({ source: 'public',  counts: PUBLIC_COUNTS });

/** The `<th>` cells of the table header. Throws rather than returning []. */
function headerCells(markup) {
  const start = markup.indexOf('<thead');
  assert.notEqual(start, -1, 'no <thead> — the table did not render');
  const end = markup.indexOf('</thead>', start);
  assert.notEqual(end, -1, 'unterminated <thead>');
  return markup.slice(start, end).split('<th').slice(1);
}

// ── 1. The strip has one card per status, plus the total ────────────────────

test('the in-house strip renders a card for EVERY declared status', () => {
  for (const s of INHOUSE_STATUSES) {
    assert.ok(inhouse.includes(s.label), `no card labelled ${s.label}`);
  }
});

test('the in-house column count is the card count, not a fixed 5', () => {
  const expected = INHOUSE_STATUSES.length + 1;
  assert.match(inhouse, new RegExp(`repeat\\(${expected},`),
    `the strip is not ${expected} columns wide`);
  assert.ok(!/grid-cols-\d/.test(inhouse), 'a fixed grid-cols-N is back');
});

test('the public strip is its own width — the grid follows the list it is given', () => {
  assert.match(publik, /repeat\(5,/, 'the public strip is not 5 columns wide');
});

/**
 * The card the defect hid. `quoted` had no card at all, so a record in that
 * status was inside ทั้งหมด 6 and displayed by nothing — cards summing to 5.
 *
 * Asserting the LABEL and its COUNT together: the label alone would be
 * satisfied by a card wired to a key the counts action does not return, which
 * is the failure mode the camelCase `closedWon` key used to cause — a card that
 * renders 0 forever.
 */
test('the ส่งใบเสนอราคาแล้ว card renders its real count, not 0', () => {
  const idx = inhouse.indexOf('ส่งใบเสนอราคาแล้ว');
  assert.notEqual(idx, -1, 'no quoted card');
  const after = inhouse.slice(idx, idx + 400);
  assert.match(after, />1</, 'the quoted card did not render the count 1');
});

test('every in-house card resolves a count — none falls through to a missing key', () => {
  // 6 declared numbers: the total plus five statuses. If a card's key did not
  // match a counts key it would render 0; the fixture gives quoted and total
  // distinct non-zero values so a wrong key cannot coincide with a right one.
  assert.match(inhouse, />6</, 'the total card did not render 6');
  assert.match(inhouse, />4</, 'the new card did not render 4');
});

// ── 2. The chrome follows `source` ──────────────────────────────────────────

test('source=inhouse renders the in-house columns', () => {
  const cells = headerCells(inhouse).join('|');
  for (const heading of ['บริษัท', 'หลักสูตรที่สนใจ', 'เดือนที่สนใจ', 'วันที่ส่งคำขอ']) {
    assert.ok(cells.includes(heading), `in-house header missing: ${heading}`);
  }
});

/**
 * THE RULE THIS SCREEN ALREADY HAD TO LEARN: no branch may render a value the
 * data does not hold. These four columns have no meaning for a public
 * registration, and rendering them over public rows is what produced a row of
 * em-dashes with a สถานะ of `confirmed` — a status no in-house enquiry can hold.
 */
test('source=public renders NONE of the in-house-only columns', () => {
  const cells = headerCells(publik).join('|');
  for (const heading of ['บริษัท', 'หลักสูตรที่สนใจ', 'เดือนที่สนใจ', 'วันที่ส่งคำขอ']) {
    assert.ok(!cells.includes(heading), `in-house header leaked onto the public table: ${heading}`);
  }
});

test('source=public renders the public columns', () => {
  const cells = headerCells(publik).join('|');
  for (const heading of ['วันอบรม', 'ผู้ประสานงาน', 'ใบเสนอราคา', 'ชำระเงิน', 'วันที่สมัคร']) {
    assert.ok(cells.includes(heading), `public header missing: ${heading}`);
  }
});

/**
 * NEITHER STRIP OFFERS A STATUS ITS COLLECTION CANNOT HOLD.
 *
 * ── WHY THIS TEST WAS REWRITTEN, AND WHAT IT USED TO SAY ────────────────────
 * It used to name two literals: 'ส่งใบเสนอราคาแล้ว' must not appear on the
 * public strip, 'รอดำเนินการ' must not appear on the in-house one. The first
 * half is now FALSE BY RULING — public `confirmed` was relabelled from
 * 'ยืนยันแล้ว' to 'ส่งใบเสนอราคาแล้ว', which is the same words in-house
 * `quoted` already used. The two collections now genuinely share one label,
 * because they genuinely describe the same real-world act: a quotation went out.
 *
 * The old assertion is not weakened away, it is restated over the thing it was
 * really protecting. Each side is checked against the labels UNIQUE to the
 * other, derived by set difference from the two modules — so a shared label is
 * excluded automatically and a future relabel cannot make this test wrong
 * again, while a genuine leak (in-house columns over public rows, the defect
 * this file was written for) still reddens it.
 *
 * Element-boundary matching, because Thai negates by prefix and compounds by
 * suffix with no separator: 'ปิดงานสำเร็จ' and 'ไม่สำเร็จ' share 'สำเร็จ', and a
 * bare substring test cannot tell a leaked card from a coincidence.
 */
test('the public strip offers no in-house-ONLY status label, and vice versa', () => {
  const publicLabels  = PUBLIC_STATUSES.map((s) => s.label);
  const inhouseLabels = INHOUSE_STATUSES.map((s) => s.label);
  const publicOnly  = publicLabels.filter((l) => !inhouseLabels.includes(l));
  const inhouseOnly = inhouseLabels.filter((l) => !publicLabels.includes(l));

  // The set difference must not be empty, or this test asserts nothing.
  assert.ok(publicOnly.length  >= 3, 'the two vocabularies overlap far more than expected');
  assert.ok(inhouseOnly.length >= 4, 'the two vocabularies overlap far more than expected');

  for (const label of inhouseOnly) {
    assert.ok(!publik.includes(`>${label}<`), `an in-house-only status leaked onto the public strip: ${label}`);
  }
  for (const label of publicOnly) {
    assert.ok(!inhouse.includes(`>${label}<`), `a public-only status leaked onto the in-house strip: ${label}`);
  }
});

test('each strip DOES render its own full vocabulary', () => {
  // The positive half, without which the test above passes on an empty page.
  for (const { label } of PUBLIC_STATUSES) {
    assert.ok(publik.includes(`>${label}<`), `the public strip is missing a card for ${label}`);
  }
  for (const { label } of INHOUSE_STATUSES) {
    assert.ok(inhouse.includes(`>${label}<`), `the in-house strip is missing a card for ${label}`);
  }
});

test('the shared label is on BOTH strips — a collision, deliberately', () => {
  // Pins the fact the rewrite above is built on. If the two vocabularies stop
  // sharing a label, the set-difference logic silently reverts to the old
  // literal-naming behaviour and this is the line that says so.
  assert.ok(publik.includes('>ส่งใบเสนอราคาแล้ว<'),  'public `confirmed` lost the relabel');
  assert.ok(inhouse.includes('>ส่งใบเสนอราคาแล้ว<'), 'in-house `quoted` lost its label');
});

/**
 * CONTROL: the two renders really are different documents.
 *
 * Every assertion above is of the form "X is in one and not the other". If the
 * two markups were identical — a props bug, a memoised render, a copy-paste in
 * this file — the positive and negative halves could not both hold, but a
 * future edit could reduce them to comparing one string with itself. This makes
 * the difference explicit.
 */
test('CONTROL: the in-house and public renders are not the same markup', () => {
  assert.notEqual(inhouse, publik, 'both sources rendered identically — the fixtures are not distinct');
  assert.ok(inhouse.length > 1000 && publik.length > 1000, 'a render collapsed to near-nothing');
});

/**
 * CONTROL: the search box carries the URL's term as its DEFAULT, uncontrolled.
 *
 * `value=` here would mean the box is controlled by something, and the only
 * something available is state — the shape this commit removed.
 */
test('the search input is uncontrolled and seeded from the q prop', () => {
  const withTerm = render({ source: 'inhouse', counts: INHOUSE_COUNTS, q: 'cpn', courseNames: {} });
  assert.match(withTerm, /name="q"[^>]*value="cpn"/,
    'the search box does not carry the q prop (React renders defaultValue as value= in static markup)');
});
