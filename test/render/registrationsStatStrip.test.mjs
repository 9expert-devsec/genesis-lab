import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RegistrationsClient } from '@/app/admin/registrations/_components/RegistrationsClient';
import { INHOUSE_STATUSES, PUBLIC_STATUSES } from '@/lib/registrations/statuses';

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
 * and that the strip renders one card per declared status.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ── WHAT THE CROSS-SOURCE TEST NOW GUARDS, AND WHY THE OLD ONE STOPPED ────
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ROUND 1 left one test here checking each strip against the labels UNIQUE to
 * the OTHER source, derived by SET DIFFERENCE between the two status modules.
 * That was the right shape at the time: it excluded a shared label
 * automatically, so a future relabel could not make the test wrong.
 *
 * ROUND 2 COLLAPSED THE TWO VOCABULARIES ONTO EACH OTHER AND THE TECHNIQUE
 * STOPPED WORKING — in one direction completely.
 *
 *   public  : pending, confirmed, paid, cancelled
 *   in-house: pending, quoted,    cancelled
 *
 * The two labels sets are now {รอดำเนินการ, ส่งใบเสนอราคาแล้ว, ชำระแล้ว,
 * ยกเลิก} and {รอดำเนินการ, ส่งใบเสนอราคาแล้ว, ยกเลิก} — in-house `quoted` and
 * public `confirmed` carry the SAME words, deliberately, because they describe
 * the same act. So:
 *
 *   · publicOnly  = {ชำระแล้ว}   — ONE member, and it is the important one
 *   · inhouseOnly = {}            — EMPTY
 *
 * THE IN-HOUSE-ONLY HALF IS DELETED, not repaired. `for (const label of [])`
 * is a loop that runs zero times: it would have gone on passing forever while
 * asserting nothing at all, which reads as coverage and is worse than no test.
 * There is no honest assertion left on that side, because there is no longer
 * any label in-house has that public does not.
 *
 * THE PUBLIC-ONLY HALF SURVIVES AND MEANS MORE THAN IT DID. Its single member
 * is `ชำระแล้ว`, so it now pins the central ruling of round 2: **`paid` is
 * PUBLIC ONLY and must never become reachable for in-house.** An in-house
 * engagement is settled off-platform with no Omise charge, so nothing in the
 * system ever observes the money. That is asserted DIRECTLY below rather than
 * left implicit in a set difference, and the set-difference derivation is kept
 * beside it as the general form.
 *
 * The guard on the difference being non-empty is kept for the surviving half
 * and is now `>= 1`, with a comment saying why the number went down. Element-
 * boundary matching throughout, because Thai negates by prefix and compounds by
 * suffix with no separator.
 */

const EMPTY = { items: [], page: 1, pageCount: 1, total: 0, pageSize: 20 };

/**
 * Deliberately DISTINCT non-zero numbers. If a card's key did not match a
 * counts key it would render 0, and a fixture with repeated values cannot tell
 * a wrong key that coincided from a right one.
 */
const INHOUSE_COUNTS = { total: 9, pending: 6, quoted: 2, cancelled: 1 };
const PUBLIC_COUNTS  = { total: 39, pending: 30, confirmed: 4, paid: 5, cancelled: 1 };

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

/** `>text<` — the whole text content of an element, so a prefix cannot match. */
const showsExactly = (markup, text) => markup.includes(`>${text}<`);

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
    assert.ok(showsExactly(inhouse, s.label), `no card labelled ${s.label}`);
  }
});

test('the in-house column count is the card count, not a fixed number', () => {
  // It was a hard-coded `grid-cols-5` against a six-member list, which is how
  // the sixth card had nowhere to go. The list is three members now and the
  // grid must have followed it down without this file being told the number.
  const expected = INHOUSE_STATUSES.length + 1;
  assert.match(inhouse, new RegExp(`repeat\\(${expected},`),
    `the strip is not ${expected} columns wide`);
  assert.ok(!/grid-cols-\d/.test(inhouse), 'a fixed grid-cols-N is back');
});

test('the public strip is its own width — the grid follows the list it is given', () => {
  const expected = PUBLIC_STATUSES.length + 1;
  assert.match(publik, new RegExp(`repeat\\(${expected},`),
    `the public strip is not ${expected} columns wide`);
});

test('CONTROL: the two strips are NOT the same width', () => {
  // Without this, both width assertions could be satisfied by one number and
  // the "follows the list it is given" claim would be untested.
  assert.notEqual(INHOUSE_STATUSES.length, PUBLIC_STATUSES.length,
    'the control is inert — the two lists are the same length, so the widths cannot differ');
});

/**
 * The card the original defect hid. `quoted` had no card at all, so a record in
 * that status was inside ทั้งหมด and displayed by nothing.
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
  assert.match(after, />2</, 'the quoted card did not render the count 2');
});

test('every in-house card resolves a count — none falls through to a missing key', () => {
  // Four declared numbers: the total plus three statuses, all distinct in the
  // fixture, so a card reading the wrong key cannot land on the right number.
  for (const n of [9, 6, 2, 1]) {
    assert.match(inhouse, new RegExp(`>${n}<`), `no card rendered the count ${n}`);
  }
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

/**
 * ── THE PUBLIC COLUMN SET AFTER ROUND 3 ─────────────────────────────────────
 *
 * Four of the five headings this used to name are gone, and none of them by
 * accident:
 *
 *   · ใบเสนอราคา and ชำระเงิน were the two tick columns, removed by ruling. The
 *     information is on the detail page and is not relocated into the list.
 *   · วันอบรม folded INTO the course cell as its round-date line, which is what
 *     "หลักสูตร / รอบอบรม" means. It had been rendering `classDate` twice per
 *     row — once as its own column, once as the course cell's sub-line.
 *   · รูปแบบ folded into the same cell as the schedule chip.
 *
 * วันที่สมัคร and ผู้ประสานงาน survive and are still asserted, so this is not
 * passing because the table stopped rendering headers.
 */
test('source=public renders the public columns', () => {
  const cells = headerCells(publik).join('|');
  for (const heading of ['วันที่สมัคร', 'หลักสูตร / รอบอบรม', 'ผู้ประสานงาน', 'ผู้เข้าอบรม', 'สถานะ']) {
    assert.ok(cells.includes(heading), `public header missing: ${heading}`);
  }
});

test('the four removed public columns are gone from the header', () => {
  const cells = headerCells(publik).join('|');
  for (const heading of ['เลขอ้างอิง', 'วันอบรม', 'รูปแบบ', 'ใบเสนอราคา', 'ชำระเงิน']) {
    assert.ok(!cells.includes(heading), `a removed column is back on the public table: ${heading}`);
  }
});

// ── 3. `paid` IS PUBLIC ONLY — the surviving half of the old cross-check ────

/**
 * THE IN-HOUSE STRIP OFFERS NO ชำระแล้ว CARD, AND NO ชำระแล้ว CHIP.
 *
 * This is the round-2 ruling stated directly, and it is what the old
 * set-difference test was really protecting on this side. An in-house
 * engagement is invoiced and settled off-platform; there is no Omise charge, so
 * nothing in the system ever observes the money arriving. A ชำระแล้ว card would
 * be the screen offering to filter to a state no in-house record can hold — and
 * a chip that always returns zero rows reads as lost data.
 *
 * Named as a literal AS WELL AS derived below, on purpose. The derivation
 * proves the general rule; the literal is what a reader greps for when they
 * come here asking "where is paid forbidden for in-house".
 */
test('the in-house strip offers no ชำระแล้ว card', () => {
  assert.ok(!showsExactly(inhouse, 'ชำระแล้ว'), '`paid` reached the in-house strip');
  // And the public one does, so this is not passing because the label vanished
  // from the product altogether.
  assert.ok(showsExactly(publik, 'ชำระแล้ว'), 'the public strip lost its ชำระแล้ว card');
});

/**
 * The same rule, DERIVED — the general form of the assertion above.
 *
 * Each public-only label (by set difference against the in-house list) must not
 * appear on the in-house strip. A shared label is excluded automatically, so a
 * future relabel cannot make this wrong.
 *
 * ── THE THRESHOLD DROPPED FROM 3 TO 1, AND THAT IS THE POINT ────────────────
 * Round 1 guarded `publicOnly.length >= 3` because the vocabularies were
 * disjoint. The collapse left exactly one public-only label. The guard is kept
 * — an empty difference would make the loop below vacuous — but it is now `>=
 * 1` and the number is not going back up. If it ever reads 0, this test is
 * asserting nothing and should be deleted rather than adjusted.
 */
test('no public-ONLY status label appears on the in-house strip', () => {
  const publicLabels  = PUBLIC_STATUSES.map((s) => s.label);
  const inhouseLabels = INHOUSE_STATUSES.map((s) => s.label);
  const publicOnly    = publicLabels.filter((l) => !inhouseLabels.includes(l));

  assert.ok(publicOnly.length >= 1,
    'the difference is empty — this test now asserts nothing and must be deleted, not adjusted');
  assert.deepEqual(publicOnly, ['ชำระแล้ว'],
    'the public-only set changed; re-read the ruling before widening this test');

  for (const label of publicOnly) {
    assert.ok(!showsExactly(inhouse, label),
      `a public-only status leaked onto the in-house strip: ${label}`);
  }
});

/**
 * THE OTHER DIRECTION IS DELIBERATELY ABSENT.
 *
 * Round 1 also checked that no in-house-ONLY label appeared on the public
 * strip. After the collapse there ARE no in-house-only labels — every in-house
 * label is also a public one — so that loop would iterate zero times and pass
 * forever while proving nothing.
 *
 * This test is what remains of it: it PINS the emptiness, so that if the two
 * vocabularies ever diverge again the suite says so and the deleted half can be
 * restored deliberately rather than forgotten.
 */
test('there are no in-house-ONLY labels left — the deleted half, pinned', () => {
  const publicLabels  = PUBLIC_STATUSES.map((s) => s.label);
  const inhouseLabels = INHOUSE_STATUSES.map((s) => s.label);
  const inhouseOnly   = inhouseLabels.filter((l) => !publicLabels.includes(l));
  assert.deepEqual(inhouseOnly, [],
    'in-house has a label public does not — restore the leak check that was deleted here');
});

test('each strip DOES render its own full vocabulary', () => {
  // The positive half, without which the negative tests above pass on an empty
  // page.
  for (const { label } of PUBLIC_STATUSES) {
    assert.ok(showsExactly(publik, label), `the public strip is missing a card for ${label}`);
  }
  for (const { label } of INHOUSE_STATUSES) {
    assert.ok(showsExactly(inhouse, label), `the in-house strip is missing a card for ${label}`);
  }
});

test('the shared labels are on BOTH strips — collisions, deliberately', () => {
  // Pins the fact the rewrite above is built on. `pending` and `cancelled` are
  // literally the same states, and in-house `quoted` / public `confirmed`
  // describe the same act. If these stop being shared, the set-difference
  // reasoning in this file changes and the comments above go stale.
  for (const label of ['รอดำเนินการ', 'ส่งใบเสนอราคาแล้ว', 'ยกเลิก']) {
    assert.ok(showsExactly(publik, label),  `the public strip lost ${label}`);
    assert.ok(showsExactly(inhouse, label), `the in-house strip lost ${label}`);
  }
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
