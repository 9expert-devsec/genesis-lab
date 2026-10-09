import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { BundleStepPicks } from '@/components/registration/BundleWizard';
import { BundleSummary } from '@/components/registration/BundleSummary';
import { RegistrationStepper } from '@/components/registration/RegistrationStepper';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND PICKING IS ITS OWN FIRST STEP, and the package summary tells the truth
 * about what has been picked.
 *
 * ── THE TWO DEFECTS THIS PINS ────────────────────────────────────────────────
 * 1. THE SUMMARY NAMED A ROUND NOBODY HAD CHOSEN. The route derived one round
 *    per course with `chooseItemRound` — the author-ordered first one still open
 *    — and the card printed `รอบอบรม 12-13 พ.ย.` while both pick controls on the
 *    same screen still read "— เลือกรอบ —". Two rounds advertised, zero chosen.
 * 2. THE DECISION WAS BURIED IN THE FORM. Picking a round decides WHAT is being
 *    quoted; it was asked at the top of a long page of contact, attendee and
 *    invoice fields, which is where it stopped being the first thing anyone did.
 *
 * ── WHY SOME OF THIS IS A SOURCE SCAN ───────────────────────────────────────
 * `BundleWizard` itself cannot be rendered in this tier: it calls `useRouter`
 * and `useSearchParams`, and its steps are gated behind a `hydrated` flag set
 * in an effect that `renderToStaticMarkup` never runs. The STEPS it renders are
 * therefore pinned at the source, where the claim is actually made, and the
 * step components are rendered directly — which is exactly why they are
 * exported.
 */

const WIZARD = 'src/components/registration/BundleWizard.jsx';

const dom = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
const text = (n) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

const TODAY = '2026-10-08';
const offer = (id, dates) => ({ id, snapshot: { id, dates, type: 'classroom' } });
const item = (id, rounds) => ({ id, courseId: `C-${id}`, rounds });
const liveOf = (...pairs) => Object.fromEntries(pairs);
const live = (id, dates, status = 'open') => [id, { status, dates }];

const picksDom = (props) =>
  dom(
    createElement(BundleStepPicks, {
      today: TODAY,
      picks: {},
      onChange() {},
      onNext() {},
      ...props,
    }),
  );

// ── the stepper ────────────────────────────────────────────────────────────

test('the stepper reads เลือกรอบ → กรอกข้อมูล → ตรวจสอบ → สำเร็จ', () => {
  /**
   * The order AND the count. A four-step flow whose indicator shows three is a
   * customer told they are on the last screen with two to go.
   */
  const { code } = readSource(WIZARD);
  assert.match(
    code,
    /const BUNDLE_STEPS = \['เลือกรอบ', 'กรอกข้อมูล', 'ตรวจสอบ', 'สำเร็จ'\]/,
    'the bundle step labels changed or lost their order',
  );
  assert.match(
    code,
    /<RegistrationStepper currentStep=\{currentStep\} steps=\{BUNDLE_STEPS\} \/>/,
    'the wizard no longer hands its own labels to the shared stepper',
  );
});

test('the shared stepper RENDERS the labels it is given, in order', () => {
  const d = dom(
    createElement(RegistrationStepper, {
      currentStep: 1,
      steps: ['เลือกรอบ', 'กรอกข้อมูล', 'ตรวจสอบ', 'สำเร็จ'],
    }),
  );
  const items = [...d.querySelectorAll('li')].map((li) => text(li));
  assert.equal(items.length, 4);
  assert.deepEqual(items, ['1เลือกรอบ', '2กรอกข้อมูล', '3ตรวจสอบ', '4สำเร็จ']);
});

test('CONTROL: without `steps` the stepper is the public wizard\'s three, unchanged', () => {
  // The override must not have become the only path — every other caller still
  // relies on the default, including its `takesPayment` rule.
  const plain = [...dom(createElement(RegistrationStepper, { currentStep: 1 })).querySelectorAll('li')];
  assert.deepEqual(plain.map(text), ['1กรอกข้อมูล', '2ตรวจสอบ', '3สำเร็จ']);

  const paying = [...dom(
    createElement(RegistrationStepper, { currentStep: 1, takesPayment: true }),
  ).querySelectorAll('li')];
  assert.deepEqual(paying.map(text), ['1กรอกข้อมูล', '2ตรวจสอบและดำเนินการ', '3สำเร็จ']);
});

// ── step 1 is the picker, and step 2 is the form ──────────────────────────

test('step 1 renders the PICK step and step 2 the form', () => {
  const { code } = readSource(WIZARD);
  const picks = code.indexOf('{currentStep === 1 && hydrated && (');
  const form = code.indexOf('{currentStep === 2 && hydrated && (');
  const review = code.indexOf('{currentStep === 3 && formData && (');
  assert.ok(picks > 0 && form > 0 && review > 0, 'a step branch is missing');
  assert.match(code.slice(picks, picks + 220), /<BundleStepPicks/);
  assert.match(code.slice(form, form + 220), /<BundleStepForm/);
  assert.match(code.slice(review, review + 220), /<BundleStepReview/);
});

test('the INFO step has no pick control left on it', () => {
  /**
   * The dropdown block used to sit above `BundleStepForm` inside the same
   * branch. It is gone rather than hidden, and that is checked by counting the
   * mounts: ONE `<BundleRoundPicks` in the file, and it is inside
   * `BundleStepPicks`.
   */
  const { code } = readSource(WIZARD);
  assert.equal(
    (code.match(/<BundleRoundPicks/g) ?? []).length, 1,
    'the picker is mounted more than once — one of them is on the form step',
  );
  const picksComponent = code.indexOf('export function BundleStepPicks(');
  const mount = code.indexOf('<BundleRoundPicks');
  assert.ok(mount > picksComponent, 'the picker is mounted outside BundleStepPicks');
});

test('a 409 returns the applicant to the PICK step, not to the form', () => {
  // bundlePicksContract pins `setCurrentStep(1)`; what it cannot say, now that
  // the steps have moved, is that step 1 is the pick step. That is this.
  const { code } = readSource(WIZARD);
  const at = code.indexOf("json?.error === 'bundle_picks_invalid'");
  assert.match(code.slice(at, at + 900), /setCurrentStep\(1\)/);
  const picks = code.indexOf('{currentStep === 1 && hydrated && (');
  assert.match(code.slice(picks, picks + 220), /<BundleStepPicks/);
});

// ── ถัดไป is gated on the shared validator ────────────────────────────────

test('ถัดไป is DISABLED until the picks are valid, and enabled once they are', () => {
  const items = [item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-12-10'])])];
  const liveStatusById = liveOf(live('a1', ['2026-11-02']), live('a2', ['2026-12-10']));

  const blocked = picksDom({ items, liveStatusById, picksOk: false });
  const button = blocked.querySelector('[data-testid="bundle-step-nav"] button');
  assert.equal(text(button), 'ถัดไป');
  assert.equal(button.hasAttribute('disabled'), true);
  assert.match(
    text(blocked.querySelector('[data-testid="bundle-picks-incomplete"]')),
    /เลือกรอบให้ครบทุกหลักสูตร/,
  );

  const ok = picksDom({ items, liveStatusById, picks: { i1: 'a1' }, picksOk: true });
  assert.equal(ok.querySelector('[data-testid="bundle-step-nav"] button').hasAttribute('disabled'), false);
  assert.equal(ok.querySelector('[data-testid="bundle-picks-incomplete"]'), null);
});

test('the gate is validateBundlePicks, in the wizard and in the route', () => {
  // The property that makes the button honest: the form cannot allow a set the
  // server will refuse. Asserted at the source because the two halves run in
  // different runtimes.
  for (const rel of [WIZARD, 'src/app/api/registration/bundle/route.js']) {
    assert.match(readSource(rel).code, /validateBundlePicks/, `${rel} does not use the shared validator`);
  }
});

test('a bundle with nothing to pick says so, and does not block the step', () => {
  // The legacy render — no pick inputs threaded. The server derives those picks
  // itself, so an empty step with a live ถัดไป is correct; it just needs a
  // sentence, or it reads as a screen that failed to load.
  const d = picksDom({ items: null, picksOk: true });
  assert.match(text(d.querySelector('[data-testid="bundle-picks-none"]')), /ไม่ต้องเลือกรอบ/);
  assert.equal(d.querySelector('[data-testid="bundle-step-nav"] button').hasAttribute('disabled'), false);
  assert.equal(d.querySelector('[data-testid="bundle-picks-incomplete"]'), null);
});

test('the step offers the way back to the promotion, and draws no link without one', () => {
  const items = [item('i1', [offer('a1', ['2026-11-02'])])];
  const liveStatusById = liveOf(live('a1', ['2026-11-02']));

  const linked = picksDom({ items, liveStatusById, picksOk: true, backHref: '/promotions/duo' });
  const a = linked.querySelector('[data-testid="bundle-step-nav"] a');
  assert.equal(a.getAttribute('href'), '/promotions/duo');
  assert.match(text(a), /กลับไปดูโปรโมชัน/);

  // `publicPageHref` answers null for a published-but-expired page, so this is
  // reachable rather than hypothetical.
  const bare = picksDom({ items, liveStatusById, picksOk: true });
  assert.equal(bare.querySelector('[data-testid="bundle-step-nav"] a'), null);
  assert.match(
    bare.querySelector('[data-testid="bundle-step-nav"]').getAttribute('class'),
    /justify-end/,
  );
});

// ── the summary shows a round ONLY once it is picked ──────────────────────

const LINE = {
  key: 'i1',
  itemId: 'i1',
  courseName: 'Microsoft Excel Level 1',
  courseId: 'EXCEL-1',
  roundsById: { a1: { dates: '12-13 พ.ย. 69', type: 'classroom' } },
};

test('BEFORE a pick the summary says ยังไม่ได้เลือกรอบ and names no round', () => {
  const d = dom(createElement(BundleSummary, { lines: [{ ...LINE, dates: null, type: null }] }));
  const row = d.querySelector('[data-testid="bundle-summary-item"]');
  assert.match(text(row), /Microsoft Excel Level 1/);
  assert.equal(text(row.querySelector('[data-testid="bundle-summary-unpicked"]')), 'ยังไม่ได้เลือกรอบ');
  assert.equal(row.querySelector('[data-testid="bundle-summary-round"]'), null);

  // The DEFECT, as an absence probe: no date and no delivery line at all.
  assert.doesNotMatch(text(row), /รอบอบรม/, 'a round is still being named before one is picked');
  assert.doesNotMatch(text(row), /Classroom/, 'a delivery label survived without a round');
});

test('AFTER a pick the round line and the delivery line both appear', () => {
  const d = dom(createElement(BundleSummary, { lines: [{ ...LINE, dates: '12-13 พ.ย. 69', type: 'classroom' }] }));
  const row = d.querySelector('[data-testid="bundle-summary-item"]');
  assert.match(text(row.querySelector('[data-testid="bundle-summary-round"]')), /รอบอบรม 12-13 พ\.ย\. 69/);
  assert.equal(row.querySelector('[data-testid="bundle-summary-unpicked"]'), null);
  assert.match(text(row), /Classroom/);
});

test('the route sends EVERY offered round, keyed by id, and no default one', () => {
  /**
   * The mechanism of defect 1 was `chooseItemRound` on the server picking a
   * round for the summary. The import is gone; `chooseItemRounds` — the plural,
   * the same one the public card draws its chips from — replaces it.
   */
  /*
    `withImports`, NOT `code`, for the first two: `readSource().code` strips
    import statements, so an assertion ABOUT an import read from it passes
    vacuously in one direction and can never fail in the other — defect 5 and
    its mirror, both named in sourceScan's own header.
  */
  const { code, withImports } = readSource('src/app/(public)/registration/bundle/BundlePageContent.jsx');
  assert.match(withImports, /import \{ chooseItemRounds \}/, 'the route no longer reads every offered round');
  assert.doesNotMatch(
    withImports, /\bchooseItemRound\b(?!s)/,
    'the singular default-round chooser is still imported or called here',
  );
  assert.match(code, /roundsById\[id\] = \{/, 'the labels are no longer keyed by round id');
  assert.match(code, /summaryLines=\{lines\}/, 'the wizard is not being handed the lines');
});

test('CONTROL: the plural/singular probe can tell the two apart', () => {
  // `chooseItemRound` is a prefix of `chooseItemRounds`, so the probe above is
  // only worth anything if the lookahead actually works.
  assert.match('chooseItemRound(', /\bchooseItemRound\b(?!s)/);
  assert.doesNotMatch('chooseItemRounds(', /\bchooseItemRound\b(?!s)/);
});
