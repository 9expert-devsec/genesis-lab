import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepForm } from '@/components/registration/RegisterWizard';

/**
 * THREE OUTCOMES ON STEP 1, AND THEY MUST NOT COLLAPSE INTO ONE MESSAGE.
 *
 * A `?class=` id that does not resolve to a bookable round has three distinct
 * causes, each with a different remedy:
 *
 *   the round is FULL      → it is here, badged เต็ม; pick another
 *   the round has STARTED  → it exists, but its first training day has arrived
 *                            and it is gone from every public surface
 *   the round is UNKNOWN   → mistyped, deleted upstream, or outside this page's
 *                            limit-20 window. We genuinely cannot say which.
 *
 * The third one FAILS CLOSED SILENTLY, and that is deliberate — the code says
 * so at the notice site. This file exists because the second outcome is new:
 * before the started-round exclusion it was unreachable, and the change would
 * otherwise have pushed a predictable daily class of visitors into the silent
 * third state. /schedule is ISR-cached for 30 minutes, so just after midnight
 * the public table still renders a live link to a round that started at 00:00.
 *
 * What is asserted is that the three stay APART. A single shared "something
 * went wrong" sentence would satisfy a naive check for "a message rendered".
 */

const COURSE = { course_id: 'DA-PBI', course_name: 'Power BI Essentials' };
const CURRENT_YEAR = 2026;

const OPEN = { _id: 'sch-open', dates: ['2026-09-10', '2026-09-11'], status: 'open', type: 'classroom' };
const FULL = { _id: 'sch-full', dates: ['2026-10-15', '2026-10-16'], status: 'full', type: 'classroom' };

/** The round that began this morning. NEVER in `schedules` — only its id travels. */
const STARTED_ID = 'sch-started';

const STARTED_MSG = 'รอบนี้เริ่มอบรมแล้ว กรุณาเลือกรอบอื่น';
const FULL_MSG = 'รอบอบรมนี้เต็มแล้ว กรุณาเลือกรอบอื่นจากรายการด้านบน';

const noop = () => {};

const render = (props) =>
  renderToStaticMarkup(
    createElement(StepForm, {
      course: COURSE,
      schedules: [OPEN, FULL],
      startedScheduleIds: [STARTED_ID],
      initialClassId: null,
      initialValues: null,
      onSubmit: noop,
      currentYear: CURRENT_YEAR,
      ...props,
    }),
  );

// ── the new state ───────────────────────────────────────────────────────────

test('a ?class= link to a STARTED round says so', () => {
  const html = render({ initialClassId: STARTED_ID });
  assert.ok(html.includes(STARTED_MSG), 'the started-round sentence did not render');
});

test('and it is a role="status", not an alert', () => {
  /**
   * Nothing has failed and nothing was submitted — the visitor has simply
   * landed somewhere that cannot proceed. Same treatment as the full-round
   * notice it sits beside, deliberately.
   */
  const html = render({ initialClassId: STARTED_ID });
  const notice = new RegExp(`<p[^>]*role="status"[^>]*>${STARTED_MSG}</p>`);
  assert.match(html, notice, 'the sentence is not carried by a role="status" element');
});

test('the started round itself is NEVER rendered as a card', () => {
  /**
   * The message names the round; the carousel must not offer it. `schedules`
   * and `startedScheduleIds` are disjoint halves of one partition, and only the
   * first half is ever drawn.
   */
  const html = render({ initialClassId: STARTED_ID });
  assert.equal(
    html.includes(`value="${STARTED_ID}"`) || html.includes(`"${STARTED_ID}"`),
    false,
    'the started round leaked into the markup as a selectable card',
  );
});

test('the form does NOT open on a started round', () => {
  /**
   * The whole point of the exclusion: nobody may book a round that has begun.
   * A message that explained the situation while still revealing the form would
   * be worse than the silence it replaced.
   */
  const started = render({ initialClassId: STARTED_ID });
  const open = render({ initialClassId: OPEN._id });
  assert.ok(open.length > started.length, 'the revealed form should be markedly larger');
  // The coordinator block is the first thing the revealed form shows.
  assert.ok(open.includes('ผู้ประสานงาน'), 'CONTROL: the open round does reveal the form');
  assert.equal(started.includes('ผู้ประสานงาน'), false, 'the started round revealed the form');
});

// ── the three stay apart ────────────────────────────────────────────────────

test('STARTED and FULL are different sentences, and never both render', () => {
  const started = render({ initialClassId: STARTED_ID });
  assert.ok(started.includes(STARTED_MSG));
  assert.equal(started.includes(FULL_MSG), false, 'the full-round message leaked onto a started round');

  const full = render({ initialClassId: FULL._id });
  assert.ok(full.includes(FULL_MSG), 'the full-round message stopped rendering');
  assert.equal(full.includes(STARTED_MSG), false, 'the started message leaked onto a full round');
});

test('a pathological OVERLAP still shows exactly one notice — started wins', () => {
  /**
   * `activeRoundIsFull` needs the round to be IN `schedules`; the started notice
   * needs it to be in `startedScheduleIds`. RegisterPageContent builds those as
   * disjoint halves, so in practice only one can be true — but that is a
   * property of a DIFFERENT FILE, and the visitor must never see two
   * contradictory red sentences if it stops holding. Fed a pathological overlap
   * the component shows exactly one, and it is the STARTED one: a round that
   * has begun cannot be booked whatever its seat status says.
   */
  const html = render({
    schedules: [OPEN, FULL],
    startedScheduleIds: [FULL._id],
    initialClassId: FULL._id,
  });
  const shown = [html.includes(FULL_MSG), html.includes(STARTED_MSG)].filter(Boolean).length;
  assert.equal(shown, 1, `expected exactly one notice, got ${shown}`);
  assert.ok(html.includes(STARTED_MSG), 'and the surviving one must be the started notice');
});

test('an UNKNOWN ?class= id still fails closed SILENTLY — neither sentence', () => {
  /**
   * The preserved third state, and the one this change most easily could have
   * destroyed by widening either message to cover "not found". A bogus id and a
   * started round have different remedies — "this link is stale" versus "pick
   * another round" — so the silence is kept exactly as it was.
   */
  const html = render({ initialClassId: 'sch-does-not-exist' });
  assert.equal(html.includes(STARTED_MSG), false, 'a bogus id was reported as a started round');
  assert.equal(html.includes(FULL_MSG), false, 'a bogus id was reported as a full round');
  assert.equal(html.includes('ผู้ประสานงาน'), false, 'a bogus id revealed the form');
});

test('no ?class= at all renders neither sentence', () => {
  // The ordinary arrival, from CourseHero's "ขอใบเสนอราคา Public" link, which
  // carries no round. Nothing has gone wrong and nothing should be said.
  const html = render({ initialClassId: null });
  assert.equal(html.includes(STARTED_MSG), false);
  assert.equal(html.includes(FULL_MSG), false);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: omitting startedScheduleIds degrades to the OLD behaviour', () => {
  /**
   * The prop defaults to empty on both RegisterWizard and StepForm, so a caller
   * that has not been updated fails closed silently exactly as before rather
   * than crashing on an undefined list.
   */
  const html = renderToStaticMarkup(
    createElement(StepForm, {
      course: COURSE,
      schedules: [OPEN, FULL],
      initialClassId: STARTED_ID,
      initialValues: null,
      onSubmit: noop,
      currentYear: CURRENT_YEAR,
    }),
  );
  assert.equal(html.includes(STARTED_MSG), false, 'a message appeared with no ids supplied');
  assert.ok(html.length > 500, 'the component threw instead of degrading');
});

test('CONTROL: the fixture really does render step 1', () => {
  // Every assertion above is a string match. A component that threw, or a
  // carousel that drew nothing, would satisfy several absence checks at once.
  const html = render({ initialClassId: null });
  assert.ok(html.length > 1000, `step 1 rendered only ${html.length} chars`);
  assert.ok(html.includes('เลือกรอบการอบรม'), 'the round picker heading is missing');
});

test('CONTROL: the two sentences are genuinely different strings', () => {
  // A copy-paste that made them identical would make every "leaked" assertion
  // above pass and mean nothing.
  assert.notEqual(STARTED_MSG, FULL_MSG);
  assert.equal(STARTED_MSG.includes(FULL_MSG), false);
  assert.equal(FULL_MSG.includes(STARTED_MSG), false);
});
