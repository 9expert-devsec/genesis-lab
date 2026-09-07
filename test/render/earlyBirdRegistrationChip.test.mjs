import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PublicTable } from '@/app/admin/registrations/_components/PublicTable';
import { foldLegsIntoRows } from '@/lib/registrations/foldRequests';
// ADDED beside the statements above rather than folded into them — the standing
// rule in this repo. The detail screen is a separate surface with a separate
// claim: the list says THAT it was Early Bird, this says at WHAT.
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';

/**
 * THE EARLY BIRD CHIP, AND THE TWO PLACES THE FIELD WAS BEING DROPPED.
 *
 * ── THE FAILURE THIS FILE IS REALLY ABOUT ─────────────────────────────────
 * A chip that renders nothing because the field never arrived looks EXACTLY
 * like a registration that was not Early Bird. There is no error, nothing in a
 * log, and the admin quotes full price — which is the harm the whole tag exists
 * to prevent, moved one layer down and made invisible.
 *
 * MEASURED before the chip was written, and both were dropping it:
 *   · the list projection in lib/actions/registrations named `bundle` and not
 *     `earlyBird`, so the query never returned it;
 *   · `foldLegsIntoRows` rebuilds EVERY row explicitly — a single registration
 *     as well as a folded bundle request — so the field was dropped for both,
 *     not only for bundles. Probed with a one-row input carrying `earlyBird`:
 *     it came back without the key.
 *
 * So the fold is asserted here beside the chip rather than in a separate pure
 * file: they are one failure, and testing the chip against a hand-made row
 * would have passed while the real screen stayed blank.
 */

const EB = {
  courseCode: 'COPILOT-STU-ADV',
  scheduleId: '6a4b5bc0dbabef601ece8918',
  specialPrice: 12665,
  labelTh: 'Early Bird',
};

const row = (over = {}) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  courseName: 'Multi-Agent with Microsoft Copilot Studio',
  classDate: '21 - 22 ก.ย. 2569',
  status: 'pending',
  createdAt: '2026-09-01T00:00:00.000Z',
  coordinator: {},
  ...over,
});

const draw = (items) =>
  renderToStaticMarkup(createElement(PublicTable, {
    items,
    detailHref: (id) => `/admin/registrations/${id}`,
  }));

const chip = (html) => html.match(/data-testid="early-bird-chip"[^>]*>([^<]*)</)?.[1]?.trim() ?? null;

// ── the fold, which is what feeds the chip ─────────────────────────────────

test('THE DROP: a single registration keeps its earlyBird through the fold', () => {
  const [folded] = foldLegsIntoRows(['aaa'], [{ ...row({ _id: 'aaa' }), earlyBird: EB }]);
  assert.ok(folded.earlyBird, 'the fold drops earlyBird — the chip would render nothing, silently');
  assert.equal(folded.earlyBird.specialPrice, 12665);
});

test('CONTROL: the fold still carries `bundle`, so the probe is not vacuous', () => {
  const bundle = { pageId: 'p', sectionId: 's', requestId: 'req', name: 'ชุด' };
  const leg = (n) => ({ ...row({ _id: `b${n}` }), bundle });
  const [folded] = foldLegsIntoRows(['req'], [leg(1), leg(2)]);
  assert.ok(folded.bundle, 'the fold lost `bundle` too — this is a wider regression');
  assert.equal(folded.legs.length, 2);
});

// ── the chip ────────────────────────────────────────────────────────────────

test('a tagged registration draws the chip, with the label AS AT SUBMIT', () => {
  assert.equal(chip(draw([row({ earlyBird: EB })])), 'Early Bird');
  assert.equal(
    chip(draw([row({ earlyBird: { ...EB, labelTh: 'ลดพิเศษ 15%' } })])),
    'ลดพิเศษ 15%',
    'the chip shows a fixed string instead of the label that was stored'
  );
});

test('an empty stored label falls back rather than drawing a coloured smudge', () => {
  // `label_th` can be empty on a directly-seeded config — the storage-floor
  // rule that `bundle.name` already lives with.
  assert.equal(chip(draw([row({ earlyBird: { ...EB, labelTh: '' } })])), 'Early Bird');
});

test('an ORDINARY registration draws no chip at all', () => {
  assert.equal(chip(draw([row()])), null);
});

test('THE LIST SHOWS NO PRICE — it is scanned, and the value is per seat', () => {
  /**
   * A number in a 20-row table invites comparison against the other rows'
   * absent numbers, and a bare figure beside a course name does not say "per
   * seat". The price belongs on the detail screen, where the quotation is
   * written and where there is room to label it.
   */
  const html = draw([row({ earlyBird: EB })]);
  assert.equal(html.includes('12,665'), false, 'the list leaked the price');
  assert.equal(html.includes('12665'), false, 'the list leaked the price');
});

/**
 * WHERE THE CHIPS SIT, RELATIVE TO THE COURSE NAME.
 *
 * MEASURED before the move, by rendering all three shapes and reading DOM order:
 *
 *     single row, bundle only      NAME  then  BUNDLE
 *     single row, Early Bird only  NAME  then  EARLYBIRD
 *     folded 2-leg bundle          BUNDLE  then  NAME
 *
 * So the reported "Early Bird below, Bundle above" was real but its cause was
 * not an asymmetry inside one branch: BOTH chips were below the name in the
 * single-course branch, and the bundle chip an admin actually sees is the
 * FOLDED one, because a real bundle always has two or more legs while an Early
 * Bird registration is always a single row.
 *
 * That is why both moved. Moving only the Early Bird chip would have made the
 * two disagree inside a single row — a worse version of the reported problem —
 * and these assertions are what stop a later edit re-introducing either shape.
 */

/** Index-based order of the three marks inside the rendered cell. */
const orderOf = (html) =>
  [
    ['NAME', html.indexOf('Multi-Agent')],
    ['BUNDLE', html.indexOf('bundle-leg-chip')],
    ['EARLYBIRD', html.indexOf('early-bird-chip')],
  ]
    .filter(([, i]) => i >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([n]) => n);

test('POSITION: a bundle-only row draws its chip ABOVE the course name', () => {
  const html = draw([row({ bundle: { pageId: 'p', sectionId: 's', requestId: 'r', name: 'ชุด' } })]);
  assert.deepEqual(orderOf(html), ['BUNDLE', 'NAME']);
});

test('POSITION: an Early-Bird-only row draws its chip ABOVE the course name', () => {
  assert.deepEqual(orderOf(draw([row({ earlyBird: EB })])), ['EARLYBIRD', 'NAME']);
});

test('POSITION: a row carrying BOTH draws two chips, both above the name', () => {
  /**
   * The constructed case. One promotion per registration is ruled at the bundle
   * route, so this should never occur — and the chips stay SIBLINGS inside an
   * OR-gated row precisely so that if the rule is ever broken the screen shows
   * both, visibly wrong and fixable, rather than an `else` silently hiding one.
   */
  const html = draw([row({
    earlyBird: EB,
    bundle: { pageId: 'p', sectionId: 's', requestId: 'r', name: 'ชุด' },
  })]);
  assert.deepEqual(orderOf(html), ['BUNDLE', 'EARLYBIRD', 'NAME']);
});

test('POSITION: the FOLDED bundle row is unchanged — it always drew above', () => {
  // The shape the move aligns TO. If this ever flips, the single-course branch
  // is aligned to nothing.
  const leg = (n) => ({ ...row({ _id: `b${n}` }), bundle: { pageId: 'p', sectionId: 's', requestId: 'req', name: 'ชุด' } });
  const html = draw([{ ...row(), bundle: leg(1).bundle, legs: [leg(1), leg(2)] }]);
  assert.deepEqual(orderOf(html).slice(0, 2), ['BUNDLE', 'NAME']);
});

test('POSITION CONTROL: a row with no promotion renders no chip row at all', () => {
  // The 24px chip row is conditional: an unconditional one would be an empty
  // element on the majority of rows, which the empty-element guard catches.
  const html = draw([row()]);
  assert.deepEqual(orderOf(html), ['NAME']);
  assert.equal(/h-\[24px\]/.test(html), false, 'an empty chip row is rendered on a plain registration');
});

test('the two promotion chips are distinguishable, and both can render', () => {
  /**
   * One promotion per registration — ruled at the bundle route — so this pair
   * should never occur. The chip is rendered as a SIBLING rather than an
   * `else` precisely so that if the rule is ever broken the screen shows two
   * chips, visibly wrong and fixable, instead of silently hiding one.
   */
  const html = draw([row({ earlyBird: EB, bundle: { pageId: 'p', sectionId: 's', requestId: 'r', name: 'ชุด' } })]);
  assert.match(html, /data-testid="early-bird-chip"/);
  assert.match(html, /data-testid="bundle-leg-chip"/);
});

// ── the detail screen, where the quotation is actually written ──────────────

const DETAIL = (over = {}) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaa0009',
  status: 'pending',
  courseName: 'Multi-Agent with Microsoft Copilot Studio',
  courseCode: 'COPILOT-STU-ADV',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.co', phone: '0812345678' },
  attendeesListProvided: true,
  attendeesCount: 3,
  attendees: [{ firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.co', phone: '0812345678' }],
  createdAt: '2026-09-01T03:00:00.000Z',
  ...over,
});

const detail = (over) =>
  renderToStaticMarkup(createElement(RegistrationDetailClient, { doc: DETAIL(over), history: null }));

test('DETAIL: the frozen per-seat price is shown, labelled as per seat', () => {
  /**
   * This is where the harm happens — every quotation is written by hand from
   * this screen, so this row is what stops an admin quoting full price.
   *
   * "/ คน" is doing real work: `specialPrice` is a PER-SEAT figure and this
   * registration carries three attendees. Nothing in this codebase multiplies
   * it, exactly as nothing multiplies the ordinary course price.
   */
  const html = detail({ earlyBird: EB });
  assert.match(html, /12,665 บาท \/ คน/, 'the frozen price is not on the detail screen');
  assert.match(html, /Early Bird/, 'the row is not labelled');
});

test('DETAIL: the label is the one stored at submit', () => {
  assert.match(detail({ earlyBird: { ...EB, labelTh: 'ลดพิเศษ 15%' } }), /ลดพิเศษ 15%/);
});

test('DETAIL: a config that stored no price says so rather than showing a bare colon', () => {
  // null is legitimate — the storage floor accepts it — and an empty value
  // would read as a field that failed to load, the same reason แพ็กเกจ carries
  // an emptyHint.
  const html = detail({ earlyBird: { ...EB, specialPrice: null } });
  assert.match(html, /ไม่ได้บันทึกราคาพิเศษไว้/);
});

test('DETAIL CONTROL: an ordinary registration shows no Early Bird row', () => {
  const html = detail();
  assert.equal(html.includes('ไม่ได้บันทึกราคาพิเศษไว้'), false);
  assert.equal(/12,665/.test(html), false);
});
