import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  customPagePreviewBanner, customPagePreviewBannerKey, CUSTOM_PAGE_PREVIEW_BANNERS,
} from '@/lib/pages/customPagePreview';
import { readSource } from '../sourceScan.mjs';

/**
 * What the ?preview= banner claims, per state.
 *
 * Pinned in the PURE tier because a banner is a claim about state, and a claim
 * you can only exercise by fetching a page is a claim nothing pins. Two booleans
 * reach every branch here.
 *
 * The route's half — that it passes the right two booleans and renders the
 * result — is asserted from source at the bottom, because the catch-all cannot
 * be rendered in this tier.
 */

test('a page that was never published keeps the original sentence', () => {
  assert.equal(customPagePreviewBannerKey({ published: false, hasDraft: false }), 'unpublished');
  assert.equal(customPagePreviewBannerKey({ published: false, hasDraft: true }), 'unpublished');
  assert.match(customPagePreviewBanner({ published: false, hasDraft: false }), /ยังไม่เผยแพร่/);
});

test('an UNPUBLISHED page carrying a draft is still "unpublished", not "the real page differs"', () => {
  /**
   * `published` is checked first, deliberately. Telling this author "หน้าจริงยัง
   * แสดงเนื้อหาเดิมอยู่" would describe a real page that does not exist — the
   * page has never been public, so there is no old content still showing.
   */
  const banner = customPagePreviewBanner({ published: false, hasDraft: true });
  assert.equal(banner, CUSTOM_PAGE_PREVIEW_BANNERS.unpublished);
  assert.doesNotMatch(banner, /หน้าจริง/,
    'an unpublished page is told its live page shows something — there is no live page');
});

test('a PUBLISHED page with pending edits is told BOTH halves', () => {
  /**
   * The state this round created, and the one that must not be got wrong: an
   * author who reads only "ฉบับร่าง" and stops will think they have shipped it.
   * So the sentence has to say the work is unpublished AND that the real page is
   * still showing the old content.
   */
  const banner = customPagePreviewBanner({ published: true, hasDraft: true });
  assert.equal(customPagePreviewBannerKey({ published: true, hasDraft: true }), 'draftPending');
  assert.match(banner, /ยังไม่เผยแพร่/, 'it does not say the work is unpublished');
  assert.match(banner, /หน้าจริง/, 'it does not say the real page is unchanged');
  assert.match(banner, /เผยแพร่”/, 'it does not name the button that would make it live');
});

test('a PUBLISHED page with nothing pending says the preview matches what is live', () => {
  const banner = customPagePreviewBanner({ published: true, hasDraft: false });
  assert.equal(customPagePreviewBannerKey({ published: true, hasDraft: false }), 'matchesLive');
  assert.match(banner, /ตรงกับหน้าที่เผยแพร่อยู่/);
  assert.doesNotMatch(banner, /หน้าจริงยังแสดงเนื้อหาเดิม/,
    'it claims the live page differs, on a page where it does not');
});

test('CONTROL: the three states are three DIFFERENT sentences', () => {
  // Without this, a selector that returned one string for everything would pass
  // every "match" above that happens to share a token — and 'ยังไม่เผยแพร่'
  // appears in two of the three on purpose.
  const seen = [
    customPagePreviewBanner({ published: false, hasDraft: false }),
    customPagePreviewBanner({ published: true, hasDraft: true }),
    customPagePreviewBanner({ published: true, hasDraft: false }),
  ];
  assert.equal(new Set(seen).size, 3, 'two states render the same sentence');
  assert.equal(new Set(Object.values(CUSTOM_PAGE_PREVIEW_BANNERS)).size, 3);
});

test('CONTROL: the loose token does NOT separate the two it appears in', () => {
  // 'ยังไม่เผยแพร่' is in both the unpublished and the draftPending sentence, so
  // the assertions above must be keyed on more than it. This proves that.
  assert.match(CUSTOM_PAGE_PREVIEW_BANNERS.unpublished, /ยังไม่เผยแพร่/);
  assert.match(CUSTOM_PAGE_PREVIEW_BANNERS.draftPending, /ยังไม่เผยแพร่/);
  assert.doesNotMatch(CUSTOM_PAGE_PREVIEW_BANNERS.unpublished, /หน้าจริง/);
});

// ── the route's half ────────────────────────────────────────────────────────

test('the catch-all renders the composed view and the selected banner', () => {
  const { code, withImports } = readSource('src/app/(public)/[...slug]/page.jsx');

  assert.match(withImports, /composeWorkingView[\s\S]{0,80}from '@\/lib\/pages\/customPageDraft'/,
    'the route no longer imports the composed view — the token would show live content');
  assert.match(code, /page: composeWorkingView\(stored\)/,
    'the preview branch no longer composes the working view, so a draft would not be shown');
  assert.match(code, /customPagePreviewBanner\(\{[\s\S]{0,160}?published: stored\.status === 'published'[\s\S]{0,120}?hasDraft: hasUnpublishedDraft\(stored\)/,
    'the banner is no longer selected from the page’s real state');
  assert.match(code, /\{cp\.banner\}/, 'the banner is no longer rendered from the resolver');
});

test('CONTROL: no banner sentence is hardcoded in the route any more', () => {
  // The defect this replaced: ONE sentence, inline, true in one of three states.
  const { code } = readSource('src/app/(public)/[...slug]/page.jsx');
  for (const sentence of Object.values(CUSTOM_PAGE_PREVIEW_BANNERS)) {
    assert.equal(code.includes(sentence), false,
      'a banner sentence is inlined in the route — it will drift from the selector');
  }
});
