import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HistoryFeed } from '@/components/audit/HistoryFeed';
import { HISTORY_STATE } from '@/lib/audit/auditQuery';
import {
  PUBLIC_ACTION_TITLES,
  INHOUSE_ACTION_TITLES,
  actionTitlesFor,
} from '@/lib/audit/registrationHistory';
import { statusLabel } from '@/lib/registrations/statuses';
import { readSource } from '../sourceScan.mjs';

/**
 * THE ประวัติการดำเนินการ TAB.
 *
 * ══ THE FRAME SHOWS AN ACTIVITY FEED; WHAT EXISTS IS AN ADMIN AUDIT LOG ════
 *
 * Three of the frame's four entry types have no data behind them, and this file
 * is where each ruling is held:
 *
 *   (a) อัปเดตสถานะรายการ — REAL. `action: 'status'`, with before/after.
 *   (b) ส่งใบเสนอราคา     — NOT REAL. No such action is ever written, and the
 *                            quotation number was ruled out in round 4.
 *   (c) เพิ่มบันทึกภายใน  — HALF REAL. In-house writes `action: 'notes'`; the
 *                            BODY is deliberately never recorded.
 *   (d) ได้รับแบบฟอร์ม    — NOT in the log at all, but DERIVABLE from the
 *                            document, so it is synthesised and marked as such.
 *   (e) the act-only row  — round 4's `— → —` fix, re-asserted in the new shape.
 *
 * ── NO REACT ROOT ──────────────────────────────────────────────────────────
 * renderToStaticMarkup only. The feed is not an accordion, so its rows render
 * without a click — which is why this can assert entry shape at all.
 */

// ── Fixtures — one row per action that genuinely exists ────────────────────

const STATUS_ROW = {
  _id: 'r-status',
  action: 'status',
  before: { status: 'pending' },
  after: { status: 'confirmed' },
  meta: null,
  createdAt: '2026-08-12T04:00:00.000Z',
  actor: { name: 'แอดมิน หนึ่ง' },
};

/** (e) The act-only row: an edit was made and NOTHING about it was recorded. */
const UPDATE_ROW = {
  _id: 'r-update',
  action: 'update',
  before: null,
  after: null,
  meta: null,
  createdAt: '2026-08-11T04:00:00.000Z',
  actor: { name: 'แอดมิน สอง' },
};

/** (c) In-house only — public folds notes into `update`. */
const NOTES_ROW = {
  _id: 'r-notes',
  action: 'notes',
  before: null,
  after: null,
  meta: null,
  createdAt: '2026-08-10T04:00:00.000Z',
  actor: { name: 'ทีมขาย' },
};

const ORIGIN = {
  createdAt: '2026-08-01T03:00:00.000Z',
  source: 'web',
  label: 'ได้รับใบสมัคร',
};

const feed = (props = {}) => renderToStaticMarkup(createElement(HistoryFeed, {
  state: HISTORY_STATE.OK,
  rows: [STATUS_ROW, UPDATE_ROW],
  total: 2,
  titles: PUBLIC_ACTION_TITLES,
  origin: ORIGIN,
  title: 'ประวัติการดำเนินการ',
  description: 'บันทึกการดำเนินการของผู้ดูแลระบบกับใบสมัครนี้',
  ...props,
}));

const FULL = feed();

// ── Probes ──────────────────────────────────────────────────────────────────

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Every `<li>` of the feed, in order, with its `data-origin`. */
function entries(markup) {
  return [...markup.matchAll(/<li data-origin="(audit|document)"([\s\S]*?)<\/li>/g)]
    .map((m) => ({ origin: m[1], html: m[2] }));
}

/** The three text lines of one entry: title, description (or null), origin line. */
function linesOf(entry) {
  const block = entry.html.slice(entry.html.indexOf('pl-[48px]'));
  const ps = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]));
  return ps;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. THE CARD AND THE ENTRY SHAPE
// ════════════════════════════════════════════════════════════════════════════

test('the card header is a two-line block with NO แก้ไข button', () => {
  // There is nothing on this card to edit. A header carrying an edit affordance
  // claims otherwise, and the frame draws none.
  assert.ok(FULL.includes('>ประวัติการดำเนินการ<'), 'the heading is gone');
  assert.ok(FULL.includes('บันทึกการดำเนินการของผู้ดูแลระบบ'), 'the description line is gone');
  assert.ok(!FULL.includes('>แก้ไข<'), 'the history card grew an edit button');
  assert.match(FULL, /h-\[53\.8px\]/, 'the header is not the measured 53.8px');
});

test('each entry is an 82px row with the measured icon box and timestamp block', () => {
  const list = entries(FULL);
  assert.ok(list.length >= 2, `expected at least 2 entries, found ${list.length}`);
  for (const [i, entry] of list.entries()) {
    assert.match(entry.html, /h-\[82px\]/, `entry ${i} is not 82px`);
    assert.match(entry.html, /left-\[2px\] top-\[13px\] flex h-\[29px\] w-\[29px\]/,
      `entry ${i}'s icon box is not at its measured position`);
    assert.match(entry.html, /w-\[150px\]/, `entry ${i} has no 150px timestamp block`);
    assert.match(entry.html, /pl-\[48px\]/, `entry ${i}'s text block is not inset 48px`);
  }
});

test('the entries stack flush and are divided by rules, not gaps', () => {
  // 82px pitch, no gap — so the divider is what separates them.
  assert.match(FULL, /divide-y divide-\[var\(--surface-border\)\] pt-\[17px\]/,
    'the entry list is not a flush divided stack starting 17px in');
  assert.ok(!/space-y-/.test(FULL.slice(FULL.indexOf('<ul'))), 'the entries have a gap between them');
});

test('the MOST RECENT entry takes a check mark and the rest take dots', () => {
  const list = entries(FULL);
  assert.match(list[0].html, /lucide-check/, 'the newest entry has no check mark');
  for (const [i, entry] of list.slice(1).entries()) {
    assert.ok(!/lucide-check/.test(entry.html), `entry ${i + 1} took a check mark it should not have`);
    assert.match(entry.html, /lucide-circle/, `entry ${i + 1} has no dot`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. (a) THE STATUS ROW — the one entry type that is fully real
// ════════════════════════════════════════════════════════════════════════════

test('(a) a status transition renders its title, its arrow line, its actor and its time', () => {
  const status = entries(FULL)[0];
  const lines = linesOf(status);
  assert.equal(lines[0], PUBLIC_ACTION_TITLES.status, 'the status row is not titled');
  assert.ok(lines[1].includes('→'), 'the status row lost its arrow line');
  assert.ok(lines[1].includes(statusLabel('pending')), 'the before value is gone');
  assert.ok(lines[1].includes(statusLabel('confirmed')), 'the after value is gone');
  assert.equal(lines[2], 'ดำเนินการโดย แอดมิน หนึ่ง', 'the actor line is wrong');
  assert.match(status.html, /2569/, 'the timestamp is gone');
});

test('(a) the round-2 legacy label map still reaches the arrow line', () => {
  // A retired in-house value must still read as Thai here — those rows are
  // historical fact and are deliberately never migrated.
  const legacy = feed({
    rows: [{ ...STATUS_ROW, before: { status: 'contacted' }, after: { status: 'closed-won' } }],
    total: 1,
    titles: INHOUSE_ACTION_TITLES,
  });
  const line = linesOf(entries(legacy)[0])[1];
  assert.ok(line.includes(statusLabel('contacted')), 'a retired before value lost its Thai label');
  assert.ok(line.includes(statusLabel('closed-won')), 'a retired after value lost its Thai label');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. (b) THE SEND-QUOTATION ENTRY IS NOT BUILT
// ════════════════════════════════════════════════════════════════════════════

test('(b) no vocabulary names a send-quotation action, on either collection', () => {
  /**
   * NOT REAL TWICE OVER: there is no action to record it — the two action files
   * write `status`, `update`, `notes` and `delete` and nothing else — and the
   * quotation NUMBER the frame shows was ruled out in round 4 because no such
   * field exists on either model.
   *
   * Asserted over the vocabulary rather than over one render, because a title
   * added here would appear on every row carrying that action, and there is no
   * such row to render.
   */
  for (const [name, titles] of Object.entries({ PUBLIC_ACTION_TITLES, INHOUSE_ACTION_TITLES })) {
    for (const value of Object.values(titles)) {
      assert.ok(!value.includes('ใบเสนอราคา'),
        `${name} names a quotation action: ${value}`);
    }
  }
  assert.ok(!FULL.includes('QT-'), 'a quotation number reached the feed');
  assert.ok(!/QT-\d{4}-\d{4}/.test(FULL), 'a quotation number reached the feed');
});

test('(b) the vocabulary carries EXACTLY the actions that are written', () => {
  /**
   * The real guard behind (b), and it is stricter than a ban on one string: the
   * titles must be the same SET as the actions the two `'use server'` files
   * record. A title with no writer is a label for an event nothing produces; a
   * writer with no title renders a raw English enum on a Thai screen.
   *
   * Read from the action files themselves, so this stays true as they change.
   */
  const written = (rel) => new Set(
    [...readSource(rel).code.matchAll(/action:\s*'([a-z_-]+)'/g)].map((m) => m[1])
  );

  assert.deepEqual(
    new Set(Object.keys(PUBLIC_ACTION_TITLES)),
    written('src/lib/actions/registrations.js'),
    'the public titles and the public actions have drifted apart',
  );
  assert.deepEqual(
    new Set(Object.keys(INHOUSE_ACTION_TITLES)),
    written('src/lib/actions/inhouse-registrations.js'),
    'the in-house titles and the in-house actions have drifted apart',
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 4. (c) + (e) A ROW WITH NOTHING RECORDED HAS NO DESCRIPTION ELEMENT
// ════════════════════════════════════════════════════════════════════════════

test('(e) an act-only row renders NO description element — shape, not string', () => {
  /**
   * `!includes('—')` would be satisfied by every other empty rendering somebody
   * might reach for: a hyphen, a non-breaking space, an empty paragraph holding
   * the space, a bare arrow with nothing either side. A ban on remembered
   * strings only bans the strings somebody remembered.
   *
   * So the claim is that the entry's text block holds exactly TWO paragraphs —
   * the title and the actor line — where a status row holds three.
   */
  const update = entries(FULL)[1];
  const lines = linesOf(update);
  assert.equal(lines.length, 2,
    `the act-only entry renders ${lines.length} lines (${JSON.stringify(lines)}), expected the title `
    + 'and the actor only. A description element holding nothing is the same defect the arrow-and-dashes '
    + 'row was, one element deeper.');
  assert.equal(lines[0], PUBLIC_ACTION_TITLES.update, 'the act-only row is not titled');
  assert.equal(lines[1], 'ดำเนินการโดย แอดมิน สอง', 'the act-only row lost its actor');
  assert.ok(!update.html.includes('→'), 'an arrow rendered with nothing on either side');
});

test('(e) CONTROL: a row WITH a diff renders three lines through the same code', () => {
  // Without this, "two lines" would be satisfied by a feed that never renders a
  // description at all, and the status row's arrow would be untested.
  assert.equal(linesOf(entries(FULL)[0]).length, 3, 'the status entry lost its description line');
});

test('(c) the in-house notes row is titled, and its BODY is still not recorded', () => {
  /**
   * HALF REAL. `updateInhouseAdminNotes` records `action: 'notes'`, so the ACT
   * is in the trail and the feed can name it. The note TEXT is deliberately not
   * — that action's own comment says admin notes are "the most sensitive field
   * on the record, not the least" — so the description line is DROPPED by the
   * same path the act-only row uses.
   */
  const inhouse = feed({ rows: [NOTES_ROW], total: 1, titles: INHOUSE_ACTION_TITLES, origin: null });
  const lines = linesOf(entries(inhouse)[0]);
  assert.equal(lines[0], 'เพิ่มบันทึกภายใน', 'the notes row is not titled');
  assert.equal(lines.length, 2, 'the notes row rendered a body the trail does not hold');
  assert.equal(lines[1], 'ดำเนินการโดย ทีมขาย');
});

test('(c) PUBLIC has no notes action, so it says what WAS recorded', () => {
  /**
   * THE ASYMMETRY, ASSERTED. Public notes are one field among many in
   * `updateRegistration`, which records `update`. Titling a public `update` as
   * "เพิ่มบันทึกภายใน" would be a label asserting something the row does not
   * hold — the row genuinely does not know which field changed.
   */
  assert.ok(!('notes' in PUBLIC_ACTION_TITLES), 'public grew a notes action it does not write');
  assert.ok('notes' in INHOUSE_ACTION_TITLES, 'in-house lost the notes action it does write');
  assert.notEqual(PUBLIC_ACTION_TITLES.update, INHOUSE_ACTION_TITLES.notes,
    'public update and in-house notes are titled the same — one of them is claiming too much');
});

// ════════════════════════════════════════════════════════════════════════════
// 5. (d) THE SYNTHESISED CREATION ENTRY
// ════════════════════════════════════════════════════════════════════════════

test('(d) a creation entry is synthesised from the document, and is marked as such', () => {
  /**
   * NOT in the audit log — that log records ADMIN actions and a customer
   * submitting a form is not one. It IS derivable: both models carry `createdAt`
   * and a `source`. So the entry is the record stating its own origin.
   *
   * IT MUST NEVER BE MISTAKEN FOR AN AUDIT ROW, and three things prevent it: the
   * markup tags it, it carries no actor, and its third line makes a visibly
   * different claim from every audit entry's `ดำเนินการโดย …`.
   */
  const list = entries(FULL);
  const origin = list[list.length - 1];
  assert.equal(origin.origin, 'document', 'the oldest entry is not marked as document-derived');
  for (const entry of list.slice(0, -1)) {
    assert.equal(entry.origin, 'audit', 'an audit entry is not marked as one');
  }

  const lines = linesOf(origin);
  assert.equal(lines[0], 'ได้รับใบสมัคร');
  assert.equal(lines[1], 'สร้างรายการจากแบบฟอร์มเว็บไซต์');
  assert.equal(lines[2], 'ข้อมูลจากตัวรายการ ไม่ใช่บันทึกการดำเนินการ',
    'the synthesised entry reads like an audit row');
  assert.ok(!lines[2].startsWith('ดำเนินการโดย'),
    'the synthesised entry claims an actor — there was no admin');
});

test('(d) the synthesised entry is SUPPRESSED when the feed is truncated', () => {
  /**
   * `readRecordHistory` fetches the newest five rows. When more exist, the oldest
   * row on screen is NOT the oldest row — and "created" pinned to the bottom of a
   * partial list asserts a completeness the list does not have. A reader would
   * take the entry above it as the second thing that ever happened.
   */
  const truncated = feed({ total: 9 });
  const list = entries(truncated);
  assert.ok(list.every((e) => e.origin === 'audit'),
    'a synthesised creation entry survived onto a truncated feed');
  // ...and the truncation is said out loud, so the shortened list is not read
  // as the whole history.
  assert.match(truncated, /แสดง 2 จาก 9 รายการ/, 'the truncated feed does not say it is truncated');
});

test('(d) no origin means no entry, not an entry with no date', () => {
  const none = feed({ origin: null });
  assert.ok(entries(none).every((e) => e.origin === 'audit'), 'an origin entry appeared from nothing');
  const noDate = feed({ origin: { source: 'web', label: 'ได้รับใบสมัคร' } });
  assert.ok(entries(noDate).every((e) => e.origin === 'audit'),
    'an origin entry rendered without a creation timestamp');
});

test('(d) an unrecognised source is shown, not hidden', () => {
  // Same rule as an unknown status: the record shows what it holds. A source
  // this module has not been taught is visible and nameable rather than behind a
  // catch-all.
  const odd = feed({ origin: { ...ORIGIN, source: 'imported-2019' } });
  const list = entries(odd);
  assert.ok(linesOf(list[list.length - 1])[1].includes('imported-2019'),
    'an unrecognised source was replaced rather than shown');
});

// ════════════════════════════════════════════════════════════════════════════
// 6. THE RAW EVIDENCE STAYS — AND IS OFFERED ONLY WHERE THERE IS ANY
// ════════════════════════════════════════════════════════════════════════════

test('a row with a payload is expandable; a row with none is not a button', () => {
  /**
   * THE DECISION, STATED. The raw before/after block STAYS — it is the audit
   * evidence, and the frame simply did not draw a collapsed affordance for it.
   * The 82px row carries it fine: 82px is the RESTING pitch and the disclosure
   * grows the entry below it, which is what the accordion panel already does.
   *
   * But an act-only row has nothing to expand INTO. Its detail block would be
   * `ก่อน: —` over `หลัง: —` — the `update — → —` defect relocated one
   * disclosure deeper — so the affordance exists exactly when there is a payload
   * or a `meta`, and a row with neither is a plain `<div>`.
   */
  const list = entries(FULL);
  assert.match(list[0].html, /<button[^>]*aria-expanded/, 'the status row cannot be expanded');
  assert.ok(!/<button/.test(list[1].html),
    'the act-only row is a button that opens onto two dashes');
  assert.ok(!/<button/.test(list[list.length - 1].html),
    'the synthesised entry is expandable — there is no audit payload behind it');
});

test('a row with a meta payload and no diff IS expandable', () => {
  // The branch between the two above: `meta` is evidence too, and a row carrying
  // one has something to disclose even with no before/after.
  const withMeta = feed({ rows: [{ ...UPDATE_ROW, meta: { alsoTouched: 3 } }], total: 1, origin: null });
  assert.match(entries(withMeta)[0].html, /<button[^>]*aria-expanded/,
    'a row with a meta payload cannot be expanded');
});

// ════════════════════════════════════════════════════════════════════════════
// 7. THE EMPTY STATES, AND NO EMPTY ELEMENTS
// ════════════════════════════════════════════════════════════════════════════

test('an un-swept menu says so, and does NOT show a synthesised entry', () => {
  /**
   * "The menu has not been instrumented" is a different fact from "this record
   * has never been edited", and the accordion panel already distinguishes them.
   * The synthesised entry goes with it: it would be perfectly true, and standing
   * alone under a heading that says nothing is recorded it reads as the only
   * thing that ever happened.
   */
  const un = feed({ state: HISTORY_STATE.NOT_INSTRUMENTED, rows: [], total: 0 });
  assert.match(un, /เมนูนี้ยังไม่ได้เปิดบันทึกประวัติ/, 'the un-swept state is not explained');
  assert.equal(entries(un).length, 0, 'an un-swept feed rendered entries');
});

test('a genuinely empty record says THAT instead', () => {
  const empty = feed({ rows: [], total: 0, origin: null });
  assert.match(empty, /ยังไม่มีประวัติการแก้ไข/, 'an empty record is not explained');
  assert.ok(!empty.includes('ยังไม่ได้เปิดบันทึก'), 'an empty record was reported as an un-swept menu');
});

const EMPTY_ELEMENT = /<(p|span|div|dl|li)\b(?![^>]*aria-hidden="true")[^>]*><\/\1>/;

test('no feed emits an empty element, in any state', () => {
  const cases = {
    FULL,
    truncated:  feed({ total: 9 }),
    noOrigin:   feed({ origin: null }),
    noActor:    feed({ rows: [{ ...UPDATE_ROW, actor: null }], total: 1 }),
    empty:      feed({ rows: [], total: 0, origin: null }),
    unswept:    feed({ state: HISTORY_STATE.NOT_INSTRUMENTED, rows: [], total: 0 }),
    noTitles:   feed({ titles: {} }),
  };
  for (const [name, markup] of Object.entries(cases)) {
    const m = EMPTY_ELEMENT.exec(markup);
    assert.equal(m, null, `${name} emits an empty element: ${m?.[0]}`);
  }
});

test('an unknown action renders its RAW value rather than a dash', () => {
  // The trail is evidence. A row whose action the vocabulary has not been taught
  // shows what it actually says, so the gap is visible and nameable.
  const odd = feed({ rows: [{ ...UPDATE_ROW, action: 'zzz-unheard-of' }], total: 1, origin: null });
  assert.equal(linesOf(entries(odd)[0])[0], 'zzz-unheard-of', 'an unknown action was hidden');

  const noTitles = feed({ titles: {} });
  assert.equal(linesOf(entries(noTitles)[0])[0], 'status',
    'an empty vocabulary hid the action instead of showing it');
});

test('CONTROL: actionTitlesFor returns an EMPTY map for an unknown entity', () => {
  // Which is what makes the raw-action fallback reachable in the product rather
  // than only in a fixture: a feed mounted on a menu this module has not been
  // taught degrades to raw names instead of borrowing a registration's wording.
  assert.deepEqual(actionTitlesFor('something-else'), {});
  assert.equal(actionTitlesFor('public'), PUBLIC_ACTION_TITLES);
  assert.equal(actionTitlesFor('inhouse'), INHOUSE_ACTION_TITLES);
});

// ════════════════════════════════════════════════════════════════════════════
// 8. THE FEED IS A CONTAINER, NOT A SECOND IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════

test('the feed re-implements nothing about a ROW', () => {
  /**
   * auditRowParts' premise: the surfaces differ in their CONTAINER and in
   * nothing inside it. This is the third container, and the assertion is that it
   * imports the shared parts rather than growing its own timestamp format,
   * severity scheme or diff line — which is how a reader learns to distrust all
   * three.
   */
  const src = readSource('src/components/audit/HistoryFeed.jsx');
  for (const binding of ['fmtWhen', 'hasDiff', 'rowSeverity', 'severityRowClass', 'AuditDiff', 'AuditRowDetail']) {
    assert.match(src.withImports,
      new RegExp(String.raw`import \{[\s\S]*?\b${binding}\b[\s\S]*?\} from '@/components/audit/auditRowParts'`),
      `${binding} is not taken from the shared row parts`);
  }
  // And no local re-implementation of the two easiest ones to re-type.
  assert.ok(!/THAI_MONTHS/.test(src.code), 'the feed grew its own date formatter');
  assert.ok(!/toLocaleDateString/.test(src.code), 'the feed grew its own date formatter');
});

test('every other mount of the panel is untouched by the feed', () => {
  /**
   * `RecordHistoryPanel` has EIGHT mount points and this round was asked about
   * two of them. `variant` defaults to `'accordion'`, so the other six render
   * exactly as before — asserted at source, because a default that quietly
   * changed would be invisible on the screens nobody looked at.
   */
  const panel = readSource('src/components/audit/RecordHistoryPanel.jsx');
  assert.match(panel.code, /variant = 'accordion'/, 'the panel no longer defaults to the accordion');
  assert.match(panel.code, /if \(variant === 'feed'\)/, 'the feed is not behind the variant');

  const server = readSource('src/components/audit/RecordHistory.jsx');
  assert.match(server.code, /variant = 'accordion'/, 'the server component no longer defaults to the accordion');
});
