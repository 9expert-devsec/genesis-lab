import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import {
  DETAIL_FIELD_VALUE, DETAIL_FIELD_LABEL, DETAIL_CARD_HEADING,
} from '@/app/admin/registrations/_components/detailShell';
import { readSource } from '../sourceScan.mjs';
import {
  fontMetrics, textWidthEm, DETAIL_TYPE_PAIRS, DETAIL_LABELS, NARROWEST_LABEL_TRACK_PX,
} from '../../scripts/_probe-thai-type-metrics.mjs';

/**
 * ROUND 11: THE TYPE SCALE IS THREE CONSTANTS, AND THE CARDS HOLD NONE OF IT.
 *
 * ══ WHAT THIS FILE IS FOR ═══════════════════════════════════════════════════
 *
 * Values became 16px and card headings became smaller. The requirement was not
 * "the values are 16px" — that is trivially satisfiable by walking the cards —
 * it was that BOTH SIZES LIVE IN ONE PLACE, so a change to the shared row moves
 * every card and a size written into one card is caught.
 *
 * The two halves of that are asserted separately, because they fail separately:
 *
 *   §1  THE RENDER — every `<dd>`, every `<dt>` and every card heading on BOTH
 *       screens carries the exact shared class string. This is the half that
 *       says a change to the constant reaches the whole page.
 *   §2  THE SOURCE — the literals appear in detailShell and NOWHERE else in the
 *       detail tree. This is the half that says a card cannot grow its own.
 *
 * Neither is sufficient. §1 alone passes on a tree where every card spells the
 * same literal by hand; §2 alone passes on a constant nothing renders.
 *
 * ══ AND §3 IS THE ONE A MARKUP ASSERTION CANNOT MAKE ════════════════════════
 *
 * THAI RENDERS TALLER THAN LATIN AT THE SAME px, and no amount of reading the
 * markup reveals it. `scripts/_probe-thai-type-metrics.mjs` reads LINE SEED SANS
 * TH's own `hhea` out of the woff2 and hands back the two numbers that decide a
 * line-height. §3 holds every pair this round ships against them.
 *
 * That is a REAL measurement against a REAL file, not a rule of thumb — and it
 * found a defect that had already shipped: the ข้อมูลระบบ heading was 12px in a
 * 17px line box, which is 1.42em against the font's own 1.584em.
 *
 * ══ THE CONTROLS ARE IN A SCRIPT ════════════════════════════════════════════
 * `node scripts/_control-round11.mjs list` names every break this file claims to
 * catch; `apply <name>` edits the real source and prints the diff; `revert` puts
 * it back. Each is recorded at the assertion it reddens, including the two that
 * are expected to leave part of the suite GREEN — those are measurements.
 *
 * ══ NO REACT ROOT ═══════════════════════════════════════════════════════════
 * renderToStaticMarkup only. `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none').
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * FULL ENOUGH THAT EVERY VALUE SHAPE IS ON SCREEN. A fixture that renders only
 * strings would let a chip, a link or the mono id keep a size of its own and
 * §1 would never look at it — the same blind spot the list-screen harvest hit
 * with a document carrying one `scheduleType`.
 */
const PUBLIC_DOC = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  courseCode: 'PBI-301',
  classId: 'class-9',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'hybrid',
  attendanceMode: 'teams',
  // `isAttending` is TRUE so the (ผู้ประสานงาน) marker renders — it is one of
  // the three pieces of table CHROME this file asserts did NOT follow the values,
  // and a fixture without it makes that assertion vacuous.
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678', isAttending: true },
  attendeesListProvided: true,
  attendeesCount: 2,
  attendees: [
    { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' },
    { firstName: 'ปรีชา', lastName: 'ตั้งใจ' }, // the two dash cells
  ],
  requestInvoice: true,
  invoice: {
    type: 'corporate', country: 'TH',
    companyName: 'บริษัท ทดสอบระบบการอบรมและพัฒนาบุคลากร จำกัด',
    taxId: '0105551234567', branchType: 'head_office',
    thaiAddress: {
      addressLine: '1550 อาคารธนภูมิ ชั้น 23', subDistrict: 'มักกะสัน',
      district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
    },
  },
  // The Omise card, so the mono charge link and the bold total are rendered.
  payment: {
    method: 'credit_card', omiseStatus: 'successful',
    omiseChargeId: 'chrg_test_5xyz', paidAt: '2026-08-02T04:00:00.000Z',
  },
  pricing: { pricePerSeat: 12000, seats: 2, subtotal: 24000, vatAmount: 1680, total: 25680 },
  consent: { dataChecked: true, noRefund: true, changePolicy: true, termsAccepted: true, acceptedAt: '2026-08-01T03:00:00.000Z', ipAddress: '1.2.3.4' },
  notes: 'ขอใบเสนอราคาก่อนชำระเงิน',
  internalNotes: [{ body: 'โทรแจ้งลูกค้าแล้ว', authorName: 'แอดมิน', createdAt: '2026-08-02T02:00:00.000Z' }],
  createdAt: '2026-08-01T03:00:00.000Z',
};

/** The INDIVIDUAL branch, which is where the new ชื่อ-นามสกุล copy row lives. */
const PUBLIC_INDIVIDUAL = {
  ...PUBLIC_DOC,
  invoice: { ...PUBLIC_DOC.invoice, type: 'individual', firstName: 'สมชาย', lastName: 'ใจดี' },
};

const INHOUSE_DOC = {
  _id: 'cccccccccccccccccccc0003',
  status: 'pending',
  companyName: 'บริษัท ทดสอบ จำกัด',
  quotationCompany: 'บริษัท ทดสอบสำหรับใบเสนอราคา จำกัด', // diverges → the longest label renders
  contactFirstName: 'สมชาย', contactLastName: 'ใจดี',
  contactEmail: 'somchai@example.com', contactPhone: '0812345678',
  contactRole: 'ผู้จัดการ', contactDepartment: 'ฝ่ายบุคคล', contactLine: '@somchai',
  coursesInterested: ['EXC-201'],
  participantsCount: 15,
  trainingFormat: 'onsite',
  onsiteVenue: {
    addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน',
    district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
  },
  quotationCountry: 'TH', branchType: 'head_office', taxId: '0105551234567',
  thaiAddress: {
    addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน',
    district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
  },
  message: 'ต้องการอบรมช่วงต้นปีหน้า',
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
};

const pub = (doc) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc, history: null }));
const inh = (doc) => renderToStaticMarkup(
  // `courses` resolves the code to a NAME, which is what makes CourseList render
  // its two-line name-over-code shape rather than the bare code.
  createElement(InhouseDetailClient, { doc, courses: [{ code: 'EXC-201', name: 'Excel Advanced' }], history: null }));

const SCREENS = {
  'public/corporate': pub(PUBLIC_DOC),
  'public/individual': pub(PUBLIC_INDIVIDUAL),
  'public/cancelled': pub({ ...PUBLIC_DOC, status: 'cancelled' }),
  inhouse: inh(INHOUSE_DOC),
  'inhouse/cancelled': inh({ ...INHOUSE_DOC, status: 'cancelled' }),
};

// ── Probes ──────────────────────────────────────────────────────────────────

/**
 * Every `<dd …>` element's OWN class attribute.
 *
 * `<dd>` cannot nest inside `<dd>`, so splitting on the open tag and taking the
 * class attribute off each piece is exact rather than a heuristic.
 */
const ddClasses = (markup) => markup.split('<dd ').slice(1)
  .map((piece) => piece.slice(0, piece.indexOf('>')))
  .map((tag) => (tag.match(/class="([^"]*)"/) ?? [, ''])[1]);

const dtClasses = (markup) => markup.split('<dt ').slice(1)
  .map((piece) => piece.slice(0, piece.indexOf('>')))
  .map((tag) => (tag.match(/class="([^"]*)"/) ?? [, ''])[1]);

/** The INNER HTML of every dd, i.e. the value and its action. */
const ddBodies = (markup) => markup.split('<dd ').slice(1)
  .map((piece) => piece.slice(piece.indexOf('>') + 1))
  .map((rest) => rest.slice(0, rest.indexOf('</dd>')));

/** Every `<h2 …>` class attribute — the card headings, both kinds. */
const h2Classes = (markup) => markup.split('<h2 ').slice(1)
  .map((piece) => piece.slice(0, piece.indexOf('>')))
  .map((tag) => (tag.match(/class="([^"]*)"/) ?? [, ''])[1]);

/**
 * Every text-size utility in a blob of markup, arbitrary or named.
 *
 * ── THE TRAILING BOUNDARY IS `(?![-\w])` AND NOT `\b`, AND THAT WAS MEASURED ─
 * `\b` after `text-[16px]` asks for a word character next, and the next
 * character in real markup is `"` or a space — both non-word, so the boundary
 * never matched and this probe returned an EMPTY SET for every arbitrary size
 * on the page. Which is the direction that passes: the subset check below is
 * satisfied by finding nothing.
 *
 * Its own control caught it, on the first run, which is the only reason it is
 * not still there. `text-[var(--…)]` is still excluded, by `[0-9.]+px` rather
 * than by the boundary.
 */
const sizeClassesIn = (html) => new Set(
  [...html.matchAll(/\btext-(?:\[[0-9.]+px\]|xs|sm|base|lg|xl|[2-9]xl)(?![-\w])/g)].map((m) => m[0]),
);

const DETAIL_SOURCES = [
  'src/app/admin/registrations/_components/detailShell.jsx',
  'src/app/admin/registrations/_components/RegistrationDetailClient.jsx',
  'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx',
];
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

// ════════════════════════════════════════════════════════════════════════════
// §1  THE RENDER — one class string, on every row of every card
// ════════════════════════════════════════════════════════════════════════════

test('the sizes under test are the ones this file names', () => {
  /**
   * The constants are imported, not re-spelled, so §2 below cannot pass by
   * agreeing with a copy of itself. These four lines are the only place the
   * expected numbers appear as literals, and they are what makes every other
   * assertion in this file a claim about a SPECIFIC scale rather than about
   * whatever the component happens to export.
   */
  assert.equal(DETAIL_FIELD_VALUE, 'text-[16px] leading-[28px]');
  assert.equal(DETAIL_FIELD_LABEL, 'text-[13px] leading-[21px] lg:leading-[28px]');
  assert.equal(DETAIL_CARD_HEADING, 'text-[14px] font-bold leading-[23px]');
});

test('EVERY value cell on BOTH screens carries the one shared value class', () => {
  for (const [name, markup] of Object.entries(SCREENS)) {
    const cells = ddClasses(markup);
    assert.ok(cells.length >= 8, `${name}: only ${cells.length} field rows — the fixture is too thin`);
    for (const cls of cells) {
      assert.ok(cls.includes('text-[16px]'), `${name}: a value cell is not 16px — "${cls}"`);
      assert.ok(cls.includes('leading-[28px]'), `${name}: a value cell lost its line-height — "${cls}"`);
    }
  }
});

test('EVERY label cell carries the one shared label class, at both widths', () => {
  for (const [name, markup] of Object.entries(SCREENS)) {
    const cells = dtClasses(markup);
    assert.equal(cells.length, ddClasses(markup).length, `${name}: dt and dd counts disagree`);
    for (const cls of cells) {
      // Stacked below `lg`, on the value's baseline at `lg` and above. Both are
      // asserted: a label that kept only one of them reads correctly at exactly
      // one viewport.
      assert.ok(cls.includes('text-[13px]'), `${name}: a label is not 13px — "${cls}"`);
      assert.ok(cls.includes('leading-[21px]'), `${name}: a label lost its stacked leading — "${cls}"`);
      assert.ok(cls.includes('lg:leading-[28px]'), `${name}: a label lost its lg leading — "${cls}"`);
    }
  }
});

test('EVERY section-card heading carries the one shared heading class', () => {
  /**
   * ── THE ข้อมูลระบบ HEADING IS THE STATED EXCEPTION ────────────────────────
   * It is a `<h2>` too, and it is DELIBERATELY 12px — the quietest heading on
   * the page, and below the 13px label would invert the hierarchy. It is
   * excluded BY NAME here rather than by a loose matcher, so a second card
   * quietly opting out is a failure and not a silence.
   */
  for (const [name, markup] of Object.entries(SCREENS)) {
    const headings = h2Classes(markup);
    assert.ok(headings.length >= 5, `${name}: only ${headings.length} card headings`);
    const system = headings.filter((c) => c.includes('text-[12px]'));
    assert.equal(system.length, 1, `${name}: expected exactly one 12px heading (ข้อมูลระบบ), got ${system.length}`);
    for (const cls of headings.filter((c) => !c.includes('text-[12px]'))) {
      assert.ok(cls.includes('text-[14px]'), `${name}: a card heading is not 14px — "${cls}"`);
      assert.ok(cls.includes('font-bold'), `${name}: a card heading lost its weight — "${cls}"`);
      assert.ok(cls.includes('leading-[23px]'), `${name}: a card heading lost its line-height — "${cls}"`);
    }
  }
});

test('the heading is SMALLER than the value it sits over — the round, as one claim', () => {
  /**
   * The direction, not the numbers. Written against the two constants so it
   * survives a future rescale and fails a future inversion — which is the whole
   * of what "headings shrink, values grow" means once the pixels are forgotten.
   */
  const px = (cls) => Number(cls.match(/text-\[([0-9.]+)px\]/)[1]);
  assert.ok(px(DETAIL_CARD_HEADING) < px(DETAIL_FIELD_VALUE),
    'the card heading is no longer smaller than a field value');
  assert.ok(px(DETAIL_FIELD_LABEL) < px(DETAIL_FIELD_VALUE),
    'the label is no longer smaller than its value — it stops reading as a label');
  assert.ok(px(DETAIL_FIELD_LABEL) < px(DETAIL_CARD_HEADING),
    'the label has caught the card heading — three sizes collapsed into two');
});

// ════════════════════════════════════════════════════════════════════════════
// §2  THE SOURCE — the literals exist in ONE file, and once
// ════════════════════════════════════════════════════════════════════════════

test('the value size is a literal in exactly ONE place in the whole detail tree', () => {
  /**
   * The `FIELD_ROW_COLUMNS` assertion in registrationFieldRows, applied to type.
   * A card that wants the value size has to import the constant; writing
   * `text-[16px]` into a card reddens here.
   *
   * Comments are stripped by `readSource`, so the docstring above the constants
   * — which quotes every one of these classes — does not satisfy this.
   */
  const counts = DETAIL_SOURCES.map((rel) => [rel, occurrences(readSource(rel).code, 'text-[16px]')]);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  assert.equal(total, 1,
    `text-[16px] appears ${total} times across the detail tree, not once:\n`
    + counts.map(([rel, n]) => `    ${n}  ${rel}`).join('\n')
    + '\n\nA card that needs the value size imports DETAIL_FIELD_VALUE. A second '
    + 'literal is a size that drifts one card at a time.');
  assert.equal(counts.find(([rel]) => rel.endsWith('detailShell.jsx'))[1], 1,
    'the one occurrence is not in detailShell — the source moved out of the shared file');
});

test('the heading and label class strings are single literals too', () => {
  /**
   * ══ COUNTED AS WHOLE CLASS STRINGS, NOT AS BARE SIZES — AND HERE IS WHY ═══
   *
   * The first draft counted `text-[14px]` and expected one. IT IS TWO, and the
   * second is correct: `DetailHeader`'s SUBTITLE — the course name under the
   * 40px H1 — is `text-[14px] leading-[21px]`, and it is page chrome rather than
   * a card heading. `leading-[21px]` collides with the label's stacked box for
   * the same reason.
   *
   * So the uniqueness claim is made about the FINGERPRINT — the complete class
   * string a consumer would have to spell to duplicate the decision — and the
   * bare-size ban is left to the per-card-file test below, where `DetailHeader`
   * does not live. Two assertions, because they are two different claims:
   * "the decision has one home" and "no card writes a size at all".
   *
   * `DETAIL_FIELD_VALUE` is counted in its own test above; these are the other
   * two, plus the one string that legitimately appears twice.
   */
  const code = DETAIL_SOURCES.map((rel) => readSource(rel).code).join('\n');
  for (const [literal, expected, why] of [
    [DETAIL_CARD_HEADING, 1, 'the card heading, as one decision'],
    [DETAIL_FIELD_LABEL, 1, 'the label, as one decision'],
    ['leading-[28px]', 2, 'the value line box, and the label matching it at lg'],
  ]) {
    assert.equal(occurrences(code, literal), expected,
      `"${literal}" (${why}) appears ${occurrences(code, literal)} times, expected ${expected}`);
  }

  // The 14px page SUBTITLE is named rather than silently tolerated: it is the
  // only other 14px on either screen, it is chrome, and a THIRD would mean a
  // card had grown one.
  assert.equal(occurrences(code, 'text-[14px]'), 2,
    'the count of bare text-[14px] moved — it is the card heading plus DetailHeader’s subtitle, and nothing else');
});

test('no CARD file carries a detail type size of its own', () => {
  /**
   * The complement of the two above, read per-file rather than as a total: the
   * two client screens must contain NONE of these literals. A total of one is
   * also satisfied by the constant moving INTO a card and out of the shell,
   * which is the shape this catches and the totals do not.
   */
  for (const rel of DETAIL_SOURCES.filter((r) => !r.endsWith('detailShell.jsx'))) {
    const code = readSource(rel).code;
    for (const literal of ['text-[16px]', 'text-[14px]', 'leading-[28px]', 'leading-[21px]', 'leading-[23px]']) {
      assert.equal(occurrences(code, literal), 0,
        `${rel} spells ${literal} itself — import the constant from detailShell instead`);
    }
  }
});

test('CONTROL: those literals are ones the probe could actually find', () => {
  /**
   * Every assertion above is an absence or an exact count, and both pass
   * happily against a probe that finds nothing at all — a mis-typed literal, a
   * `readSource` that returned '', a file list pointing at nothing.
   */
  const shell = readSource('src/app/admin/registrations/_components/detailShell.jsx').code;
  assert.ok(shell.length > 10_000, 'readSource returned almost nothing for detailShell');
  assert.equal(occurrences(shell, 'text-[16px]'), 1, 'the probe cannot see the constant it is counting');
  assert.equal(occurrences(shell, 'lg:grid-cols-[22%_1fr]'), 1,
    'the probe cannot see a class known to be in this file — it is reading the wrong text');
  // …and it CAN count above one, so `equal(…, 1)` is a real constraint.
  assert.ok(occurrences(shell, 'rounded-9e-md') > 1, 'the probe cannot count past one');
});

// ════════════════════════════════════════════════════════════════════════════
// §3  THAI VERTICAL METRICS — measured against the font file itself
// ════════════════════════════════════════════════════════════════════════════

test('the probe’s table of type pairs IS the scale the components ship', () => {
  /**
   * ══ THE PROBE PRINTS A TABLE, AND A TABLE CAN GO STALE ════════════════════
   *
   * `DETAIL_TYPE_PAIRS` is a hand-written list in the probe script, and every
   * assertion below reads it. If it drifted from the constants the components
   * actually export, the floor tests would go on passing about a scale nobody
   * ships — face three of defect 7, in the instrument rather than in the code.
   *
   * So the three pairs the constants define are DERIVED here and matched against
   * the probe's list. What is left in the probe and not derivable — the
   * ข้อมูลระบบ heading, which is a literal in `SystemCard` on purpose — is
   * asserted to be exactly one entry, so the list cannot quietly grow either.
   */
  const pairsIn = (cls) => {
    const px = Number(cls.match(/text-\[([0-9.]+)px\]/)[1]);
    return [...cls.matchAll(/(?:^|\s)(?:lg:)?leading-\[([0-9.]+)px\]/g)]
      .map((m) => [px, Number(m[1])]);
  };
  const fromComponents = [
    ...pairsIn(DETAIL_FIELD_VALUE),
    ...pairsIn(DETAIL_FIELD_LABEL),
    ...pairsIn(DETAIL_CARD_HEADING),
  ].map(([px, leading]) => `${px}/${leading}`).sort();

  const inProbe = DETAIL_TYPE_PAIRS.map(([, px, leading]) => `${px}/${leading}`);
  for (const pair of fromComponents) {
    assert.ok(inProbe.includes(pair),
      `the components ship ${pair} and the probe's table does not list it — `
      + `[${inProbe.join(' ')}]`);
  }
  const extra = inProbe.filter((p) => !fromComponents.includes(p));
  assert.deepEqual(extra, ['12/20'],
    `the probe lists pairs no shared constant defines: [${extra.join(' ')}]. `
    + 'The only legitimate one is the ข้อมูลระบบ heading, which SystemCard spells itself.');
});

test('every type pair this round ships clears LINE Seed Sans TH’s own line box', () => {
  /**
   * ══ THE CLAIM, AND WHY px ALONE CANNOT MAKE IT ════════════════════════════
   *
   * LINE Seed Sans TH declares ascent 1144 / descent −440 / lineGap 0 over 1000
   * units, so its natural line box is 1.584em. A `line-height` BELOW that gives
   * NEGATIVE half-leading: the glyph box grows out of its own line box, and any
   * ancestor with `overflow:hidden` — which is exactly what `truncate` compiles
   * to — shears the upper marks off. That is round 3's 27px-in-a-30px-block
   * defect, expressed as a number instead of as a memory.
   *
   * This is the assertion a markup check cannot make, and it is why the probe
   * reads the woff2 rather than trusting a ratio.
   */
  const m = fontMetrics();
  assert.equal(m.unitsPerEm, 1000, 'the font under test is not the one these numbers came from');
  assert.ok(Math.abs(m.naturalLineEm - 1.584) < 0.001,
    `the font's natural line box moved to ${m.naturalLineEm} — every leading below needs re-deciding`);

  for (const [what, px, leading] of DETAIL_TYPE_PAIRS) {
    const floor = px * m.naturalLineEm;
    assert.ok(leading >= floor,
      `${what}: ${px}px in a ${leading}px line box is BELOW the font's own ${floor.toFixed(1)}px. `
      + 'Thai upper marks will clip anywhere this text is inside overflow:hidden.');
  }
});

test('…and clears the ink extremes too, so two wrapped lines cannot touch', () => {
  // The address and the customer note are the live multi-line cases. The floor
  // above stops a single line being sheared; this stops two lines colliding.
  const m = fontMetrics();
  for (const [what, px, leading] of DETAIL_TYPE_PAIRS) {
    const ink = px * m.inkEm;
    assert.ok(leading > ink,
      `${what}: ${leading}px of line box against ${ink.toFixed(1)}px of possible ink — `
      + 'a wrapped line can overlap the one above it');
  }
});

test('CONTROL: the floor DOES reject the leading this round replaced', () => {
  /**
   * Without this the test above passes on any font whose metrics happen to be
   * generous, and would have passed on the 13px/25px row it replaced — which
   * would make it a claim about nothing.
   *
   * Both directions, because the interesting property is DISCRIMINATION:
   *   · 16px in the OLD 25px box is under the floor  → must be rejected
   *   · 16px in the new 28px box                      → must be accepted
   */
  const m = fontMetrics();
  assert.ok(25 < 16 * m.naturalLineEm,
    'the floor accepts 16px in a 25px box — it is not measuring anything');
  assert.ok(28 >= 16 * m.naturalLineEm, 'the floor rejects the leading that ships');
  // The pair that shipped BEFORE this round was fine at its own size, so the
  // floor is not simply "bigger is better" — it is a ratio.
  assert.ok(25 >= 13 * m.naturalLineEm, 'the floor would have rejected the 13px row it replaced');
  // …and the defect the probe found: 12px in the old 17px box.
  assert.ok(17 < 12 * m.naturalLineEm,
    'the floor accepts the ข้อมูลระบบ heading’s old 17px box — it would not have found that defect');
});

test('the 13px label still sets on ONE line in the narrowest label track', () => {
  /**
   * ══ (a), AS ARITHMETIC ════════════════════════════════════════════════════
   *
   * The label went 11px → 13px because a label at 0.69 of its value stops
   * reading as one half of a pair. The constraint on how far it could go is the
   * 22% track, at the narrowest width the split is ever drawn: viewport 1024
   * (`lg`) with the sidebar open → 676px of card, so 148.7px.
   *
   * The longest label is `บริษัท / องค์กร (ที่ติดต่อ)` at 10.124em — the in-house
   * contact card's divergence spelling, NOT the tax id the old docstring named.
   *
   * ── WHAT THIS CANNOT SETTLE ───────────────────────────────────────────────
   * The widths are advance sums with no GPOS applied. Treat them as ±1-2%, and
   * treat this assertion as "no label is anywhere near the edge" rather than as
   * proof one fits. A browser is the only thing that settles the last 2%.
   */
  const m = fontMetrics();
  // THE SIZE IS READ OUT OF THE CONSTANT, not spelled 13 here. Written as a
  // literal this test would go on measuring 13px after someone took the label to
  // 14 — green, about a size that no longer ships. Face three, avoided.
  const labelPx = Number(DETAIL_FIELD_LABEL.match(/text-\[([0-9.]+)px\]/)[1]);
  const widest = DETAIL_LABELS
    .map((label) => ({ label, px: textWidthEm(label, m) * labelPx }))
    .sort((a, b) => b.px - a.px)[0];
  assert.ok(widest.px < NARROWEST_LABEL_TRACK_PX,
    `"${widest.label}" is ${widest.px.toFixed(1)}px at 13px and the track is only `
    + `${NARROWEST_LABEL_TRACK_PX.toFixed(1)}px — it will wrap under itself at lg`);
  // Not merely fitting — fitting with room. A label at 99% of the track is one
  // GPOS pair away from wrapping, and the check above would still be green.
  assert.ok(widest.px < NARROWEST_LABEL_TRACK_PX * 0.92,
    `"${widest.label}" fills ${(100 * widest.px / NARROWEST_LABEL_TRACK_PX).toFixed(0)}% of the `
    + 'label track — no margin for the GPOS this probe does not apply');
});

test('CONTROL: 14px is the step that would NOT have fitted', () => {
  // Which is what makes 13px a measurement rather than a preference. Without
  // this, "13px fits" is true of every size the column could have taken.
  const m = fontMetrics();
  const widest = Math.max(...DETAIL_LABELS.map((l) => textWidthEm(l, m)));
  assert.ok(widest * 14 > NARROWEST_LABEL_TRACK_PX * 0.92,
    'at 14px the longest label still leaves 8% of the track — the choice of 13 was not forced');
  assert.ok(widest * 15 > NARROWEST_LABEL_TRACK_PX,
    'at 15px the longest label still fits outright — the probe is not measuring the track');
});

test('the renamed card heading fits its header row without truncating', () => {
  /**
   * `ข้อมูลสำหรับออกใบเสนอราคา` is 25 characters where `การเงินและเอกสาร` was 16,
   * and the `<h2>` is `truncate`. A rename that quietly ellipsises the card's own
   * name on the narrowest admin viewport is the failure worth checking.
   *
   * The header row is `card inner − 29px icon − 9px gap − 46px แก้ไข`. Taken at
   * the narrowest place a card is drawn WITH the sidebar open: viewport 768 →
   * 420px inner.
   */
  const m = fontMetrics();
  const available = 420 - 29 - 9 - 46;
  const width = textWidthEm('ข้อมูลสำหรับออกใบเสนอราคา', m) * 14;
  assert.ok(width < available,
    `the renamed heading is ${width.toFixed(1)}px at 14px against ${available}px of header row`);
  // CONTROL: the longest heading on either screen also fits, so this is a claim
  // about the header row rather than about this one string being short.
  const longest = textWidthEm('ตารางเวลา & รูปแบบการอบรม', m) * 14;
  assert.ok(longest < available, `the in-house schedule heading is ${longest.toFixed(1)}px and does not fit`);
});

// ════════════════════════════════════════════════════════════════════════════
// §4  WHAT FOLLOWS, AND WHAT IS DELIBERATELY DIFFERENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * ── THE EXCEPTION LIST IS THE POINT OF THIS SECTION ────────────────────────
 *
 * `text-[11px]` is the only size allowed to appear INSIDE a value cell, and it
 * covers exactly three things, all of them stated:
 *
 *   1. `CopyButton` — the copy control, which sits in the `action` slot inside
 *      the `<dd>`. It is a CONTROL, not a value.
 *   2. the รอบอบรม row's two italic "why there is no แก้ไข" spans — also
 *      actions, also not values.
 *   3. the in-house `CourseList`'s mono course CODE, the annotation under the
 *      name. Held at 11px so it still matches the in-house LIST cell, which this
 *      round does not touch.
 *
 * Anything else appearing here is a value that grew its own size, and it fails.
 */
const ALLOWED_INSIDE_VALUE = new Set(['text-[16px]', 'text-[11px]']);

test('nothing inside a value cell sets a size the exception list does not name', () => {
  for (const [name, markup] of Object.entries(SCREENS)) {
    const found = new Set();
    for (const body of ddBodies(markup)) for (const cls of sizeClassesIn(body)) found.add(cls);
    for (const cls of found) {
      assert.ok(ALLOWED_INSIDE_VALUE.has(cls),
        `${name}: ${cls} appears inside a value cell. Either it follows DETAIL_FIELD_VALUE `
        + 'or it is added to ALLOWED_INSIDE_VALUE with the reason it is different.');
    }
  }
});

test('CONTROL: that probe DOES see a size written inside a value cell', () => {
  /**
   * The assertion above is a subset check over a set the probe builds. If the
   * probe found nothing — a `<dd` that never matched, a regex that missed the
   * arbitrary form — it would pass on a page where every value had its own size.
   */
  assert.deepEqual(sizeClassesIn('<span class="font-mono text-[11px]">x</span>'), new Set(['text-[11px]']));
  assert.deepEqual(sizeClassesIn('<p class="text-sm">x</p>'), new Set(['text-sm']));
  assert.equal(sizeClassesIn('<p class="text-[var(--x)]">x</p>').size, 0, 'a colour token read as a size');
  // …and the real markup genuinely reaches inside the cells: the copy control's
  // 11px is found, which is the exception the list exists for.
  const inside = new Set();
  for (const body of ddBodies(SCREENS['public/corporate'])) for (const c of sizeClassesIn(body)) inside.add(c);
  assert.ok(inside.has('text-[11px]'), 'the probe never reached the copy control inside a value cell');
});

test('the mono ids and the Omise link FOLLOW — they carry no size of their own', () => {
  /**
   * They were `font-mono text-[11px]`: a second place a field value's size
   * lived, which survived this round by ignoring it. The class is gone rather
   * than re-pointed, so there is nothing left to drift.
   */
  for (const [name, markup] of Object.entries(SCREENS)) {
    for (const piece of markup.split('font-mono ').slice(1)) {
      const cls = piece.slice(0, piece.indexOf('"'));
      // The in-house course CODE is the stated exception and keeps its 11px.
      if (cls.includes('text-[11px]')) {
        assert.ok(name.startsWith('inhouse'), `${name}: a mono value kept a size of its own — "${cls}"`);
        continue;
      }
      assert.ok(!/text-\[[0-9.]+px\]/.test(cls), `${name}: a mono value sets its own size — "${cls}"`);
    }
  }
});

test('the ATTENDEE TABLE cells follow; its chrome deliberately does not', () => {
  /**
   * ══ (c), DECIDED RATHER THAN LEFT ═════════════════════════════════════════
   *
   * The three VALUE cells — name, email, phone — are values a reader scans
   * alongside the cards two inches above, so they take `DETAIL_FIELD_VALUE`
   * through the same constant rather than through three literals. The COUNTER,
   * the COLUMN HEADERS and the (ผู้ประสานงาน) marker are not values and keep
   * their own sizes.
   *
   * The HISTORY FEED does not follow at all and is asserted separately below.
   */
  const markup = SCREENS['public/corporate'];
  const table = markup.slice(markup.indexOf('<table'), markup.indexOf('</table>'));
  const body = table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));

  const sizes = sizeClassesIn(body);
  assert.ok(sizes.has('text-[16px]'), 'no attendee cell took the shared value size');
  assert.ok(sizes.has('text-[12px]'), 'the # counter lost its own size — the chrome followed by mistake');
  assert.ok(sizes.has('text-[11px]'), 'the (ผู้ประสานงาน) marker lost its own size');
  assert.ok(!sizes.has('text-[13px]') && !sizes.has('text-[14px]'),
    `an attendee cell kept its pre-round-11 size — ${[...sizes].join(' ')}`);

  // The header row is chrome and stays where it was.
  const head = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));
  assert.ok(sizeClassesIn(head).has('text-[11px]'), 'the column headers followed the values');
  assert.ok(!sizeClassesIn(head).has('text-[16px]'), 'the column headers followed the values');
});

test('the attendee name cell no longer clips its own Thai marks', () => {
  /**
   * ── MEASURED, AND IT WAS ALREADY WRONG BEFORE THIS ROUND ──────────────────
   * `truncate` is `overflow:hidden`. The cell was `text-[14px] leading-[17.25px]`
   * — 1.23em against the font's 1.584em — so the glyph box was already growing
   * out of a box that clips, by about 1.4px at the top. At 16px inside the same
   * leading it would have been ~2.9px.
   *
   * `tableParts`' `CoordinatorCell` carries the identical pair and is NOT fixed:
   * it is on the LIST screens, which this round does not touch. Named here so it
   * is a known finding rather than a miss.
   */
  const markup = SCREENS['public/corporate'];
  const table = markup.slice(markup.indexOf('<table'), markup.indexOf('</table>'));
  assert.ok(!table.includes('leading-[17.25px]'),
    'an attendee cell still sets a line box the font overflows, inside a truncate');
  const m = fontMetrics();
  assert.ok(17.25 < 14 * m.naturalLineEm,
    'the old pair was fine after all — then this test is asserting nothing');
});

test('the history feed does NOT follow, and that is the decision', () => {
  /**
   * ══ (c), THE OTHER HALF ═══════════════════════════════════════════════════
   *
   * `components/audit/HistoryFeed` is mounted on SEVEN other admin screens —
   * articles, courses, the cache console, three other registration types. It has
   * its own body/byline hierarchy, and a change here would restyle all of them
   * from a round scoped to two screens.
   *
   * Asserted as the ABSENCE of the shared constant in that file, which is a
   * claim about the decision rather than about the feed's current sizes: those
   * are the feed's business and this round does not pin them.
   */
  const feed = readSource('src/components/audit/HistoryFeed.jsx').code;
  assert.ok(!feed.includes('DETAIL_FIELD_VALUE'), 'the history feed imported the detail value size');
  assert.ok(!feed.includes('text-[16px]'), 'the history feed took the detail value size');
  // CONTROL: it is a real file with real sizes, so the absence above is about
  // this round and not about a file the probe failed to read.
  assert.ok(feed.length > 1000, 'readSource returned almost nothing for HistoryFeed');
  assert.ok(/text-\[[0-9.]+px\]/.test(feed), 'the feed has no sizes at all — the probe is reading the wrong file');
});

test('the internal-notes entries do NOT follow either', () => {
  /**
   * Same argument as the feed, applied inside detailShell: an append-only list
   * of body-plus-byline is a feed, not a field row, and it is the one place on
   * the card stack where an admin WRITES prose rather than reads a field.
   *
   * `QuotedNote` — the CUSTOMER's note — DOES follow, because it is the value of
   * its card. The two sit three cards apart and are deliberately not the same.
   */
  const shell = readSource('src/app/admin/registrations/_components/detailShell.jsx').code;
  const notes = shell.slice(shell.indexOf('export function InternalNotesBody'));
  const body = notes.slice(0, notes.indexOf('export function CopyButton'));
  assert.ok(!body.includes('DETAIL_FIELD_VALUE'), 'the internal-notes feed took the field-value size');
  assert.ok(body.includes('text-[13px]'), 'the internal-notes entries lost their own size');

  // …and QuotedNote, which is three cards above it, DID take it. Bounded on the
  // NEXT export rather than on the first `}` — the first `}` in
  // `function QuotedNote({ children }) {` closes the destructuring, so that
  // bound sliced away the whole body and the assertion was about an empty
  // string. Found by watching it fail.
  const quotedFrom = shell.indexOf('export function QuotedNote');
  assert.notEqual(quotedFrom, -1, 'QuotedNote is gone from the shell');
  const quoted = shell.slice(quotedFrom);
  const quotedBody = quoted.slice(0, quoted.indexOf('export function InternalNotesBody'));
  assert.ok(quotedBody.includes('DETAIL_FIELD_VALUE'),
    'the customer note did not follow the field value');
  assert.ok(quotedBody.length > 100 && quotedBody.length < 2000,
    `the QuotedNote slice is ${quotedBody.length} bytes — the bounds are wrong, not the code`);
});
