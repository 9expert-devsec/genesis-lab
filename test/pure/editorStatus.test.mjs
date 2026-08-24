import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hasPendingDraft, canDiscardDraft, statusLine } from '@/lib/pageBuilder/editorStatus';
import { shouldBlockLeave, leaveBlockReason } from '@/lib/pageBuilder/leaveGuard';
import { editorReducer, initialEditorState } from '@/components/pageBuilder/editor/editorReducer';
import { composeWorkingView } from '@/lib/pageBuilder/draftState';

/**
 * Round 5 — what the editor SAYS, decided purely.
 *
 * The classification lives here so the render tier only has to prove the top
 * bar consumes it (the same split scheduleStatus already uses). It also lets
 * the chip be tested against a state a server render cannot construct: "the
 * author is typing but nothing has been saved" needs a dispatch, and this suite
 * mounts no React roots.
 */

const T0 = 1_700_000_000_000;

// ── A: an identity-only edit must still block leaving ───────────────────────

const LIVE = {
  slug: 'live-slug', title: 'Live', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
};

/** Exactly what EditorProvider hands useLeaveGuard, from a real reducer state. */
const guardInput = (state) => ({
  dirty: state.contentDirty || state.identityDirty,
  saving: state.saving,
  conflict: state.conflict,
});

test('an IDENTITY-only edit blocks leaving, exactly like a content edit', () => {
  // The derivation is an OR, so this already held before round 5 — this pins it
  // against a future "split dirty per domain" that would quietly stop the guard
  // firing for a retyped slug, the one edit that is live the moment it saves.
  const start = initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
  const identityOnly = editorReducer(start, { type: 'PATCH_PAGE', patch: { slug: 'retyped' } });

  assert.equal(identityOnly.identityDirty, true, 'precondition: only identity is dirty');
  assert.equal(identityOnly.contentDirty, false, 'precondition: content is clean');
  assert.equal(shouldBlockLeave(guardInput(identityOnly)), true, 'a retyped slug did not block Back');
  assert.equal(leaveBlockReason(guardInput(identityOnly)), 'dirty');
});

test('a CONTENT-only edit blocks leaving too', () => {
  const start = initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
  const contentOnly = editorReducer(start, { type: 'PATCH_PAGE', patch: { title: 'Typed' } });
  assert.equal(contentOnly.contentDirty, true);
  assert.equal(contentOnly.identityDirty, false);
  assert.equal(shouldBlockLeave(guardInput(contentOnly)), true);
});

test('CONTROL: a clean state does NOT block leaving', () => {
  // Without this, the two cases above pass for a guard that blocks everything.
  const clean = initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
  assert.equal(shouldBlockLeave(guardInput(clean)), false);
  assert.equal(leaveBlockReason(guardInput(clean)), null);
});

// ── E.1: the chip reads the SERVER's state, not the keyboard ────────────────

test('the draft chip follows hadDraft, NOT contentDirty', () => {
  // The distinction is the whole point: contentDirty means "keystrokes in this
  // tab"; hadDraft means "the server is holding unpublished content".
  assert.equal(hasPendingDraft({ hadDraft: true, contentDirty: false }), true);
  assert.equal(
    hasPendingDraft({ hadDraft: false, contentDirty: true }), false,
    'the chip appeared for unsaved keystrokes the server has never seen'
  );
  assert.equal(hasPendingDraft({ hadDraft: false, contentDirty: false }), false);
  assert.equal(hasPendingDraft({}), false);
  assert.equal(hasPendingDraft(null), false);
});

test('typing then saving is what turns the chip on', () => {
  // The two states the render tier cannot build, walked through the real reducer.
  const start = initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
  assert.equal(hasPendingDraft(start), false, 'a page with no stored draft starts without the chip');

  const typing = editorReducer(start, { type: 'PATCH_PAGE', patch: { title: 'Typed' } });
  assert.equal(typing.contentDirty, true);
  assert.equal(hasPendingDraft(typing), false, 'the chip appeared while merely typing');

  const saved = editorReducer(typing, { type: 'SAVE_OK', domains: ['content'], updatedAt: 'T1' });
  assert.equal(hasPendingDraft(saved), true, 'the chip did not appear after the draft was stored');
});

test('a page that already had a stored draft shows the chip on open', () => {
  const withDraft = { ...LIVE, draft: { title: 'Drafted', sections: [] } };
  assert.equal(hasPendingDraft(initialEditorState({ page: withDraft, pageId: 'p1' })), true);
});

// ── E.3: when discarding is offered ─────────────────────────────────────────

test('discard is offered only with a pending draft, and never mid-save or after a conflict', () => {
  assert.equal(canDiscardDraft({ hadDraft: true }), true);
  assert.equal(canDiscardDraft({ hadDraft: false }), false, 'offered with nothing to discard');
  assert.equal(canDiscardDraft({ hadDraft: true, saving: true }), false, 'offered mid-save');
  assert.equal(
    canDiscardDraft({ hadDraft: true, conflict: { message: 'moved' } }), false,
    'offered after a conflict, when this tab can no longer promise what is published'
  );
});

// ── E.2: the status line ────────────────────────────────────────────────────

const line = (over, now = T0) => statusLine({ lastSavedAt: T0, lastSavedDomains: [], ...over }, now);

test('conflict, saving and dirty keep their existing precedence and copy', () => {
  assert.equal(line({ conflict: { message: 'x' }, saving: true, contentDirty: true }), '');
  assert.equal(line({ saving: true, contentDirty: true }), 'กำลังบันทึก…');
  assert.equal(line({ contentDirty: true }), 'ยังไม่ได้บันทึก');
  assert.equal(line({ identityDirty: true }), 'ยังไม่ได้บันทึก');
});

test('a content-only save reads as a DRAFT autosave', () => {
  assert.equal(line({ lastSavedDomains: ['content'] }), 'บันทึกฉบับร่างอัตโนมัติเมื่อสักครู่');
  assert.equal(
    line({ lastSavedDomains: ['content'] }, T0 + 3 * 60000),
    'บันทึกฉบับร่างอัตโนมัติเมื่อ 3 นาทีที่แล้ว'
  );
});

test('an identity-inclusive save says it took effect IMMEDIATELY', () => {
  // Different words on purpose: an identity flush renames a slug and busts
  // caches the instant it lands, and must not be announced in the sentence used
  // for a write nobody can see yet.
  assert.equal(line({ lastSavedDomains: ['identity'] }), 'บันทึกแล้ว (มีผลทันที) เมื่อสักครู่');
  assert.equal(
    line({ lastSavedDomains: ['content', 'identity'] }, T0 + 7 * 60000),
    'บันทึกแล้ว (มีผลทันที) เมื่อ 7 นาทีที่แล้ว'
  );
});

test('a publish also reads as immediate', () => {
  assert.equal(line({ lastSavedDomains: ['publish'] }), 'บันทึกแล้ว (มีผลทันที) เมื่อสักครู่');
});

test('CONTROL: the two clean sentences are genuinely different strings', () => {
  // Thai negates by prefix and these two share a stem; a refactor that collapsed
  // them would leave every assertion above passing on one of them.
  const draft = line({ lastSavedDomains: ['content'] });
  const immediate = line({ lastSavedDomains: ['identity'] });
  assert.notEqual(draft, immediate);
  assert.equal(draft.includes('มีผลทันที'), false, 'the draft sentence claims immediate effect');
  assert.equal(immediate.includes('ฉบับร่าง'), false, 'the immediate sentence calls itself a draft');
});

test('nothing saved yet says nothing', () => {
  assert.equal(statusLine({ lastSavedAt: null }, T0), '');
  assert.equal(statusLine({}, T0), '');
});

test('the reducer retains the domains the status line reads', () => {
  // The gap this round closed: SAVE_OK already carried `domains` (round 4) but
  // the reducer dropped them, so the line had nothing to fork on.
  const start = initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
  assert.deepEqual(start.lastSavedDomains, []);
  const afterIdentity = editorReducer(start, {
    type: 'SAVE_OK', domains: ['identity'], updatedAt: 'T1', at: T0,
  });
  assert.deepEqual(afterIdentity.lastSavedDomains, ['identity']);
  assert.equal(statusLine(afterIdentity, T0), 'บันทึกแล้ว (มีผลทันที) เมื่อสักครู่');
});

// ── G: the preview composition is the editor's composition ──────────────────

test('the preview renders the same composition the editor opens on', () => {
  // One function, two callers — the reason it moved into draftState.js.
  const withDraft = { ...LIVE, draft: { title: 'Drafted', sections: [{ id: 'd', type: 'rich_text' }] } };
  assert.deepEqual(
    composeWorkingView(withDraft),
    initialEditorState({ page: withDraft }).page,
    'the preview and the editor would show different content'
  );
});
