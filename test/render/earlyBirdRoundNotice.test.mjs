import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepForm } from '@/components/registration/RegisterWizard';

/**
 * THE EARLY BIRD NOTICE ON THE SELECTED ROUND.
 *
 * ── WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT ───────────────────────────
 * A CONFIRMATION. The person reading it is already mid-form on the round it
 * names — they have chosen. So it states what is true and stops.
 *
 * It carries NO PRICE (this form shows none anywhere, and the discount reaches
 * the customer on the quotation an admin sends), NO COUNTDOWN (a clock on a
 * form someone is typing into raises a question nobody has answered — what
 * happens at zero — and the honest answer is that the SUBMIT decides, which a
 * countdown implies without saying), and NO LINK AWAY (every link out of a form
 * costs the registration). Each of those is asserted below, because "we chose
 * not to" is the kind of decision a later edit undoes without noticing.
 *
 * ── AND IT DISAPPEARS ON ROUND SWITCH FOR FREE ────────────────────────────
 * Measured in Phase A: changing round is pure client state
 * (`setSelectedScheduleId`; the `router.replace` beside it only syncs the URL
 * for shareability), and `earlyBirdScheduleId` is a stable server prop that does
 * not depend on `?class=`. So the notice is gated on
 * `selectedScheduleId === earlyBirdScheduleId` and nothing was built to remove
 * it. That finding is ASSERTED here rather than trusted — the two rounds below
 * differ only in which one the Early Bird is on.
 */

const COURSE = { course_id: 'COPILOT-STU-ADV', course_name: 'Multi-Agent with Microsoft Copilot Studio' };
const CURRENT_YEAR = 2026;

const EB_ROUND = { _id: '6a4b5bc0dbabef601ece8918', dates: ['2026-09-21', '2026-09-22'], status: 'open', type: 'classroom' };
const OTHER = { _id: 'sch-other', dates: ['2026-10-15', '2026-10-16'], status: 'open', type: 'classroom' };

/** The Bangkok end-of-day instant the binding panel writes. */
const DEADLINE = '2026-09-10T16:59:59.999Z';

const noop = () => {};

const render = (props) =>
  renderToStaticMarkup(
    createElement(StepForm, {
      course: COURSE,
      schedules: [EB_ROUND, OTHER],
      startedScheduleIds: [],
      initialValues: null,
      onSubmit: noop,
      currentYear: CURRENT_YEAR,
      earlyBirdScheduleId: EB_ROUND._id,
      earlyBirdDeadline: DEADLINE,
      ...props,
    }),
  );

const notice = (html) =>
  html.match(/data-testid="early-bird-round-notice"[^>]*>([\s\S]*?)<\/p>/)?.[1]
    ?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() ?? null;

// ── present on the Early Bird round ─────────────────────────────────────────

test('the selected Early Bird round says so, and until when', () => {
  const text = notice(render({ initialClassId: EB_ROUND._id }));
  assert.ok(text, 'the notice is missing on the Early Bird round');
  assert.match(text, /รอบนี้อยู่ในช่วง Early Bird/);
  // The Bangkok day the offer ends on — 16:59:59.999Z is 23:59 on the 10th
  // there, which is the day the author named in the binding panel.
  assert.match(text, /10 ก\.ย\. 2569/, 'the deadline is missing or in the wrong zone');
});

// ── absent everywhere else ──────────────────────────────────────────────────

test('THE ROUND SWITCH: a sibling round without an Early Bird shows nothing', () => {
  /**
   * The Phase A finding, asserted. These two renders differ ONLY in which round
   * is selected — same course, same schedules, same `earlyBirdScheduleId` — so
   * a notice appearing on both would mean the gate reads something other than
   * the selection.
   */
  assert.equal(notice(render({ initialClassId: OTHER._id })), null);
});

test('a course with NO Early Bird at all shows nothing on either round', () => {
  for (const id of [EB_ROUND._id, OTHER._id]) {
    assert.equal(
      notice(render({ initialClassId: id, earlyBirdScheduleId: null, earlyBirdDeadline: null })),
      null,
      `a notice appeared with no Early Bird configured (round ${id})`,
    );
  }
});

test('CONTROL: the probe is live — it finds the notice when it is there', () => {
  // Otherwise every "absent" assertion above would be satisfied by a broken
  // reader rather than by the component.
  assert.ok(notice(render({ initialClassId: EB_ROUND._id })));
});

// ── the deliberate omissions ────────────────────────────────────────────────

test('the notice still renders when the deadline could not be read', () => {
  /**
   * The map knows WHICH round is Early Bird even when the by-course read that
   * carries the deadline failed (both are `.catch()`-guarded independently). A
   * half-sentence ending in "ถึง" would be worse than the shorter true one.
   */
  const text = notice(render({ initialClassId: EB_ROUND._id, earlyBirdDeadline: null }));
  assert.match(text, /รอบนี้อยู่ในช่วง Early Bird/);
  assert.equal(/ถึง/.test(text), false, 'a dangling "ถึง" with no date');
});

test('NO PRICE, NO COUNTDOWN, NO LINK — the three deliberate omissions', () => {
  const html = render({ initialClassId: EB_ROUND._id });
  const text = notice(html);
  // The live config's price. This form shows no prices and this round does not
  // change that.
  assert.equal(/12,?665/.test(html), false, 'the form leaked the Early Bird price');
  // A countdown would need a live-updating unit in the notice.
  assert.equal(/เหลือ|วินาที|นับถอยหลัง/.test(text), false, 'the notice grew a countdown');
  // And it is a <p>, not an anchor: no way out of the form.
  assert.equal(/<a[^>]*>/.test(
    html.match(/data-testid="early-bird-round-notice"[\s\S]*?<\/p>/)?.[0] ?? ''
  ), false, 'the notice grew a link out of the form');
});
