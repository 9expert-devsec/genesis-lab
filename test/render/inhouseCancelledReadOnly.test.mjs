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

/**
 * ── ROUND 4: THE ACTION GROUP HAS TWO SLOTS, SO THE PROBES ARE ELEMENTS ────
 *
 * A permitted move now renders either as the 100x38 primary button's SHORT label
 * or as an item of the "•••" menu carrying the canonical one. A `>text<` scan
 * cannot tell either from the status NAME — for `cancelled` the name and the
 * button's short label are byte-identical — so the assertions that are about
 * WHICH MOVES ARE OFFERED read the controls rather than the page.
 *
 * That is strictly stronger than the boundary matching it replaces: a boundary
 * match still finds text anywhere on the page, and this finds text inside the
 * control the claim is about.
 */
const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Located by `w-[100px]`, the measured width — on no other element here. */
function primaryButton(markup) {
  const m = /<button[^>]*w-\[100px\][^>]*>([\s\S]*?)<\/button>/.exec(markup);
  return m ? m[1] : null;
}

function menuItems(markup) {
  return [...markup.matchAll(/<button[^>]*role="menuitem"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
}

const ACTION_BUTTON = { quoted: 'ส่งใบเสนอฯ',    cancelled: 'ยกเลิก' };
const ACTION_MENU   = { quoted: 'ส่งใบเสนอราคา', cancelled: 'ยกเลิกคำขอ' };

function offeredTargets(markup) {
  const primary = primaryButton(markup);
  const primaryText = primary === null ? null : textOf(primary);
  const menu = menuItems(markup).map(textOf);
  return Object.keys(ACTION_MENU).filter((target) =>
    primaryText === ACTION_BUTTON[target] || menu.includes(ACTION_MENU[target]));
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
  // BOTH SLOTS. The primary is empty and the menu holds no status move — only
  // delete, which is a different permission and is asserted separately below.
  assert.equal(primaryButton(cancelled), null, 'a cancelled request must offer no primary action');
  assert.deepEqual(offeredTargets(cancelled), [], 'a cancelled request must offer no status move at all');
  for (const label of ['ส่งใบเสนอราคา', 'ส่งใบเสนอฯ', 'ยกเลิกคำขอ']) {
    assert.ok(!showsExactly(cancelled, label), `cancelled must not offer "${label}"`);
  }
});

test('a cancelled in-house request still renders the delete control', () => {
  // The ruling: delete is a different permission from edit, and it is the only
  // way to clear a wrongly-cancelled row now that cancellation is terminal.
  //
  // RE-POINTED, NOT WEAKENED. Delete has moved into the "•••" menu, so the claim
  // is that it is an ITEM OF THAT MENU rather than merely a string somewhere on
  // the page — which is what a reader can actually reach.
  assert.ok(menuItems(cancelled).map(textOf).includes('ลบ Request นี้'),
    'delete must survive the read-only state, as a menu item');
  assert.ok(cancelled.includes('ลบ Request นี้'), 'delete must survive the read-only state');
});

test('the in-house overflow menu is NEVER empty, and every control in it has TEXT', () => {
  /**
   * Including `cancelled`, which has no status moves left — delete is what keeps
   * the menu populated, and a "•••" that opens onto nothing is a control that
   * lies.
   *
   * The TEXT half is the round-1 empty-button defect carried onto a surface with
   * three new ways to produce one: an unlabelled primary (ACTION_SHORT missing a
   * target), an unlabelled menu item (ACTION_LABEL missing one), and the "•••"
   * trigger itself, whose only child is an icon.
   */
  for (const status of [...INHOUSE_STATUS_VALUES, ...Object.keys(INHOUSE_LEGACY_STATUS_MAP)]) {
    const markup = html(status);
    const items = menuItems(markup);
    assert.ok(items.length > 0, `${status}: the overflow menu rendered with no items`);
    for (const item of items) {
      assert.ok(textOf(item).length > 0, `${status}: an overflow menu item rendered with no text`);
    }
    const primary = primaryButton(markup);
    if (primary !== null) {
      assert.ok(textOf(primary).length > 0, `${status}: the primary button rendered with no text`);
    }
    const trigger = /<button[^>]*aria-haspopup="menu"[^>]*>([\s\S]*?)<\/button>/.exec(markup);
    assert.ok(trigger, `${status}: the overflow trigger is gone`);
    assert.ok(textOf(trigger[1]).length > 0, `${status}: the overflow trigger has no accessible text`);
  }
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
  assert.deepEqual(offeredTargets(pending), ['quoted', 'cancelled']);
  assert.deepEqual(allowedTransitions('pending', INHOUSE_STATUS_TRANSITIONS), ['quoted', 'cancelled']);
  // The forward move is the PRIMARY button and the cancellation is in the menu.
  // Which slot a target lands in is derived from the table — a target with no
  // outgoing edges of its own is demoted — see fs/registrationActionsDerived.
  assert.equal(textOf(primaryButton(pending)), 'ส่งใบเสนอฯ');
  assert.deepEqual(menuItems(pending).map(textOf), ['ยกเลิกคำขอ', 'ลบ Request นี้']);
});

test('a quoted request offers only cancel', () => {
  assert.deepEqual(offeredTargets(quoted), ['cancelled'], 'quoted → quoted is not a move');
  assert.equal(primaryButton(quoted), null, 'cancellation must not be the primary action');
  assert.ok(menuItems(quoted).map(textOf).includes('ยกเลิกคำขอ'));
});

/**
 * ── RE-POINTED, AND STRICTLY STRONGER THAN THE LINE IT REPLACES ─────────────
 *
 * It read `countExactly(pending, 'แก้ไข') === 1` — one button, the admin-notes
 * card's, because that was the only editable card on the screen. Its stated job
 * was to stop "no แก้ไข when cancelled" passing vacuously on a screen that
 * renders no edit control at all, and THAT JOB IS UNCHANGED AND STILL DONE:
 * a non-zero exact count still fails the moment the affordance disappears.
 *
 * What the number now additionally pins is the defect this round fixed. The
 * in-house screen displayed 25 allowlisted fields and could edit none of them,
 * and the old `=== 1` was GREEN throughout — it was satisfied by the one card
 * that worked, and said nothing about the five that did not. Six is therefore
 * not a looser constant than one; it is the same guard with the five missing
 * cards brought inside it.
 *
 * The count is spelled as a NAMED LIST rather than a bare 6 so a card removed
 * on purpose changes this list in the same commit, and one lost by accident
 * fails against a name a reader can act on.
 */
const EDITABLE_CARDS = [
  'ผู้ประสานงาน & บริษัท',
  'Training Requirement',
  'ตารางเวลา & รูปแบบการอบรม',
  'ข้อมูลใบเสนอราคา',
  'หมายเหตุจากลูกค้า',
];

/**
 * The notes card is NOT in the list above, and that is not a card losing its
 * edit control — it is a card that has nothing to edit.
 *
 * Internal notes became APPEND-ONLY. There is no แก้ไข because there is no
 * revision: what the card has instead is a COMPOSER, and the composer is gated
 * on exactly the same `readOnly` flag every แก้ไข is. So the cancellation lock
 * still covers it, in the shape the card actually has — asserted separately
 * below rather than folded into the แก้ไข count, because counting a control
 * that does not exist would have meant re-adding one to satisfy a test.
 */
const APPEND_ONLY_CARD = 'บันทึกภายในของทีมขาย';

/**
 * Card titles are matched through the SAME ESCAPING React applies.
 *
 * `ผู้ประสานงาน & บริษัท` renders as `ผู้ประสานงาน &amp; บริษัท`, so a raw
 * `includes` of the source string reports the card MISSING on a page that draws
 * it perfectly. Measured with scripts/_probe-inhouse-edit-count.mjs — the first
 * draft of this list failed on exactly the two titles containing an ampersand
 * while the แก้ไข counts were already correct, which is the tell: a probe that
 * disagrees with itself about one card and not another is reading the markup
 * wrong, not finding a defect.
 */
const escaped = (s) => s.replace(/&/g, '&amp;');

test('a pending request keeps its edit control — on EVERY editable card', () => {
  assert.equal(
    countExactly(pending, 'แก้ไข'),
    EDITABLE_CARDS.length,
    `expected one แก้ไข per editable card (${EDITABLE_CARDS.join(', ')}); `
    + `${APPEND_ONLY_CARD} is deliberately not among them — it is append-only`,
  );
  // Each named card is actually on the page, so the count above cannot be
  // reached by six buttons on three cards.
  for (const title of EDITABLE_CARDS) {
    assert.ok(pending.includes(escaped(title)), `the ${title} card is missing from the page`);
  }
});

/**
 * THE PAIRING, stated as one assertion rather than left implicit across two
 * tests: the same render that has six buttons when pending has zero when
 * cancelled. This is what makes the count above a statement about the LOCK and
 * not merely about the markup.
 */
test('the cancellation lock removes every one of those, not merely some', () => {
  assert.equal(countExactly(pending, 'แก้ไข'), EDITABLE_CARDS.length);
  assert.equal(countExactly(cancelled, 'แก้ไข'), 0,
    'a cancelled request must offer no edit control on ANY card');
  // …and the cards themselves are still drawn. A lock that worked by not
  // rendering the cards would satisfy the line above and hide the record.
  for (const title of [...EDITABLE_CARDS, APPEND_ONLY_CARD]) {
    assert.ok(cancelled.includes(escaped(title)), `the ${title} card vanished on a cancelled request`);
  }
});

test('THE NOTES CARD OBEYS THE LOCK TOO — its composer is the gated control', () => {
  /**
   * The notes card has no แก้ไข, so the count above cannot cover it. Its edit
   * affordance is the COMPOSER, and this is what says the lock reaches it.
   *
   * Without this assertion the card would be the one editable surface on the
   * screen that the read-only tests did not touch — which is precisely how the
   * original in-house defect survived: an affordance that no assertion was
   * shaped to look for.
   *
   * The button's TEXT is the probe, not a class, and the card is asserted
   * present in both states so this cannot pass by the whole card disappearing.
   */
  assert.ok(pending.includes(escaped(APPEND_ONLY_CARD)), 'the notes card is missing when pending');
  assert.ok(showsExactly(pending, 'เพิ่มบันทึก'), 'a pending request cannot add a note');
  assert.ok(!showsExactly(cancelled, 'เพิ่มบันทึก'),
    'a CANCELLED request still offers the note composer — the lock does not reach it');
});

test('there is no per-note edit or delete control, on either state', () => {
  /**
   * APPEND-ONLY IS THE DESIGN. The absence of UI is not the enforcement — the
   * server's `$push` and the action's signature are — but a control here would
   * CONTRADICT the enforcement, and the contradiction is what a reader would
   * trust. So it is pinned.
   *
   * Read from the notes card's own region: `ลบ` appears in the overflow menu
   * ("ลบ Request นี้") and `แก้ไข` on five other cards, so a page-wide probe
   * would be answering about entirely different controls.
   */
  for (const [name, markup] of Object.entries({ pending, cancelled })) {
    const start = markup.indexOf(escaped(APPEND_ONLY_CARD));
    assert.notEqual(start, -1, `${name}: the notes card is missing`);
    const end = markup.indexOf('>ข้อมูลระบบ<', start);
    assert.notEqual(end, -1, `${name}: the card after the notes card is missing — region unbounded`);
    const card = markup.slice(start, end);

    assert.ok(!card.includes('>แก้ไข<'), `${name}: the notes card grew an edit control`);
    assert.ok(!/>ลบ[^<]*</.test(card), `${name}: the notes card grew a delete control`);
    assert.ok(!card.includes('aria-haspopup="menu"'), `${name}: the notes card grew a ••• menu`);
  }
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
  for (const status of INHOUSE_STATUS_VALUES) {
    const markup = html(status);
    const expected = allowedTransitions(status, INHOUSE_STATUS_TRANSITIONS);
    assert.deepEqual(offeredTargets(markup), expected,
      `${status}: the screen offers ${offeredTargets(markup)} but the table permits ${expected}`);
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
    const expected = allowedTransitions(live, INHOUSE_STATUS_TRANSITIONS);
    assert.deepEqual(offeredTargets(markup), expected,
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
