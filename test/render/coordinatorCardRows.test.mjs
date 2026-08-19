import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { readSource } from '../sourceScan.mjs';

/**
 * THE ผู้ประสานงาน CARD'S ROWS — and the one that was removed.
 *
 * `เข้าอบรมด้วย` is gone from the READ VIEW. That is the entire change:
 * `coordinator.isAttending` stays on the schema, is still written by the public
 * wizard's checkbox, and keeps every one of its readers.
 *
 * ══ IT WAS NOT EDITABLE, AND DOES NOT BECOME EDITABLE ═══════════════════════
 *
 * `updateRegistration`'s coordinator branch names exactly four fields —
 * firstName, lastName, email, phone. `isAttending` is not among them and no
 * control on the admin screen ever offered it, so the rule "it stays editable if
 * it is editable today" resolves to: it was not, and it still is not. §2 asserts
 * that against the action's source rather than leaving it as a claim in prose.
 *
 * ══ THE VACUITY CHANGE, STATED ══════════════════════════════════════════════
 *
 * The removed row's value was `isAttending ? 'ใช่' : 'ไม่'` — TRUTHY IN BOTH
 * BRANCHES. `DLRow` drops a row whose value is empty, and this row could never
 * be dropped, so the coordinator card was guaranteed to render at least one row
 * whatever the document held. Any assertion of the shape "the coordinator card
 * renders rows" was therefore satisfied by this row and by the data never.
 *
 * With it gone, all three remaining rows are genuinely optional and such an
 * assertion measures the record. The change is in the SAFE direction — a guard
 * that was vacuous becoming meaningful — and nothing in the suite made that
 * claim beforehand, so nothing went the other way. §3 is the assertion that only
 * became possible because of it.
 */

const DOC = (coordinator) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaa0009',
  status: 'pending',
  courseName: 'Power BI Advanced',
  coordinator,
  attendeesListProvided: true,
  attendeesCount: 1,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' }],
  createdAt: '2026-08-01T03:00:00.000Z',
});

const render = (coordinator) =>
  renderToStaticMarkup(createElement(RegistrationDetailClient, { doc: DOC(coordinator), history: null }));

/**
 * JUST the ผู้ประสานงาน card, from its heading to the next card's.
 *
 * ── PAGE-WIDE MATCHING DOES NOT WORK HERE, AND IT WAS MEASURED ─────────────
 * The first draft scanned the whole render for `>ชื่อ-นามสกุล<` and reddened on
 * correct markup: the ATTENDEE TABLE's first column header is the same string,
 * and `อีเมล` / `เบอร์โทร` are labels in the attendee editor too. So a
 * "these rows are absent" assertion read page-wide is asking about three
 * completely different elements and can essentially never pass.
 *
 * Bounded on the two card headings rather than on a geometry class, so a future
 * restyle of the card cannot silently unbound it — and both ends are asserted,
 * because an `indexOf` that returns -1 would slice a region that is not this
 * card and every absence assertion would pass for the wrong reason.
 */
function coordinatorCard(markup) {
  const start = markup.indexOf('>ผู้ประสานงาน<');
  assert.notEqual(start, -1, 'the coordinator card heading is missing');
  const end = markup.indexOf('>การเงินและเอกสาร<', start);
  assert.notEqual(end, -1, 'the card after the coordinator card is missing — the region is unbounded');
  return markup.slice(start, end);
}

const FULL = {
  firstName: 'สมชาย', lastName: 'ใจดี',
  email: 'somchai@example.com', phone: '0812345678',
  isAttending: true,
};

// ── 1. The row is gone from the read view ───────────────────────────────────

test('the coordinator card no longer shows เข้าอบรมด้วย', () => {
  /**
   * Rendered with `isAttending: TRUE` deliberately — the branch that used to
   * print `ใช่`. A row asserted absent must be absent in the state where it had
   * something to say, not only in the state where it said "no".
   */
  const markup = render(FULL);
  const card = coordinatorCard(markup);
  assert.ok(!markup.includes('เข้าอบรมด้วย'), 'the เข้าอบรมด้วย row is still rendered');
  // …and the rows that stayed, read INSIDE the card, so this is not passing on
  // the attendee table's identically-named column header.
  for (const label of ['ชื่อ-นามสกุล', 'อีเมล', 'เบอร์โทร']) {
    assert.ok(card.includes(`>${label}<`), `the ${label} row went with it`);
  }
});

test('the FALSE branch is gone too — neither ใช่ nor ไม่ is claimed', () => {
  // The row rendered on both branches, so removing only one would leave a card
  // that reports attendance for half the records and is silent for the other.
  const markup = render({ ...FULL, isAttending: false });
  assert.ok(!markup.includes('เข้าอบรมด้วย'), 'the row returns when isAttending is false');
});

// ── 2. The field is untouched everywhere else ───────────────────────────────

const ACTIONS = readSource('src/lib/actions/registrations.js');
const CLIENT  = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');

test('isAttending was NOT in the allowlist before and is not in it now', () => {
  /**
   * The claim "display only" is only true if the write side is unchanged, and
   * the interesting half is that there was nothing to change: the coordinator
   * branch names four fields and this was never one of them.
   */
  const branch = ACTIONS.code.slice(
    ACTIONS.code.indexOf('if (data.coordinator)'),
    ACTIONS.code.indexOf('if (data.attendeesListProvided'),
  );
  assert.ok(branch.length > 50, 'could not locate the coordinator branch');
  for (const named of ['firstName', 'lastName', 'email', 'phone']) {
    assert.ok(branch.includes(`c.${named}`), `the coordinator branch stopped writing ${named}`);
  }
  assert.ok(!branch.includes('isAttending'),
    'isAttending became writable — the removal was supposed to be display-only');
});

test('the attendee table still reads isAttending — the field is display-only, not dead', () => {
  /**
   * The row went; the FIELD did not. If this ever stops holding, the removal has
   * quietly become a deletion, and the seat allocation in `buildAttendees` plus
   * three email models still depend on the value.
   */
  assert.match(CLIENT.code, /coordinatorAttending=\{doc\.coordinator\?\.isAttending\}/,
    'the attendee table no longer marks the coordinator’s row');
});

// ── 3. The assertion the removal made possible ──────────────────────────────

test('a coordinator with NO details renders NO rows — which the old row prevented', () => {
  /**
   * ── THIS IS THE VACUITY CHANGE, AS AN ASSERTION ───────────────────────────
   *
   * It could not have been written before. `เข้าอบรมด้วย` was truthy on both
   * branches, so an empty coordinator still produced one row and this test would
   * have failed on correct code — which is exactly why "does the card drop empty
   * rows" was untestable on this card while every other card was held to it.
   *
   * `DLRow`'s absent-means-absent rule now applies to the whole card.
   */
  const markup = render({ firstName: '', lastName: '', email: '', phone: '', isAttending: false });
  const card = coordinatorCard(markup);
  for (const label of ['ชื่อ-นามสกุล', 'อีเมล', 'เบอร์โทร']) {
    assert.ok(!card.includes(`>${label}<`), `the ${label} row rendered with no value`);
  }
  // The CARD is still drawn — the rule is that empty ROWS vanish, not that a
  // card with nothing in it disappears and takes its แก้ไข button with it.
  assert.ok(markup.includes('>ผู้ประสานงาน<'), 'the card itself vanished');
});
