import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  rollingWindow,
} from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { SCHEDULE_STATUS } from '@/lib/scheduleStatus';

/**
 * A SOLD-OUT ROUND IS SHOWN, AND IS NOT A LINK.
 *
 * Upstream used to withhold `full` rounds from every public feed, so "this
 * round is not registerable" and "this round is not in the response" were the
 * same fact and no surface had to draw the difference. The public pages now ask
 * for open+nearly_full+full precisely so a full round ARRIVES — and the moment
 * it is on screen, the failure mode inverts: instead of a missing row, the risk
 * is a red เต็ม row that still navigates into a booking form.
 *
 * ── WHY THE CONTROL IS HALF THE TEST ────────────────────────────────────────
 * "No href for the full round" is satisfied by a render that produced no rows
 * at all — a filter mistake, a fixture dated outside the rolling window, an
 * early return. So the open round is in the SAME fixture and the SAME render,
 * and it must carry the link the full one is denied. One assertion says the
 * link is withheld; the other says withholding it was a decision rather than an
 * empty page.
 *
 * Both /schedule layouts read one builder (lib/schedule/scheduleRegistrationHref),
 * so this render covers the desktop cell and the mobile card together. Dates
 * come from the rolling window because nothing here can move the clock and a
 * fixed month renders no rounds for most of the year.
 */

const now = new Date();
const WINDOW = rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
const OPTIONS = rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON);
const DEFAULTS = defaultScheduleFilters(now);

const FULL_ID = 's-full';
const OPEN_ID = 's-open';

const COURSE = {
  _id: 'c1',
  course_id: 'GEN-AI-L1',
  course_name: 'Generative AI for Business Transformation',
  course_price: 14900,
  course_trainingdays: 2,
  program: { program_name: 'Generative AI' },
  schedules: [
    { _id: FULL_ID, dates: [`${WINDOW[0]}-10`, `${WINDOW[0]}-11`], type: 'hybrid', status: 'full' },
    { _id: OPEN_ID, dates: [`${WINDOW[1]}-08`], type: 'classroom', status: 'open' },
  ],
};

const html = renderToStaticMarkup(
  createElement(ScheduleBoard, {
    courses: [COURSE],
    programs: [{ _id: 'p1', program_name: 'Generative AI' }],
    schedulePDF: null,
    earlyBirdMap: {},
    filters: DEFAULTS,
    defaults: DEFAULTS,
    monthOptions: OPTIONS,
    onFilterChange() {},
    onReset() {},
    sheetOpen: false,
    onSheetOpenChange() {},
  }),
);

/**
 * Every `&class=<id>` that appears inside an `href`, and nothing else.
 *
 * Scoped to `href="..."` deliberately: the id is also emitted as a React key
 * and could appear in ordinary text, and a bare substring search for the id
 * would call either of those a link. What this test is about is navigability,
 * so only an href counts. `&amp;` because this is serialised markup.
 */
const linkedRoundIds = (markup) =>
  (markup.match(/href="[^"]*&amp;class=([^"&]+)/g) ?? []).map(
    (m) => m.split('class=')[1],
  );

test('a full round renders เต็ม and carries no navigable href', () => {
  assert.ok(
    html.includes(SCHEDULE_STATUS.full.label),
    'the round is on the page, labelled เต็ม — it must be SHOWN, not filtered out again',
  );
  assert.ok(
    !linkedRoundIds(html).includes(FULL_ID),
    'a full round must not be linked: greying a link that still navigates is the failure this prevents',
  );
});

test('CONTROL: an open round in the same fixture DOES carry one', () => {
  // Without this the assertion above passes on an empty render, on a broken
  // fixture, and on a regression that stops linking every round.
  assert.ok(
    linkedRoundIds(html).includes(OPEN_ID),
    'the open round is still a registration link — the absence above is specific to `full`',
  );
});
