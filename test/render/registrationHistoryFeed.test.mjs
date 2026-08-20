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

  /**
   * ── THE IN-HOUSE SET IS A UNION NOW, AND THAT IS THE CHANGE ───────────────
   *
   * It used to read `written('inhouse-registrations.js')` alone, because that
   * file was the only writer of in-house rows. Round 6 moved two things into the
   * SHARED module: internal notes (`addInternalNote`) and field edits (the
   * in-house screen now calls `updateRegistration`). Both record with
   * `entity: entityForSource(source)`, so both can file an IN-HOUSE row from
   * registrations.js.
   *
   * Reading one file would therefore have understated what in-house writes — and
   * it did: this assertion is what caught `update` having no in-house title,
   * which would have rendered the raw English enum on a Thai feed. Nobody
   * noticed by reading.
   *
   * `delete` appears in both files and the union absorbs it, which is correct:
   * the question is "can a row with this action reach this feed", not "which
   * file wrote it".
   */
  /**
   * ── NOT EVERY SHARED ACTION CAN FILE AN IN-HOUSE ROW ──────────────────────
   *
   * The first version of this union assumed the whole shared module was
   * reachable from both entities. It is not: `updateRegistrationRound` writes
   * `entity: 'public'` as a LITERAL, because only public registrations have a
   * training round at all — an in-house request is an enquiry about a course
   * that has not been scheduled yet.
   *
   * So the entity is read per action rather than assumed. An action whose
   * `entity` is `entityForSource(source)` can reach both; one with a literal
   * reaches exactly that entity.
   *
   * This mattered immediately: the over-broad union demanded a `round` title on
   * the IN-HOUSE feed, for a row that collection can never receive. Adding one
   * would have been a label for an event nothing writes — which is the defect
   * this whole test exists to prevent, arriving through the test itself.
   */
  const actionsByEntity = (rel) => {
    const code = readSource(rel).code;
    const both = new Set();
    const perEntity = { public: new Set(), inhouse: new Set() };
    // Each recordAdminActionAfter call, as one blob, so `action` and `entity`
    // are read from the SAME call rather than paired by proximity.
    for (const m of code.matchAll(/recordAdminActionAfter\(\{([\s\S]*?)\n\s*\}\);/g)) {
      const call = m[1];
      const action = /action:\s*'([a-z_-]+)'/.exec(call)?.[1];
      if (!action) continue;
      if (/entity:\s*entityForSource\(/.test(call)) { both.add(action); continue; }
      const literal = /entity:\s*'([a-z_-]+)'/.exec(call)?.[1];
      if (literal && perEntity[literal]) perEntity[literal].add(action);
    }
    return { both, ...perEntity };
  };

  const shared = actionsByEntity('src/lib/actions/registrations.js');
  const inhouseOwn = actionsByEntity('src/lib/actions/inhouse-registrations.js');

  /**
   * ══ RETIRED ACTIONS: A TITLE MAY OUTLIVE ITS WRITER, AND MUST ══════════════
   *
   * This assertion used to be "titles ≡ writers", full stop. That is right in
   * one direction and WRONG IN THE OTHER, and the reversal is what exposed it.
   *
   * `updateAttendeesCountPaid` filed `seats` rows against real paid
   * registrations. The action has been removed — a paid record's count can no
   * longer be changed by any path — but THE TRAIL IS APPEND-ONLY and those rows
   * are still in it. `auditRowTitle` falls through to the RAW ACTION VALUE for
   * an action it has not been taught, so deleting the title would print the
   * bare English token `seats` in a Thai feed, on real records, forever.
   *
   * So a retired writer keeps its title. The set below is the exception, and it
   * is DELIBERATELY NARROW — an explicit key at a time, never a predicate — so
   * that the defect this test was written for still fires: an action that WRITES
   * with no title is still red, and a title for an event nothing ever wrote is
   * still red unless it is named here as retired.
   *
   * TO ADD A KEY HERE you must have removed a writer, not merely failed to write
   * one. The question to answer first: could a row with this action already be
   * in the trail? If no, the title is a label for an event nothing wrote, which
   * is the original defect and not an exception to it.
   */
  const RETIRED_PUBLIC = new Set([
    // Round 8's `updateAttendeesCountPaid`, removed in the reversal.
    'seats',
  ]);

  const publicWrites  = new Set([...shared.both, ...shared.public,
    ...inhouseOwn.public, ...RETIRED_PUBLIC]);
  const inhouseWrites = new Set([...shared.both, ...shared.inhouse,
    ...inhouseOwn.both, ...inhouseOwn.inhouse]);

  assert.deepEqual(
    new Set(Object.keys(PUBLIC_ACTION_TITLES)),
    publicWrites,
    'the public titles and the public actions have drifted apart',
  );

  // The exception must stay an exception. Every retired key needs a title (that
  // is the entire reason it is retained) and must genuinely have NO writer left
  // — otherwise it is not retired and the note above is describing fiction.
  for (const retired of RETIRED_PUBLIC) {
    assert.ok(PUBLIC_ACTION_TITLES[retired],
      `\`${retired}\` is listed as retired but has no title — retiring it is what keeps the title`);
    assert.equal(shared.both.has(retired) || shared.public.has(retired), false,
      `\`${retired}\` is listed as retired but something still writes it`);
  }
  assert.deepEqual(
    new Set(Object.keys(INHOUSE_ACTION_TITLES)),
    inhouseWrites,
    'the in-house titles and the in-house actions have drifted apart',
  );

  // The parse found real calls of both shapes, so neither set is empty by
  // accident and the per-entity split is doing work rather than collapsing.
  assert.ok(shared.both.size >= 3, `only ${shared.both.size} source-derived actions parsed`);
  assert.ok(shared.public.size >= 1, 'no public-literal action parsed — the split found nothing');

  // The union is not vacuous: the in-house file still writes actions of its own,
  // so this is a union of two non-empty sets rather than the shared set wearing
  // a different name.
  // The in-house module still writes actions of its own, so `inhouseWrites` is
  // a real union rather than the shared set wearing a different name.
  const ownCount = inhouseOwn.both.size + inhouseOwn.inhouse.size;
  assert.ok(ownCount >= 2, `the in-house file writes only ${ownCount} actions of its own`);
  assert.ok(inhouseOwn.inhouse.has('status'),
    'the in-house file stopped writing its own status action');
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

test('(c) PUBLIC NOW HAS A notes ACTION, because it genuinely writes one', () => {
  /**
   * ══ THE ASYMMETRY IS GONE, AND THE OLD TEST'S REASONING IS WHY THIS IS OK ══
   *
   * This asserted `!('notes' in PUBLIC_ACTION_TITLES)`. The reasoning was
   * sound and is worth keeping in view: public notes used to be one field among
   * many in `updateRegistration`, which records `update`, so titling a public
   * `update` as "เพิ่มบันทึกภายใน" would have been a label asserting something
   * the row does not hold.
   *
   * ROUND 6 DID NOT RELAX THAT — it removed its cause. `addInternalNote` is a
   * dedicated action on BOTH sources and records `action: 'notes'` directly, so
   * a public notes row now really does mean a note was added. The title is
   * earned rather than borrowed.
   *
   * THE CLAIM THAT SURVIVES UNCHANGED is the one that was actually load-bearing:
   * `update` must still not be titled as if it knew which field changed. That is
   * asserted below and is byte-identical to what it was.
   */
  assert.ok('notes' in PUBLIC_ACTION_TITLES, 'public lost the notes action it now writes');
  assert.ok('notes' in INHOUSE_ACTION_TITLES, 'in-house lost the notes action it does write');
  assert.equal(PUBLIC_ACTION_TITLES.notes, INHOUSE_ACTION_TITLES.notes,
    'one mechanism, two titles — the two feeds would name the same event differently');

  // UNCHANGED, and this is the half that mattered all along: a wholesale field
  // edit must not be titled as if the row named a field.
  assert.notEqual(PUBLIC_ACTION_TITLES.update, PUBLIC_ACTION_TITLES.notes,
    'public update and public notes are titled the same — update is claiming too much');
  assert.equal(PUBLIC_ACTION_TITLES.update, 'แก้ไขข้อมูลใบสมัคร',
    'the wholesale-edit title changed — it must stay non-specific');
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


// ════════════════════════════════════════════════════════════════════════════
// 9. IN-HOUSE — THE SAME FEED, AND THE ONE PLACE THE TWO GENUINELY DIFFER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Section 4 asked for anything where the in-house audit rows differ IN KIND from
 * public's, rather than assuming symmetry. There is exactly one, and it is not a
 * gap to be closed:
 *
 *   IN-HOUSE WRITES A DEDICATED `notes` ACTION. PUBLIC DOES NOT.
 *
 * `updateInhouseAdminNotes` records `action: 'notes'`; public notes are one
 * field among many in `updateRegistration`, which records `update`. So the
 * in-house feed can name what happened and the public feed cannot — and titling
 * a public `update` "เพิ่มบันทึกภายใน" would assert something the row does not
 * hold.
 *
 * Everything else is symmetric, and these tests say which is which rather than
 * leaving a reader to infer it.
 */

const INHOUSE_ROWS = [
  { _id: 'i-status', action: 'status', before: { status: 'pending' }, after: { status: 'quoted' }, meta: null, createdAt: '2026-08-12T04:00:00.000Z', actor: { name: 'ทีมขาย' } },
  NOTES_ROW,
];

const INHOUSE_ORIGIN = {
  createdAt: '2026-08-01T03:00:00.000Z',
  source: 'inhouse',
  label: 'ได้รับคำขออบรม',
};

const INHOUSE_FEED = renderToStaticMarkup(createElement(HistoryFeed, {
  state: HISTORY_STATE.OK,
  rows: INHOUSE_ROWS,
  total: INHOUSE_ROWS.length,
  titles: INHOUSE_ACTION_TITLES,
  origin: INHOUSE_ORIGIN,
  title: 'ประวัติการดำเนินการ',
  description: 'บันทึกการดำเนินการของทีมขายกับคำขอนี้',
}));

test('in-house takes the SAME entry shape as public', () => {
  // The 82px row, the icon box, the 48px text block, the 150px timestamp. A
  // second entry shape for the same kind of row is how a reader learns the two
  // screens are different products.
  for (const entry of entries(INHOUSE_FEED)) {
    assert.match(entry.html, /h-\[82px\]/, 'an in-house entry is not 82px');
    assert.match(entry.html, /left-\[2px\] top-\[13px\] flex h-\[29px\] w-\[29px\]/,
      'an in-house entry’s icon box moved');
    assert.match(entry.html, /pl-\[48px\]/, 'an in-house entry’s text block is not inset 48px');
    assert.match(entry.html, /w-\[150px\]/, 'an in-house entry has no 150px timestamp block');
  }
  assert.match(INHOUSE_FEED, /h-\[53\.8px\]/, 'the in-house card header is not the measured 53.8px');
  assert.ok(!INHOUSE_FEED.includes('>แก้ไข<'), 'the in-house history card grew an edit button');
});

test('BOTH vocabularies name the notes action, identically', () => {
  /**
   * ── RE-POINTED, AND THE CLAIM IS NOW THE OPPOSITE ONE ─────────────────────
   *
   * It read "in-house names its notes action; the same row on public could not
   * be", and rendered the identical row through PUBLIC_ACTION_TITLES to show it
   * came out as the raw enum `notes` — because public had no title for an action
   * it never wrote.
   *
   * Public writes it now. So the assertion is inverted: the same row through
   * either vocabulary produces the SAME Thai title, which is what "one notes
   * mechanism" means at the reading end. A raw `notes` appearing on either feed
   * would now be the defect.
   *
   * NOT WEAKER. The old form proved a title was absent; this proves two titles
   * agree AND that neither degrades to the enum — the second half is the one
   * that was doing the real work, and it is still here.
   */
  const lines = linesOf(entries(INHOUSE_FEED)[1]);
  assert.equal(lines[0], 'เพิ่มบันทึกภายใน', 'the in-house notes row is not titled');

  const asPublic = renderToStaticMarkup(createElement(HistoryFeed, {
    state: HISTORY_STATE.OK, rows: [NOTES_ROW], total: 1,
    titles: PUBLIC_ACTION_TITLES, origin: null, title: 'x',
  }));
  assert.equal(linesOf(entries(asPublic)[0])[0], 'เพิ่มบันทึกภายใน',
    'the public vocabulary renders the raw enum for an action it now writes');
});

test('CONTROL: an untitled action DOES still degrade to its raw enum', () => {
  /**
   * The assertion above no longer demonstrates the fallback, because both
   * vocabularies now carry `notes`. Without this, "the feed renders the raw
   * action when it has no title" would be an untested claim — and it is the
   * behaviour that keeps a future action from rendering a blank line.
   */
  const unknownRow = { ...NOTES_ROW, action: 'defenestrate' };
  const markup = renderToStaticMarkup(createElement(HistoryFeed, {
    state: HISTORY_STATE.OK, rows: [unknownRow], total: 1,
    titles: PUBLIC_ACTION_TITLES, origin: null, title: 'x',
  }));
  assert.equal(linesOf(entries(markup)[0])[0], 'defenestrate',
    'an unknown action rendered something other than its raw value');
});

test('in-house synthesises its own creation entry, from its own source', () => {
  const list = entries(INHOUSE_FEED);
  const origin = list[list.length - 1];
  assert.equal(origin.origin, 'document', 'the in-house oldest entry is not marked document-derived');
  const lines = linesOf(origin);
  assert.equal(lines[0], 'ได้รับคำขออบรม', 'the in-house origin entry uses the public label');
  assert.equal(lines[1], 'สร้างรายการจากแบบฟอร์ม In-house', 'the in-house source is not named');
  assert.equal(lines[2], 'ข้อมูลจากตัวรายการ ไม่ใช่บันทึกการดำเนินการ');
});

test('a legacy in-house record holding source "web" says so rather than guessing', () => {
  /**
   * MEASURED FROM THE SCHEMA, not assumed. RegisterInhouse declares
   * `source: { default: 'web' }` and api/registration/inhouse/route.js overrides
   * it explicitly — so a document written before that route did so really does
   * hold 'web'. Defaulting to 'inhouse' at the mount point would make the screen
   * assert a provenance the record does not carry.
   */
  const legacy = renderToStaticMarkup(createElement(HistoryFeed, {
    state: HISTORY_STATE.OK, rows: [], total: 0,
    titles: INHOUSE_ACTION_TITLES,
    origin: { ...INHOUSE_ORIGIN, source: 'web' },
    title: 'x',
  }));
  const list = entries(legacy);
  assert.equal(linesOf(list[list.length - 1])[1], 'สร้างรายการจากแบบฟอร์มเว็บไซต์');
});

test('both mount points pass the feed variant, the title and the origin', () => {
  /**
   * The pages are SERVER components and cannot be rendered in this tier, so the
   * wiring is asserted at source. `variant`, `origin` and the label are props of
   * the MOUNT POINT — written into the screen's own file, exactly like `menu`
   * and `entity`, because they come off the document that page already loaded.
   */
  for (const [name, rel] of Object.entries({
    public:  'src/app/admin/registrations/[id]/page.jsx',
    inhouse: 'src/app/admin/registrations/inhouse/[id]/page.jsx',
  })) {
    const src = readSource(rel);
    assert.match(src.code, /variant="feed"/, `${name}: the page does not ask for the feed`);
    assert.match(src.code, /title="ประวัติการดำเนินการ"/, `${name}: the card has no heading`);
    assert.match(src.code, /createdAt: doc\.createdAt/, `${name}: the origin carries no timestamp`);
    assert.match(src.code, /source: doc\.source \?\? 'web'/,
      `${name}: the origin's source does not follow the schema default`);
    assert.match(src.code, /label: 'ได้รับ/, `${name}: the origin entry has no label`);
  }
});

test('the two pages label their origin entry DIFFERENTLY', () => {
  // One is a ใบสมัคร and the other a คำขอ — the same distinction the two screens'
  // read-only copy already keeps, one word apart. A shared label would make the
  // in-house feed call the record something it is not.
  const pub = readSource('src/app/admin/registrations/[id]/page.jsx').code;
  const inh = readSource('src/app/admin/registrations/inhouse/[id]/page.jsx').code;
  assert.match(pub, /label: 'ได้รับใบสมัคร'/);
  assert.match(inh, /label: 'ได้รับคำขออบรม'/);
});
