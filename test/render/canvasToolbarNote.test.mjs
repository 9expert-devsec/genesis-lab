import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { CanvasToolbar, PREVIEW_FRAME_NOTE } from '@/components/pageBuilder/editor/CanvasToolbar';
import { VIEWPORT_WIDTH } from '@/components/pageBuilder/editor/CanvasPanel';
import { readSource } from '../sourceScan.mjs';

/**
 * What the device toggle now says, and what it deliberately does not claim.
 *
 * ── EXACT STRINGS, BECAUSE THIS IS THE DELIVERABLE ────────────────────────
 * The copy IS the honesty half of this round; a substring check would pass on a
 * sentence that had lost its negation, and Thai qualifies by prefix so "ยังไม่
 * จำลอง" and "จำลอง" are one edit apart with opposite meanings. Every assertion
 * below reads one element's exact textContent or compares the whole constant.
 *
 * The toolbar reads only `previewViewport` from the editor context, and the
 * default is 'desktop', so it renders whole inside a provider — no dispatch
 * needed (unlike SettingsPanel, which needs a selection).
 */

const PAGE = {
  slug: 's', title: 'T', pageType: 'general', status: 'draft', theme: 'default',
  showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', seo: {}, jsonLd: {}, slugHistory: [], sections: [],
};
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };

function toolbarDoc() {
  const markup = renderToStaticMarkup(
    createElement(EditorProvider, { page: PAGE, pageId: 'p1', updatedAt: 'T0', tier: TIER },
      createElement(CanvasToolbar, {})),
  );
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

/** The exact sentence the caveat carried before this round. */
const OLD_CAVEAT =
  'จำลองความกว้างเท่านั้น — breakpoint ยังอิงขนาดหน้าต่างเบราว์เซอร์จริง '
  + 'section ที่ตั้งค่าให้แสดงเฉพาะมือถือ/เดสก์ท็อปจะสลับกัน ตรวจของจริงที่ปุ่ม “ดูตัวอย่าง”';

// ── 1. the new note, verbatim ──────────────────────────────────────────────

test('the note says the frame is a real viewport, and names what it is not', () => {
  assert.equal(
    PREVIEW_FRAME_NOTE,
    'ตัวอย่างนี้เป็นวิวพอร์ตจริง — breakpoint ทำงานตามความกว้างของกรอบนี้ '
    + '(“เดสก์ท็อป” = ความกว้างของพื้นที่แก้ไข ไม่ใช่ขนาดจอจริง) '
    + 'ยังไม่จำลอง: การสัมผัส ความหนาแน่นพิกเซลของจอ (DPR) และแถบของเบราว์เซอร์บนมือถือ',
  );
});

test('the note is rendered, as visible text', () => {
  const doc = toolbarDoc();
  const note = doc.querySelector('[data-testid="preview-frame-note"]');
  assert.ok(note, 'the note is not rendered at all');
  assert.equal(text(note), PREVIEW_FRAME_NOTE);
  // A title attribute is not an answer to a control that makes a claim about a
  // device — the author must be able to read it without hovering.
  assert.equal(doc.querySelector('[title]')?.getAttribute('title') === PREVIEW_FRAME_NOTE, false,
    'the note became a tooltip');
});

test('the note appears at EVERY viewport, including the default one', () => {
  /**
   * A deliberate reversal. The old caveat was hidden at เดสก์ท็อป on the grounds
   * that an unclamped canvas made no claim to be misled by. A frame always has a
   * width, so เดสก์ท็อป is a claim now too — and it is the one an author is most
   * likely to misread, because the editing column is narrower than their screen.
   *
   * The toolbar takes the viewport from context and the render tier cannot
   * dispatch, so this is asserted as the ABSENCE of any condition around the
   * note rather than by re-rendering at three states.
   */
  const { code } = readSource('src/components/pageBuilder/editor/CanvasToolbar.jsx');
  const strip = code.slice(code.indexOf('<p'), code.indexOf('</p>'));
  assert.match(strip, /data-testid="preview-frame-note"/, 'the note element was not located');
  assert.equal(/caveat &&|previewViewport ===|\? \(/.test(strip), false,
    'the note is conditional again. Whichever viewport is hidden is the one whose claim '
    + 'goes unstated.');
});

// ── 2. the old copy is gone, everywhere ────────────────────────────────────

test('the previous caveat is absent from the rendered toolbar and from the source', () => {
  assert.notEqual(PREVIEW_FRAME_NOTE, OLD_CAVEAT);
  assert.equal(text(toolbarDoc().body).includes(OLD_CAVEAT), false,
    'the toolbar still renders the old caveat');
  // `raw`, not `code`: if the sentence survived as a comment it would still be
  // scanned by Tailwind and, more to the point, still read by the next person.
  for (const rel of [
    'src/components/pageBuilder/editor/CanvasToolbar.jsx',
    'src/components/pageBuilder/editor/CanvasPanel.jsx',
  ]) {
    assert.equal(readSource(rel).raw.includes(OLD_CAVEAT), false, `${rel} still carries the old caveat`);
  }
});

test('CONTROL: the absence probe would catch the old sentence if it were there', () => {
  // Discrimination. Without this, "the old caveat is absent" would read the same
  // as a comparison that can never match anything — Thai string equality across
  // a file read is exactly where an encoding slip hides.
  const pretend = `<p>${OLD_CAVEAT}</p>`;
  assert.equal(pretend.includes(OLD_CAVEAT), true, 'the probe cannot find the string even when it is present');
  assert.equal(OLD_CAVEAT.includes('สลับกัน'), true, 'the old sentence lost the clause that made it false');
});

test('CONTROL: the note is not merely a prefix of the old one, or vice versa', () => {
  // Both directions, because a partial replacement that left the old tail behind
  // would satisfy a naive "contains the new text" check.
  assert.equal(PREVIEW_FRAME_NOTE.includes(OLD_CAVEAT), false);
  assert.equal(OLD_CAVEAT.includes(PREVIEW_FRAME_NOTE), false);
  assert.equal(PREVIEW_FRAME_NOTE.includes('สลับกัน'), false,
    'the new note still warns about an inversion that no longer happens');
});

// ── 3. the three buttons, and the widths they now mean ─────────────────────

test('the toggle still offers exactly three viewports, unchanged', () => {
  const doc = toolbarDoc();
  const labels = [...doc.querySelectorAll('button[title]')].map((b) => b.getAttribute('title'));
  assert.deepEqual(labels, ['เดสก์ท็อป', 'แท็บเล็ต', 'มือถือ']);
  assert.deepEqual(Object.keys(VIEWPORT_WIDTH), ['desktop', 'tablet', 'mobile'],
    'the width map and the button set no longer line up');
});

test('the widths are real frame widths — and desktop is the column, not a number', () => {
  /**
   * Pinned exactly because the browser measurements were taken against these
   * three and reported: 900 / 768 / 390 inner width, 2 / 2 / 1 grid columns,
   * 36px / 36px / 30px heading.
   *
   * `desktop: null` is the honest reading rather than a gap. The frame IS the
   * viewport, so the only width it can claim without lying is the one it has;
   * naming a figure would render the page at a width the frame does not occupy,
   * which is the same untruth this round removed, pointed the other way.
   */
  assert.deepEqual(VIEWPORT_WIDTH, { desktop: null, tablet: 768, mobile: 390 });
  assert.equal(VIEWPORT_WIDTH.desktop, null, 'desktop gained a fixed width the frame may not have');
});
