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

test('the wizard keeps CheckCircle2 for its OTHER, unrelated roles', () => {
  // The icon is also an inline step-indicator glyph and a mode-card tick in the
  // same file. Those are a different role and were left alone; a blanket
  // find-and-replace across the file is the way that gets broken.
  assert.match(WIZARD, /import \{\s*ArrowRight,\s*CheckCircle2,/);
  assert.match(WIZARD, /currentStep > s\.n \? <CheckCircle2 className="h-4 w-4" \/> : s\.n/);
  assert.match(WIZARD, /\{active && <CheckCircle2 className="h-4 w-4 text-9e-brand" \/>\}/);
});

test('CONTROL: the wizard success screens no longer use the 16x16 lucide mark', () => {
  // The markup the swap removed, in both branches. Pairs with the test above:
  // together they say "the bullet glyphs stayed, the success marks went".
  assert.ok(!WIZARD.includes('mx-auto h-16 w-16 text-9e-brand'));
  assert.equal((WIZARD.match(/<SuccessPulseIcon className="mx-auto" \/>/g) || []).length, 2);
});
