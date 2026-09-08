import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EarlyBirdBanner } from '@/app/(public)/[...slug]/_components/EarlyBirdBanner';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The label is compared against the SERVER helper's output
// rather than a string typed here, so the two cannot drift apart quietly.
import { earlyBirdDeadlineLabel } from '@/lib/earlyBird/deadlineLabel';
// ADDED beside the statements above rather than folded into any. The source
// read below is the only way to assert the negative — that the component
// formats no dates of its own.
import { readSource } from '../sourceScan.mjs';

/**
 * The deadline label on the Early Bird banner.
 *
 * ── THE CLAIM IS ABOUT WHERE THE FORMATTING HAPPENS ─────────────────────
 * `EarlyBirdBanner` is `'use client'`. A date formatted inside it is formatted
 * twice, against two local timezones, and a deadline near midnight then names
 * two different days — a hydration mismatch. The string therefore arrives
 * finished, from the server.
 *
 * That is a claim a render alone cannot make: rendering the component with a
 * finished string proves the string is DISPLAYED, not that nothing else in the
 * file could have produced one. So this file asserts both halves — the render,
 * and a source read for the absence.
 */

const DEADLINE = '2026-09-10T16:59:59.999Z'; // 10 Sep 23:59:59.999 in Bangkok

const EB = {
  course_id: 'MSE-L1',
  label_th: 'Early Bird',
  schedule_id: 'sch1',
  special_price: 5900,
  deadline: DEADLINE,
};
const COURSE = { course_id: 'MSE-L1', course_name_th: 'หลักสูตรทดสอบ' };

/**
 * Through `createElement`, NOT by calling the component as a function. It holds
 * `useState` for the expiry flip, and a hook invoked outside a render throws —
 * which is also the reminder that this is the `'use client'` half of the card.
 */
const html = (props) =>
  renderToStaticMarkup(createElement(EarlyBirdBanner, {
    earlyBird: EB, earlyBirdPromotion: null, schedules: [], course: COURSE, ...props,
  }));
const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

test('the finished label is rendered, in the countdown column', () => {
  const label = earlyBirdDeadlineLabel(DEADLINE);
  assert.equal(label, 'หมดเขต 10 ก.ย. 2569', 'the helper changed — this fixture is stale');

  const markup = html({ deadlineLabel: label });
  assert.ok(markup.includes(label), 'the banner did not render the label it was given');

  // IN THE RIGHT-HAND COLUMN, with the countdown — it is the same fact the
  // countdown is counting. Asserted structurally: the label and the timer share
  // a parent, rather than the label merely existing somewhere in the card.
  const d = doc(markup);
  const timer = d.querySelector('[role="timer"]');
  assert.ok(timer, 'no countdown rendered — the placement claim has no anchor');
  const column = timer.parentElement;
  assert.ok(column.textContent.includes(label),
    'the label is not in the same column as the countdown');
});

test('the banner renders the string VERBATIM — it does not re-derive it', () => {
  /**
   * Handed a label that could not have come from this deadline, the banner must
   * still print it. That is what proves the component is a renderer of a
   * server-supplied string rather than a formatter that happens to agree.
   */
  assert.ok(html({ deadlineLabel: 'หมดเขต 1 ม.ค. 2500' }).includes('หมดเขต 1 ม.ค. 2500'));
});

test('no label ⇒ nothing rendered, and the banner is otherwise unchanged', () => {
  /**
   * The byte-identity claim, asserted as an equality against the banner WITHOUT
   * the new prop at all — which is exactly what every call site produced before
   * this round.
   */
  const before = html({});
  for (const deadlineLabel of [null, undefined, '']) {
    assert.equal(html({ deadlineLabel }), before,
      `deadlineLabel=${JSON.stringify(deadlineLabel)} changed the markup`);
  }
  assert.ok(!before.includes('หมดเขต'), 'the prefix leaked into a banner with no label');
});

test('CONTROL — the equality above can fail', () => {
  /**
   * Without this, "no label changes nothing" would be satisfied by a banner
   * that ignored the prop entirely, and the first test would be the only thing
   * standing between this feature and doing nothing at all.
   */
  assert.notEqual(html({ deadlineLabel: 'หมดเขต 10 ก.ย. 2569' }), html({}),
    'a real label did not change the markup — the prop is being ignored');
});

test('the component formats NO date from an instant — the whole point', () => {
  /**
   * The negative half, and it can only be a source read: a render proves what
   * the component did with the input it was given, not what it is capable of
   * doing with another.
   *
   * `formatScheduleRange` is the one permitted reader of the runtime calendar
   * and is EXEMPTED BY NAME rather than by loosening the rule — it is
   * pre-existing, it is not this round's subject, and rewriting it would move a
   * rendered string on every banner that shows a round. The exemption is narrow
   * enough that a SECOND such function would fail this test.
   *
   * Comments stripped (`.code`), this suite's standing rule — the doc block
   * above the component names these very methods and would otherwise satisfy
   * the search on its own.
   */
  const src = readSource('src/app/(public)/[...slug]/_components/EarlyBirdBanner.jsx').code;

  const body = src.replace(/function formatScheduleRange[\s\S]*?\n}\n/, '');
  for (const banned of ['getDate()', 'getMonth()', 'getFullYear()', 'toLocaleDateString']) {
    assert.ok(!body.includes(banned),
      `the banner calls ${banned} outside formatScheduleRange — a date formatted in a `
      + "'use client' component is formatted twice, in two timezones");
  }

  // CONTROL: the stripper really removed a function that DOES use them, so the
  // sweep above is not passing because it is looking at an empty string.
  assert.ok(src.includes('getDate()'), 'the fixture no longer contains the exempted reader');
  assert.ok(body.length > 500, 'the exemption stripped far more than one function');
});

// ── ROUND G COMMIT 2: ดูรายละเอียด ────────────────────────────────────────

/**
 * The link's TARGET is decided in lib/earlyBird/detailHref.js and pinned in
 * test/pure/earlyBirdDetailHref. What can only be asserted here is what the
 * banner DOES with the answer — in particular that `null` renders nothing at
 * all rather than a disabled control, which is the outcome an expired owner
 * page and an unowned row both have to reach.
 */

test('a resolved target renders a quiet link, beside the register button', () => {
  const markup = html({ detailHref: '/promotions/super-sale' });
  const d = doc(markup);
  const link = [...d.querySelectorAll('a')].find((a) => a.textContent.includes('ดูรายละเอียด'));
  assert.ok(link, 'no ดูรายละเอียด link rendered for a resolved target');
  assert.equal(link.getAttribute('href'), '/promotions/super-sale');

  // BESIDE the register button, in the same column — asserted structurally
  // rather than by position in the string.
  const register = [...d.querySelectorAll('a')].find((a) => a.textContent.includes('ลงทะเบียน'));
  assert.ok(register, 'the register button is gone');
  assert.equal(link.parentElement, register.parentElement,
    'the detail link is not in the same column as the register action');

  // NOT a second button: the card has one action. `btn-9e-cta` is the button
  // treatment, and the quiet link must not carry it.
  assert.ok(!String(link.getAttribute('class')).includes('btn-9e-cta'),
    'the detail link is styled as a second button');
  assert.ok(String(register.getAttribute('class')).includes('btn-9e-cta'),
    'the register button lost its treatment — the comparison above is vacuous');
});

test('no target ⇒ NO link, not a disabled control', () => {
  /**
   * `null` is what an unowned row, a deleted owner page and an owner page
   * outside its publish window all produce. Every one of them must render
   * nothing: a dead or self-referential link spends a click before failing.
   */
  for (const detailHref of [null, undefined, '']) {
    const markup = html({ detailHref });
    assert.ok(!markup.includes('ดูรายละเอียด'),
      `detailHref=${JSON.stringify(detailHref)} rendered a control anyway`);
  }
  // ...and specifically NOT a disabled span wearing the label.
  const d = doc(html({ detailHref: null }));
  assert.equal([...d.querySelectorAll('[aria-disabled]')]
    .filter((el) => el.textContent.includes('ดูรายละเอียด')).length, 0);
});

test('the banner never points at the course page it is already on', () => {
  /**
   * The one target that is worse than none, because it looks like it works.
   * There is no code path that could produce it — the resolver returns a
   * promotion href or null — so this asserts the absence at the RENDER, where a
   * later "helpful" fallback would land.
   */
  const markup = html({ detailHref: null });
  const hrefs = [...doc(markup).querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(!hrefs.some((h) => String(h).includes('-training-course')),
    'the banner linked back to a course page');
});

test('CONTROL — the no-link banner is otherwise byte-identical', () => {
  /**
   * Both round G props absent must reproduce the banner exactly as it rendered
   * before either commit, and a present target must change it — or "renders
   * nothing" would be satisfied by a prop nothing reads.
   */
  const bare = html({});
  assert.equal(html({ detailHref: null, deadlineLabel: null }), bare);
  assert.notEqual(html({ detailHref: '/promotions/super-sale' }), bare,
    'a resolved target did not change the markup — the prop is being ignored');
});
