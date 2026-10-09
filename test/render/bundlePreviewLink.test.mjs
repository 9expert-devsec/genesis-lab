import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PromotionBundleSection } from '@/components/pageBuilder/sections/promotion_bundle';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The link builder and the flag name, so this file asserts
// against the ONE spelling rather than a second copy of the query string.
import { bundleRegisterHref, wantsBundlePreview, PREVIEW_PARAM } from '@/lib/registration/bundlePreview';
import { composeWorkingView, stripDraft } from '@/lib/pageBuilder/draftState';

/**
 * THE REGISTER BUTTON ON A PREVIEW PAGE.
 *
 * ── THE BUG, AND WHY IT TOOK THE STATE MESSAGE WITH IT ─────────────────────
 * On `/preview/<slug>` a bundle drew no register button AND no closed-state
 * message — the left column simply ended after the VAT note.
 *
 * The cause is one dropped field. `composeWorkingView` returns the EDITABLE
 * SURFACE, whose keys are the page schema's minus the drafted ones, and `_id`
 * is in neither list; `stripDraft` — the published branch of the same route —
 * keeps it. So the draft branch handed `PageBuilderView` a page with no id,
 * `pageId` arrived null, and the href builder refuses a half key.
 *
 * Both the button and the message live inside the same conditional, which is
 * why a bundle with no discount code rendered nothing at all rather than
 * falling back to the message. The first test below pins the dropped field
 * directly, because it is the fact everything else here follows from.
 */

const doc = (props) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(PromotionBundleSection, {
        content: { name: 'B', items: [], registrationOpen: true },
        data: [],
        style: {},
        ...props,
      }),
    )}</body>`,
  ).window.document;

const PAGE = {
  _id: 'PID',
  slug: 'claude-duo',
  status: 'draft',
  sections: [{ id: 'sec-1', type: 'promotion_bundle', content: { name: 'B' } }],
};

// ── the dropped field ───────────────────────────────────────────────────────

test('composeWorkingView drops `_id` and stripDraft keeps it — the whole cause', () => {
  assert.equal(
    composeWorkingView(PAGE)._id,
    undefined,
    'composeWorkingView now carries _id; the preview route no longer needs to restore it',
  );
  assert.equal(stripDraft(PAGE)._id, 'PID', 'the published branch lost its id');
});

// ── the link ────────────────────────────────────────────────────────────────

test('the href needs BOTH halves of the key, and carries the flag only when asked', () => {
  assert.equal(
    bundleRegisterHref({ pageId: 'p1', sectionId: 's1' }),
    '/registration/bundle?page=p1&section=s1',
  );
  assert.equal(
    bundleRegisterHref({ pageId: 'p1', sectionId: 's1', preview: true }),
    `/registration/bundle?page=p1&section=s1&${PREVIEW_PARAM}=1`,
  );
  /**
   * A HALF KEY IS NO LINK. `duplicatePageBuilderPage` keeps section ids, so
   * two bundles on a duplicated page share one — an id alone cannot say which
   * page a quotation came from.
   */
  assert.equal(bundleRegisterHref({ pageId: '', sectionId: 's1' }), null);
  assert.equal(bundleRegisterHref({ pageId: 'p1', sectionId: '' }), null);
  assert.equal(bundleRegisterHref({ pageId: 'p1', sectionId: '', preview: true }), null);
});

test('both halves are URL-encoded, so an id with a separator cannot forge a parameter', () => {
  const href = bundleRegisterHref({ pageId: 'a&preview=1', sectionId: 'b c' });
  assert.equal(href, '/registration/bundle?page=a%26preview%3D1&section=b%20c');
  assert.equal(
    wantsBundlePreview(Object.fromEntries(new URL(`http://x${href}`).searchParams)),
    false,
    'an id containing the flag turned preview on',
  );
});

// ── the card ────────────────────────────────────────────────────────────────

test('a preview render links to the wizard IN preview mode', () => {
  const d = doc({ pageId: 'PID', sectionId: 'sec-1', preview: true });
  const btn = d.querySelector('[data-testid="bundle-register"]');
  assert.notEqual(btn, null, 'the preview page still draws no register button');
  assert.equal(
    btn.getAttribute('href'),
    `/registration/bundle?page=PID&section=sec-1&${PREVIEW_PARAM}=1`,
  );
});

test('a PUBLIC render is unchanged — no flag anywhere near the live link', () => {
  const d = doc({ pageId: 'PID', sectionId: 'sec-1' });
  const btn = d.querySelector('[data-testid="bundle-register"]');
  assert.notEqual(btn, null, 'the live card lost its button');
  assert.equal(btn.getAttribute('href'), '/registration/bundle?page=PID&section=sec-1');
  assert.equal(
    btn.getAttribute('href').includes(PREVIEW_PARAM),
    false,
    'a live card is offering a preview link',
  );
});

test('CONTROL: still no button without a pageId, preview or not', () => {
  /**
   * The editor canvas renders SectionRenderer directly and threads no id. That
   * must keep drawing nothing — a link missing half its key would resolve to
   * the wrong bundle — and the preview flag must not be a way around it.
   */
  for (const preview of [false, true]) {
    const d = doc({ pageId: null, sectionId: 'sec-1', preview });
    assert.equal(
      d.querySelector('[data-testid="bundle-register"]'),
      null,
      `a bundle with no pageId drew a button (preview=${preview})`,
    );
  }
});

// ── the flag reader ─────────────────────────────────────────────────────────

test('only the exact flag asks for preview', () => {
  assert.equal(wantsBundlePreview({ preview: '1' }), true);
  // An array is what Next hands over for a repeated parameter.
  assert.equal(wantsBundlePreview({ preview: ['1', '0'] }), true);
  for (const v of [undefined, '', '0', 'true', 'yes', 'on', 1, null, ['0']]) {
    assert.equal(wantsBundlePreview({ preview: v }), false, `${JSON.stringify(v)} turned preview on`);
  }
  assert.equal(wantsBundlePreview({}), false);
  assert.equal(wantsBundlePreview(null), false);
});
