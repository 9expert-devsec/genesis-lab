import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The third success path. A card payer redirected through Omise 3DS lands on
 * /registration/payment/complete and may never reach StepComplete at all, so
 * the new mark has to be here too or the swap covers only two of three exits.
 *
 * Source-scanned rather than rendered: the page's status branches sit behind a
 * <Suspense> + useSearchParams + a polling useEffect, so a static render only
 * ever produces the "checking" spinner and can never reach the paid branch.
 *
 * The controls fire the SAME probes at the masterclass sibling page, which is
 * deliberately OUT OF SCOPE. That does double duty: it proves the probes match
 * real code (so the absence assertions are not vacuous) and it pins that the
 * out-of-scope file was left alone.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const IN_SCOPE = read('src/app/(public)/registration/payment/complete/page.jsx');
const OUT_OF_SCOPE = read('src/app/(public)/masterclass/payment/complete/page.jsx');
const WIZARD = read('src/components/registration/RegisterWizard.jsx');
/**
 * The step indicator LEFT RegisterWizard.jsx. It is its own component now,
 * shared with the bundle quotation, and it took the CheckCircle2 step glyph
 * with it — so the guard below follows the glyph rather than continuing to
 * assert a location that stopped being true.
 */
const STEPPER = read('src/components/registration/RegistrationStepper.jsx');

test('the 3DS return page renders the new mark on its paid branch', () => {
  assert.match(IN_SCOPE, /import \{ SuccessPulseIcon \} from '@\/components\/ui\/SuccessPulseIcon'/);
  assert.match(IN_SCOPE, /<SuccessPulseIcon \/>/);
});

test('the 3DS return page no longer references CheckCircle2', () => {
  assert.ok(!IN_SCOPE.includes('CheckCircle2'));
});

test('its other lucide icons survived the import edit', () => {
  // The import was rewritten, not deleted — the failed/timeout branches still
  // need XCircle and the checking branch still needs Loader2.
  assert.match(IN_SCOPE, /import \{ XCircle, Loader2 \} from 'lucide-react'/);
  assert.match(IN_SCOPE, /<XCircle /);
  assert.match(IN_SCOPE, /<Loader2 /);
});

test('CONTROL: the CheckCircle2 probe DOES match the out-of-scope sibling', () => {
  // Same string, same shape of file. If this fails, the absence assertion above
  // is checking for something that no longer exists anywhere and proves nothing.
  assert.ok(OUT_OF_SCOPE.includes('CheckCircle2'));
  assert.match(OUT_OF_SCOPE, /<CheckCircle2 className="h-16 w-16 text-green-500" strokeWidth=\{1\.5\} \/>/);
});

test('CONTROL: the masterclass 3DS page did NOT get the new mark', () => {
  // Explicitly out of scope this round. If this goes red the swap leaked into
  // a feature whose owner has not decided on it yet.
  assert.ok(!OUT_OF_SCOPE.includes('SuccessPulseIcon'));
});

test('CheckCircle2 keeps its OTHER, unrelated roles — in both files it now lives in', () => {
  /**
   * The icon is a success mark in ONE role and a bullet glyph in two others:
   * the step indicator's "this step is done" tick, and the attendance-mode
   * card's "this card is selected" tick. Those two were left alone by the
   * SuccessPulseIcon swap, and a blanket find-and-replace is how that gets
   * broken.
   *
   * THE STEP GLYPH MOVED FILES. It used to sit in RegisterWizard.jsx beside the
   * mode-card tick, and this test used to assert both against that one source.
   * The step indicator is now RegistrationStepper.jsx — extracted so the bundle
   * quotation could render the same three steps instead of a fifth copy — so
   * the glyph is asserted where it actually is. The property under guard is
   * unchanged; only its address moved, and the assertion follows it rather than
   * being relaxed to accommodate the move.
   */
  // The wizard still imports the icon, because the mode-card tick is still here.
  assert.match(WIZARD, /import \{\s*ArrowRight,\s*CheckCircle2,/);
  assert.match(WIZARD, /\{active && <CheckCircle2 className="h-4 w-4 text-9e-brand" \/>\}/);

  // …and the step glyph, at its new address, unchanged in form.
  assert.match(STEPPER, /import \{ CheckCircle2 \} from "lucide-react"/);
  assert.match(STEPPER, /currentStep > s\.n \? <CheckCircle2 className="h-4 w-4" \/> : s\.n/);
});

test('CONTROL: the step glyph is in the stepper and NOT still in the wizard', () => {
  /**
   * Discrimination, so the test above cannot pass by the glyph having been
   * duplicated into both files — which is the failure a move is most likely to
   * produce and the one a pair of independent `match` assertions would miss.
   */
  const probe = /currentStep > s\.n \? <CheckCircle2 className="h-4 w-4" \/> : s\.n/g;
  assert.equal((STEPPER.match(probe) || []).length, 1, 'the stepper must hold it exactly once');
  assert.equal((WIZARD.match(probe) || []).length, 0, 'the wizard must not hold it any more');

  // …and the wizard did not simply lose CheckCircle2 altogether, which would
  // make the first half of this test vacuous.
  assert.ok(WIZARD.includes('CheckCircle2'));
});

test('CONTROL: the wizard success screens no longer use the 16x16 lucide mark', () => {
  // The markup the swap removed, in both branches. Pairs with the test above:
  // together they say "the bullet glyphs stayed, the success marks went".
  assert.ok(!WIZARD.includes('mx-auto h-16 w-16 text-9e-brand'));
  assert.equal((WIZARD.match(/<SuccessPulseIcon className="mx-auto" \/>/g) || []).length, 2);
});
