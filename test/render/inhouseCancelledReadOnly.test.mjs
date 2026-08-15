import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import {
  INHOUSE_STATUS_TRANSITIONS,
  INHOUSE_STATUS_VALUES,
  INHOUSE_LEGACY_STATUS_MAP,
  allowedTransitions,
  effectiveStatus,
  statusLabel,
} from '@/lib/registrations/statuses';

/**
 * WHAT THE ADMIN CAN ACT ON, AS RENDERED, FOR EACH STORED IN-HOUSE STATUS.
 *
 * The in-house twin of render/registrationCancelledReadOnly, and it exists
 * because round 1's cancellation lock was PUBLIC ONLY — in-house had no
 * `cancelled` to apply it to, and now it does.
 *
 * ── MATCHING THAI: BOUNDARIES, NOT SUBSTRINGS ───────────────────────────────
 * Thai negates by PREFIX and compounds by suffix, with no word separator. So
 * 'ไม่สำเร็จ' CONTAINS 'สำเร็จ', and 'ยกเลิกคำขอ' CONTAINS 'ยกเลิก' — a bare
 * `includes('ยกเลิก')` cannot tell the ยกเลิก status badge from the ยกเลิกคำขอ
 * action button, and would report the button present on a screen that only
 * shows the badge. Every assertion below matches ELEMENT TEXT BOUNDARIES —
 * `>label<` — so the match ends where the element does.
 *
 * ── NO REACT ROOT ───────────────────────────────────────────────────────────
 * renderToStaticMarkup only. `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none') and once broke
 * twenty-eight of them. The notes TEXTAREA is behind `editingNotes`, which a
 * click sets and this tier cannot reach — so what is asserted here is which
 * AFFORDANCES render, which is exactly the claim.
 */

/** `>text<` — the whole text content of an element, so a prefix cannot match. */
const showsExactly = (markup, text) => markup.includes(`>${text}<`);

/** How many elements have exactly this text content. */
function countExactly(markup, text) {
  return markup.split(`>${text}<`).length - 1;
}

const BASE_DOC = {
  _id: '68a1b2c3d4e5f60718293a4b',
  companyName: 'บริษัท ทดสอบ จำกัด',
  quotationCompany: 'บริษัท ทดสอบ จำกัด',
  contactFirstName: 'สมชาย',
  contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.com',
  contactPhone: '0812345678',
  coursesInterested: ['EXC-201'],
  participantsCount: 20,
  contentMode: 'standard',
  trainingFormat: 'onsite',
  preferredMonth: '2026-09',
  quotationCountry: 'TH',
  branchType: 'head_office',
  branchCode: '',
  adminNotes: 'คุยกับลูกค้าแล้ว',
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

const html = (status, extra = {}) =>
  renderToStaticMarkup(createElement(InhouseDetailClient, {
    doc: { ...BASE_DOC, status, ...extra },
    courses: [{ code: 'EXC-201', name: 'Excel Advanced' }],
  }));

const cancelled = html('cancelled');
const pending   = html('pending');
const quoted    = html('quoted');

// ── 1. A cancelled request offers nothing to edit ───────────────────────────

test('a cancelled in-house request renders NO แก้ไข control', () => {
  assert.equal(countExactly(cancelled, 'แก้ไข'), 0,
    'a cancelled request must offer no edit affordance');
});

test('a cancelled in-house request renders NO status action button', () => {
  for (const label of ['ส่งใบเสนอราคา', 'ยกเลิกคำขอ']) {
    assert.ok(!showsExactly(cancelled, label), `cancelled must not offer "${label}"`);
  }
});

test('a cancelled in-house request still renders the delete control', () => {
  // The ruling: delete is a different permission from edit, and it is the only
  // way to clear a wrongly-cancelled row now that cancellation is terminal.
  assert.ok(cancelled.includes('ลบ Request นี้'), 'delete must survive the read-only state');
});

test('a cancelled in-house request says WHY the controls are gone', () => {
  // Without this line a card with no button reads as a broken page.
  assert.match(cancelled, /คำขอนี้ถูกยกเลิกแล้ว/);
  assert.match(cancelled, /ยังลบได้/, 'the copy must say delete is still available');
});

test('the cancelled badge renders — the page did not simply fail to draw', () => {
  // CONTROL for all four above: if the component had thrown or short-circuited,
  // every "no button" assertion would pass on an empty string.
  assert.ok(showsExactly(cancelled, statusLabel('cancelled')),
    'the ยกเลิก badge is missing — did the page render at all?');
  assert.ok(cancelled.includes('Excel Advanced'), 'the record content is missing');
  assert.ok(cancelled.length > 2000, 'the markup is too short to be the real page');
});

// ── 2. The other two states, so the assertions above are about STATUS ───────

test('a pending request offers both of its transitions', () => {
  assert.equal(countExactly(pending, 'ส่งใบเสนอราคา'), 1);
  assert.equal(countExactly(pending, 'ยกเลิกคำขอ'), 1);
  assert.deepEqual(allowedTransitions('pending', INHOUSE_STATUS_TRANSITIONS), ['quoted', 'cancelled']);
});

test('a quoted request offers only cancel', () => {
  assert.equal(countExactly(quoted, 'ส่งใบเสนอราคา'), 0, 'quoted → quoted is not a move');
  assert.equal(countExactly(quoted, 'ยกเลิกคำขอ'), 1);
});

test('a pending request keeps its edit control', () => {
  // The other side of the read-only assertion — without it, "no แก้ไข when
  // cancelled" would pass on a screen that never renders one at all.
  assert.equal(countExactly(pending, 'แก้ไข'), 1, 'the admin-notes card lost its edit button');
});

/**
 * THE BUTTONS ARE A PROJECTION OF THE TABLE.
 *
 * Not "pending has two buttons" — that is a symptom and a hard-coded map would
 * satisfy it. This walks every status and asserts the rendered action set
 * equals `allowedTransitions(status)`, so the screen and the module cannot
 * disagree for any state.
 */
test('for EVERY in-house status, the rendered actions match the transition table', () => {
  const ACTION_TEXT = { quoted: 'ส่งใบเสนอราคา', cancelled: 'ยกเลิกคำขอ' };
  for (const status of INHOUSE_STATUS_VALUES) {
    const markup = html(status);
    const expected = allowedTransitions(status, INHOUSE_STATUS_TRANSITIONS);
    const rendered = Object.entries(ACTION_TEXT)
      .filter(([, text]) => showsExactly(markup, text))
      .map(([target]) => target);
    assert.deepEqual(rendered, expected,
      `${status}: the screen offers ${rendered} but the table permits ${expected}`);
  }
});

// ── 3. THE RETIRED ACTIONS ARE GONE ─────────────────────────────────────────

/**
 * ── SCOPED TO BUTTONS, BECAUSE ONE RETIRED ACTION SHARES ITS TEXT WITH A
 *    LEGACY BADGE ─────────────────────────────────────────────────────────
 *
 * MEASURED, not anticipated. The first version of this test forbade the string
 * 'ปิดงานสำเร็จ' anywhere in the markup and went red on a completely correct
 * page: a `closed-won` document renders that text in its BADGE, because it is
 * the legacy label and rendering it is the whole point of the legacy map.
 *
 * Element-boundary matching does not separate them either — the two strings are
 * byte-identical, so `>ปิดงานสำเร็จ<` matches both. What distinguishes them is
 * the ELEMENT: an action is a `<button>` (the Button component renders one) and
 * a badge is a `<span>`. So the matcher closes on `</button>`.
 *
 * This is the same class of mistake as matching Thai by substring, one level
 * up: the text is not the thing, the element is.
 */
const showsAsButton = (markup, text) => markup.includes(`>${text}</button>`);

test('THE RETIRED ACTIONS: the five-value toolbar is gone from every status', () => {
  // These were the buttons of the old vocabulary. `คืนสถานะ "ใหม่"` is the one
  // that matters most: it un-cancelled a record, and cancellation is terminal
  // on both sides now.
  const retired = ['บันทึกว่าติดต่อแล้ว', 'ปิดงานสำเร็จ', 'ปิดงาน — ไม่สำเร็จ', 'คืนสถานะ "ใหม่"'];
  for (const status of [...INHOUSE_STATUS_VALUES, ...Object.keys(INHOUSE_LEGACY_STATUS_MAP)]) {
    const markup = html(status);
    for (const label of retired) {
      assert.ok(!showsAsButton(markup, label), `${status}: the retired action "${label}" is back`);
    }
  }
});

test('CONTROL: the button matcher tells a legacy BADGE from a retired ACTION', () => {
  // Proves the scoping above does real work. On a closed-won record the text
  // 'ปิดงานสำเร็จ' IS present — as the badge — and the test above must still
  // pass. If the matcher stopped discriminating, this is the line that says so.
  const closedWon = html('closed-won');
  assert.ok(closedWon.includes('ปิดงานสำเร็จ'),
    'the legacy badge label is missing — the control is inert and the test above is vacuous');
  assert.ok(!showsAsButton(closedWon, 'ปิดงานสำเร็จ'),
    'the text is present as a BUTTON, not just as a badge');
  // And the matcher does find a real button on the same page.
  assert.ok(showsAsButton(closedWon, 'ยกเลิกคำขอ'),
    'the matcher found no button at all — it is not discriminating, it is blind');
});

/**
 * NO STATUS BUTTON RENDERS EMPTY — the failure a text scan cannot see.
 *
 * MEASURED IN ROUND 1, NOT IMAGINED. On the public client, re-introducing the
 * hand-written STATUS_ACTIONS map as a deliberate break made it offer targets
 * that ACTION_LABEL no longer named, so `{ACTION_LABEL[next]}` rendered
 * `undefined` — a real, clickable, textless button that fires a status change.
 * Every text assertion stayed green, because a button with no text matches no
 * text. That defect was found by a control, not by review, and this extends the
 * guard to the in-house client where the same two maps exist.
 */
test('no in-house button renders with empty content, on any status', () => {
  for (const status of [...INHOUSE_STATUS_VALUES, ...Object.keys(INHOUSE_LEGACY_STATUS_MAP)]) {
    const markup = html(status);
    assert.ok(
      !/<button[^>]*>\s*<\/button>/.test(markup),
      `${status}: a button rendered with no content — an unlabelled action`
    );
  }
});

// ── 4. UNMIGRATED DOCUMENTS STILL WORK ──────────────────────────────────────

/**
 * A document the migration has not reached yet holds a RETIRED value, which has
 * no row in the three-value table. `allowedTransitions('new')` is [], so
 * without `effectiveStatus` the screen would render a toolbar with nothing in
 * it — for the entire backlog, until someone ran a script.
 *
 * This is the window between the code deploying and `--apply` being run, and it
 * is deliberate that the two are separate decisions. The product has to keep
 * working across it.
 */
test('an unmigrated request offers the transitions of the status it becomes', () => {
  for (const [retired, live] of Object.entries(INHOUSE_LEGACY_STATUS_MAP)) {
    const markup = html(retired);
    const ACTION_TEXT = { quoted: 'ส่งใบเสนอราคา', cancelled: 'ยกเลิกคำขอ' };
    const expected = allowedTransitions(live, INHOUSE_STATUS_TRANSITIONS);
    const rendered = Object.entries(ACTION_TEXT)
      .filter(([, text]) => showsExactly(markup, text))
      .map(([target]) => target);
    assert.deepEqual(rendered, expected,
      `a stored ${retired} behaves as ${live}, so it should offer ${expected}`);
  }
});

test('an unmigrated request shows the status it ACTUALLY holds, not the one it becomes', () => {
  // The badge must not go through `effectiveStatus`. Rendering a `new` enquiry
  // as 'รอดำเนินการ' would be the screen quietly asserting the migration had
  // run. What the record says and what may be done to it are two questions.
  const markup = html('new');
  assert.ok(showsExactly(markup, statusLabel('new')), 'the badge lost the stored value');
  assert.ok(!showsExactly(markup, statusLabel('pending')),
    'the badge shows the migrated label — the screen is asserting a migration that has not run');
});

test('a `closed-lost` request is read-only — it behaves as the cancelled it becomes', () => {
  const markup = html('closed-lost');
  assert.equal(countExactly(markup, 'แก้ไข'), 0, 'a closed-lost request must offer no edit affordance');
  assert.match(markup, /คำขอนี้ถูกยกเลิกแล้ว/);
  assert.ok(markup.includes('ลบ Request นี้'), 'delete must survive');
});

test('CONTROL: effectiveStatus is what makes those four cases differ', () => {
  // Proves the three tests above are about the mapping rather than about a
  // coincidence. Each retired value must resolve to a DIFFERENT live status
  // than the identity would give, and identity must hold for live values.
  for (const [retired, live] of Object.entries(INHOUSE_LEGACY_STATUS_MAP)) {
    assert.equal(effectiveStatus(retired, 'inhouse'), live);
    assert.notEqual(effectiveStatus(retired, 'inhouse'), retired,
      'the control is inert — a retired value maps to itself');
  }
  for (const live of INHOUSE_STATUS_VALUES) {
    assert.equal(effectiveStatus(live, 'inhouse'), live, 'a live status must be unchanged');
  }
});

test('CONTROL: the boundary match can tell the badge from the button', () => {
  // Proves the `>text<` technique is doing real work rather than passing by
  // luck. 'ยกเลิกคำขอ' contains 'ยกเลิก'; a bare substring test cannot separate
  // them, and a boundary test can.
  const sample = '<span>ยกเลิก</span><button>ยกเลิกคำขอ</button>';
  assert.ok(sample.includes('ยกเลิก'), 'the substring appears twice over');
  assert.equal(countExactly(sample, 'ยกเลิก'), 1, 'but exactly one element IS the bare word');
  assert.equal(countExactly(sample, 'ยกเลิกคำขอ'), 1);
  // And on the real page: the cancelled badge is present while the action is not.
  assert.ok(showsExactly(cancelled, 'ยกเลิก') && !showsExactly(cancelled, 'ยกเลิกคำขอ'));
});
