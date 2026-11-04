import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { renderRefusal } from '@/app/(public)/registration/bundle/BundlePageContent';
import { BundleLateRefusal } from '@/components/registration/BundleWizard';
import {
  BUNDLE_CLOSED_MESSAGE,
  BUNDLE_EXPIRED_MESSAGE,
  BUNDLE_NO_ROUNDS_MESSAGE,
  BUNDLE_UNAVAILABLE_MESSAGE,
} from '@/lib/pageBuilder/bundleRegistration';

/**
 * WHAT A VISITOR IS TOLD WHEN A BUNDLE HAS NO OPEN ROUND.
 *
 * The reason is only half of it. `renderRefusal` and the wizard's late panel
 * both have a FALLBACK — the sales-contact sentence — so a reason neither of
 * them knows renders perfectly well, in the wrong words, and no guard test can
 * see that. There are two surfaces because a round can go between opening the
 * form and sending it.
 */

const dom = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
const text = (n) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

test('the page says no_open_rounds in the words the card uses, not the sales fallback', () => {
  const d = dom(renderRefusal('no_open_rounds'));
  const panel = d.querySelector('[data-testid="bundle-refused-no-rounds"]');
  assert.notEqual(panel, null, 'no_open_rounds fell through to another panel');
  assert.equal(panel.getAttribute('data-reason'), 'no_open_rounds');
  assert.equal(text(panel.querySelector('h1')), BUNDLE_NO_ROUNDS_MESSAGE);
  assert.equal(d.body.textContent.includes(BUNDLE_UNAVAILABLE_MESSAGE), false);
  assert.equal(d.body.textContent.includes('ลิงก์ที่บันทึกไว้'), false, 'the stale-link sub-line was shown');
});

test('CONTROL: the other spoken refusals keep their own sentences', () => {
  const heading = (reason) => text(dom(renderRefusal(reason)).querySelector('h1'));
  assert.equal(heading('closed'), BUNDLE_CLOSED_MESSAGE);
  assert.equal(heading('page_expired'), BUNDLE_EXPIRED_MESSAGE);
  assert.equal(heading('unresolved_items'), BUNDLE_UNAVAILABLE_MESSAGE);
});

test('the late panel says the same thing when the round goes during the form', () => {
  const d = dom(createElement(BundleLateRefusal, { reason: 'no_open_rounds' }));
  const panel = d.querySelector('[data-testid="bundle-refused-late"]');
  assert.equal(text(panel.querySelector('h2')), BUNDLE_NO_ROUNDS_MESSAGE);
  assert.equal(panel.getAttribute('data-reason'), 'no_open_rounds');
});

test('CONTROL: the late panel still tells closed and the fallback apart', () => {
  const heading = (reason) => text(dom(createElement(BundleLateRefusal, { reason })).querySelector('h2'));
  assert.equal(heading('closed'), BUNDLE_CLOSED_MESSAGE);
  assert.equal(heading('unresolved_items'), BUNDLE_UNAVAILABLE_MESSAGE);
  assert.equal(heading('section_missing'), BUNDLE_UNAVAILABLE_MESSAGE);
});
