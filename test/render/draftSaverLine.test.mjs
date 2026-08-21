import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { EditorTopBar } from '@/components/pageBuilder/editor/EditorTopBar';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * ROUND 34, commit 3 — the saver line, RENDERED.
 *
 * The pure tier (test/pure/draftSaver) proves the classification. Only a render
 * can prove a surface CONSUMES it — editorStatus.js's own header states that
 * split — so this mounts the real top bar inside the real provider and reads
 * the DOM.
 */

const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };
const CREATOR = { id: 'u-creator', name: 'Author A' };
const SAVER = { id: 'u-saver', name: 'Editor B' };

const storedPage = (over = {}) => ({
  slug: 'p', title: 'Live Title', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
  createdBy: CREATOR, updatedBy: CREATOR, draft: null, ...over,
});

const withDraft = (savedBy = SAVER) => storedPage({
  draft: { title: 'Drafted', sections: [], savedAt: '2026-08-20T02:00:00.000Z', savedBy },
});

const noop = () => {};

function topBarDoc(page, currentUserName = 'Current C') {
  const html = renderToStaticMarkup(createElement(
    EditorProvider,
    { page, pageId: 'p1', updatedAt: 'T0', tier: TIER, currentUserName },
    createElement(EditorTopBar, {
      onSave: noop, onOpenSettings: noop, onOpenPreview: noop, onPublish: noop, onDiscard: noop,
    })
  ));
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

const saverEl = (doc) => doc.querySelector('[data-testid="draft-saver-line"]');
const chipEl = (doc) => doc.querySelector('[data-testid="pending-draft-chip"]');

test('the top bar says who holds the pending draft', async (t) => {
  await t.test('the line renders, naming the draft’s saver', () => {
    const el = saverEl(topBarDoc(withDraft()));
    assert.notEqual(el, null, 'the saver line did not render');
    assert.equal(el.textContent.trim(), 'แก้ไขล่าสุดโดย Editor B');
  });

  await t.test('the CREATOR’s name is nowhere in the top bar', () => {
    // updatedBy is populated with a different name on this fixture, so this
    // fails the moment the line is re-pointed at it.
    const doc = topBarDoc(withDraft());
    assert.equal(
      doc.body.textContent.includes('Author A'), false,
      'the top bar names the page creator — something is reading updatedBy'
    );
  });

  await t.test('CONTROL: the fixture’s two names really do differ', () => {
    const page = withDraft();
    assert.equal(page.updatedBy.name, 'Author A');
    assert.equal(page.draft.savedBy.name, 'Editor B');
    // …and the one that DID render is the draft's.
    assert.equal(topBarDoc(page).body.textContent.includes('Editor B'), true);
  });

  await t.test('it appears and disappears with the chip — one fact, one condition', () => {
    const withOne = topBarDoc(withDraft());
    assert.notEqual(chipEl(withOne), null, 'precondition: the chip is shown');
    assert.notEqual(saverEl(withOne), null, 'the saver line is missing beside the chip');

    const without = topBarDoc(storedPage());
    assert.equal(chipEl(without), null, 'precondition: no chip without a draft');
    assert.equal(saverEl(without), null, 'the saver line outlived the chip');
  });

  await t.test('an unnamed saver renders NO element at all, not an empty one', () => {
    // An empty span is a blank gap in the bar that looks like a loading state.
    const doc = topBarDoc(withDraft({ id: 'u-x', name: '' }));
    assert.notEqual(chipEl(doc), null, 'precondition: there IS a draft');
    assert.equal(saverEl(doc), null, 'an empty saver line rendered');
  });

  await t.test('the status line is still there and is still its own sentence', () => {
    // Round 27's rule: not a second vocabulary for the same fact. The saver
    // line must not have displaced or absorbed the save-state line.
    const doc = topBarDoc(withDraft());
    assert.equal(doc.body.textContent.includes('มีฉบับร่างที่ยังไม่เผยแพร่'), true,
      'the draft chip’s own copy is gone');
    // 'Drafted', not 'Live Title': the working view is effectiveContent, which
    // shows the DRAFT's title while one is pending. Round 2's behaviour, and
    // the first cut of this assertion had it backwards.
    assert.equal(doc.body.textContent.includes('Drafted'), true, 'the page title is gone');
  });
});

test('nothing in the editor reads updatedBy', async (t) => {
  await t.test('no editor component mentions the frozen field', () => {
    // Round 33's finding, held structurally. `updatedBy` is written by the
    // action layer and read by nothing in the editor; the moment a component
    // reaches for it, this names the file.
    // No lookbehind here, deliberately. countCallSites excludes property access
    // because it hunts an imported binding; this hunts the opposite — a read of
    // `page.updatedBy` IS the defect, so a pattern that skips a leading dot
    // would skip every real occurrence. The first cut of this had that bug and
    // the control below is what caught it.
    const offenders = walkSources('src/components/pageBuilder')
      .filter((f) => /\bupdatedBy\b/.test(f.code))
      .map((f) => f.rel);
    assert.deepEqual(offenders, [],
      'an editor component reads updatedBy, which round 33 measured frozen at creation');
  });

  await t.test('CONTROL: the scanner does see the field when it is there', () => {
    // Otherwise the empty list above would mean nothing — a scanner that reads
    // no files reports no offenders.
    const files = walkSources('src/components/pageBuilder');
    assert.ok(files.length > 10, 'the walk found almost nothing — it is not reaching the editor');
    assert.equal(/\bupdatedBy\b/.test('const who = page.updatedBy.name;'), true,
      'the matcher does not recognise the field it is looking for');
    assert.equal(/\bupdatedBy\b/.test('const who = draftSavedBy;'), false,
      'the matcher fires on text that is not the field');
  });

  await t.test('the top bar reads draftSaverLine and not the page object', () => {
    const src = readSource('src/components/pageBuilder/editor/EditorTopBar.jsx').withImports;
    assert.match(src, /draftSaverLine\(editor\)/, 'the top bar no longer calls draftSaverLine');
    assert.equal(src.includes('savedBy'), false,
      'the top bar reaches into the stamp itself; the pure function owns that read');
  });
});
