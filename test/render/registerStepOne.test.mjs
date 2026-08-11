import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
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

const SEP = { _id: 'sch-sep', dates: ['2026-09-10', '2026-09-11'], status: 'open', type: 'classroom' };
const OCT = { _id: 'sch-oct', dates: ['2026-10-15', '2026-10-16'], status: 'open', type: 'classroom' };
const SCHEDULES = [SEP, OCT];

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
  const html = render({ initialClassId: OCT._id, initialValues: DRAFT });
  assert.equal(isPressed(html, '15-16 OCT'), true, 'the URL round is selected');
  assert.equal(isPressed(html, '10-11 SEP'), false, 'the draft round is not');
});

test('CONTROL: the OLD precedence would have selected the draft round', () => {
  // Reproduces `restoredClassId || initialClassId` by handing StepForm ONLY the
  // draft — the exact state the old ordering produced from the inputs above.
  // If this and the test above ever agree, the swap has been undone: the two
  // orderings would be indistinguishable and the test above would prove nothing.
  const oldOrdering = render({ initialClassId: null, initialValues: DRAFT });
  assert.equal(isPressed(oldOrdering, '10-11 SEP'), true, 'draft-only selects September');
  assert.equal(isPressed(oldOrdering, '15-16 OCT'), false);

  const newOrdering = render({ initialClassId: OCT._id, initialValues: DRAFT });
  assert.notEqual(
    isPressed(oldOrdering, '15-16 OCT'),
    isPressed(newOrdering, '15-16 OCT'),
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
  const html = render({ initialClassId: null, initialValues: DRAFT });
  assert.equal(isPressed(html, '10-11 SEP'), true, 'the draft round is selected');
  assert.ok(html.includes('10-11 ก.ย. 2569'), 'and drives the summary strip');
});

test('with neither, nothing is selected and the summary strip is absent', () => {
  const html = render({ initialClassId: null, initialValues: null });
  assert.equal(isPressed(html, '10-11 SEP'), false);
  assert.equal(isPressed(html, '15-16 OCT'), false);
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
  assert.equal(isPressed(html, '10-11 SEP'), false, 'no card is pressed');
  assert.equal(isPressed(html, '15-16 OCT'), false);
  assert.equal(anyStrip(html), false, 'and no round summary strip');
});

test('CONTROL: the same draft with a LIVE round does show the strip', () => {
  // Proves the stale-round assertions above measure the missing round and not a
  // strip that is simply never rendered once a draft reveals the form.
  const html = render({ initialClassId: null, initialValues: DRAFT });
  assert.equal(isPressed(html, '10-11 SEP'), true);
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

test('CONTROL: both states DO render the schedule carousel', () => {
  // Proves the unrevealed render is a real page and not an early return or a
  // crash — which is the other way "the form body is absent" could pass.
  for (const html of [
    render({ initialClassId: OCT._id, initialValues: null }),
    render({ initialClassId: null, initialValues: null }),
  ]) {
    assert.ok(html.includes('เลือกรอบการอบรม'), 'the schedule section heading');
    assert.ok(html.includes('10-11 SEP') && html.includes('15-16 OCT'), 'both round cards');
  }
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
  assert.equal(isPressed(html, '10-11 SEP'), false);
  assert.equal(isPressed(html, '15-16 OCT'), false);
  assert.equal(anyStrip(html), false, 'and no round summary strip');
});

test('a draft with no URL classId still reveals — unchanged behaviour', () => {
  const html = render({ initialClassId: null, initialValues: DRAFT });
  assert.equal(isRevealed(html), true);
  assert.equal(isPressed(html, '10-11 SEP'), true, 'on the round the draft remembers');
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
  assert.equal(isPressed(html, '10-11 SEP'), false, 'and nothing is selected for them');
  assert.equal(isPressed(html, '15-16 OCT'), false);
  assert.equal(anyStrip(html), false, 'and there is no summary strip');
});

test('a draft whose classId is NOT in schedules likewise leaves it shut', () => {
  // Narrows pre-existing behaviour on purpose: `Boolean(initialValues)` used to
  // open the form here, dropping the user into a dead end they could only
  // discover at submit.
  const html = render({ initialClassId: null, initialValues: { ...DRAFT, classId: GHOST } });
  assert.equal(anyRevealed(html), false, 'the form body stays closed');
  assert.equal(isPressed(html, '10-11 SEP'), false);
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
