import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { TRAINING_TYPE_LABEL } from '@/lib/schedule/trainingTypeLabel';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepForm } from '@/components/registration/RegisterWizard';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * Step 1 of the public registration wizard.
 *
 * Two fixes are pinned here:
 *   1. the selected round follows the ?class= URL param, NOT the stored draft
 *   2. "← กลับไปดูหลักสูตร" returns to the course detail page, not the catalog
 *
 * The round the user sees selected is driven by `selectedScheduleId`, which is
 * what these assert — via ScheduleCarousel's aria-pressed and the summary strip
 * below it. The hidden `classId` form field is deliberately NOT the probe: it is
 * reconciled by a mount effect that renderToStaticMarkup never runs (see the
 * note in the last test in this file).
 */

const COURSE = { course_id: 'DA-PBI', course_name: 'Power BI Essentials' };

/**
 * The Bangkok year the round cards measure showYear:'auto' against.
 *
 * Pinned, not read from the clock: a fixture that took the real year would
 * mean something different every January. formatRoundDays THROWS without it,
 * which is why a harness that omits it fails loudly here rather than shipping
 * a wrong year — the intended failure mode.
 */
const CURRENT_YEAR = 2026;

const SEP = { _id: 'sch-sep', dates: ['2026-09-10', '2026-09-11'], status: 'open', type: 'classroom' };
const OCT = { _id: 'sch-oct', dates: ['2026-10-15', '2026-10-16'], status: 'open', type: 'classroom' };
const SCHEDULES = [SEP, OCT];

/**
 * The two round labels, DERIVED from the shared formatter.
 *
 * They were the literals `10-11 SEP` and `15-16 OCT`. ScheduleCarousel no
 * longer renders English months — it uses lib/schedule/roundDateLabel like every
 * other round surface — so those strings match nothing.
 *
 * Derived rather than retyped in Thai, because what these tests actually claim
 * is "the card FOR THIS ROUND is/is not pressed". The label is how the card is
 * located, not what is being asserted; its content is pinned in
 * test/pure/roundDateLabel against fixed dates. A control below stops the
 * derivation from going vacuous.
 */
const labelOf = (s) =>
  formatRoundDays(s.dates, { showMonth: true, showYear: 'auto', currentYear: CURRENT_YEAR });
const SEP_LABEL = labelOf(SEP);
const OCT_LABEL = labelOf(OCT);

// A draft that remembers the September round AND carries typed-in fields. The
// point of the fix is that changing rounds keeps all of this.
const DRAFT = {
  courseId: 'DA-PBI',
  classId: SEP._id,
  classDate: '10-11 ก.ย. 2569',
  coordinator: {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    email: 'somchai@example.com',
    // NOT 0812345678 — that string is the placeholder on CoordinatorFields and
    // AttendeesList, so a probe for it matches whether or not a draft restored.
    // The control below caught exactly that.
    phone: '0891112222',
    isAttending: true,
  },
  attendeesCount: 2,
  attendeesListProvided: true,
  attendees: [
    { firstName: 'สมหญิง', lastName: 'ดีใจ', email: 'somying@example.com', phone: '0898765432' },
  ],
  requestInvoice: true,
  invoice: {
    type: 'corporate',
    country: 'TH',
    companyName: 'ACME จำกัด',
    taxId: '0123456789012',
    thaiAddress: {
      addressLine: '1 ถนนสุขุมวิท',
      subDistrict: 'ลาดพร้าว',
      district: 'ลาดพร้าว',
      province: 'กรุงเทพมหานคร',
      postalCode: '10230',
    },
  },
  notes: 'แพ้อาหารทะเล',
};

const noop = () => {};

const render = (props) =>
  renderToStaticMarkup(
    createElement(StepForm, {
      course: COURSE,
      schedules: SCHEDULES,
      initialClassId: null,
      initialValues: null,
      onSubmit: noop,
      currentYear: CURRENT_YEAR,
      ...props,
    })
  );

/** Every <button> in `html` whose own markup contains `text`. */
function buttonsContaining(html, text) {
  return html
    .split('<button')
    .slice(1)
    .map((c) => '<button' + c.slice(0, c.indexOf('</button>') + '</button>'.length))
    .filter((b) => b.includes(text));
}

/** The schedule card labelled `label`, as rendered. */
const card = (html, label) => {
  const [found] = buttonsContaining(html, label);
  assert.ok(found, `a schedule card labelled "${label}" is on screen`);
  return found;
};

const isPressed = (html, label) => card(html, label).includes('aria-pressed="true"');

// The round summary strip, identified by the selected round's Thai date label.
// NOT by the 'ยืนยันรอบอบรม' button inside it: that button is additionally gated
// on !formRevealed, so it is absent whenever the form is open and a probe built
// from it would confuse "no strip" with "strip, form already open".
const STRIP_LABELS = ['10-11 ก.ย. 2569', '15-16 ต.ค. 2569'];
const anyStrip = (html) => STRIP_LABELS.some((l) => html.includes(l));

// ── Bug 1: the URL wins over the draft ──────────────────────────────────────

test('a URL classId beats a differing draft classId', () => {
  // NOT isPressed: a round IS selected in this render (from the URL), so the
  // picker box — and the cards inside it — has collapsed (see the "round
  // picker collapses" section below). The summary strip is what survives a
  // collapse and is the only place left to read which round is active.
  const html = render({ initialClassId: OCT._id, initialValues: DRAFT });
  assert.ok(html.includes('15-16 ต.ค. 2569'), 'the URL round (October) is what the summary strip shows');
  assert.ok(!html.includes('10-11 ก.ย. 2569'), 'not the draft round (September)');
});

test('CONTROL: the OLD precedence would have selected the draft round', () => {
  // Reproduces `restoredClassId || initialClassId` by handing StepForm ONLY the
  // draft — the exact state the old ordering produced from the inputs above.
  // If this and the test above ever agree, the swap has been undone: the two
  // orderings would be indistinguishable and the test above would prove nothing.
  // Strip-based, not isPressed, for the same reason as the test above — both
  // renders here have a round selected, so both have a collapsed box.
  const oldOrdering = render({ initialClassId: null, initialValues: DRAFT });
  assert.ok(oldOrdering.includes('10-11 ก.ย. 2569'), 'draft-only selects September');
  assert.ok(!oldOrdering.includes('15-16 ต.ค. 2569'));

  const newOrdering = render({ initialClassId: OCT._id, initialValues: DRAFT });
  assert.notEqual(
    oldOrdering.includes('15-16 ต.ค. 2569'),
    newOrdering.includes('15-16 ต.ค. 2569'),
    'the two orderings must disagree, or the precedence test is vacuous'
  );
});

test('the summary strip follows the URL round too', () => {
  // aria-pressed is the carousel's view of the selection; activeSchedule /
  // activeDateLabel is StepForm's. Both must land on the same round.
  const html = render({ initialClassId: OCT._id, initialValues: DRAFT });
  assert.ok(html.includes('15-16 ต.ค. 2569'), 'the October date label is in the summary');
  assert.ok(!html.includes('10-11 ก.ย. 2569'), 'the September label is not');
});

// Only a subset of the draft is visible to a STATIC render: react-hook-form
// registers most text inputs as uncontrolled, so their defaultValues are applied
// by a ref at mount and never reach the SSR markup. The coordinator block and
// the Thai address render from watched state, so they are the observable proxy
// for "the draft survived" — they and the invisible fields arrive through the
// same single `...(initialValues ?? {})` spread, so one cannot restore without
// the other. The last test in this file pins that constraint.
const DRAFT_PROBES = [
  ['coordinator first name', 'สมชาย'],
  ['coordinator last name', 'ใจดี'],
  ['coordinator email', 'somchai@example.com'],
  ['coordinator phone', '0891112222'],
  ['invoice address line', '1 ถนนสุขุมวิท'],
  ['invoice sub-district', 'ลาดพร้าว'],
];

test('changing rounds keeps the fields the user already typed', () => {
  // The whole point of inverting precedence instead of discarding the draft.
  const html = render({ initialClassId: OCT._id, initialValues: DRAFT });
  for (const [what, probe] of DRAFT_PROBES) {
    assert.ok(html.includes(probe), `${what} survived the round change`);
  }
});

test('CONTROL: those probes track the draft, they are not step-1 boilerplate', () => {
  // A DIFFERENT draft under the same URL round. If the probes above matched
  // placeholder text or static copy they would still be present here.
  const other = {
    ...DRAFT,
    coordinator: { ...DRAFT.coordinator, firstName: 'วิชัย', lastName: 'สุขใจ', email: 'wichai@example.com', phone: '0900000000' },
    // district too — the base fixture uses the same string for both, so leaving
    // it would keep 'ลาดพร้าว' on screen and the probe would look like a false pass.
    invoice: {
      ...DRAFT.invoice,
      thaiAddress: {
        ...DRAFT.invoice.thaiAddress,
        addressLine: '99 ถนนพระราม 9',
        subDistrict: 'ห้วยขวาง',
        district: 'ห้วยขวาง',
      },
    },
  };
  const html = render({ initialClassId: OCT._id, initialValues: other });
  for (const [what, probe] of DRAFT_PROBES) {
    assert.equal(html.includes(probe), false, `${what} must not survive a different draft`);
  }
  assert.ok(html.includes('วิชัย'), 'the other draft renders its own values');
  assert.ok(html.includes('99 ถนนพระราม 9'));
});

// ── The draft fallback is reachable, so it stays ────────────────────────────

test('with NO URL classId the draft round is still restored', () => {
  // CourseHero links to /registration/public?course=<id> with no &class=, so
  // this is the live path for a returning user, not a hypothetical one.
  // Strip-based, not isPressed — the draft round is selected, so the box
  // (and its cards) has already collapsed.
  const html = render({ initialClassId: null, initialValues: DRAFT });
  assert.ok(html.includes('10-11 ก.ย. 2569'), 'the draft round drives the summary strip');
  assert.ok(!html.includes('15-16 ต.ค. 2569'), 'not the other round');
});

test('with neither, nothing is selected and the summary strip is absent', () => {
  const html = render({ initialClassId: null, initialValues: null });
  assert.equal(isPressed(html, SEP_LABEL), false);
  assert.equal(isPressed(html, OCT_LABEL), false);
  assert.equal(anyStrip(html), false, 'no round selected → no summary strip');
});

test('CONTROL: the summary strip DOES appear once a round is selected', () => {
  // Without this, the "absent" assertion above is satisfied by a strip that
  // never renders under any input.
  assert.equal(anyStrip(render({ initialClassId: OCT._id })), true);
});

// ── A draft round that no longer exists ────────────────────────────────────

test('a draft round missing from schedules degrades, it does not crash', () => {
  // The round was unpublished or finished between visits. activeSchedule is
  // null → no summary strip, no card pressed, and classId resolves empty so the
  // zod schema would block submit with 'กรุณาเลือกรอบอบรม' rather than posting a
  // dangling id. The reveal guard now also keeps the form shut in this state —
  // see the existence-guard section below — so the user is returned to the
  // carousel instead of being dropped into a form they cannot submit.
  const html = render({
    initialClassId: null,
    initialValues: { ...DRAFT, classId: 'sch-deleted' },
  });
  assert.ok(html.length > 0, 'it renders');
  assert.equal(isPressed(html, SEP_LABEL), false, 'no card is pressed');
  assert.equal(isPressed(html, OCT_LABEL), false);
  assert.equal(anyStrip(html), false, 'and no round summary strip');
});

test('CONTROL: the same draft with a LIVE round does show the strip', () => {
  // Proves the stale-round assertions above measure the missing round and not a
  // strip that is simply never rendered once a draft reveals the form.
  const html = render({ initialClassId: null, initialValues: DRAFT });
  assert.ok(html.includes('10-11 ก.ย. 2569'), 'the strip shows the draft round');
  assert.equal(anyStrip(html), true, 'the strip renders for a round that exists');
});

// ── Arriving with a round skips the confirm step ───────────────────────────

/**
 * Structural markers for the revealed form body — the block gated on
 * `formRevealed`. Field NAMES, not values: with no draft there are no values to
 * probe, and react-hook-form's uncontrolled inputs would not render them anyway.
 *
 * Deliberately NOT the schedule carousel or its heading: those render in both
 * states, so a probe built from them would pass whether or not the form opened.
 * The control below pins exactly that distinction.
 */
// NOT invoice.companyName: the invoice block defaults to type 'individual' and
// only renders that field for a corporate draft, so it is absent in the very
// no-draft case these tests are about.
const REVEALED_PROBES = [
  'name="coordinator.firstName"',
  'name="notes"',
  'ผู้ประสานงาน',
];
const CONFIRM_BUTTON = 'ยืนยันรอบอบรม';

const isRevealed = (html) => REVEALED_PROBES.every((p) => html.includes(p));
const anyRevealed = (html) => REVEALED_PROBES.some((p) => html.includes(p));

test('a URL classId reveals the form on first render, with no confirm step', () => {
  // Every round-specific entry point appends &class=, so this is the common
  // arrival and the confirm click was pure friction.
  const html = render({ initialClassId: OCT._id, initialValues: null });
  assert.equal(isRevealed(html), true, 'the form body is open');
  assert.equal(html.includes(CONFIRM_BUTTON), false, 'and the confirm button is gone');
});

test('with neither, the confirm button renders and the form body does not', () => {
  // CourseHero's "ขอใบเสนอราคา Public" arrives with no round — the path the
  // confirm step still exists for.
  const html = render({ initialClassId: null, initialValues: null });
  assert.equal(anyRevealed(html), false, 'no part of the form body rendered');
  assert.ok(!html.includes(CONFIRM_BUTTON), 'and with nothing selected there is nothing to confirm yet');
});

test('CONTROL: the REVEALED probes flip between those two states', () => {
  // The control the whole section rests on. If these probes matched something
  // rendered in both states — the carousel, the section heading, the submit row
  // — they would be present here too and the assertions above would be vacuous.
  const open = render({ initialClassId: OCT._id, initialValues: null });
  const shut = render({ initialClassId: null, initialValues: null });
  for (const probe of REVEALED_PROBES) {
    assert.ok(open.includes(probe), `"${probe}" present when revealed`);
    assert.equal(shut.includes(probe), false, `"${probe}" absent when not revealed`);
  }
});

test('CONTROL: the unrevealed render IS a real page, not an early return or a crash', () => {
  // Proves the unrevealed render is a real page — the other way "the form body
  // is absent" could pass. Was 'CONTROL: both states DO render the schedule
  // carousel', asserting the carousel renders in BOTH the revealed and
  // unrevealed states — that premise is exactly what the round-picker-collapse
  // section below inverts: a round IS selected in the "revealed" case here
  // (initialClassId: OCT._id), so its carousel has now collapsed. See the
  // dedicated "round picker collapses once a round is chosen" tests for that
  // behaviour; this control now only claims the unrevealed (no-round) case
  // still renders a real carousel.
  const html = render({ initialClassId: null, initialValues: null });
  assert.ok(html.includes('เลือกรอบการอบรม'), 'the schedule section heading');
  assert.ok(html.includes(SEP_LABEL) && html.includes(OCT_LABEL), 'both round cards');
});

test('CONTROL: the confirm button DOES appear once a round is picked without one in the URL', () => {
  // Pairs with the first test: proves 'ยืนยันรอบอบรม' is a string this component
  // can still emit, so asserting its absence above means something. Reaching it
  // needs a round selected (for the summary strip) but no reveal — which is
  // exactly the draft-less state after the user clicks a card.
  const html = render({ initialClassId: null, initialValues: null });
  assert.ok(!html.includes(CONFIRM_BUTTON), 'not before a round is chosen');
  // The pre-change behaviour, reproduced by hand: a resolved round with the form
  // still shut. StepForm no longer produces this from a URL round, so it is
  // asserted against the component's own gate rather than a prop combination.
  // The gate gained a second clause when full rounds started arriving here
  // (`!activeRoundIsFull` — there is nothing to confirm about a sold-out
  // round). `!formRevealed` is the part this test is about and it is still
  // what leads the condition, so the probe is widened rather than deleted.
  assert.ok(
    readFileSync(path.join(ROOT, 'src/components/registration/RegisterWizard.jsx'), 'utf8')
      .includes('{!formRevealed && !activeRoundIsFull && ('),
    'the confirm button is still gated on !formRevealed, not deleted'
  );
});

test('the confirm UI is still wired for the no-round path', () => {
  // Explicitly out of scope to remove. handleReveal, its guard, and the button
  // all stay — a user arriving without a round must still choose deliberately.
  const src = readFileSync(path.join(ROOT, 'src/components/registration/RegisterWizard.jsx'), 'utf8');
  assert.match(src, /const handleReveal = \(\) => \{/, 'handleReveal survives');
  assert.match(src, /if \(!selectedScheduleId\) return;/, 'and still refuses with no round');
  assert.match(src, /setFormRevealed\(true\)/, 'and still opens the form');
  assert.ok(src.includes(CONFIRM_BUTTON), 'the button label is still in the tree');
});

test('nothing auto-selects a round when none was given', () => {
  // The other thing explicitly out of scope. Revealing early must not slide into
  // choosing for the user.
  const html = render({ initialClassId: null, initialValues: null });
  assert.equal(isPressed(html, SEP_LABEL), false);
  assert.equal(isPressed(html, OCT_LABEL), false);
  assert.equal(anyStrip(html), false, 'and no round summary strip');
});

test('a draft with no URL classId still reveals — unchanged behaviour', () => {
  const html = render({ initialClassId: null, initialValues: DRAFT });
  assert.equal(isRevealed(html), true);
  // Strip-based, not isPressed — the draft round is selected, so its card is
  // no longer on screen for a pressed-state check.
  assert.ok(html.includes('10-11 ก.ย. 2569'), 'the strip shows the round the draft remembers');
});

test('CONTROL: the draft alone is what reveals it, not the fixture being non-empty', () => {
  // Same call shape, initialValues dropped. If the reveal came from anything
  // else in `render`'s defaults this would still be open.
  assert.equal(anyRevealed(render({ initialClassId: null, initialValues: null })), false);
});

// ── The existence guard: a round that does not resolve must not reveal ──────

const GHOST = 'sch-unpublished-between-visits';

test('a URL classId naming a round NOT in schedules leaves the form shut', () => {
  // The round was unpublished, finished, or fell outside the registration
  // page's own limit-20 fetch window while the detail page still linked it.
  const html = render({ initialClassId: GHOST, initialValues: null });
  assert.equal(anyRevealed(html), false, 'the form body stays closed');
  assert.equal(isPressed(html, SEP_LABEL), false, 'and nothing is selected for them');
  assert.equal(isPressed(html, OCT_LABEL), false);
  assert.equal(anyStrip(html), false, 'and there is no summary strip');
});

test('a draft whose classId is NOT in schedules likewise leaves it shut', () => {
  // Narrows pre-existing behaviour on purpose: `Boolean(initialValues)` used to
  // open the form here, dropping the user into a dead end they could only
  // discover at submit.
  const html = render({ initialClassId: null, initialValues: { ...DRAFT, classId: GHOST } });
  assert.equal(anyRevealed(html), false, 'the form body stays closed');
  assert.equal(isPressed(html, SEP_LABEL), false);
  assert.equal(anyStrip(html), false);
});

test('a ghost URL round does not rescue itself via a live draft round, or vice versa', () => {
  // Either signal resolving is enough; neither being resolvable is not.
  assert.equal(
    isRevealed(render({ initialClassId: GHOST, initialValues: DRAFT })), true,
    'the draft round is live, so the form opens'
  );
  assert.equal(
    isRevealed(render({ initialClassId: OCT._id, initialValues: { ...DRAFT, classId: GHOST } })), true,
    'the URL round is live, so the form opens'
  );
  assert.equal(
    anyRevealed(render({ initialClassId: GHOST, initialValues: { ...DRAFT, classId: GHOST } })), false,
    'neither resolves, so it stays shut'
  );
});

test('CONTROL: the SAME inputs with a live round DO reveal', () => {
  // The pair that makes the three tests above mean something: only the round id
  // changes between these and the ghosts, so a form that never opened under any
  // input could not pass both.
  assert.equal(isRevealed(render({ initialClassId: OCT._id, initialValues: null })), true);
  assert.equal(isRevealed(render({ initialClassId: null, initialValues: DRAFT })), true);
});

test('CONTROL: the guard tests MEMBERSHIP, not mere presence', () => {
  // The mutation this exists for: `roundExists = (id) => Boolean(id)`. Under it
  // the ghost id is truthy and the form opens, so these two must disagree.
  const ghost = render({ initialClassId: GHOST, initialValues: null });
  const live = render({ initialClassId: OCT._id, initialValues: null });
  assert.notEqual(
    anyRevealed(ghost), anyRevealed(live),
    'a non-empty id that names no round must behave differently from one that does'
  );
  // And the id really is non-empty — a guard that only rejected '' would pass
  // the notEqual above for the wrong reason.
  assert.ok(GHOST.length > 0 && !SCHEDULES.some((s) => s._id === GHOST));
});

test('the draft is untouched — its fields restore once a live round is picked', () => {
  // Failing closed must not mean discarding what they typed. The draft still
  // feeds defaultValues; it is only the reveal that waits.
  const stale = { ...DRAFT, classId: GHOST };
  assert.equal(anyRevealed(render({ initialClassId: null, initialValues: stale })), false);
  // Picking a live round is what the user does next; StepForm sees that as a
  // URL round on the re-render that follows router.replace('?class=…').
  const afterPick = render({ initialClassId: SEP._id, initialValues: stale });
  assert.equal(isRevealed(afterPick), true, 'the form opens');
  for (const [what, probe] of DRAFT_PROBES) {
    assert.ok(afterPick.includes(probe), `${what} survived the stale round`);
  }
});

// ── Round picker collapses once a round is chosen ───────────────────────────
//
// เลือกรอบการอบรม (the box: heading + ScheduleCarousel) now renders ONLY while
// no SELECTABLE round is chosen. Once one is, the box collapses; the summary
// strip stays and grows a "เปลี่ยนรอบ" link that re-opens the box IN PLACE —
// pure local state, no navigation, no URL change, no field reset. A FULL or
// STARTED round does NOT collapse the box — see the full-round test below —
// because the notices for those states explicitly point at "รายการด้านบน"
// (the list above), which must still be on screen for that to mean anything.

const BOX_HEADING = 'เลือกรอบการอบรม';
const CHANGE_ROUND_LINK = 'เปลี่ยนรอบ';
const FULL = { _id: 'sch-full', dates: ['2026-11-05', '2026-11-06'], status: 'full', type: 'classroom' };

const renderWithFull = (props) =>
  renderToStaticMarkup(
    createElement(StepForm, {
      course: COURSE,
      schedules: [...SCHEDULES, FULL],
      initialClassId: FULL._id,
      initialValues: null,
      onSubmit: noop,
      currentYear: CURRENT_YEAR,
      ...props,
    })
  );

test('the box is absent when a round arrives in the URL', () => {
  // buttonsContaining, not a bare html.includes: OCT_LABEL is the CARD's own
  // label, but the strip renders the SAME round's Thai date text too (a
  // different formatter, same underlying date) — a bare substring check would
  // find that and report a card that is not actually there.
  const html = render({ initialClassId: OCT._id, initialValues: null });
  assert.ok(!html.includes(BOX_HEADING), 'heading gone');
  assert.equal(buttonsContaining(html, SEP_LABEL).length, 0, 'no card button for September');
  assert.equal(buttonsContaining(html, OCT_LABEL).length, 0, 'no card button for October either');
});

test('the box is present when no round arrives in the URL', () => {
  const html = render({ initialClassId: null, initialValues: null });
  assert.ok(html.includes(BOX_HEADING));
  assert.ok(html.includes(SEP_LABEL) && html.includes(OCT_LABEL));
});

test('the box collapses the moment a round is picked', () => {
  // Simulated the way every round-pick transition in this file is: as two
  // renders, the second with the id handleSelectSchedule's own
  // router.replace('?class=<id>') would have put in the URL a moment later.
  const beforePick = render({ initialClassId: null, initialValues: null });
  assert.ok(beforePick.includes(BOX_HEADING), 'box open before any pick');

  const afterPick = render({ initialClassId: OCT._id, initialValues: null });
  assert.ok(!afterPick.includes(BOX_HEADING), 'box collapsed the moment a round is picked');
  assert.ok(afterPick.includes('15-16 ต.ค. 2569'), 'the strip now shows the picked round');
});

test('CONTROL: a FULL round does NOT collapse the box — its notice points at the list above', () => {
  // The carousel refuses to let a full round be SELECTED, but a stale deep
  // link can still land on one — roundSelectable is false for it (status
  // 'full'), so the box must stay open, matching pre-existing behaviour.
  const html = renderWithFull({});
  assert.ok(html.includes(BOX_HEADING), 'box stays open for an unselectable (full) round');
  assert.ok(html.includes('รอบอบรมนี้เต็มแล้ว กรุณาเลือกรอบอื่นจากรายการด้านบน'), 'the notice referencing the list is shown');
});

test('เปลี่ยนรอบ appears only once the box has collapsed', () => {
  const collapsed = render({ initialClassId: OCT._id, initialValues: null });
  assert.ok(collapsed.includes(CHANGE_ROUND_LINK), 'present once a round is chosen and the box collapsed');

  const open = render({ initialClassId: null, initialValues: null });
  assert.ok(!open.includes(CHANGE_ROUND_LINK), 'absent while the box is already open — nothing to re-open');

  // The no-round case above can't distinguish "the link's own gate is
  // correct" from "the whole strip is absent anyway" — there is no
  // activeSchedule there, so the strip (and anything inside it) never
  // renders regardless of the link's own condition. A FULL round is the
  // scenario that actually exercises the link's gate: the strip DOES render
  // (activeSchedule resolves), but the box is ALSO still open (unselectable),
  // so the link — redundant with the already-visible carousel — must not
  // additionally appear.
  const fullRoundOpenBox = renderWithFull({});
  assert.ok(!fullRoundOpenBox.includes(CHANGE_ROUND_LINK), 'absent for a full round too — the box is already open');
});

test('CONTROL: "เปลี่ยนรอบ" is wired as pure local state — no navigation, no URL change', () => {
  // The hard constraint this ticket calls out by name: เปลี่ยนรอบ must not
  // navigate, must not change the URL in a way that remounts the form, and
  // must not reset a filled field. Reading the handler's own line proves it
  // touches neither router nor location — a click simulation cannot run in
  // this harness (see itemListReorder.test.mjs's note on why), so this is
  // the same source-wiring proof pattern this file already uses for
  // handleReveal below.
  const src = readFileSync(path.join(ROOT, 'src/components/registration/RegisterWizard.jsx'), 'utf8');
  assert.match(src, /const handleChangeRound = \(\) => setPickerForcedOpen\(true\);/, 'handleChangeRound only flips local state');
  assert.match(src, /onClick=\{handleChangeRound\}/, 'the เปลี่ยนรอบ button is wired to it');
  const handlerLine = src.split('\n').find((l) => l.includes('const handleChangeRound ='));
  assert.ok(handlerLine, 'handleChangeRound found in source');
  assert.ok(!handlerLine.includes('router.'), 'no router call on that line');
  assert.ok(!handlerLine.includes('location'), 'no location assignment on that line');
});

test('เปลี่ยนรอบ re-opens the box in place: picking a different round keeps a filled field', () => {
  // What "เปลี่ยนรอบ re-opens in place" ACTUALLY buys the user: fill a field,
  // reopen the box, pick a different round — the field must still hold its
  // value, and the strip must show the new round. Simulated as two renders,
  // exactly like 'the draft is untouched — its fields restore once a live
  // round is picked' above — the field-level proof a static render can give.
  const before = render({ initialClassId: SEP._id, initialValues: DRAFT });
  for (const [what, probe] of DRAFT_PROBES) {
    assert.ok(before.includes(probe), `${what} present before the round change`);
  }
  assert.ok(before.includes('10-11 ก.ย. 2569'), 'strip shows the original round');
  assert.ok(!before.includes(BOX_HEADING), 'box already collapsed — a round is chosen');

  const afterChange = render({ initialClassId: OCT._id, initialValues: DRAFT });
  for (const [what, probe] of DRAFT_PROBES) {
    assert.ok(afterChange.includes(probe), `${what} survived the round change via เปลี่ยนรอบ`);
  }
  assert.ok(afterChange.includes('15-16 ต.ค. 2569'), 'strip shows the NEW round');
  assert.ok(!afterChange.includes('10-11 ก.ย. 2569'), 'not the old one');
});

test('CONTROL: a genuinely different draft does not survive — the probes track the draft, not boilerplate', () => {
  const other = {
    ...DRAFT,
    coordinator: { ...DRAFT.coordinator, firstName: 'วิชัย', lastName: 'สุขใจ', email: 'wichai@example.com', phone: '0900000000' },
  };
  const before = render({ initialClassId: SEP._id, initialValues: other });
  assert.ok(!before.includes('สมชาย'), 'the OTHER draft is what rendered');
  const afterChange = render({ initialClassId: OCT._id, initialValues: other });
  assert.ok(afterChange.includes('วิชัย'), 'and it still is, after the round change');
});

// ── Bug 2: the back link ───────────────────────────────────────────────────

// The back link lives inside the form body, which only renders once the form is
// revealed — `formRevealed` initialises to Boolean(initialValues). So every
// back-link render needs a draft, or the link is not on the page at all.
const revealed = (props) => render({ initialValues: DRAFT, ...props });

const backLink = (html) => {
  const i = html.indexOf('← กลับไปดูหลักสูตร');
  assert.notEqual(i, -1, 'the back link is on screen');
  return html.slice(html.lastIndexOf('<a', i), i);
};

test('the back link points at the course detail page', () => {
  const html = revealed({ courseDetailHref: '/da-pbi-training-course' });
  assert.ok(backLink(html).includes('href="/da-pbi-training-course"'));
});

test('the back link falls back to the catalog when no href is threaded', () => {
  // StepForm's own default. RegisterPageContent gets the same '/training-course'
  // out of courseHref('') when a course has no id — see the fs-tier guard.
  assert.ok(backLink(revealed({})).includes('href="/training-course"'));
});

test('CONTROL: the back link is not hardcoded — it tracks the prop', () => {
  // Two different props must produce two different hrefs. A link still nailed to
  // /training-course would pass the fallback test above on its own.
  const a = backLink(revealed({ courseDetailHref: '/da-pbi-training-course' }));
  const b = backLink(revealed({ courseDetailHref: '/excel-adv-training-course' }));
  assert.notEqual(a, b);
  assert.ok(b.includes('href="/excel-adv-training-course"'));
});

test('the step-3 links are untouched and still point at the catalog', () => {
  // "ดูคอร์สอื่นเพิ่มเติม" deliberately means "browse other courses" and is NOT
  // the same link as the step-1 back arrow.
  const src = readFileSync(
    path.join(ROOT, 'src/components/registration/RegisterWizard.jsx'), 'utf8'
  );
  const links = [...src.matchAll(/<Link href="([^"]*)">ดูคอร์สอื่นเพิ่มเติม<\/Link>/g)];
  assert.equal(links.length, 2, 'both success-screen links are present');
  for (const [, href] of links) assert.equal(href, '/training-course');
});

test('CONTROL: that probe would notice if one of them changed', () => {
  // Same matcher against a string where one link was repointed — proves the
  // assertion reads the href rather than merely counting the label.
  const mutated = '<Link href="/da-pbi-training-course">ดูคอร์สอื่นเพิ่มเติม</Link>';
  const [, href] = /<Link href="([^"]*)">ดูคอร์สอื่นเพิ่มเติม<\/Link>/.exec(mutated);
  assert.notEqual(href, '/training-course');
});

// ── Type label on the summary strip — Commit C ──────────────────────────────
//
// The two-branch (hybrid ? ... : "Classroom") ternary is replaced by the
// shared three-way map in src/lib/schedule/trainingTypeLabel.js. The map's
// own exact-string and fallback behaviour is pinned in
// test/pure/trainingTypeLabel.test.mjs; what belongs HERE is proof that the
// STRIP actually calls it (not a second, drifted copy) — verified not to
// touch scheduleType, attendanceMode, or what gets submitted.

const renderWithType = (type) => {
  const round = { _id: `sch-${type}`, dates: ['2026-12-01', '2026-12-02'], status: 'open', type };
  return renderToStaticMarkup(
    createElement(StepForm, {
      course: COURSE,
      schedules: [round],
      initialClassId: round._id,
      initialValues: null,
      onSubmit: noop,
      currentYear: CURRENT_YEAR,
    })
  );
};

for (const [type, expected] of Object.entries(TRAINING_TYPE_LABEL)) {
  test(`a ${type} round's strip shows the exact shared label`, () => {
    const html = renderWithType(type);
    assert.ok(html.includes(expected), `"${expected}" not found for type "${type}"`);
  });
}

test('an Online round no longer renders the Classroom label — the latent defect this commit fixes', () => {
  // Before Commit C the ternary was binary (hybrid vs everything else), so an
  // "online" round silently fell into the "else" branch and rendered
  // "Classroom". That is exactly what must no longer happen.
  const html = renderWithType('online');
  assert.ok(!html.includes(TRAINING_TYPE_LABEL.classroom), 'the Classroom label must not leak into an online round\'s strip');
  assert.ok(html.includes(TRAINING_TYPE_LABEL.online), 'and the correct online label is there instead');
});

test('an unrecognised type does not fall back to Classroom on the strip', () => {
  const html = renderWithType('webinar');
  assert.ok(!html.includes(TRAINING_TYPE_LABEL.classroom), 'must not silently relabel an unknown type as Classroom');
  assert.ok(html.includes('webinar'), 'the raw type value is shown instead');
});

test('CONTROL: the strip imports trainingTypeLabel — not a second, local copy of the map', () => {
  const src = readFileSync(path.join(ROOT, 'src/components/registration/RegisterWizard.jsx'), 'utf8');
  assert.match(src, /import \{ trainingTypeLabel \} from "@\/lib\/schedule\/trainingTypeLabel";/);
  assert.match(src, /\{trainingTypeLabel\(activeSchedule\.type\)\}/, 'the strip calls the shared function directly');
});

test('CONTROL: the type-label change does not alter scheduleType, attendanceMode, or the classId field', () => {
  // Label-only, per the ticket: nothing about what gets submitted may change.
  // classId/scheduleType are set via a mount effect renderToStaticMarkup
  // never runs, so this reads the SOURCE for the effect that sets them.
  const src = readFileSync(path.join(ROOT, 'src/components/registration/RegisterWizard.jsx'), 'utf8');
  assert.match(src, /setValue\("scheduleType", sch\?\.type \|\| undefined\);/, 'scheduleType still comes straight from the round');
  assert.match(src, /setValue\("attendanceMode", undefined\);/, 'hybrid still leaves attendanceMode for the user to choose');
  assert.ok(src.includes('data-section="attendance-mode"'), 'the attendance-mode selector section is still present, untouched');
});

// ── Note for the next reader ───────────────────────────────────────────────

test('WHY the probes are what they are: RHF inputs are uncontrolled in SSR', () => {
  // Pins the constraint that shapes this whole file. react-hook-form registers
  // these inputs uncontrolled, so their restored values are applied by a ref at
  // mount and never appear in static markup — which is why "the draft survived"
  // is asserted through the coordinator/address block and the round selection
  // through aria-pressed, rather than through form field values.
  const html = render({ initialClassId: OCT._id, initialValues: DRAFT });
  assert.ok(html.includes('name="notes"'), 'the notes input is rendered…');
  assert.ok(!html.includes('แพ้อาหารทะเล'), '…but its restored value is not in the markup');
  assert.ok(html.includes('name="invoice.companyName"'), 'the company input is rendered…');
  assert.ok(!html.includes('ACME จำกัด'), '…and likewise carries no value attribute');
  assert.ok(html.includes('somchai@example.com'), 'while watched state DOES show the draft');
});
