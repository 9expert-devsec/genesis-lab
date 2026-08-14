import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { allowedTransitions, buildStatusLabels } from '@/lib/registrations/publicStatuses';

/**
 * WHAT THE ADMIN CAN ACT ON, AS RENDERED, FOR EACH STORED STATUS.
 *
 * ── MATCHING THAI: BOUNDARIES, NOT SUBSTRINGS ───────────────────────────────
 * Thai negates by PREFIX and compounds by suffix, with no word separator. So
 * 'ไม่สำเร็จ' CONTAINS 'สำเร็จ' and 'ยกเลิกการสมัคร' CONTAINS 'ยกเลิก' — a bare
 * `includes('ยกเลิก')` cannot tell the ยกเลิก status badge from the
 * ยกเลิกการสมัคร action button, and would report the button present on a screen
 * that only shows the badge. Every assertion below matches ELEMENT TEXT
 * BOUNDARIES — `>label<` — so the match ends where the element does.
 *
 * ── NO REACT ROOT ───────────────────────────────────────────────────────────
 * renderToStaticMarkup only. `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none') and once broke
 * twenty-eight of them. The edit FORMS are behind `editSection`, which a click
 * sets and this tier cannot reach — so what is asserted here is which
 * AFFORDANCES render, which is exactly the claim.
 */

const LABEL = buildStatusLabels();

/** `>text<` — the whole text content of an element, so a prefix cannot match. */
const showsExactly = (markup, text) => markup.includes(`>${text}<`);

/** How many elements have exactly this text content. */
function countExactly(markup, text) {
  return markup.split(`>${text}<`).length - 1;
}

const BASE_DOC = {
  _id: '68a1b2c3d4e5f60718293a4b',
  courseName: 'Excel Advanced',
  courseCode: 'EXC-201',
  classId: 'class-1',
  classDate: '20 ส.ค. 2568',
  scheduleType: 'classroom',
  attendanceMode: 'classroom',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678', isAttending: true },
  attendeesListProvided: true,
  attendeesCount: 1,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' }],
  requestInvoice: false,
  invoice: null,
  notes: '',
  createdAt: '2025-08-01T03:00:00.000Z',
  updatedAt: '2025-08-02T03:00:00.000Z',
};

const html = (status, extra = {}) =>
  renderToStaticMarkup(createElement(RegistrationDetailClient, { doc: { ...BASE_DOC, status, ...extra } }));

const cancelled = html('cancelled');
const paid      = html('paid', { payment: { method: 'promptpay', omiseStatus: 'successful', omiseChargeId: 'chrg_test_1', paidAt: '2025-08-02T03:00:00.000Z' } });
const pending   = html('pending');
const confirmed = html('confirmed');

// ── 1. A cancelled record offers nothing to edit ────────────────────────────

test('a cancelled document renders NO แก้ไข control', () => {
  assert.equal(countExactly(cancelled, 'แก้ไข'), 0, 'a cancelled record must offer no edit affordance');
});

test('a cancelled document renders NO status action button', () => {
  for (const label of ['ยกเลิกการสมัคร', 'บันทึกส่งใบเสนอราคาแล้ว', 'คืนสถานะ รอดำเนินการ']) {
    assert.ok(!showsExactly(cancelled, label), `cancelled must not offer "${label}"`);
  }
});

test('a cancelled document still renders the delete control', () => {
  // The ruling: delete is a different permission from edit, and it is the only
  // way to clear a wrongly-cancelled row now that cancellation is terminal.
  assert.ok(cancelled.includes('ลบใบสมัครนี้'), 'delete must survive the read-only state');
});

test('a cancelled document says WHY the controls are gone', () => {
  // Without this line, five cards with no buttons read as a broken page.
  assert.match(cancelled, /ใบสมัครนี้ถูกยกเลิกแล้ว/);
  assert.match(cancelled, /ยังลบได้/, 'the copy must say delete is still available');
});

test('the cancelled badge renders — the page did not simply fail to draw', () => {
  // CONTROL for all four above: if the component had thrown or short-circuited,
  // every "no button" assertion would pass on an empty string.
  assert.ok(showsExactly(cancelled, LABEL.cancelled), 'the ยกเลิก badge is missing — did the page render at all?');
  assert.ok(cancelled.includes('Excel Advanced'), 'the record content is missing');
  assert.ok(cancelled.length > 2000, 'the markup is too short to be the real page');
});

// ── 2. A paid record is editable, and can only be cancelled ─────────────────

test('a paid document renders the edit controls', () => {
  // The ruling: `paid` locks the STATUS FIELD ONLY. Attendees, the coordinator,
  // the invoice and the notes all stay editable — those are exactly what needs
  // correcting after money arrives.
  assert.equal(countExactly(paid, 'แก้ไข'), 5, 'all five editable cards keep their แก้ไข button');
});

test('a paid document renders exactly ONE status action, and it is cancel', () => {
  assert.equal(countExactly(paid, 'ยกเลิกการสมัคร'), 1);
  assert.deepEqual(allowedTransitions('paid'), ['cancelled'], 'the table agrees with the screen');
});

test('THE RETIRED ACTION: บันทึกชำระแล้ว is gone from every status', () => {
  // It disappeared with `confirmed → paid`. Only Omise writes `paid`; an admin
  // asserting it by hand is the whole thing the transition table forbids.
  for (const [name, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    assert.ok(!markup.includes('บันทึกชำระแล้ว'), `the paid action is back on a ${name} record`);
  }
});

test('THE RETIRED ACTION: nothing offers a way out of cancelled', () => {
  for (const [name, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    assert.ok(!markup.includes('คืนสถานะ'), `an un-cancel action is back on a ${name} record`);
  }
});

// ── 3. The other two states, so the assertions above are about STATUS ───────

test('a pending document offers both of its transitions', () => {
  assert.equal(countExactly(pending, 'บันทึกส่งใบเสนอราคาแล้ว'), 1);
  assert.equal(countExactly(pending, 'ยกเลิกการสมัคร'), 1);
  assert.deepEqual(allowedTransitions('pending'), ['confirmed', 'cancelled']);
});

test('a confirmed document offers only cancel', () => {
  assert.equal(countExactly(confirmed, 'บันทึกส่งใบเสนอราคาแล้ว'), 0, 'confirmed → confirmed is not a move');
  assert.equal(countExactly(confirmed, 'ยกเลิกการสมัคร'), 1);
});

/**
 * THE BUTTONS ARE A PROJECTION OF THE TABLE.
 *
 * Not "pending has two buttons" — that is a symptom and a hard-coded map would
 * satisfy it. This walks every status and asserts the rendered action count
 * equals `allowedTransitions(status).length`, so the screen and the module
 * cannot disagree for any state.
 */
test('for EVERY status, the rendered actions match the transition table', () => {
  const ACTION_TEXT = { confirmed: 'บันทึกส่งใบเสนอราคาแล้ว', cancelled: 'ยกเลิกการสมัคร' };
  for (const [status, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    const expected = allowedTransitions(status);
    const rendered = Object.entries(ACTION_TEXT)
      .filter(([, text]) => showsExactly(markup, text))
      .map(([target]) => target);
    assert.deepEqual(rendered, expected, `${status}: the screen offers ${rendered} but the table permits ${expected}`);
  }
});

/**
 * NO STATUS BUTTON RENDERS EMPTY — the failure a text scan cannot see.
 *
 * Measured, not imagined. Re-introducing the old hand-written STATUS_ACTIONS
 * map as a deliberate break made the client offer targets (`paid`, `pending`)
 * that ACTION_LABEL no longer names, so `{ACTION_LABEL[next]}` rendered
 * `undefined` — a real, clickable, textless button that fires a status change.
 * Every assertion above stayed green, because a button with no text matches no
 * text. This is the one that would have noticed.
 */
test('no button renders with empty content, on any status', () => {
  for (const [status, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    assert.ok(
      !/<button[^>]*>\s*<\/button>/.test(markup),
      `${status}: a button rendered with no content — an unlabelled action`
    );
  }
});

// ── 4. The relabel reaches the screen ───────────────────────────────────────

test('`confirmed` renders as ส่งใบเสนอราคาแล้ว, not ยืนยันแล้ว', () => {
  assert.ok(showsExactly(confirmed, 'ส่งใบเสนอราคาแล้ว'), 'the new label is on the badge');
  assert.ok(!confirmed.includes('ยืนยันแล้ว'), 'the old label survives somewhere in the page');
});

test('CONTROL: the boundary match can tell the badge from the button', () => {
  // Proves the `>text<` technique is doing real work rather than passing by
  // luck. 'ยกเลิกการสมัคร' contains 'ยกเลิก'; a bare substring test cannot
  // separate them, and a boundary test can.
  const sample = '<span>ยกเลิก</span><button>ยกเลิกการสมัคร</button>';
  assert.ok(sample.includes('ยกเลิก'), 'the substring appears twice over');
  assert.equal(countExactly(sample, 'ยกเลิก'), 1, 'but exactly one element IS the bare word');
  assert.equal(countExactly(sample, 'ยกเลิกการสมัคร'), 1);
  // And on the real page: the cancelled badge is present while the action is not.
  assert.ok(showsExactly(cancelled, 'ยกเลิก') && !showsExactly(cancelled, 'ยกเลิกการสมัคร'));
});
