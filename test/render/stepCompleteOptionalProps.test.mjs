import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { StepComplete } from '@/components/registration/RegisterWizard';

/**
 * Source reader, for the call-site assertions below. Which props a caller
 * PASSES is not observable from rendering this component in isolation — it is a
 * fact about the callers — so those two tests read them.
 */
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/**
 * `StepComplete` gained optional props — `title` and `closing` — so the bundle
 * quotation could render the wizard's own success screen instead of keeping a
 * fourth copy of one. A third, `showReference`, was added and later REMOVED
 * once its only caller stopped passing it; the tests below pin that it is gone
 * from the signature and that a stray one is inert.
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
   * source, deliberately, by someone, on two live paths — and the reasoning for
   * that now lives AT THAT BLOCK, in RegisterWizard's quote branch, rather than
   * on a prop. Nothing can opt in to the line any more; this pins that the
   * default render has it hidden.
   */
  const markup = render(QUOTE);
  assert.ok(!markup.includes('REF-123'), 'the number leaked into a default render');
  assert.equal(doc(markup).querySelector('[data-testid="step-complete-ref"]'), null);
});

test('EVERY caller takes the defaults — no call site passes closing, or a stray showReference', () => {
  /**
   * THE BUNDLE STOPPED OPTING IN, and this is what pins it.
   *
   * The bundle used to pass `showReference` and a bundle-specific `closing`, on
   * the argument that a reference number is the customer's only handle on a
   * quotation answered by a human days later. That argument was withdrawn: the
   * CONFIRMATION EMAIL carries the number and is the copy a customer keeps, so
   * the screen was never the only source. Step 3 now renders this component's
   * defaults — the PDF-within-3-working-days closing, and no reference line.
   *
   * Asserted over the SOURCE of every call site rather than over one of them,
   * so a future caller that opts in has to come here and say why.
   */
  const callers = [
    'src/components/registration/BundleWizard.jsx',
    'src/components/registration/RegisterWizard.jsx',
  ];
  for (const rel of callers) {
    const src = read(rel);
    // The prop, as it would appear when PASSED — `showReference` bare or
    // `showReference={…}` — rather than the bare identifier, which also occurs
    // in this component's own signature and prose.
    assert.equal(
      /<StepComplete[^>]*\sshowReference/s.test(src),
      false,
      `${rel} passes showReference`,
    );
    assert.equal(/<StepComplete[^>]*\sclosing=/s.test(src), false, `${rel} passes closing`);
  }
});

test('CONTROL: that call-site probe can see a prop that IS passed', () => {
  /**
   * Discrimination. A regex that matched nothing would satisfy the test above
   * whatever the call sites said. `title` IS still passed by the bundle, so the
   * same shape of probe must find it — and must NOT find a prop nobody passes.
   */
  const src = read('src/components/registration/BundleWizard.jsx');
  assert.ok(/<StepComplete[^>]*\stitle=/s.test(src), 'the probe cannot see title, so it sees nothing');
  assert.equal(/<StepComplete[^>]*\sonlyAnInventedProp=/s.test(src), false);
  // …and the bundle really does still render this component, so the absence
  // assertions above are about the props and not about a vanished call site.
  assert.ok(src.includes('<StepComplete'));
});

test('`showReference` IS GONE — the prop is not in the signature', () => {
  /**
   * It let a caller opt in to the reference number. The bundle was its only
   * user and stopped passing it, so it became a prop with no reader — which
   * this codebase keeps out whether the field is a Mongo key or a React prop.
   *
   * Two tests replaced by this one: "a caller can opt IN to the reference
   * number" and "showReference with NO reference number renders no line". Both
   * exercised behaviour that no longer exists, and neither could be relaxed
   * into something true — the opt-in is the thing that was removed.
   */
  const src = read('src/components/registration/RegisterWizard.jsx');
  const signature = /export function StepComplete\(\{([\s\S]*?)\}\)/.exec(src)?.[1];
  assert.ok(signature, 'could not find the StepComplete signature');
  assert.equal(/\bshowReference\b/.test(signature), false, 'the prop is still declared');
  // CONTROL: the signature probe reads the real thing — the props that DID
  // survive are in it, so the absence above is not an empty match.
  assert.match(signature, /\btitle\b/);
  assert.match(signature, /\bclosing\b/);
  assert.match(signature, /\bresult\b/);
});

test('passing it anyway is INERT — a stray showReference cannot revive the line', () => {
  /**
   * The prop is gone, so React passes it through to nothing. Asserted rather
   * than assumed, because "removed" and "ignored" are different failures: a
   * component that still branched on it would keep working here and surprise
   * whoever deleted the last caller.
   */
  const withStray = render({ ...QUOTE, showReference: true });
  assert.equal(withStray, render(QUOTE), 'showReference still changes the render');
  assert.ok(!withStray.includes('REF-123'));
  assert.ok(!withStray.includes('เลขอ้างอิง'));
  assert.equal(doc(withStray).querySelector('[data-testid="step-complete-ref"]'), null);
  // CONTROL: a prop that IS live still changes this render, so the equality
  // above is showReference being dead rather than `render` ignoring everything.
  assert.notEqual(render({ ...QUOTE, title: 'อื่น' }), render(QUOTE));
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

test('the PAID branch ignores both props — it is out of scope by construction', () => {
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
    closing: createElement('p', null, 'ทีมขายจะติดต่อกลับ'),
  });
  assert.equal(withProps, plain, 'a prop leaked into the paid receipt');
  assert.equal(sha(withProps), BASELINE.paid.hash);
});
