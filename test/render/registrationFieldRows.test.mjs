import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import {
  DL, DLRow, EditField, FIELD_ROW_COLUMNS, isEmptyValue,
} from '@/app/admin/registrations/_components/detailShell';

/**
 * ROUND 7: EVERY FIELD IS ONE ROW — LABEL LEFT, VALUE RIGHT.
 *
 * ══ WHAT ROUND 4 ASSERTED ABOUT THE OLD GEOMETRY, AND WHERE IT WENT ═════════
 *
 * Round 4 specified the definition list as TWO 500px COLUMNS with a 36px gap,
 * each cell stacking its term over its description, plus `col-span-full` rows.
 * That is superseded. Searched before writing this file rather than assumed —
 * `grid-cols-2`, `gap-x-[36px]`, `grid-cols-3`, `gap-x-[20px]` and
 * `col-span-full` across the whole of test/ — and the finding is worth stating
 * plainly:
 *
 *   THE OLD TWO-COLUMN GEOMETRY WAS PINNED IN EXACTLY ONE PLACE, and it was not
 *   a layout assertion. `gap-x-[36px]` appeared once, in
 *   test/fs/tailwindArbitraryValueRules' measured-geometry list, whose claim is
 *   "this class is RENDERED and COMPILES" rather than "the list has two
 *   columns". It is RE-POINTED there onto `lg:grid-cols-[22%_1fr]`,
 *   `lg:gap-x-[1%]` and `py-[11px]`, and the old entry is left NAMED as
 *   deliberately-absent beside `h-[93px]`, so a reader comparing the list to the
 *   design file is not left wondering which is out of date.
 *
 *   NOTHING ELSE WAS DELETED, because nothing else existed. No test anywhere
 *   asserted the column count, the 36px gap, the 500px width, `col-span-full`,
 *   or that a `wide` row spanned anything. The two-column list shipped for three
 *   rounds with its geometry unguarded, which is exactly why this file exists in
 *   the shape it does.
 *
 * The `wide` prop is gone from the component and from all eight call sites. It
 * meant "span both columns"; there is one column.
 *
 * ══ NO REACT ROOT ═══════════════════════════════════════════════════════════
 * renderToStaticMarkup only — `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none') and once broke
 * twenty-eight of them. The edit FORMS sit behind `editSection`, which a click
 * sets and this tier cannot reach, so §8 renders `EditField` DIRECTLY rather
 * than pretending to open a card.
 *
 * ══ THE CONTROLS ARE IN A SCRIPT, NOT IN PROSE ══════════════════════════════
 * `node scripts/_control-field-rows.mjs list` names every break this file claims
 * to catch; `apply <name>` edits the source and prints the diff that landed;
 * `revert` puts it back. Each is recorded at the assertion it reddens.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const HISTORY = createElement('p', { id: 'history-slot-sentinel' }, 'ประวัติ');

const PUBLIC_DOC = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  courseCode: 'PBI-301',
  classId: 'class-9',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'teams',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' },
  attendeesListProvided: true,
  attendeesCount: 1,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' }],
  // THE INVOICE IS ON, so the address row — one of the two live long-value cases
  // — is actually on screen. Without it §4 would be asserting about a row the
  // fixture never renders.
  requestInvoice: true,
  invoice: {
    type: 'corporate',
    country: 'TH',
    companyName: 'บริษัท ทดสอบระบบการอบรมและพัฒนาบุคลากร จำกัด (สำนักงานใหญ่)',
    taxId: '0105551234567',
    branchType: 'head_office',
    thaiAddress: {
      addressLine: '1550 อาคารธนภูมิ ชั้น 23 ถนนเพชรบุรีตัดใหม่',
      subDistrict: 'มักกะสัน', district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
    },
  },
  notes: 'โทรยืนยันแล้ว',
  pricing: { pricePerSeat: 10000, seats: 1, subtotal: 10000, vatAmount: 700, total: 10700 },
  payment: { method: 'promptpay', omiseStatus: 'successful', omiseChargeId: 'chrg_1', paidAt: '2026-08-02T03:00:00.000Z' },
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

const INHOUSE_DOC = {
  _id: 'cccccccccccccccccccc0003',
  status: 'pending',
  companyName: 'บริษัท ทดสอบ จำกัด',
  quotationCompany: 'บริษัท ทดสอบ จำกัด',
  contactFirstName: 'สมชาย', contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.com', contactPhone: '0812345678',
  coursesInterested: ['EXC-201'],
  participantsCount: 15,
  contentMode: 'standard',
  contentDetails: 'เน้น Power Query และการทำ Data Model ให้ครบทั้งกระบวนการ',
  trainingFormat: 'onsite',
  preferredMonth: '2026-09',
  scheduleNote: 'ช่วงบ่าย',
  quotationCountry: 'TH',
  branchType: 'head_office',
  taxId: '0105551234567',
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

const ROUNDS = [{ _id: 'class-9', dates: ['2026-08-12', '2026-08-13'], type: 'hybrid', status: 'open' }];

const pub = (doc = PUBLIC_DOC, extra = {}) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc, rounds: ROUNDS, history: HISTORY, ...extra }));
const inh = (doc = INHOUSE_DOC, extra = {}) => renderToStaticMarkup(
  createElement(InhouseDetailClient, {
    doc, courses: [{ code: 'EXC-201', name: 'Excel Advanced' }], history: HISTORY, ...extra }));

const PUB = pub();
const INH = inh();
const BOTH = { PUB, INH };

// ── Probes ──────────────────────────────────────────────────────────────────

/**
 * The row's opening tag begins with its RHYTHM class, not with its split.
 *
 * That split is deliberate and it is what lets the controls work: a break that
 * changes the column ratio must still leave every row FINDABLE, or the probe
 * stops seeing rows and the assertion goes red for the wrong reason — reporting
 * "no rows" when the real defect is "the wrong ratio". `py-[11px]` is the row's
 * vertical rhythm and no control touches it.
 */
const ROW_OPEN = '<div class="py-[11px]';

/** Every `<dl>` on the page, with its own classes and its rows. */
function fieldLists(markup) {
  return [...markup.matchAll(/<dl class="([^"]*)">([\s\S]*?)<\/dl>/g)].map((m) => ({
    classes: m[1].split(/\s+/).filter(Boolean),
    inner: m[2],
    rows: m[2].split(ROW_OPEN).slice(1).map((part) => ROW_OPEN + part),
  }));
}

const allRows = (markup) => fieldLists(markup).flatMap((dl) => dl.rows);

/** A row's own class list — the FIRST class attribute, which is the row div's. */
const rowClasses = (row) => /^<div class="([^"]*)"/.exec(row)[1].split(/\s+/).filter(Boolean);

/** A row's `<dt>` inner markup, and its `<dd>` inner markup. */
const dtOf = (row) => /<dt[^>]*>([\s\S]*?)<\/dt>/.exec(row)?.[1] ?? null;
const ddOf = (row) => /<dd[^>]*>([\s\S]*?)<\/dd>/.exec(row)?.[1] ?? null;

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** The card region from one heading to the next `<section` — bounded at both ends. */
function cardRegion(markup, heading) {
  const start = markup.indexOf(`>${heading}<`);
  assert.notEqual(start, -1, `the ${heading} card heading is missing`);
  const next = markup.indexOf('<section', start);
  return markup.slice(start, next === -1 ? undefined : next);
}

/** Render a bare field list, for the component-level claims. */
const list = (...rows) => renderToStaticMarkup(createElement(DL, null, ...rows));
const row = (props) => createElement(DLRow, props);

// ════════════════════════════════════════════════════════════════════════════
// 1. ONE FIELD PER ROW, LABEL LEFT AND VALUE RIGHT
// ════════════════════════════════════════════════════════════════════════════

test('every field is a row of exactly one dt and one dd', () => {
  /**
   * The shape claim. Round 4's cell held a dt over a dd inside a grid CELL, and
   * two cells shared a row; the count of dt/dd per row was the same, so this is
   * not what separates the two shapes — §2 is. What this catches is a row that
   * grew a second field, which is how "one field per row" would quietly stop
   * being true while every other assertion here still passed.
   */
  for (const [name, markup] of Object.entries(BOTH)) {
    const rows = allRows(markup);
    assert.ok(rows.length >= 12, `${name}: only ${rows.length} field rows — the fixture is not exercising the screen`);
    for (const [i, r] of rows.entries()) {
      assert.equal((r.match(/<dt\b/g) ?? []).length, 1, `${name} row ${i}: not exactly one <dt>`);
      assert.equal((r.match(/<dd\b/g) ?? []).length, 1, `${name} row ${i}: not exactly one <dd>`);
      assert.ok(r.indexOf('<dt') < r.indexOf('<dd'), `${name} row ${i}: the value precedes the label`);
    }
  }
});

test('the label is the LEFT column and the value the RIGHT — a grid, not a stack', () => {
  // `lg:grid` plus a two-track template is what puts them side by side. Without
  // the template a `lg:grid` row is a single column and the value sits UNDER the
  // label, which is the pre-round-7 shape and looks identical in a text scan.
  for (const [name, markup] of Object.entries(BOTH)) {
    for (const [i, r] of allRows(markup).entries()) {
      const cs = rowClasses(r);
      assert.ok(cs.includes('lg:grid'), `${name} row ${i}: not a grid at lg — [${cs.join(' ')}]`);
      assert.ok(cs.some((c) => /^lg:grid-cols-\[/.test(c)),
        `${name} row ${i}: a grid with no column template — the value stacks under the label`);
      assert.ok(cs.includes('lg:items-baseline'),
        `${name} row ${i}: the label and value do not share a baseline`);
    }
  }
});

test('CONTROL: the row probe can tell a two-track row from a one-track one', () => {
  // Otherwise the assertion above passes on any grid at all, and the difference
  // between the new shape and the old one is precisely the second track.
  const twoTrack = `${ROW_OPEN} lg:grid lg:grid-cols-[22%_1fr]"><dt>a</dt><dd>b</dd></div>`;
  const oneTrack = `${ROW_OPEN} lg:grid"><dt>a</dt><dd>b</dd></div>`;
  assert.ok(rowClasses(twoTrack).some((c) => /^lg:grid-cols-\[/.test(c)));
  assert.equal(rowClasses(oneTrack).some((c) => /^lg:grid-cols-\[/.test(c)), false);
  // …and it does not mistake the OLD two-column list for a field row.
  assert.equal(fieldLists('<dl class="grid grid-cols-2 gap-x-[36px]"><div>x</div></dl>')[0].rows.length, 0,
    'the probe counted a round-4 cell as a round-7 row');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. (1) THE VALUE COLUMN STARTS AT THE SAME PLACE IN EVERY CARD
// ════════════════════════════════════════════════════════════════════════════

test('the column split is ONE shared source, byte-identical on every row of every card', () => {
  /**
   * ── THIS IS THE ASSERTION THE ROUND IS ABOUT ──────────────────────────────
   *
   * The single alignment down the whole page is most of the effect, and it
   * survives only if no card computes its own column. Two claims, and both are
   * needed:
   *
   *   · EXACTLY ONE distinct split across both screens and every card. A card
   *     with short labels — ข้อมูลระบบ is the live temptation — must not narrow.
   *   · That one split IS `FIELD_ROW_COLUMNS`, the exported constant. Without
   *     this half, twenty cards could agree by being twenty copies of the same
   *     string, which satisfies "consistent" and fails "single source": the next
   *     change would move nineteen of them.
   *
   * CONTROL `ratio` changes the constant to 30% and this stays GREEN — which is
   * the point, and is why the control script also prints the row count that
   * moved. A shared source is proved by every row FOLLOWING the constant, not by
   * the constant having a particular value. CONTROL `per-card` is the one that
   * reddens it: it gives ข้อมูลระบบ its own narrower split.
   */
  const expected = FIELD_ROW_COLUMNS.split(/\s+/).filter(Boolean);
  assert.ok(expected.length >= 3, 'FIELD_ROW_COLUMNS is too short to be a column split');

  const signatures = new Set();
  let counted = 0;
  for (const [name, markup] of Object.entries(BOTH)) {
    for (const [i, r] of allRows(markup).entries()) {
      const cs = rowClasses(r);
      // The layout half of the row's classes — everything except its rhythm.
      signatures.add(cs.filter((c) => c !== 'py-[11px]').join(' '));
      for (const token of expected) {
        assert.ok(cs.includes(token), `${name} row ${i}: missing ${token} from the shared split`);
      }
      counted += 1;
    }
  }
  assert.ok(counted >= 25, `only ${counted} rows across both screens — too few to prove a shared alignment`);
  assert.equal(signatures.size, 1,
    `${signatures.size} different column splits are in use:\n  ${[...signatures].join('\n  ')}`);
  assert.equal([...signatures][0], expected.join(' '),
    'the rows agree with each other but not with FIELD_ROW_COLUMNS — the constant is not the source');
});

test('the ratio puts the value column at 23% — the label 22% plus a 1% gutter', () => {
  // The proportions from the reference image at a 1017px inner width, as RATIOS
  // rather than px because the sidebar collapses. Read off the constant, so this
  // is the one place a number is written down twice on purpose: here and in the
  // component, which is what makes a silent change to it a red test.
  assert.match(FIELD_ROW_COLUMNS, /lg:grid-cols-\[22%_1fr\]/, 'the label column is not 22%');
  assert.match(FIELD_ROW_COLUMNS, /lg:gap-x-\[1%\]/, 'the gutter is not 1%, so the value column does not start at 23%');
});

test('no card carries a column split of its own, outside the shared constant', () => {
  // The other direction of the same claim: a card that added a grid to its DL —
  // rather than to its rows — would put a second geometry on the page that the
  // per-row assertion above cannot see, because it does not look at the `<dl>`.
  for (const [name, markup] of Object.entries(BOTH)) {
    for (const dl of fieldLists(markup)) {
      for (const c of dl.classes) {
        assert.ok(!/^(lg:)?grid/.test(c), `${name}: a field list carries its own grid class "${c}"`);
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. (2) THE DIVIDER GOES BETWEEN ROWS AND NEVER AFTER THE LAST
// ════════════════════════════════════════════════════════════════════════════

test('the divider belongs to the LIST, not to the row', () => {
  /**
   * ── WHY THIS IS THE STRONGEST FORM AVAILABLE ──────────────────────────────
   *
   * `divide-y` compiles to `& > :not([hidden]) ~ :not([hidden])` — a border-TOP
   * on every child after the first. A trailing rule is therefore not avoided, it
   * is UNEXPRESSIBLE: there is no last child to suppress and a single row has no
   * sibling to pair with.
   *
   * So the assertion is in two halves, and the second is the one with teeth: the
   * mechanism that CANNOT trail is present, and the mechanism that CAN — a
   * per-row bottom border, with or without a `last:` escape — is absent. Written
   * the first way alone it would pass on a row list that carried BOTH.
   *
   * The compiled selector itself is pinned in test/fs/tailwindArbitraryValueRules
   * (`divide-y` is sibling-based, not `:last-child`-based), because a markup
   * assertion cannot see what the class actually does.
   */
  for (const [name, markup] of Object.entries(BOTH)) {
    const lists = fieldLists(markup);
    assert.ok(lists.length >= 4, `${name}: only ${lists.length} field lists — the fixture is too thin`);
    for (const [i, dl] of lists.entries()) {
      assert.ok(dl.classes.includes('divide-y'), `${name} list ${i}: no divider mechanism at all`);
      assert.ok(dl.classes.includes('divide-[var(--surface-border)]'),
        `${name} list ${i}: the divider has no colour — a 1px transparent rule is not a hairline`);
    }
    for (const [i, r] of allRows(markup).entries()) {
      for (const c of rowClasses(r)) {
        assert.ok(!/^(lg:)?(last:)?border-b/.test(c),
          `${name} row ${i}: the row draws its own bottom rule ("${c}") — that is the trailing-divider trap`);
      }
    }
  }
});

test('a card with ONE row emits no divider at all', () => {
  /**
   * The degenerate case, and the one a per-row `border-b` + `last:border-b-0`
   * gets right by accident while getting the dropped-row case wrong. Rendered
   * from a document whose coordinator has a name and nothing else, so the card
   * genuinely has one row rather than being trimmed by the probe.
   */
  const oneRow = pub({
    ...PUBLIC_DOC,
    coordinator: { firstName: 'ปรีชา', lastName: 'ตั้งใจ' },
  });
  const card = cardRegion(oneRow, 'ผู้ประสานงาน');
  const lists = fieldLists(card);
  assert.equal(lists.length, 1, 'the coordinator card does not hold exactly one field list');
  assert.equal(lists[0].rows.length, 1, `the card has ${lists[0].rows.length} rows, not one`);
  assert.equal(textOf(dtOf(lists[0].rows[0])), 'ชื่อ-นามสกุล', 'the surviving row is not the name row');
  // Nothing in the single row draws a rule, and the list's own `divide-y` has no
  // sibling pair to paint between.
  for (const c of rowClasses(lists[0].rows[0])) {
    assert.ok(!/border/.test(c), `a single row still carries a border class: ${c}`);
  }
});

test('CONTROL: the border probe DOES fire on a row that draws its own rule', () => {
  // Without this the "no trailing divider" claim passes on any markup, including
  // markup with no rows at all, and would go on passing if the pattern were
  // misspelled.
  const guilty = `${ROW_OPEN} border-b border-[var(--surface-border)] lg:grid"><dt>a</dt><dd>b</dd></div>`;
  assert.ok(rowClasses(guilty).some((c) => /^(lg:)?(last:)?border-b/.test(c)), 'the probe cannot see a per-row rule');
  const escaped = `${ROW_OPEN} border-b last:border-b-0 lg:grid"><dt>a</dt><dd>b</dd></div>`;
  assert.ok(rowClasses(escaped).some((c) => /^(lg:)?(last:)?border-b/.test(c)),
    'the probe is fooled by a last: escape — which is the shape it exists to reject');
  // …and it does not fire on the border classes the SECTION CARD legitimately has.
  assert.equal(rowClasses(`${ROW_OPEN} lg:grid"><dt>a</dt><dd>b</dd></div>`)
    .some((c) => /^(lg:)?(last:)?border-b/.test(c)), false);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. (3) A LONG VALUE WRAPS INSIDE THE VALUE COLUMN
// ════════════════════════════════════════════════════════════════════════════

test('the value column can shrink — `min-w-0` is on the dd, and it is load-bearing', () => {
  /**
   * ── WHAT THIS CAN AND CANNOT MEASURE, STATED ──────────────────────────────
   *
   * Nothing here lays anything out, so "the address wraps inside its column" is
   * not directly observable. What IS observable is the mechanism, and the
   * mechanism is exact: the value track is `1fr`, which is `minmax(auto, 1fr)`,
   * so its minimum is the item's min-content contribution UNLESS the item sets
   * `min-width`. `min-w-0` is what clamps that to zero.
   *
   * Without it a long unbroken value widens the value track, the label track
   * gives up its share, and the alignment §2 asserts is gone on exactly the rows
   * where it matters most. So this is not a wrapping assertion dressed up — it
   * is the assertion that (1) survives (3).
   *
   * `minmax(0,1fr)` in the template would have been the other way to say it, and
   * it COMPILES TO NOTHING — see the note on FIELD_ROW_COLUMNS and
   * scripts/_probe-field-row-columns.mjs. That is why the clamp is on the item.
   */
  for (const [name, markup] of Object.entries(BOTH)) {
    for (const [i, r] of allRows(markup).entries()) {
      const dd = /<dd class="([^"]*)"/.exec(r);
      assert.ok(dd, `${name} row ${i}: the dd has no class attribute`);
      assert.ok(dd[1].split(/\s+/).includes('min-w-0'),
        `${name} row ${i}: the value cell cannot shrink — a long value will widen the column and break the alignment`);
    }
  }
});

test('a long value lives ENTIRELY in the dd — it never leaks into the label', () => {
  // The live cases: the billing address on the public screen and the content
  // detail in-house. Asserted as containment rather than as wrapping, which is
  // the honest claim for static markup: the dt holds the label and nothing else,
  // so there is no line under the label for the value to wrap onto.
  const addressRow = allRows(PUB).find((r) => textOf(dtOf(r)) === 'ที่อยู่');
  assert.ok(addressRow, 'the billing address row did not render — the invoice fixture is not on');
  assert.equal(textOf(dtOf(addressRow)), 'ที่อยู่', 'the label cell holds more than the label');
  assert.ok(textOf(ddOf(addressRow)).includes('เพชรบุรีตัดใหม่'), 'the address is not in the value cell');
  assert.ok(textOf(ddOf(addressRow)).length > 40, 'the address fixture is too short to be a long value');

  const detailRow = allRows(INH).find((r) => textOf(dtOf(r)) === 'รายละเอียดเนื้อหา');
  assert.ok(detailRow, 'the in-house content-detail row did not render');
  assert.equal(textOf(dtOf(detailRow)), 'รายละเอียดเนื้อหา');
  assert.ok(textOf(ddOf(detailRow)).includes('Power Query'));
});

// ════════════════════════════════════════════════════════════════════════════
// 5. (4) A NODE VALUE KEEPS ITS FORM, AT THE SAME LEFT EDGE AS TEXT
// ════════════════════════════════════════════════════════════════════════════

test('a node value and a text value sit in the SAME wrapper, so they share a left edge', () => {
  /**
   * The requirement is that a value which is a chip keeps its chip and starts
   * where a text value starts. Both halves reduce to one checkable fact: the row
   * puts EVERY value inside the same `<span class="min-w-0">` and inspects
   * nothing about what the value is.
   *
   * ── AND A FINDING WORTH RECORDING ─────────────────────────────────────────
   * รูปแบบการอบรม is named as the live chip case. IT IS NOT A CHIP TODAY on
   * either screen: `scheduleLabel()` returns the string 'Hybrid · Teams' and the
   * in-house รูปแบบ row returns 'Onsite' out of TRAINING_FORMAT_LABEL. Both are
   * plain text. No chip was added — that is a new visual treatment rather than a
   * row-layout change, and the standing instruction is to stop and ask. So what
   * is asserted is the property a chip would need, exercised against the node
   * values that ARE live: the mono reference number, the mailto link, and the
   * bold ยอดสุทธิ total.
   */
  const nodeRow = allRows(PUB).find((r) => textOf(dtOf(r)) === 'เลขอ้างอิง');
  const textRow = allRows(PUB).find((r) => textOf(dtOf(r)) === 'แหล่งที่มา');
  assert.ok(nodeRow && textRow, 'the reference-number or source row did not render');

  const WRAPPER = '<span class="min-w-0">';
  assert.ok(ddOf(nodeRow).includes(WRAPPER), 'a node value is not in the shared value wrapper');
  assert.ok(ddOf(textRow).includes(WRAPPER), 'a text value is not in the shared value wrapper');
  // The node survived INSIDE that wrapper rather than being flattened to text.
  assert.match(ddOf(nodeRow), /<span class="min-w-0"><span class="font-mono/,
    'the mono span was unwrapped or re-nested — a chip would lose its chip the same way');

  // รูปแบบการอบรม renders, and it renders as text — recorded so the finding above
  // is an assertion rather than a claim in a comment.
  const formatRow = allRows(PUB).find((r) => textOf(dtOf(r)) === 'รูปแบบการอบรม');
  assert.ok(formatRow, 'the รูปแบบการอบรม row is gone');
  assert.equal(ddOf(formatRow), `${WRAPPER}Hybrid · Teams</span>`,
    'รูปแบบการอบรม is no longer plain text — if it became a chip, say so and re-point this');
});

test('an `action` sits beside the value, inside the value column', () => {
  // The in-house CopyButton. It must not become a third column, or the value
  // column stops running to the card's right edge.
  const copyRow = allRows(INH).find((r) => (ddOf(r) ?? '').includes('<button'));
  assert.ok(copyRow, 'no row on the in-house screen renders an action button');
  assert.equal((copyRow.match(/<dd\b/g) ?? []).length, 1, 'the action grew its own cell');
  assert.match(/<dd class="([^"]*)"/.exec(copyRow)[1], /justify-between/,
    'the action is not pushed to the value column’s right edge');
});

// ════════════════════════════════════════════════════════════════════════════
// 6. (5) ABSENT MEANS ABSENT — INCLUDING A WRAPPED EMPTY
// ════════════════════════════════════════════════════════════════════════════

/**
 * ROUND 5's DEFECT, AS A FIXTURE TABLE.
 *
 * A REACT ELEMENT IS ALWAYS TRUTHY, so the old test —
 * `value === null || undefined || '' || false` — let a wrapper around nothing
 * through and rendered a label, a row and a rule around empty space. Every call
 * site that wraps its value had to repeat the guard, and four of them do.
 *
 * `null` alone would not have caught it, which is why the table below is mostly
 * wrappers.
 */
const EMPTY_VALUES = [
  ['null',                 null],
  ['undefined',            undefined],
  ['empty string',         ''],
  ['false',                false],
  ['true',                 true],
  ['empty array',          []],
  ['array of empties',     ['', null, undefined]],
  ['span wrapping ""',     createElement('span', { className: 'font-mono text-[11px]' }, '')],
  ['span wrapping null',   createElement('span', { className: 'font-mono text-[11px]' }, null)],
  ['fragment of nothing',  createElement(Fragment, null, null)],
  ['fragment of empties',  createElement(Fragment, null, '', null, false)],
  ['nested wrappers',      createElement('span', null, createElement('span', null, ''))],
  ['span wrapping []',     createElement('span', null, [])],
];

const PRESENT_VALUES = [
  ['a string',            'web'],
  ['the number zero',     0],
  ['a span with text',    createElement('span', { className: 'font-mono' }, 'AAAA0001')],
  ['a fragment with one', createElement(Fragment, null, '', 'x')],
  ['an array with one',   ['', 'x']],
  ['a self-drawing tag',  createElement('img', { src: '/x.png', alt: 'x' })],
  ['a component element', createElement(() => createElement('span', null, 'c'), null)],
];

test('a field with no value emits NO row — a wrapper does not defeat it', () => {
  for (const [name, value] of EMPTY_VALUES) {
    assert.equal(isEmptyValue(value), true, `${name}: isEmptyValue said it was present`);
    const html = list(row({ label: 'ทดสอบ', value }));
    assert.equal(html, '<dl class="divide-y divide-[var(--surface-border)]"></dl>',
      `${name}: rendered a row — ${html}`);
    assert.ok(!html.includes('ทดสอบ'), `${name}: the label rendered without a value`);
  }
});

test('…and no divider either, because the divider was never the row’s', () => {
  // The two rules are ONE mechanism here rather than two that must agree. A
  // dropped row cannot leave a rule behind: `divide-y` paints between siblings
  // that exist, so a row that is not rendered has no sibling pair.
  const html = list(
    row({ label: 'ก', value: 'first' }),
    row({ label: 'ข', value: createElement('span', null, '') }),
    row({ label: 'ค', value: 'last' }),
  );
  const dl = fieldLists(html)[0];
  assert.equal(dl.rows.length, 2, `the wrapped-empty row rendered: ${html}`);
  assert.deepEqual(dl.rows.map((r) => textOf(dtOf(r))), ['ก', 'ค']);
  for (const r of dl.rows) {
    for (const c of rowClasses(r)) assert.ok(!/border/.test(c), `a row carries its own rule: ${c}`);
  }
});

test('CONTROL: a value that is genuinely present DOES render a row', () => {
  // Without this, `isEmptyValue` returning true for EVERYTHING would satisfy
  // every assertion above. The zero and the component element are the two the
  // recursion could plausibly over-reach on.
  for (const [name, value] of PRESENT_VALUES) {
    assert.equal(isEmptyValue(value), false, `${name}: isEmptyValue swallowed a real value`);
    const html = list(row({ label: 'ทดสอบ', value }));
    assert.ok(fieldLists(html)[0].rows.length === 1, `${name}: a present value rendered no row`);
    assert.ok(html.includes('ทดสอบ'), `${name}: the row rendered without its label`);
  }
});

test('emptyHint is the one exception, and it renders a row AND takes a divider', () => {
  // An onsite enquiry with no venue is work for a salesperson, not a blank to
  // hide. A hinted row is an ordinary row in every other respect — including
  // that it participates in the rules — or the hint would be visually detached
  // from the list it belongs to.
  const html = list(
    row({ label: 'ก', value: 'x' }),
    row({ label: 'สถานที่', value: '', emptyHint: 'ยังไม่ได้ระบุ' }),
  );
  const dl = fieldLists(html)[0];
  assert.equal(dl.rows.length, 2, 'the hinted row did not render');
  assert.match(ddOf(dl.rows[1]), /italic/, 'the hint is not distinguished from a real value');
  assert.ok(textOf(ddOf(dl.rows[1])).includes('ยังไม่ได้ระบุ'));
  // And a WRAPPED empty with a hint takes the hint, not the wrapper.
  const wrapped = list(row({
    label: 'สถานที่', value: createElement('span', null, ''), emptyHint: 'ยังไม่ได้ระบุ',
  }));
  assert.ok(textOf(wrapped).includes('ยังไม่ได้ระบุ'), 'a wrapped empty with a hint lost its hint');
  assert.ok(!wrapped.includes('<span class="min-w-0"><span'), 'the empty wrapper rendered beside the hint');
});

// ════════════════════════════════════════════════════════════════════════════
// 7. ข้อมูลระบบ IS ROWS NOW, NOT A THREE-COLUMN GRID
// ════════════════════════════════════════════════════════════════════════════

test('the ข้อมูลระบบ card uses the same field list as every other card', () => {
  /**
   * THE DECISION: rows, for (1). It was the one card on either screen that did
   * not use the shared list, and it is the LAST card on both — the one a reader
   * reaches with the alignment already established, so a three-column grid there
   * breaks the line at the bottom of every page.
   *
   * It holds SIX rows on the public screen and FIVE in-house; the three was the
   * COLUMN count, not a field count. Asserted, because "it holds three short
   * values" is the natural misreading of the old markup and it is the whole
   * trade-off.
   */
  for (const [name, markup, floor] of [['PUB', PUB, 5], ['INH', INH, 4]]) {
    const card = cardRegion(markup, 'ข้อมูลระบบ');
    const lists = fieldLists(card);
    assert.equal(lists.length, 1, `${name}: the system card does not hold exactly one field list`);
    assert.ok(lists[0].rows.length >= floor,
      `${name}: the system card has ${lists[0].rows.length} rows, expected at least ${floor}`);
    assert.ok(lists[0].classes.includes('divide-y'), `${name}: the system card's list has no dividers`);
    for (const [i, r] of lists[0].rows.entries()) {
      const cs = rowClasses(r);
      for (const token of FIELD_ROW_COLUMNS.split(/\s+/)) {
        assert.ok(cs.includes(token), `${name}: system-card row ${i} does not share the page's column split`);
      }
    }
  }
});

test('the three-column grid is gone from both screens, and so is the two-column one', () => {
  // The delete, asserted rather than assumed — a DL left behind a falsy branch
  // would satisfy every assertion above while still being in the tree.
  for (const [name, markup] of Object.entries(BOTH)) {
    for (const dead of ['grid-cols-3', 'gap-x-[20px]', 'grid-cols-2', 'gap-x-[36px]', 'col-span-full']) {
      assert.ok(!markup.includes(dead), `${name}: the superseded class ${dead} is still rendered`);
    }
  }
});

test('CONTROL: those class names are ones the probe could actually find', () => {
  // Four of the five are absent from a correct render, so the assertion above is
  // four absences in a row — the shape that passes on an empty string. Run the
  // same matcher against markup that HAS them.
  const old = '<dl class="grid grid-cols-2 gap-x-[36px] gap-y-[18px]">'
    + '<div class="min-h-[40px] col-span-full"></div></dl>'
    + '<dl class="grid grid-cols-3 gap-x-[20px]"></dl>';
  for (const dead of ['grid-cols-3', 'gap-x-[20px]', 'grid-cols-2', 'gap-x-[36px]', 'col-span-full']) {
    assert.ok(old.includes(dead), `the probe cannot see ${dead} even when it is there`);
  }
  // `sm:grid-cols-2` on an EDIT form must not be mistaken for the old DL — §8
  // depends on that form keeping its two-up grid.
  assert.ok(!'<div class="grid gap-3 sm:grid-cols-2">'.includes('"grid grid-cols-2'),
    'the probe would fire on an edit form’s own grid');
});

// ════════════════════════════════════════════════════════════════════════════
// 8. THE EDIT VIEW KEEPS LABEL-ABOVE-CONTROL, DELIBERATELY
// ════════════════════════════════════════════════════════════════════════════

test('an edit control stacks its label ABOVE it and takes no field-row split', () => {
  /**
   * THE DECISION, PINNED SO IT CANNOT DRIFT EITHER WAY. The read view moved to
   * label-left; the edit forms did not, and the reasons are on `EditField` in
   * detailShell — a control wants the width the label column would take, and a
   * label at the point of focus wants to be directly above its input rather than
   * across a gutter.
   *
   * Rendered DIRECTLY rather than through a card, because the edit branch sits
   * behind `editSection` and this tier cannot click. That is the honest way to
   * reach it; opening the card is not available and pretending otherwise would
   * make this an assertion about the read view.
   *
   * Both directions are asserted: the label IS a block above, and the field does
   * NOT carry the row split. Without the second half a future change could add
   * label-left to the form and this would stay green.
   */
  const html = renderToStaticMarkup(createElement(EditField, {
    label: 'อีเมล', value: 'a@b.c', onChange: () => {},
  }));
  assert.match(html, /<label class="[^"]*\bblock\b[^"]*">/, 'the edit label is not a block above its control');
  assert.ok(html.indexOf('<label') < html.indexOf('<input'), 'the control precedes its label');
  for (const token of FIELD_ROW_COLUMNS.split(/\s+/)) {
    assert.ok(!html.includes(token), `the edit field took the read view's column split (${token})`);
  }
  assert.ok(!html.includes('<dt'), 'the edit field became a definition-list row');
});

test('the edit forms keep their own two-up grid — the read view has no such thing', () => {
  // `sm:grid-cols-2` is the edit forms' shape and it is NOT the DL's old
  // `grid-cols-2`. Asserting the difference here is what stops §7's delete check
  // from being read as "no two-column anything survives".
  const cancelledFree = pub();
  assert.ok(!cancelledFree.includes('"grid grid-cols-2'), 'the read view has a bare two-column grid');
  // The read view renders no edit control at all, so the form's own grid is not
  // observable from here — its shape is asserted on the component above.
  assert.ok(!cancelledFree.includes('<input type="email"'), 'an edit control is rendering in the read view');
});

// ════════════════════════════════════════════════════════════════════════════
// 9. ROUND 1'S READ-ONLY RULES, THROUGH THE RESTYLE
// ════════════════════════════════════════════════════════════════════════════

/**
 * ── RE-VERIFIED, NOT RE-POINTED, AND THE DIFFERENCE MATTERS ────────────────
 *
 * Round 1's rules are asserted in test/render/registrationCancelledReadOnly and
 * test/render/registrationAttendeeTab, and NEITHER was touched by this round:
 * they read card HEADERS (`>แก้ไข<`), the attendee tab's + button, and
 * `role="menuitem"`. None of them ever read the definition list's geometry, so
 * there was nothing to re-point and nothing was weakened. Both files are green
 * against the new markup, which is the evidence.
 *
 * What is added here is the half those files cannot make: that the lock did not
 * take the CONTENT with it. A cancelled record with no cards at all would
 * satisfy every "no แก้ไข" assertion ever written.
 */
test('a cancelled record loses every edit affordance and keeps its field rows', () => {
  const cancelled = pub({ ...PUBLIC_DOC, status: 'cancelled' });
  assert.equal((cancelled.match(/>แก้ไข</g) ?? []).length, 0, 'a cancelled record kept a แก้ไข button');
  assert.ok(!cancelled.includes('เพิ่มผู้เข้าอบรม'), 'a cancelled record kept the + add button');
  assert.ok(cancelled.includes('ลบใบสมัครนี้'), 'delete did not survive the read-only state');

  // …and the record is still READABLE. This is the half the other files cannot
  // assert, and the restyle is exactly the kind of change that could break it.
  const rows = allRows(cancelled);
  assert.ok(rows.length >= 12, `a cancelled record renders only ${rows.length} field rows`);
  assert.ok(rows.some((r) => textOf(dtOf(r)) === 'หลักสูตร'), 'the course row is gone on a cancelled record');
  assert.ok(rows.some((r) => textOf(dtOf(r)) === 'เลขอ้างอิง'), 'the reference number is gone');
});

test('CONTROL: the same document, NOT cancelled, does render those affordances', () => {
  // Otherwise every absence above is satisfied by a screen that offers no edit
  // to anyone — and the row-count floor is satisfied by any long page.
  assert.ok((PUB.match(/>แก้ไข</g) ?? []).length > 0, 'no card offers an edit on an editable record');
  assert.ok(PUB.includes('เพิ่มผู้เข้าอบรม'), 'the + button is missing from an editable record');
  assert.equal(allRows(pub({ ...PUBLIC_DOC, status: 'cancelled' })).length, allRows(PUB).length,
    'cancelling changed the NUMBER of field rows — the lock is dropping content, not just controls');
});

test('the in-house screen answers the same way', () => {
  // The rule is one rule expressed once, so it must hold on the source that did
  // not write it. `readOnly` gates `onEdit` on both clients.
  const cancelled = inh({ ...INHOUSE_DOC, status: 'cancelled' });
  assert.equal((cancelled.match(/>แก้ไข</g) ?? []).length, 0, 'a cancelled in-house request kept a แก้ไข button');
  assert.ok((INH.match(/>แก้ไข</g) ?? []).length > 0, 'the editable in-house request offers none either');
  assert.equal(allRows(cancelled).length, allRows(INH).length, 'the in-house lock dropped field rows');
});
