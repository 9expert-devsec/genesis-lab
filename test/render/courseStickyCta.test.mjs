import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CourseStickyCTA,
  stickyCtaAction,
} from '@/app/(public)/[...slug]/_components/CourseStickyCTA';
import { inhouseRegistrationHref } from '@/lib/courseRegistrationHref';

// The three actions are onClick scrolls (branches 1 & 2) and a <Link> (branch
// 3). Only navigation shows in server markup, so BEHAVIOUR is asserted against
// the pure `stickyCtaAction` resolver — the render path just executes what it
// returns — and markup tests cover what a static render can actually see.

const COURSE_ID = 'DA-PBI'; // uppercased on purpose — the href must lowercase it
const INHOUSE_HREF = inhouseRegistrationHref(COURSE_ID); // /registration/in-house?course=da-pbi

// ── Behaviour: branch 1 — has open sessions ─────────────────────────────────
test('branch 1 (hasSchedules): scrolls to #schedule, does not navigate', () => {
  const a = stickyCtaAction({ hasSchedules: true, inhouseHref: null });
  assert.equal(a.kind, 'scroll-schedule');
  assert.equal(a.label, 'ลงทะเบียน');
  assert.equal(a.href, undefined, 'branch 1 never navigates');
});

test('branch 1 ignores a stray inhouseHref (hasSchedules wins)', () => {
  // Defensive: schedules present ⇒ public course ⇒ page passes null anyway, but
  // hasSchedules must take priority even if an href leaked through.
  const a = stickyCtaAction({ hasSchedules: true, inhouseHref: INHOUSE_HREF });
  assert.equal(a.kind, 'scroll-schedule');
});

// ── Behaviour: branch 2 — public course, no open sessions ───────────────────
test('branch 2 (public, no sessions): scrolls to TOP, targets neither #schedule nor a quotation href', () => {
  const a = stickyCtaAction({ hasSchedules: false, inhouseHref: null });
  assert.equal(a.kind, 'scroll-top');
  assert.equal(a.label, 'ขอใบเสนอราคา');
  // The specific mistake to guard against: the empty schedule section still
  // exists on the page, so branch 2 must NOT be a scroll-to-#schedule…
  assert.notEqual(a.kind, 'scroll-schedule', 'branch 2 must not scroll to #schedule');
  // …and it must NOT navigate to any quotation flow.
  assert.equal(a.href, undefined, 'branch 2 does not navigate anywhere');
});

// ── Behaviour: branch 3 — inhouse-only ──────────────────────────────────────
test('branch 3 (inhouse-only): navigates to the INHOUSE quotation href', () => {
  const a = stickyCtaAction({ hasSchedules: false, inhouseHref: INHOUSE_HREF });
  assert.equal(a.kind, 'navigate');
  assert.equal(a.href, INHOUSE_HREF);
  assert.equal(a.label, 'ขอใบเสนอราคา');
});

// Branches 2 and 3 share a label but MUST behave differently — assert on the
// behaviour (kind/href), never the text. A label-only test would pass with both
// wired the same way.
test('branches 2 and 3 share a label but differ in behaviour', () => {
  const b2 = stickyCtaAction({ hasSchedules: false, inhouseHref: null });
  const b3 = stickyCtaAction({ hasSchedules: false, inhouseHref: INHOUSE_HREF });
  assert.equal(b2.label, b3.label, 'same label…');
  assert.notEqual(b2.kind, b3.kind, '…but different behaviour');
  assert.equal(b2.href, undefined, 'branch 2 never navigates');
  assert.equal(b3.href, INHOUSE_HREF, 'branch 3 navigates to inhouse');
});

// ── Markup: what a static render can observe ─────────────────────────────────
const R = (props) => renderToStaticMarkup(createElement(CourseStickyCTA, props));
const TITLE = 'Power BI Training Course';
const COVER = 'https://cdn/power-bi-cover.jpg';

test('branch 3 renders a real <a> to the inhouse href', () => {
  const html = R({ title: TITLE, coverUrl: COVER, hasSchedules: false, inhouseHref: INHOUSE_HREF });
  assert.ok(html.includes(`href="${INHOUSE_HREF}"`), 'inhouse link present');
  assert.ok(html.includes('ขอใบเสนอราคา'));
  assert.ok(html.includes('สนใจหลักสูตร'), 'course-page eyebrow');
});

test('branches 1 & 2 render a <button>, never a registration href', () => {
  const sched = R({ title: TITLE, coverUrl: COVER, hasSchedules: true, inhouseHref: null });
  const noSched = R({ title: TITLE, coverUrl: COVER, hasSchedules: false, inhouseHref: null });
  // In-page scrolls are onClick handlers — no href of any registration flow
  // should appear in the markup for either scroll branch.
  assert.ok(!/href="\/registration\//.test(sched), 'branch 1 has no registration link');
  assert.ok(!/href="\/registration\//.test(noSched), 'branch 2 has no registration link');
  assert.ok(sched.includes('ลงทะเบียน'), 'branch 1 label');
  assert.ok(noSched.includes('ขอใบเสนอราคา'), 'branch 2 label');
});

test('no coverUrl: bar still renders, emits no <img>', () => {
  const html = R({ title: TITLE, coverUrl: null, hasSchedules: true, inhouseHref: null });
  assert.ok(html.includes(TITLE), 'title still shown');
  assert.ok(html.includes('ลงทะเบียน'), 'action still present');
  assert.ok(!html.includes('<img'), 'no broken image element when cover is null');
});

test('with coverUrl: an <img> points at the cover', () => {
  const html = R({ title: TITLE, coverUrl: COVER, hasSchedules: true, inhouseHref: null });
  assert.ok(html.includes(`src="${COVER}"`), 'cover image src present when given');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
// Proves the branch assertions distinguish the shapes rather than passing
// vacuously. This broken resolver ignores its inputs and always scrolls to top
// (the branch-2 behaviour). Fed the branch-1 and branch-3 inputs it produces the
// WRONG kind — exactly what those tests assert against — so if the real resolver
// regressed to this, branches 1 and 3 above would go red.
test('CONTROL: an always-scroll-top resolver fails the branch-1 and branch-3 checks', () => {
  const broken = () => ({ label: 'ขอใบเสนอราคา', kind: 'scroll-top' });

  const asBranch1 = broken({ hasSchedules: true, inhouseHref: null });
  assert.notEqual(
    asBranch1.kind,
    'scroll-schedule',
    'broken variant is NOT scroll-schedule — branch 1’s assertion would fail here',
  );

  const asBranch3 = broken({ hasSchedules: false, inhouseHref: INHOUSE_HREF });
  assert.notEqual(asBranch3.kind, 'navigate', 'broken variant does not navigate');
  assert.equal(asBranch3.href, undefined, 'broken variant drops the inhouse href — branch 3 would fail');

  // And the real resolver gets those same inputs right (the green side):
  assert.equal(stickyCtaAction({ hasSchedules: true, inhouseHref: null }).kind, 'scroll-schedule');
  assert.equal(stickyCtaAction({ hasSchedules: false, inhouseHref: INHOUSE_HREF }).href, INHOUSE_HREF);
});
