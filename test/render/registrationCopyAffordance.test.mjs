import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { InhouseDetailClient } from '@/app/admin/registrations/inhouse/_components/InhouseDetailClient';
import { CopyAction } from '@/app/admin/registrations/_components/detailShell';
import { readSource } from '../sourceScan.mjs';

/**
 * THE COPY AFFORDANCE, ON BOTH SCREENS.
 *
 * ══ THE DECISION THIS FILE PINS ═════════════════════════════════════════════
 *
 * PER-VALUE on the field rows, plus ONE multi-value copy on the attendee row
 * menu. NOT a per-card "copy this card" control, and not both.
 *
 * The basis is what an admin actually re-types into another system: one value at
 * a time — an email into a mail client, a phone into a dialler, an address into
 * a quotation. Nobody pastes a card. A per-card control would produce a labelled
 * block that has to be edited down wherever it lands, and it still would not
 * give them the single field they came for.
 *
 * The attendee is the stated exception, because a roster genuinely does go
 * somewhere as ROWS — an attendance sheet, a certificate mail-merge.
 *
 * ══ THE THREE CONSTRAINTS ═══════════════════════════════════════════════════
 *   1. copying is NOT an edit and survives the cancellation lock
 *   2. a copy NEVER writes an audit row
 *   3. no control on a field with no value
 *
 * (2) is asserted in render/registrationAttendeeTab, structurally — there is no
 * server action to write one. Named here so a reader looking for all three
 * finds where the third lives.
 */

const PUBLIC_DOC = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  status: 'pending',
  courseName: 'Power BI Advanced',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' },
  attendeesListProvided: true,
  attendeesCount: 2,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.com', phone: '0812345678' }],
  requestInvoice: true,
  invoice: {
    type: 'corporate', country: 'TH',
    companyName: 'บริษัท ทดสอบ จำกัด', taxId: '0105551234567', branchType: 'head_office',
    thaiAddress: {
      addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน',
      district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400',
    },
  },
  createdAt: '2026-08-01T03:00:00.000Z',
};

/** Every optional value absent — the branch where a control must NOT render. */
const PUBLIC_BARE = {
  ...PUBLIC_DOC,
  _id: 'bbbbbbbbbbbbbbbbbbbb0002',
  coordinator: { firstName: 'ปรีชา', lastName: 'ตั้งใจ' }, // no email, no phone
  attendees: [{ firstName: 'ปรีชา', lastName: 'ตั้งใจ' }],
  requestInvoice: false,
  invoice: null,
};

/**
 * ROUND 11'S TWO NEW CONTROLS — ชื่อ-นามสกุล and เลขประจำตัวผู้เสียภาษี.
 *
 * The name row is on the INDIVIDUAL branch of the quotation card and the
 * corporate fixture above never renders it, so it needs a document of its own.
 * A tax id is on both branches.
 */
const PUBLIC_INDIVIDUAL = {
  ...PUBLIC_DOC,
  _id: 'dddddddddddddddddddd0004',
  invoice: {
    ...PUBLIC_DOC.invoice,
    type: 'individual',
    firstName: 'สมชาย', lastName: 'ใจดี',
    companyName: undefined,
  },
};

/**
 * THE INDIVIDUAL BRANCH WITH BOTH NEW VALUES EMPTY, which is the branch the
 * empty rule actually has to survive. `firstName`/`lastName` absent joins to
 * '' and the tax id is absent outright.
 */
const PUBLIC_INDIVIDUAL_BARE = {
  ...PUBLIC_INDIVIDUAL,
  _id: 'eeeeeeeeeeeeeeeeeeee0005',
  invoice: {
    ...PUBLIC_INDIVIDUAL.invoice,
    firstName: '', lastName: '   ', // whitespace — see the wrapped-but-empty note
    taxId: '',
  },
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
  trainingFormat: 'online',
  quotationCountry: 'TH', branchType: 'head_office', taxId: '0105551234567',
  source: 'inhouse',
  createdAt: '2026-08-01T03:00:00.000Z',
};

const pub = (doc) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc, history: null }));
const inh = (doc) => renderToStaticMarkup(
  createElement(InhouseDetailClient, { doc, courses: [], history: null }));

const PUB       = pub(PUBLIC_DOC);
const BARE      = pub(PUBLIC_BARE);
const INDIV     = pub(PUBLIC_INDIVIDUAL);
const INDIV_BARE = pub(PUBLIC_INDIVIDUAL_BARE);
const INDIV_CANCELLED = pub({ ...PUBLIC_INDIVIDUAL, status: 'cancelled' });
const CANCELLED = pub({ ...PUBLIC_DOC, status: 'cancelled' });
const INH       = inh(INHOUSE_DOC);
const INH_CANCELLED = inh({ ...INHOUSE_DOC, status: 'cancelled' });

/**
 * Every copy control's accessible label, in order.
 *
 * ── THIS SEES THE FIELD-ROW CONTROLS AND NOT THE ROW MENU'S ───────────────
 * `CopyButton` carries an `aria-label`; the attendee row menu's copy items are
 * `OverflowItem` buttons whose accessible name is their TEXT. So this probe is
 * about the per-value affordance only, and the row menu's two items are asserted
 * in render/registrationAttendeeTab instead.
 *
 * Measured rather than assumed: the `copy-gated` control, which wires the row
 * copy to the edit gate, reddens the attendee-tab test and leaves every
 * assertion in this file green. Stated so the next reader does not take this
 * file's cancellation test as covering the row menu.
 */
const copyLabels = (markup) =>
  [...markup.matchAll(/aria-label="คัดลอก([^"]*)"/g)].map((m) => m[1]);

// ════════════════════════════════════════════════════════════════════════════
// 1. PER-VALUE, ON BOTH SCREENS
// ════════════════════════════════════════════════════════════════════════════

test('the public screen offers a copy on each value worth re-typing', () => {
  const labels = copyLabels(PUB);
  for (const expected of ['ชื่อผู้ประสานงาน', 'อีเมลผู้ประสานงาน', 'เบอร์โทรผู้ประสานงาน',
    'ที่อยู่ใบเสนอราคา', 'เลขประจำตัวผู้เสียภาษี']) {
    assert.ok(labels.includes(expected), `no copy control for ${expected}: [${labels.join(', ')}]`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 1b. ROUND 11 — THE QUOTATION CARD'S OTHER TWO VALUES
// ════════════════════════════════════════════════════════════════════════════

/**
 * ══ WHAT WAS ADDED, AND WHY THESE THREE ARE NOW A SET ═══════════════════════
 *
 * ชื่อ-นามสกุล and เลขประจำตัวผู้เสียภาษี get the control ที่อยู่ already had. All
 * three are values a salesperson re-types into a quotation in another system,
 * and the address being the only copyable one of them was the odd arrangement:
 * the two values that are HARDEST to re-type by hand — a Thai name and a
 * thirteen-digit tax id — were the two you had to select with the mouse.
 *
 * They go through `CopyAction` → `CopyButton`, the SAME shared components, with
 * the same `คัดลอก{label}` accessible name and the same three visible states.
 * Nothing about them is a new shape, which is the point: a second copy
 * implementation is how one screen ends up telling a salesperson the tax id is
 * on their clipboard when it is not.
 */

test('the quotation card offers a copy on its name, its tax id and its address', () => {
  const labels = copyLabels(INDIV);
  for (const expected of ['ชื่อ-นามสกุลใบเสนอราคา', 'เลขประจำตัวผู้เสียภาษี', 'ที่อยู่ใบเสนอราคา']) {
    assert.ok(labels.includes(expected), `no copy control for ${expected}: [${labels.join(', ')}]`);
  }
});

test('the two new controls are the SAME component, not a second implementation', () => {
  /**
   * ── ASSERTED ON THE MARKUP, NOT ON THE IMPORT LINE ────────────────────────
   * An import proves a symbol is in scope; it does not prove these two rows use
   * it. So the two new buttons' rendered attributes are compared against the
   * ADDRESS control that already shipped. If either row grew a button of its
   * own, the shapes diverge here.
   */
  const button = (markup, label) => {
    const at = markup.indexOf(`aria-label="คัดลอก${label}"`);
    assert.notEqual(at, -1, `no control for ${label}`);
    const open = markup.lastIndexOf('<button', at);
    return markup.slice(open, markup.indexOf('</button>', at) + 9);
  };
  const shapeOf = (html) => ({
    typed: /^<button[^>]*type="button"/.test(html),
    classes: (html.match(/class="([^"]*)"/) ?? [, ''])[1],
    live: html.includes('aria-live="polite"'),
    text: html.includes('>คัดลอก<'),
  });

  const reference = shapeOf(button(INDIV, 'ที่อยู่ใบเสนอราคา'));
  for (const label of ['ชื่อ-นามสกุลใบเสนอราคา', 'เลขประจำตัวผู้เสียภาษี']) {
    assert.deepEqual(shapeOf(button(INDIV, label)), reference,
      `the ${label} control is not the same button as the address one`);
  }
  // …and the reference really is a control rather than an empty match.
  assert.ok(reference.typed && reference.live && reference.text,
    'the address control did not parse — the comparison above proves nothing');
});

test('NEITHER new control appears on a row whose value is empty', () => {
  /**
   * ══ THE RULE THAT HAS BEEN DEFEATED ONCE ══════════════════════════════════
   *
   * A wrapped-but-empty value is TRUTHY, so `value && <CopyButton/>` renders a
   * control beside nothing. `CopyAction` asks the only question that matters —
   * is the STRING bound for the clipboard empty — and the fixture here is built
   * to reach it: the name parts are `''` and `'   '`, which join to WHITESPACE
   * rather than to nothing, and the tax id is `''`.
   *
   * `DLRow` drops both rows too, so this is belt and braces by design; the
   * `copy-empty` control in scripts/_control-round11.mjs is what says which of
   * the two guards is actually holding.
   */
  const labels = copyLabels(INDIV_BARE);
  assert.ok(!labels.includes('ชื่อ-นามสกุลใบเสนอราคา'),
    'a copy control rendered for a name that is only whitespace');
  assert.ok(!labels.includes('เลขประจำตัวผู้เสียภาษี'),
    'a copy control rendered for an absent tax id');
  // …and the address, which this fixture DOES hold, keeps its control — so the
  // absences above are about the two values and not about an empty page.
  assert.ok(labels.includes('ที่อยู่ใบเสนอราคา'),
    'the bare individual fixture rendered no controls at all');
});

test('both new controls survive the cancellation lock', () => {
  // The claim §3 makes for the whole screen, made for these two BY NAME so a
  // future `readOnly` threaded through the quotation card is caught here and not
  // only inside a set comparison someone has to read carefully.
  const labels = copyLabels(INDIV_CANCELLED);
  for (const expected of ['ชื่อ-นามสกุลใบเสนอราคา', 'เลขประจำตัวผู้เสียภาษี']) {
    assert.ok(labels.includes(expected), `${expected} lost its copy control on a cancelled record`);
  }
  assert.deepEqual(copyLabels(INDIV_CANCELLED), copyLabels(INDIV),
    'the individual screen lost or gained a copy control when cancelled');
  assert.equal((INDIV_CANCELLED.match(/>แก้ไข</g) ?? []).length, 0,
    'the cancelled individual fixture is not actually locked');
});

test('neither new control can write an audit row — there is no action to write one', () => {
  /**
   * ══ STRUCTURAL, WHICH IS THE ONLY WAY THIS CAN BE ASSERTED FROM HERE ══════
   *
   * A copy is `navigator.clipboard.writeText`. Nothing crosses the wire, so
   * there is no endpoint anyone could later attach a `recordAdminActionAfter`
   * to — the enforcement is the ABSENCE of a server action, not a decision
   * someone has to keep making.
   *
   * Read as: `CopyButton`'s body calls no imported action and no `fetch`. The
   * render tier cannot observe a network call that does not happen, so this is a
   * shape claim and it says so.
   */
  const shell = readSource('src/app/admin/registrations/_components/detailShell.jsx');
  const from = shell.code.indexOf('export function CopyButton');
  const body = shell.code.slice(from, shell.code.indexOf('export function CopyAction'));
  assert.ok(body.includes('navigator.clipboard'), 'CopyButton no longer copies — the slice is wrong');
  for (const forbidden of ['fetch(', 'recordAdminAction', 'useTransition', 'router.refresh']) {
    assert.ok(!body.includes(forbidden), `CopyButton reaches for ${forbidden} — a copy became a write`);
  }
  // …and the two new call sites hand it a STRING, never an action.
  const client = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx').code;
  assert.ok(client.includes('label="เลขประจำตัวผู้เสียภาษี"'), 'the tax-id control is gone from the source');
  assert.ok(client.includes('label="ชื่อ-นามสกุลใบเสนอราคา"'), 'the name control is gone from the source');
});

test('the in-house screen offers one on its person and its addresses', () => {
  const labels = copyLabels(INH);
  // เลขประจำตัวผู้เสียภาษี since round 11 — the in-house screen took the public
  // one's spelling along with its card name. Re-pointed, and the `rename-inhouse`
  // control is what proves the new string is the one that binds.
  for (const expected of ['ชื่อผู้ติดต่อ', 'ชื่อบริษัท', 'เลขประจำตัวผู้เสียภาษี']) {
    assert.ok(labels.includes(expected), `no copy control for ${expected}: [${labels.join(', ')}]`);
  }
});

test('EVERY copy control names WHAT it copies — none is a bare "คัดลอก"', () => {
  /**
   * There are several on a page. A screen reader announcing "คัดลอก" five times
   * has told the reader nothing about which is which, and the visible label is
   * the same word on all of them.
   */
  for (const [name, markup] of Object.entries({ PUB, INH })) {
    const labels = copyLabels(markup);
    assert.ok(labels.length >= 3, `${name}: only ${labels.length} copy controls — the fixture is too thin`);
    for (const label of labels) {
      assert.ok(label.trim().length > 0, `${name}: a copy control has no subject in its label`);
    }
    assert.equal(new Set(labels).size, labels.length,
      `${name}: two copy controls share a label — [${labels.join(', ')}]`);
  }
});

test('there is NO per-card copy control', () => {
  // The decision, asserted rather than left to the absence of code. A card-level
  // control would most plausibly arrive in the card header beside แก้ไข.
  for (const [name, markup] of Object.entries({ PUB, INH })) {
    assert.ok(!markup.includes('คัดลอกทั้งการ์ด'), `${name}: a per-card copy control appeared`);
    assert.ok(!markup.includes('คัดลอกข้อมูลทั้งหมด'), `${name}: a copy-everything control appeared`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. ABSENT MEANS ABSENT
// ════════════════════════════════════════════════════════════════════════════

test('a dropped ROW takes its copy control with it', () => {
  /**
   * ══ WHAT THIS MEASURES, AND WHAT IT DOES NOT — FOUND BY A CONTROL ═════════
   *
   * The coordinator on the bare fixture has no email and no phone, and no
   * invoice at all. `DLRow` drops those rows ENTIRELY, so `CopyAction` is never
   * even reached — which means this test passes whether or not CopyAction has an
   * empty guard. The `copy-empty` control proved it: removing that guard leaves
   * this test GREEN.
   *
   * It is kept, renamed to what it actually checks, because the claim is still
   * worth having — a dropped row must not leave a stray control behind. But the
   * guard on the CONTROL itself is the test below, and the row that reaches it
   * is the one that renders WITHOUT a value: an `emptyHint` row.
   */
  const labels = copyLabels(BARE);
  assert.ok(!labels.includes('อีเมลผู้ประสานงาน'), 'a copy control rendered for an absent email');
  assert.ok(!labels.includes('เบอร์โทรผู้ประสานงาน'), 'a copy control rendered for an absent phone');
  assert.ok(!labels.includes('ที่อยู่ใบเสนอราคา'), 'a copy control rendered for an absent address');
  // …and the one value it DOES have keeps its control, so this is not passing
  // because the page rendered nothing.
  assert.ok(labels.includes('ชื่อผู้ประสานงาน'), 'the bare fixture lost the control it should have');
});

test('a row that renders WITHOUT a value offers no copy — the emptyHint case', () => {
  /**
   * THE ROW THAT ACTUALLY REACHES `CopyAction` WITH NOTHING. An onsite in-house
   * enquiry with no venue renders on purpose — the missing value IS the
   * information, work for a salesperson — so the row survives `DLRow`'s
   * absent-means-absent rule and the control has to make its own decision.
   *
   * Without this fixture, every "no control on an empty value" assertion in this
   * file is really an assertion about `DLRow`, and the control's own guard is
   * untested. The `copy-empty` control is what showed that.
   */
  const noVenue = inh({ ...INHOUSE_DOC, trainingFormat: 'onsite', onsiteVenue: null });
  assert.ok(noVenue.includes('ยังไม่ได้ระบุ — ต้องสอบถามลูกค้า'),
    'the venue row did not render its hint — the fixture does not reach the case');
  assert.ok(!copyLabels(noVenue).includes('สถานที่จัดอบรม'),
    'a copy control rendered beside a hint — it would put the hint on the clipboard');

  // CONTROL: the same row WITH a venue does offer one, so the absence above is
  // about the value rather than about the row never having a control.
  const withVenue = inh({
    ...INHOUSE_DOC,
    trainingFormat: 'onsite',
    onsiteVenue: { addressLine: '1550 อาคารธนภูมิ', subDistrict: 'มักกะสัน', district: 'ราชเทวี', province: 'กรุงเทพมหานคร', postalCode: '10400' },
  });
  assert.ok(copyLabels(withVenue).includes('สถานที่จัดอบรม'),
    'the venue row never offers a copy at all — the assertion above proves nothing');
});

test('CopyAction renders NOTHING for an empty or whitespace-only text', () => {
  /**
   * Asserted at the component, over the shapes a caller can actually hand it.
   *
   * ── AND WHY THE TEST IS ON THE TEXT, NOT ON A NODE ───────────────────────
   * Round 5's wrapped-but-empty defeat came from asking "does this render" with
   * the answer to "is this truthy". `CopyAction` takes the STRING that would
   * reach the clipboard, so the question and the answer are the same one: a node
   * can render perfectly while the text derived from it is ''.
   */
  const render = (text) => renderToStaticMarkup(createElement(CopyAction, { text, label: 'x' }));
  for (const empty of ['', '   ', '\t', '\n', null, undefined, 0, false, {}, []]) {
    assert.equal(render(empty), '', `CopyAction rendered for ${JSON.stringify(empty)}`);
  }
});

test('CONTROL: CopyAction DOES render for a real value', () => {
  // Without this, a component returning null for everything would satisfy every
  // absence above and remove the feature entirely.
  const html = renderToStaticMarkup(createElement(CopyAction, { text: 'a@b.c', label: 'อีเมล' }));
  assert.ok(html.includes('<button'), 'CopyAction rendered no control for a real value');
  assert.match(html, /aria-label="คัดลอกอีเมล"/, 'the control lost its subject');
  // Trimmed, so a padded value does not put whitespace on the clipboard.
  const padded = renderToStaticMarkup(createElement(CopyAction, { text: '  a@b.c  ', label: 'อีเมล' }));
  assert.ok(padded.includes('<button'), 'a padded value rendered no control');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. COPYING IS NOT AN EDIT
// ════════════════════════════════════════════════════════════════════════════

test('every copy control survives the cancellation lock, on BOTH screens', () => {
  /**
   * The lock is about WRITING. A copy reads, and the field rows it sits on are
   * still rendered on a cancelled record — so removing the controls would take
   * away the one thing a reader can still usefully do with a frozen record.
   *
   * Asserted as SET EQUALITY against the editable render, not as "some remain":
   * a subset would mean one of them had been wired to the edit gate by mistake,
   * which is the easiest mistake to make and the hardest to see.
   */
  assert.deepEqual(copyLabels(CANCELLED), copyLabels(PUB),
    'the public screen lost or gained a copy control when cancelled');
  assert.deepEqual(copyLabels(INH_CANCELLED), copyLabels(INH),
    'the in-house screen lost or gained a copy control when cancelled');
});

test('CONTROL: the cancelled fixtures really ARE locked', () => {
  /**
   * The equality above would also hold on a record that was never locked at all.
   * These two lines are what make it a statement about the lock rather than
   * about two identical renders.
   */
  assert.equal((CANCELLED.match(/>แก้ไข</g) ?? []).length, 0, 'the public fixture is not locked');
  assert.equal((INH_CANCELLED.match(/>แก้ไข</g) ?? []).length, 0, 'the in-house fixture is not locked');
  assert.ok((PUB.match(/>แก้ไข</g) ?? []).length > 0, 'the editable public fixture offers no edit');
  assert.ok((INH.match(/>แก้ไข</g) ?? []).length > 0, 'the editable in-house fixture offers no edit');
  // …and both cancelled renders still carry their content, so the equality is
  // not between two empty pages.
  assert.ok(copyLabels(CANCELLED).length >= 3, 'the cancelled public render has almost no copy controls');
});
