import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { BundleStepReview } from '@/components/registration/BundleWizard';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The words themselves, so this file asserts against the
// ONE definition rather than a second copy of each Thai string.
import {
  BUNDLE_PREVIEW_SUBMIT,
  BUNDLE_PREVIEW_SUCCESS_TITLE,
  BUNDLE_PREVIEW_SUCCESS_BODY,
} from '@/lib/registration/bundlePreview';
import { StepComplete } from '@/components/registration/RegisterWizard';

/**
 * WHAT A DRY RUN LOOKS LIKE TO THE PERSON DOING IT.
 *
 * The two screens where a preview and a real submission are otherwise
 * indistinguishable: the button that commits, and the screen that says it
 * worked. Both are rendered directly — `BundleWizard` itself reads
 * `useSearchParams` and sessionStorage, and neither is reachable here, but the
 * two pieces that carry the WORDS take plain props.
 */

const doc = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
const text = (e) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

const DATA = {
  coordinator: { name: 'ก', email: 'a@b.co', phone: '0800000000' },
  attendees: [{ name: 'ข', email: 'c@d.co' }],
  company: {},
};

const review = (preview) =>
  doc(createElement(BundleStepReview, {
    data: DATA,
    onBack: () => {},
    onConfirm: () => {},
    submitting: false,
    error: null,
    consented: true,
    onConsentChange: () => {},
    preview,
  }));

// ── the button that commits ────────────────────────────────────────────────

test('in preview the submit button says it will not save', () => {
  const t = text(review(true).body);
  assert.ok(t.includes(BUNDLE_PREVIEW_SUBMIT), `the submit label is not the preview one: ${t.slice(-160)}`);
  assert.equal(
    t.includes('ยืนยันการขอใบเสนอราคา'),
    false,
    'the real submit label is still on screen in preview mode',
  );
});

test('without preview the button is EXACTLY what it was', () => {
  const t = text(review(false).body);
  assert.ok(t.includes('ยืนยันการขอใบเสนอราคา'), 'the live submit label changed');
  assert.equal(t.includes(BUNDLE_PREVIEW_SUBMIT), false, 'a live review offers a dry run');
});

test('the review body itself is unchanged — only the button differs', () => {
  /**
   * The point of a dry run is that everything else is the real thing. If the
   * preview review showed different DATA, it would stop answering the question
   * the author opened it to ask.
   */
  const strip = (d) => {
    const btns = [...d.querySelectorAll('button')];
    for (const b of btns) b.remove();
    return text(d.body);
  };
  assert.equal(strip(review(true)), strip(review(false)));
});

// ── the screen that says it worked ─────────────────────────────────────────

test('the preview success screen says nothing was saved, and claims no email', () => {
  /**
   * `StepComplete` renders "ทาง 9Expert ได้ส่งอีเมลยืนยันไปที่ …" whenever it is
   * given an address. In a dry run the route returns before the send, so the
   * wizard withholds the address — changing only the heading would have left
   * the one false sentence on the screen.
   */
  const d = doc(createElement(StepComplete, {
    result: { ok: true, preview: true },
    email: null,
    title: BUNDLE_PREVIEW_SUCCESS_TITLE,
    closing: createElement('p', { 'data-testid': 'bundle-preview-success' }, BUNDLE_PREVIEW_SUCCESS_BODY),
  }));
  const t = text(d.body);
  assert.ok(t.includes(BUNDLE_PREVIEW_SUCCESS_TITLE), 'the heading does not say it was a check');
  assert.match(text(d.querySelector('[data-testid="bundle-preview-success"]')), /ไม่ได้บันทึก/);
  assert.equal(t.includes('ได้ส่งอีเมลยืนยันไปที่'), false, 'it claims an email was sent');
  assert.equal(t.includes('a@b.co'), false, 'the address is on a screen that sent nothing');
  // …and it does not promise the PDF a real quotation promises.
  assert.equal(t.includes('ภายใน 3 วันทำการ'), false, 'it promises a quotation nobody will send');
});

test('CONTROL: the live success screen DOES say both of those things', () => {
  /**
   * Every assertion above is an absence. They would all pass against a
   * component that says nothing at all, or a renamed string — so the same
   * component, given an address and no closing, must produce exactly the two
   * sentences preview mode is asserting the absence of.
   */
  const t = text(doc(createElement(StepComplete, {
    result: { ok: true },
    email: 'a@b.co',
    title: 'ได้รับคำขอใบเสนอราคาแล้ว',
  })).body);
  assert.ok(t.includes('ได้ส่งอีเมลยืนยันไปที่'), 'the live screen no longer mentions the email');
  assert.ok(t.includes('a@b.co'), 'the live screen no longer shows the address');
  assert.ok(t.includes('ภายใน 3 วันทำการ'), 'the live screen no longer promises the PDF');
});
