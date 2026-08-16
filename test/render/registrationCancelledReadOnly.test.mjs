import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { allowedTransitions, buildStatusLabels } from '@/lib/registrations/statuses';

/**
 * WHAT THE ADMIN CAN ACT ON, AS RENDERED, FOR EACH STORED STATUS.
 *
 * ── ROUND 4 RE-POINTED EVERY ASSERTION IN THIS FILE ONTO A NEW SURFACE ──────
 *
 * The claims are round 1's and none of them was relaxed. What changed underneath
 * them is the SHAPE of the action group: there is now a 100x38 primary button
 * and a 39x38 "•••" menu, and the permitted moves are split between them by
 * asking the transition table which targets are terminal.
 *
 * So "is this action offered" is no longer answerable by scanning the page for a
 * string — the same move can appear as the button's SHORT label or as the menu's
 * canonical one, and a `>text<` scan cannot tell either from the status BADGE,
 * which for `cancelled` is byte-identical to the button's short form 'ยกเลิก'.
 *
 * Every assertion is therefore ELEMENT-SCOPED now: the primary button is
 * extracted by the class carrying its measured width, the menu items by
 * `role="menuitem"`, and the comparison is EQUALITY on stripped text rather than
 * `includes`. That is strictly stronger than the boundary matching it replaces —
 * a boundary match still compares text found anywhere on the page, and this
 * compares text found in the control the claim is about.
 *
 * ── MATCHING THAI: BOUNDARIES, NOT SUBSTRINGS ───────────────────────────────
 * Thai negates by PREFIX and compounds by suffix, with no word separator. So
 * 'ไม่สำเร็จ' CONTAINS 'สำเร็จ' and 'ยกเลิกการสมัคร' CONTAINS 'ยกเลิก' — a bare
 * `includes('ยกเลิก')` cannot tell the ยกเลิก status name from the
 * ยกเลิกการสมัคร action, and would report the action present on a screen that
 * only shows the name. Where an assertion below still matches text rather than
 * an element, it matches ELEMENT TEXT BOUNDARIES — `>label<` — so the match ends
 * where the element does.
 *
 * ── NO REACT ROOT ───────────────────────────────────────────────────────────
 * renderToStaticMarkup only. `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none') and once broke
 * twenty-eight of them. The edit FORMS are behind `editSection`, which a click
 * sets and this tier cannot reach — so what is asserted here is which
 * AFFORDANCES render, which is exactly the claim.
 *
 * THE MENU IS REACHABLE FROM HERE and that is deliberate on the component's
 * side: its items are always in the DOM with the `hidden` attribute rather than
 * conditionally rendered, precisely so that DELETE — the one control a cancelled
 * record has left — is not behind a click no assertion can perform.
 */

const LABEL = buildStatusLabels();

/** `>text<` — the whole text content of an element, so a prefix cannot match. */
const showsExactly = (markup, text) => markup.includes(`>${text}<`);

/** How many elements have exactly this text content. */
function countExactly(markup, text) {
  return markup.split(`>${text}<`).length - 1;
}

/** The visible text of a fragment of markup, tags removed. */
const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * The primary action button's inner markup, or null when the slot is empty.
 *
 * Located by `w-[100px]`, the measured width from the geometry — it is on no
 * other element in this render, and keying on it means the probe follows the
 * button rather than the wording, which is the half that changes.
 */
function primaryButton(markup) {
  const m = /<button[^>]*w-\[100px\][^>]*>([\s\S]*?)<\/button>/.exec(markup);
  return m ? m[1] : null;
}

/**
 * Every item of the STATUS BAR's overflow menu, in order.
 *
 * ── SCOPED IN ROUND 5, AND THE SCOPING IS THE POINT ───────────────────────
 * `role="menuitem"` was unique to the status bar until the attendee table grew a
 * per-row "•••". It is not any more: a fully-populated attendee renders two more
 * menu items, so an unscoped probe reported four items for the status bar and
 * every deepEqual against it went red on correct code.
 *
 * That is the measured version of a probe that was right by accident. It is
 * bounded to the status card — the 87px element — and stops at the summary strip
 * that follows it, so it reads the menu the claim is about and nothing else.
 */
function statusBarRegion(markup) {
  const start = markup.indexOf('h-[87px]');
  assert.notEqual(start, -1, 'no status bar in the render — the marker class has changed');
  const end = markup.indexOf('h-[93px]', start);
  assert.notEqual(end, -1, 'the status bar is not followed by the summary strip — the probe would over-read');
  return markup.slice(start, end);
}

function menuItems(markup) {
  return [...statusBarRegion(markup).matchAll(/<button[^>]*role="menuitem"[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => m[1]);
}

/** Every menu item ANYWHERE on the page — the status bar's and the rows'. */
function allMenuItems(markup) {
  return [...markup.matchAll(/<button[^>]*role="menuitem"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
}

/**
 * The targets the screen OFFERS, whichever slot they are in.
 *
 * The two maps are the component's, written out here because a test that
 * imported them could not tell a screen that renders nothing from a screen whose
 * maps are empty.
 */
const ACTION_BUTTON = { confirmed: 'บันทึกส่งแล้ว',            cancelled: 'ยกเลิก' };
const ACTION_MENU   = { confirmed: 'บันทึกส่งใบเสนอราคาแล้ว', cancelled: 'ยกเลิกการสมัคร' };

function offeredTargets(markup) {
  const primary = primaryButton(markup);
  const primaryText = primary === null ? null : textOf(primary);
  const menu = menuItems(markup).map(textOf);
  return Object.keys(ACTION_MENU).filter((target) =>
    primaryText === ACTION_BUTTON[target] || menu.includes(ACTION_MENU[target]));
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
  // BOTH SLOTS. The primary is empty and the menu holds no status move — only
  // delete, which is a different permission and is asserted separately below.
  assert.equal(primaryButton(cancelled), null, 'a cancelled record must offer no primary action');
  assert.deepEqual(offeredTargets(cancelled), [], 'a cancelled record must offer no status move at all');
  // And the retired wordings, by name, in case a slot is added that neither
  // probe above knows about.
  for (const label of ['ยกเลิกการสมัคร', 'บันทึกส่งใบเสนอราคาแล้ว', 'บันทึกส่งแล้ว', 'คืนสถานะ รอดำเนินการ']) {
    assert.ok(!showsExactly(cancelled, label), `cancelled must not offer "${label}"`);
  }
});

test('a cancelled document still renders the delete control', () => {
  // The ruling: delete is a different permission from edit, and it is the only
  // way to clear a wrongly-cancelled row now that cancellation is terminal.
  //
  // RE-POINTED, NOT WEAKENED. Delete has moved into the "•••" menu, so the claim
  // is now that it is an ITEM OF THAT MENU rather than merely a string somewhere
  // on the page — which is what a reader can actually reach.
  assert.ok(menuItems(cancelled).map(textOf).includes('ลบใบสมัครนี้'),
    'delete must survive the read-only state, as a menu item');
  assert.ok(cancelled.includes('ลบใบสมัครนี้'), 'delete must survive the read-only state');
});

test('a cancelled document says WHY the controls are gone', () => {
  // Without this line, five cards with no buttons read as a broken page. The
  // copy is verbatim round 1's; what changed is WHERE it sits — it is the status
  // bar's description now, which is the line describing the state it is about.
  assert.match(cancelled, /ใบสมัครนี้ถูกยกเลิกแล้ว/);
  assert.match(cancelled, /ยังลบได้/, 'the copy must say delete is still available');
});

test('the cancelled status name renders — the page did not simply fail to draw', () => {
  // CONTROL for all four above: if the component had thrown or short-circuited,
  // every "no button" assertion would pass on an empty string.
  assert.ok(showsExactly(cancelled, LABEL.cancelled), 'the ยกเลิก status name is missing — did the page render at all?');
  assert.ok(cancelled.includes('Excel Advanced'), 'the record content is missing');
  assert.ok(cancelled.length > 2000, 'the markup is too short to be the real page');
});

// ── 2. A paid record is editable, and can only be cancelled ─────────────────

test('a paid document renders the edit controls', () => {
  // The ruling: `paid` locks the STATUS FIELD ONLY. Attendees, the coordinator,
  // the invoice and the notes all stay editable — those are exactly what needs
  // correcting after money arrives.
  //
  // Still five: the attendee card moved to its own TAB rather than out of the
  // page, and every panel is in the markup with the inactive ones `hidden`.
  assert.equal(countExactly(paid, 'แก้ไข'), 5, 'all five editable cards keep their แก้ไข button');
});

test('a paid document renders exactly ONE status action, and it is cancel', () => {
  assert.deepEqual(offeredTargets(paid), ['cancelled']);
  assert.deepEqual(allowedTransitions('paid'), ['cancelled'], 'the table agrees with the screen');
  // And it is in the MENU, not the button: `cancelled` is terminal, so the
  // derivation demotes it. The primary slot is empty rather than holding an
  // unlabelled or disabled control.
  assert.equal(primaryButton(paid), null, 'cancellation must not be the primary action');
  assert.ok(menuItems(paid).map(textOf).includes('ยกเลิกการสมัคร'));
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
  assert.deepEqual(offeredTargets(pending), ['confirmed', 'cancelled']);
  assert.deepEqual(allowedTransitions('pending'), ['confirmed', 'cancelled']);
  // The forward move is the PRIMARY button and the cancellation is in the menu —
  // which is the slot claim, and it is derived rather than named. See
  // fs/registrationActionsDerived.
  assert.equal(textOf(primaryButton(pending)), 'บันทึกส่งแล้ว');
  assert.deepEqual(menuItems(pending).map(textOf), ['ยกเลิกการสมัคร', 'ลบใบสมัครนี้']);
});

test('a confirmed document offers only cancel', () => {
  assert.deepEqual(offeredTargets(confirmed), ['cancelled'], 'confirmed → confirmed is not a move');
  assert.equal(primaryButton(confirmed), null, 'confirmed has no ordinary next step in the system');
});

/**
 * THE BUTTONS ARE A PROJECTION OF THE TABLE.
 *
 * Not "pending has two buttons" — that is a symptom and a hard-coded map would
 * satisfy it. This walks every status and asserts the rendered action set equals
 * `allowedTransitions(status)`, so the screen and the module cannot disagree for
 * any state. Unchanged in substance from round 1; `offeredTargets` reads two
 * slots where it used to read one.
 */
test('for EVERY status, the rendered actions match the transition table', () => {
  for (const [status, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    assert.deepEqual(offeredTargets(markup), allowedTransitions(status),
      `${status}: the screen offers ${offeredTargets(markup)} but the table permits ${allowedTransitions(status)}`);
  }
});

/**
 * NO STATUS BUTTON RENDERS EMPTY — the failure a text scan cannot see.
 *
 * Measured, not imagined. Re-introducing the old hand-written STATUS_ACTIONS
 * map as a deliberate break made the client offer targets (`paid`, `pending`)
 * that ACTION_LABEL no longer named, so `{ACTION_LABEL[next]}` rendered
 * `undefined` — a real, clickable, textless button that fires a status change.
 * Every assertion above stayed green, because a button with no text matches no
 * text. This is the one that would have noticed.
 *
 * ── CARRIED ONTO THE NEW SURFACE, AND WIDENED ──────────────────────────────
 * There are now THREE ways to render a textless control here rather than one: an
 * unlabelled primary button (ACTION_SHORT missing a target), an unlabelled menu
 * item (ACTION_LABEL missing one), and the "•••" trigger itself, whose only
 * child is an icon and which would be `<button …></button>` were it not for its
 * screen-reader text. The whole-page regex catches all three; the two assertions
 * after it name the action group specifically, because that is where the defect
 * was found twice and a page-wide regex is satisfied by a page with no buttons.
 */
test('no button renders with empty content, on any status', () => {
  for (const [status, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    assert.ok(
      !/<button[^>]*>\s*<\/button>/.test(markup),
      `${status}: a button rendered with no content — an unlabelled action`
    );
  }
});

test('every control in the action group has TEXT, not just an icon', () => {
  for (const [status, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    const primary = primaryButton(markup);
    if (primary !== null) {
      assert.ok(textOf(primary).length > 0, `${status}: the primary button rendered with no text`);
    }
    // EVERY menu on the page, not only the status bar's: the attendee table's
    // per-row "•••" is a THIRD producer of menu items and the empty-content
    // defect has now been found by a control in rounds 1, 2 and 4.
    for (const item of allMenuItems(markup)) {
      assert.ok(textOf(item).length > 0, `${status}: an overflow menu item rendered with no text`);
    }
    // The "•••" trigger has an icon and nothing else visible, so its accessible
    // name comes from screen-reader-only text. Without it the control is
    // announced as nothing at all.
    const trigger = /<button[^>]*aria-haspopup="menu"[^>]*>([\s\S]*?)<\/button>/.exec(markup);
    assert.ok(trigger, `${status}: the overflow trigger is gone`);
    assert.ok(textOf(trigger[1]).length > 0, `${status}: the overflow trigger has no accessible text`);
  }
});

test('the overflow menu is NEVER empty, on any status', () => {
  // Including `cancelled`, which has no status moves left. Delete is what keeps
  // it populated, and a "•••" that opens onto nothing is a control that lies.
  for (const [status, markup] of Object.entries({ pending, confirmed, paid, cancelled })) {
    assert.ok(menuItems(markup).length > 0, `${status}: the overflow menu rendered with no items`);
  }
});

// ── 4. The relabel reaches the screen ───────────────────────────────────────

test('`confirmed` renders as ส่งใบเสนอราคาแล้ว, not ยืนยันแล้ว', () => {
  assert.ok(showsExactly(confirmed, 'ส่งใบเสนอราคาแล้ว'), 'the new label is on the status bar');
  assert.ok(!confirmed.includes('ยืนยันแล้ว'), 'the old label survives somewhere in the page');
});

test('CONTROL: the element probes can tell the status NAME from the action', () => {
  /**
   * Proves the element scoping is doing real work rather than passing by luck,
   * and it is sharper than the round-1 version it replaces.
   *
   * On a cancelled record the status bar's NAME is 'ยกเลิก' — byte-identical to
   * the primary button's short label for the cancel action. A `>text<` boundary
   * match cannot separate those two at all; only the element can.
   */
  assert.ok(showsExactly(cancelled, 'ยกเลิก'), 'the bare word IS on the page, as the status name');
  assert.equal(primaryButton(cancelled), null, 'and it is NOT the primary button');
  assert.deepEqual(offeredTargets(cancelled), [], 'and no probe mistook it for the cancel action');

  // The probes are not simply blind: on a pending record they find both slots.
  assert.equal(textOf(primaryButton(pending)), 'บันทึกส่งแล้ว');
  assert.ok(menuItems(pending).length >= 2);

  // And the boundary helper still discriminates where it is used above.
  const sample = '<span>ยกเลิก</span><button>ยกเลิกการสมัคร</button>';
  assert.ok(sample.includes('ยกเลิก'), 'the substring appears twice over');
  assert.equal(countExactly(sample, 'ยกเลิก'), 1, 'but exactly one element IS the bare word');
  assert.equal(countExactly(sample, 'ยกเลิกการสมัคร'), 1);
});
