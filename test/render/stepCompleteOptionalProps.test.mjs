import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { StepComplete } from '@/components/registration/RegisterWizard';

/**
 * `StepComplete` gained three optional props — `title`, `showReference` and
 * `closing` — so the bundle quotation could render the wizard's own success
 * screen instead of keeping a fourth copy of one.
 *
 * ══ WHAT THIS FILE IS ACTUALLY FOR ═════════════════════════════════════════
 *
 * The claim that matters is NOT "the new props work". It is that CALLERS WHICH
 * PASS NOTHING RENDER BYTE-IDENTICALLY — the public registration wizard and the
 * 3DS return path are live, and a bundle restyle must not move a pixel on
 * either. That is asserted here against markup CAPTURED FROM THE COMPONENT
 * BEFORE THE PROPS EXISTED, not against the component's current behaviour,
 * which would be circular.
 *
 * ══ THE HASHES, AND WHAT TO DO WHEN ONE FIRES ══════════════════════════════
 *
 * BASELINE, recorded from the pre-props component:
 *
 *     quote         2541 bytes  4ebd5e0b…
 *     quoteNoEmail  2370 bytes  cf4c2d6f…
 *     paid          2617 bytes  08974521…
 *
 * A hash rather than the whole 2.5KB string, so the file stays readable. If one
 * of these goes red, READ WHY BEFORE RE-BASELINING:
 *
 *   · if you changed StepComplete's DEFAULT rendering on purpose — new copy, a
 *     restyle — then this test has done its job by making you say so, and the
 *     new hash is the new baseline. Record the intent in the commit.
 *   · if you did NOT mean to change it, you have just found a default that
 *     leaked. That is the failure this file exists to catch: it is exactly what
 *     an optional prop with a wrong default does, and it is invisible in review
 *     because the diff shows only the prop being added.
 *
 * The byte length is asserted beside the hash on purpose — a hash mismatch says
 * only "different", while the length says "different, and by roughly this much",
 * which is the first thing anyone debugging it wants to know.
 */

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const render = (props) => renderToStaticMarkup(createElement(StepComplete, props));
const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

/** The three shapes the component branches on. */
const QUOTE = { result: { kind: 'quote', referenceNumber: 'REF-123' }, email: 'a@b.com' };
const QUOTE_NO_EMAIL = { result: { kind: 'quote', referenceNumber: 'REF-123' }, email: undefined };
const PAID = {
  result: { kind: 'paid', referenceNumber: 'REF-9', method: 'promptpay', amount: 32640 },
  email: 'a@b.com',
};

const BASELINE = {
  quote: {
    props: QUOTE,
    bytes: 2541,
    hash: '4ebd5e0be8c90e6117a1a54ac7bf1382b16d44bff9fd23d329d6d3f86758d504',
  },
  quoteNoEmail: {
    props: QUOTE_NO_EMAIL,
    bytes: 2370,
    hash: 'cf4c2d6f09138e1ecf701201e7854e4b2329fbda452da9eacf2746995c9c856c',
  },
  paid: {
    props: PAID,
    bytes: 2617,
    hash: '08974521e5d93cea53a94d5d47ad19868518146f5308b3e46f1dc200999adc95',
  },
};

test('a caller passing no new props renders EXACTLY what it did before they existed', () => {
  for (const [name, { props, bytes, hash }] of Object.entries(BASELINE)) {
    const markup = render(props);
    assert.equal(markup.length, bytes, `${name}: byte length moved`);
    assert.equal(sha(markup), hash, `${name}: rendered markup changed`);
  }
});

test('CONTROL: the baseline really can go red — a changed render fails both probes', () => {
  /**
   * Discrimination. Without this, a bug that made `render()` return a constant
   * would still satisfy the test above for whichever case matched, and three
   * hashes of nothing would look like three passes.
   */
  const changed = render({ ...QUOTE, title: 'something else entirely' });
  assert.notEqual(sha(changed), BASELINE.quote.hash);
  assert.notEqual(changed.length, BASELINE.quote.bytes);
  // …and the three baselines differ from EACH OTHER, so they are three
  // measurements rather than one value written three times.
  const hashes = new Set(Object.values(BASELINE).map((b) => b.hash));
  assert.equal(hashes.size, 3);
});

test('the reference number is HIDDEN by default — the commented-out block stays that way', () => {
  /**
   * The public and in-house flows have their reference line commented out in
   * source, deliberately, by someone, on two live paths. `showReference`
   * defaults to false so a bundle change cannot un-hide it for them.
   */
  const markup = render(QUOTE);
  assert.ok(!markup.includes('REF-123'), 'the number leaked into a default render');
  assert.equal(doc(markup).querySelector('[data-testid="step-complete-ref"]'), null);
});

test('a caller can opt IN to the reference number, and only it changes', () => {
  const markup = render({ ...QUOTE, showReference: true });
  const el = doc(markup).querySelector('[data-testid="step-complete-ref"]');
  assert.ok(el, 'no reference element rendered');
  assert.equal(el.textContent.trim(), 'REF-123');
  // The rest of the screen is untouched: the default heading and the default
  // closing paragraph both survive an opt-in that was only about the number.
  assert.ok(markup.includes('ขอบคุณสำหรับการลงทะเบียน'));
  assert.ok(markup.includes('ภายใน 3 วันทำการ'));
});

test('showReference with NO reference number renders no line rather than an empty one', () => {
  /**
   * The refusal that matters at 2am: a quotation whose POST succeeded but
   * returned no referenceNumber must not print `เลขอ้างอิง` followed by
   * nothing, which reads as a number the customer failed to write down.
   */
  const markup = render({
    result: { kind: 'quote' },
    email: 'a@b.com',
    showReference: true,
  });
  assert.equal(doc(markup).querySelector('[data-testid="step-complete-ref"]'), null);
  assert.ok(!markup.includes('เลขอ้างอิง'));
});

test('title and closing replace their defaults, and nothing else', () => {
  const markup = render({
    ...QUOTE,
    title: 'ได้รับคำขอใบเสนอราคาแล้ว',
    closing: createElement('p', null, 'ทีมขายจะติดต่อกลับ'),
  });
  assert.ok(markup.includes('ได้รับคำขอใบเสนอราคาแล้ว'));
  assert.ok(!markup.includes('ขอบคุณสำหรับการลงทะเบียน'), 'the default title survived');
  assert.ok(markup.includes('ทีมขายจะติดต่อกลับ'));
  assert.ok(!markup.includes('ภายใน 3 วันทำการ'), 'the default closing survived');
  // The email line is not one of the three props and must be unaffected.
  assert.ok(markup.includes('a@b.com'));
});

test('the PAID branch ignores all three props — it is out of scope by construction', () => {
  /**
   * The bundle can never reach the paid branch: a quotation carries no
   * paymentMethod and no omiseToken at all. Widening that branch would be scope
   * this round has no reason to take, so it was left alone — and this pins
   * that, rather than leaving it as a claim in a comment.
   */
  const plain = render(PAID);
  const withProps = render({
    ...PAID,
    title: 'ได้รับคำขอใบเสนอราคาแล้ว',
    showReference: true,
    closing: createElement('p', null, 'ทีมขายจะติดต่อกลับ'),
  });
  assert.equal(withProps, plain, 'a prop leaked into the paid receipt');
  assert.equal(sha(withProps), BASELINE.paid.hash);
});
