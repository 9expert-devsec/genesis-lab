import { test } from 'node:test';
import assert from 'node:assert/strict';

import { draftSaverLine, statusLine, hasPendingDraft } from '@/lib/pageBuilder/editorStatus';
import { initialEditorState, editorReducer } from '@/components/pageBuilder/editor/editorReducer';

/**
 * ROUND 34, commit 3 — who last saved the pending draft.
 *
 * ── THE FIELD IT MUST NOT READ ────────────────────────────────────────────
 * Round 33 measured `page.updatedBy` frozen at creation: publishPageStatus
 * never writes it, updatePageBuilderPage has had no live caller since round 3,
 * and there are no schema hooks. So the field whose NAME promises "last edited
 * by" answers with whoever CREATED the page — confidently, and wrongly. The
 * fixture below is built to make that difference visible: the creator and the
 * draft's saver are different named people, so a line reading the wrong field
 * cannot accidentally agree with one reading the right one.
 *
 * That freeze is not fixed this round. Its tripwire lives in
 * test/fs/pageBuilderDraftActions and stays red-on-fix; these tests only refuse
 * to read the frozen field.
 */

const CREATOR = { id: 'u-creator', name: 'Author A' };
const SAVER = { id: 'u-saver', name: 'Editor B' };

/** A stored page as getPageBuilderPageById hands it over. */
const storedPage = (over = {}) => ({
  slug: 'p', title: 'Live Title', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
  createdBy: CREATOR,
  updatedBy: CREATOR,   // frozen at creation — round 33
  draft: null,
  ...over,
});

const withDraft = (savedBy = SAVER) => storedPage({
  draft: { title: 'Drafted', sections: [], savedAt: '2026-08-20T02:00:00.000Z', savedBy },
});

test('the draft-saver line reads savedBy, never updatedBy', async (t) => {
  await t.test('it names the person who saved the DRAFT', () => {
    const state = initialEditorState({ page: withDraft(), pageId: 'p1', updatedAt: 'T0' });
    assert.equal(draftSaverLine(state), 'แก้ไขล่าสุดโดย Editor B');
  });

  await t.test('and it does NOT name the creator, who updatedBy still points at', () => {
    // The discrimination this whole file is built around. Both names are real
    // and different, so this fails the moment the line is re-pointed.
    const state = initialEditorState({ page: withDraft(), pageId: 'p1', updatedAt: 'T0' });
    const line = draftSaverLine(state);
    assert.equal(line.includes('Author A'), false,
      'the draft-saver line is naming the page CREATOR — it is reading updatedBy');
    assert.equal(line.includes('Editor B'), true);
  });

  await t.test('CONTROL: the fixture really does disagree between the two fields', () => {
    // Without this, the case above passes for a fixture in which both fields
    // happen to hold the same name — and would keep passing after a re-point.
    const page = withDraft();
    assert.equal(page.updatedBy.name, 'Author A');
    assert.equal(page.draft.savedBy.name, 'Editor B');
    assert.notEqual(page.updatedBy.name, page.draft.savedBy.name);
  });

  await t.test('CONTROL: a line built from updatedBy IS caught by the assertion above', () => {
    // The break, run in-memory. If asserting on the rendered line cannot tell
    // the two fields apart, the case above proves nothing.
    const page = withDraft();
    const wrong = `แก้ไขล่าสุดโดย ${page.updatedBy.name}`;
    assert.throws(
      () => assert.equal(wrong.includes('Author A'), false),
      'reading updatedBy would NOT be caught — re-point the assertion'
    );
  });

  await t.test('the state carries the name, not the stamp object', () => {
    const state = initialEditorState({ page: withDraft(), pageId: 'p1', updatedAt: 'T0' });
    assert.equal(state.draftSavedBy, 'Editor B');
    assert.equal(typeof state.draftSavedBy, 'string');
  });
});

test('the two empty cases, and both are deliberate', async (t) => {
  await t.test('NO pending draft — nobody last saved one, so the line is empty', () => {
    const state = initialEditorState({ page: storedPage(), pageId: 'p1', updatedAt: 'T0' });
    assert.equal(hasPendingDraft(state), false, 'precondition: the fixture has no draft');
    assert.equal(draftSaverLine(state), '');
    assert.equal(state.draftSavedBy, '', 'a saver was seeded for a page with no draft');
  });

  await t.test('…even though updatedBy is populated on that same page', () => {
    // The tempting failure: falling back to updatedBy when there is no draft
    // would produce a plausible-looking line about a page with nothing pending.
    const page = storedPage();
    assert.equal(page.updatedBy.name, 'Author A', 'precondition: updatedBy is set');
    const state = initialEditorState({ page, pageId: 'p1', updatedAt: 'T0' });
    assert.equal(draftSaverLine(state), '', 'the line fell back to updatedBy with no draft');
  });

  await t.test('a draft saved by an UNNAMED session renders nothing, not a placeholder', () => {
    // savedBy defaults to { id: '', name: '' }. Round 26 declined to draw the
    // preview dialog's "created by" line rather than invent an actor, and an
    // invented placeholder is worse than an absent line: it looks like data.
    const state = initialEditorState({
      page: withDraft({ id: 'u-x', name: '' }), pageId: 'p1', updatedAt: 'T0',
    });
    assert.equal(hasPendingDraft(state), true, 'precondition: there IS a draft');
    assert.equal(draftSaverLine(state), '');
  });

  await t.test('a whitespace-only name is the same case', () => {
    const state = initialEditorState({
      page: withDraft({ id: 'u-x', name: '   ' }), pageId: 'p1', updatedAt: 'T0',
    });
    assert.equal(draftSaverLine(state), '');
  });

  await t.test('and no state at all is empty rather than a throw', () => {
    assert.equal(draftSaverLine(null), '');
    assert.equal(draftSaverLine({}), '');
  });
});

test('the line follows the draft through the reducer', async (t) => {
  const seed = (page, currentUserName = 'Current C') =>
    initialEditorState({ page, pageId: 'p1', updatedAt: 'T0', currentUserName });

  await t.test('a content save makes THIS session the saver', () => {
    // Otherwise the line would keep naming the previous author for the rest of
    // the session — the same quietly-stale display updatedBy already is.
    const after = editorReducer(seed(withDraft()), {
      type: 'SAVE_OK', domains: ['content'], updatedAt: 'T1', at: 1,
    });
    assert.equal(after.draftSavedBy, 'Current C');
    assert.equal(draftSaverLine(after), 'แก้ไขล่าสุดโดย Current C');
  });

  await t.test('an IDENTITY save does not move it — it writes no draft', () => {
    const after = editorReducer(seed(withDraft()), {
      type: 'SAVE_OK', domains: ['identity'], updatedAt: 'T1', at: 1,
    });
    assert.equal(after.draftSavedBy, 'Editor B', 'a rename claimed the draft');
  });

  await t.test('discarding the draft clears the saver with it', () => {
    const after = editorReducer(seed(withDraft()), { type: 'DRAFT_DISCARDED' });
    assert.equal(after.hadDraft, false);
    assert.equal(after.draftSavedBy, '');
    assert.equal(draftSaverLine(after), '', 'the line survived the draft it describes');
  });

  await t.test('publishing clears it too — publish dispatches DRAFT_DISCARDED', () => {
    // The sequence useEditorSave.publish runs: the promote lands, then the
    // pending draft is gone. A line still naming its saver would describe
    // content that is now simply the published page.
    let state = seed(withDraft());
    state = editorReducer(state, { type: 'SAVE_OK', domains: ['publish'], updatedAt: 'T1', at: 1 });
    state = editorReducer(state, { type: 'DRAFT_DISCARDED' });
    assert.equal(draftSaverLine(state), '');
  });

  await t.test('RESET keeps the session name, because a document reset is not a login', () => {
    const state = editorReducer(seed(withDraft()), {
      type: 'RESET', page: withDraft(), pageId: 'p1', updatedAt: 'T2',
    });
    assert.equal(state.currentUserName, 'Current C');
  });
});

test('it is one vocabulary, not two — statusLine keeps its own job', async (t) => {
  await t.test('statusLine says nothing about WHO, on a page with a named draft', () => {
    // Round 27 refused a second save vocabulary for the settings dialog. The
    // two lines stay disjoint: statusLine reports this TAB, the saver line
    // reports the STORED draft.
    const state = initialEditorState({ page: withDraft(), pageId: 'p1', updatedAt: 'T0' });
    const line = statusLine(state, Date.parse('2026-08-20T03:00:00.000Z'));
    assert.equal(line.includes('Editor B'), false, 'statusLine absorbed the saver');
    assert.equal(line.includes('Author A'), false);
  });

  await t.test('and the saver line says nothing about saving state', () => {
    const dirty = { ...initialEditorState({ page: withDraft(), pageId: 'p1', updatedAt: 'T0' }), contentDirty: true, saving: true };
    assert.equal(draftSaverLine(dirty), 'แก้ไขล่าสุดโดย Editor B',
      'the saver line changed because the tab was busy — that is statusLine’s job');
    assert.equal(statusLine(dirty), 'กำลังบันทึก…', 'statusLine stopped reporting the local write');
  });
});
