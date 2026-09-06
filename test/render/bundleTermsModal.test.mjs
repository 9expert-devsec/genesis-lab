import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { BundleTermsModal } from '@/components/registration/BundleTermsModal';
import { BUNDLE_TERMS } from '@/lib/registration/bundleTerms';

/**
 * The bundle's terms modal — and, just as much, the promise that building it
 * left the PUBLIC payment modal alone.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const doc = (props) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(createElement(BundleTermsModal, props))}</body>`,
  ).window.document;

test('closed renders nothing at all', () => {
  assert.equal(renderToStaticMarkup(createElement(BundleTermsModal, { open: false })), '');
  // CONTROL: open renders something, so the emptiness above is the `open` gate
  // and not a component that never renders.
  assert.notEqual(renderToStaticMarkup(createElement(BundleTermsModal, { open: true })), '');
});

test('open renders all eleven clauses, in order, verbatim', () => {
  const d = doc({ open: true });
  const items = [...d.querySelectorAll('[data-testid="bundle-terms-list"] li')].map((li) =>
    li.textContent.trim(),
  );
  assert.equal(items.length, 11);
  assert.deepEqual(items, [...BUNDLE_TERMS]);
});

test('CONTROL: the clause probe would notice a missing one', () => {
  /**
   * Discrimination for the test above: it compares against the module, so it
   * would also pass if BOTH the module and the render lost a clause. This pins
   * the count against a literal 11 and shows the comparison moving.
   */
  const d = doc({ open: true });
  const items = [...d.querySelectorAll('[data-testid="bundle-terms-list"] li')];
  assert.equal(items.length, 11);
  assert.notDeepEqual(
    items.map((li) => li.textContent.trim()),
    [...BUNDLE_TERMS].slice(0, 10),
  );
});

test('the heading, the accessible name and the dismiss button', () => {
  const d = doc({ open: true });
  const dlg = d.querySelector('[data-testid="bundle-terms-modal"]');
  assert.equal(dlg.getAttribute('role'), 'dialog');
  assert.equal(dlg.getAttribute('aria-modal'), 'true');
  // The accessible name and the visible heading are the SAME words, and they are
  // the same words as the link that opens it.
  assert.equal(dlg.getAttribute('aria-label'), 'เงื่อนไขการสมัคร');
  assert.equal(d.querySelector('h2').textContent.trim(), 'เงื่อนไขการสมัคร');
  assert.equal(
    d.querySelector('[data-testid="bundle-terms-dismiss"]').textContent.trim(),
    'รับทราบและปิด',
  );
});

test('the panel carries the scroll container ELEVEN clauses need', () => {
  /**
   * The public modal shows four clauses; this one shows eleven, so the
   * `max-h-[80vh] overflow-y-auto` pair is what keeps it inside the viewport
   * instead of running off the bottom. Measured live at 375x640 and 360x560,
   * where the list does scroll and the dismiss button stays reachable; asserted
   * here so the classes cannot be dropped in a tidy-up.
   */
  const d = doc({ open: true });
  const panel = d.querySelector('[data-testid="bundle-terms-modal"] .overflow-y-auto');
  assert.ok(panel, 'no scroll container');
  assert.match(panel.className, /max-h-\[80vh\]/);
  assert.match(panel.className, /overflow-y-auto/);
});

test('it names no payment terms — the ruling that made it a separate component', () => {
  /**
   * A bundle is a QUOTATION. The public modal is titled
   * เงื่อนไขการสมัครและการชำระเงิน and its clauses are about paying for a seat;
   * pointing a quotation customer at those is a statement about a transaction
   * they have not entered into.
   *
   * NOTE what this does NOT claim: the clauses themselves mention refunds,
   * payment deadlines and receipts, because the supplied copy does. The
   * assertion is about the TITLE and the absence of the public modal's own
   * wording, not about the word "payment" never appearing.
   */
  const html = renderToStaticMarkup(createElement(BundleTermsModal, { open: true }));
  assert.ok(!html.includes('เงื่อนไขการสมัครและการชำระเงิน'));
  assert.ok(html.includes('เงื่อนไขการสมัคร'));
  // CONTROL: the probe string really is the public modal's title, so the
  // absence above is meaningful rather than a typo that can never match.
  assert.ok(read('src/components/payment/TermsModal.jsx').includes('เงื่อนไขการสมัครและการชำระเงิน'));
});

test('THE PUBLIC PAYMENT MODAL IS BYTE-IDENTICAL — it was not edited to serve the bundle', () => {
  /**
   * The round's hard constraint. `components/payment/TermsModal.jsx` has TWO
   * LIVE CONSUMERS — ReviewAndPayStep and the masterclass register client — so
   * adding a `title`/`children` prop to make it serve a third caller would have
   * put a bundle change into two flows this work is forbidden to touch. The
   * bundle got its own component and copied the shell's CLASSES instead.
   *
   * Hashed with line endings normalised to LF: the repo has core.autocrlf on, so
   * a raw byte hash would pass on one checkout and fail on another and tell
   * nobody anything about the file's content.
   *
   * IF THIS FAILS: you edited the shared payment modal. That may be right — but
   * it is a decision about two live flows, and it does not belong in a bundle
   * commit. Re-baseline only with that said out loud.
   */
  const lf = read('src/components/payment/TermsModal.jsx').replace(/\r\n/g, '\n');
  assert.equal(
    createHash('sha256').update(lf, 'utf8').digest('hex'),
    'ca781aa87beced7846005217dd26d2df2513469fd52ec2966d90228281c4cc58',
  );
  assert.equal(Buffer.byteLength(lf), 3167);
});

test('CONTROL: the public-modal hash would notice a one-character edit', () => {
  const lf = read('src/components/payment/TermsModal.jsx').replace(/\r\n/g, '\n');
  const tampered = `${lf} `;
  assert.notEqual(
    createHash('sha256').update(tampered, 'utf8').digest('hex'),
    'ca781aa87beced7846005217dd26d2df2513469fd52ec2966d90228281c4cc58',
  );
});

test('the bundle modal does not import the public one', () => {
  /**
   * Structural, beside the hash: the hash says the shared file did not change,
   * this says the bundle is not quietly rendering it. Two different ways for the
   * separation to be undone, two assertions.
   */
  const src = read('src/components/registration/BundleTermsModal.jsx');
  assert.ok(!src.includes("from '@/components/payment/TermsModal'"));
  assert.ok(!src.includes('from "@/components/payment/TermsModal"'));
  // …and it does read the clauses from the shared pure module rather than
  // inlining a second copy of the legal copy.
  assert.match(src, /from '@\/lib\/registration\/bundleTerms'/);
});
