import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAFT_CONTENT_KEYS, IDENTITY_KEYS, STATUS_KEYS, SERVER_COMPUTED_KEYS,
  LIVE_ONLY_KEYS, pageBuilderSchema,
} from '@/lib/schemas/pageBuilder';
import {
  editorReducer, initialEditorState, composeWorkingView,
} from '@/components/pageBuilder/editor/editorReducer';
import { runSave, runPublish, domainChanged } from '@/lib/pageBuilder/savePlan';

/**
 * Round 4 — the editor's state layer under the draft/published split.
 *
 * PURE, and it has to be: `editorReducer` is a plain function and savePlan's
 * two orchestrators take their actions by injection, so everything below runs
 * with no React and no DOM. This suite mounts no roots (isolation:'none' means
 * one leaked root breaks unrelated files), which is exactly why the sequencing
 * was extracted out of useEditorSave rather than tested through it.
 */

// ── the four-way partition the reducer classifies against ───────────────────

test('the editable surface partitions into content / identity / status / server', () => {
  const surface = Object.keys(pageBuilderSchema.shape).sort();
  const union = [
    ...DRAFT_CONTENT_KEYS, ...IDENTITY_KEYS, ...STATUS_KEYS, ...SERVER_COMPUTED_KEYS,
  ].sort();
  assert.deepEqual(union, surface, 'a key belongs to no group, or to two');
  assert.deepEqual(DRAFT_CONTENT_KEYS.length + IDENTITY_KEYS.length
    + STATUS_KEYS.length + SERVER_COMPUTED_KEYS.length, 17);
});

test('identity, status and server-computed together are exactly the live-only half', () => {
  assert.deepEqual(
    [...IDENTITY_KEYS, ...STATUS_KEYS, ...SERVER_COMPUTED_KEYS].sort(),
    [...LIVE_ONLY_KEYS].sort(),
    'the round-1 live-only set and its round-4 subdivision disagree'
  );
});

test('CONTROL: the four groups are pairwise disjoint', () => {
  const groups = { DRAFT_CONTENT_KEYS, IDENTITY_KEYS, STATUS_KEYS, SERVER_COMPUTED_KEYS };
  const overlaps = [];
  for (const [aName, a] of Object.entries(groups)) {
    for (const [bName, b] of Object.entries(groups)) {
      if (aName >= bName) continue;
      for (const k of a) if (b.includes(k)) overlaps.push(`${k} in ${aName} and ${bName}`);
    }
  }
  assert.deepEqual(overlaps, [], 'a key would raise two dirty flags at once');
});

// ── composing the working view ──────────────────────────────────────────────

const LIVE = {
  slug: 'live-slug', title: 'Live Title', pageType: 'general', status: 'published',
  theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [{ id: 'live-1', type: 'heading' }],
  seo: { metaTitle: 'live meta' }, jsonLd: { mode: 'auto' }, slugHistory: ['older'],
};

const DRAFT = {
  title: 'Drafted Title', sections: [{ id: 'draft-1', type: 'rich_text' }],
  theme: 'ai_purple', showHeader: false, showFooter: true, showStickyCta: true,
  seo: { metaTitle: 'draft meta' }, jsonLd: { mode: 'off' },
  promotionCover: 'https://example.com/c.png',
};

test('a page WITH a draft opens on the draft content and the live identity', () => {
  const raw = { ...LIVE, draft: { ...DRAFT, savedAt: 'x', savedBy: { id: 'u' } } };
  const view = composeWorkingView(raw);
  for (const k of DRAFT_CONTENT_KEYS) {
    assert.deepEqual(view[k], DRAFT[k], `${k} did not come from the draft`);
  }
  for (const k of LIVE_ONLY_KEYS) {
    assert.deepEqual(view[k], LIVE[k], `${k} did not come from the live document`);
  }
  // The stamps are not content and the raw draft is not carried through.
  assert.deepEqual(Object.keys(view).sort(), [...DRAFT_CONTENT_KEYS, ...LIVE_ONLY_KEYS].sort());
  assert.equal('draft' in view, false, 'the working view still carries the raw draft');
  assert.equal('savedAt' in view, false);
});

test('a page with draft:null opens on the LIVE content', () => {
  const view = composeWorkingView({ ...LIVE, draft: null });
  assert.equal(view.title, 'Live Title');
  assert.deepEqual(view.sections, LIVE.sections);
  assert.equal(view.theme, 'default');
});

test('a page MISSING the draft key entirely opens identically', () => {
  // Every document that predates round 1 is this shape: no backfill, and a
  // Mongoose default does not apply to a doc read through .lean() + JSON.
  const missing = composeWorkingView({ ...LIVE });
  const explicitNull = composeWorkingView({ ...LIVE, draft: null });
  assert.deepEqual(missing, explicitNull, 'an absent draft differs from an explicit null');
  assert.equal(missing.title, 'Live Title');
});

test('CONTROL: the draft really does change the view — the three cases are not all live', () => {
  const withDraft = composeWorkingView({ ...LIVE, draft: DRAFT });
  const without = composeWorkingView({ ...LIVE });
  assert.notDeepEqual(withDraft, without);
  assert.equal(withDraft.title, 'Drafted Title');
  assert.equal(without.title, 'Live Title');
});

test('initialEditorState records whether the STORED doc had a draft', () => {
  assert.equal(initialEditorState({ page: { ...LIVE, draft: DRAFT } }).hadDraft, true);
  assert.equal(initialEditorState({ page: { ...LIVE, draft: null } }).hadDraft, false);
  assert.equal(initialEditorState({ page: { ...LIVE } }).hadDraft, false);
  assert.equal(initialEditorState({ page: { ...LIVE, draft: {} } }).hadDraft, false);
});

test('initialEditorState starts clean, with one token for the whole document', () => {
  const s = initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
  assert.equal(s.contentDirty, false);
  assert.equal(s.identityDirty, false);
  assert.equal(s.savedUpdatedAt, 'T0');
  assert.equal(s.pageId, 'p1');
  assert.equal(s.conflict, null);
});

// ── PATCH_PAGE classifies by key ────────────────────────────────────────────

const base = () => initialEditorState({ page: LIVE, pageId: 'p1', updatedAt: 'T0' });
const patch = (state, p) => editorReducer(state, { type: 'PATCH_PAGE', patch: p });

test('a CONTENT patch raises contentDirty only', () => {
  const s = patch(base(), { title: 'New' });
  assert.equal(s.contentDirty, true);
  assert.equal(s.identityDirty, false, 'a content edit raised the identity flag');
  assert.equal(s.page.title, 'New');
});

test('an IDENTITY patch raises identityDirty only', () => {
  const s = patch(base(), { slug: 'renamed' });
  assert.equal(s.identityDirty, true);
  assert.equal(s.contentDirty, false, 'an identity edit raised the content flag');
  assert.equal(s.page.slug, 'renamed');
});

test('every content key raises content, every identity key raises identity', () => {
  // Exact, key by key — a classifier that happened to work for `title` and
  // `slug` while mis-sorting `jsonLd` would pass the two cases above.
  for (const k of DRAFT_CONTENT_KEYS) {
    const s = patch(base(), { [k]: 'v' });
    assert.equal(s.contentDirty, true, `${k} did not raise contentDirty`);
    assert.equal(s.identityDirty, false, `${k} raised identityDirty`);
  }
  for (const k of IDENTITY_KEYS) {
    const s = patch(base(), { [k]: 'v' });
    assert.equal(s.identityDirty, true, `${k} did not raise identityDirty`);
    assert.equal(s.contentDirty, false, `${k} raised contentDirty`);
  }
});

test('a patch spanning BOTH halves raises both flags', () => {
  // PageSettingsDialog patches through one shared helper, so this is reachable
  // the moment anything batches two fields. It must not silently pick one.
  const s = patch(base(), { title: 'New', slug: 'renamed' });
  assert.equal(s.contentDirty, true);
  assert.equal(s.identityDirty, true);
});

test('a STATUS-only patch raises NEITHER flag', () => {
  // Status is applied by publishPageStatus at the moment the dialog is
  // confirmed; this patch tells the working view what the server already did.
  const s = patch(base(), { status: 'published', publishStartDate: null, publishEndDate: null });
  assert.equal(s.contentDirty, false, 'a status patch marked content unsaved');
  assert.equal(s.identityDirty, false, 'a status patch marked identity unsaved');
  assert.equal(s.page.status, 'published');
});

test('every section action is CONTENT', () => {
  const withSection = { ...LIVE, sections: [{ id: 'a', type: 'heading', enabled: true }] };
  const start = initialEditorState({ page: withSection, pageId: 'p1' });
  const actions = [
    { type: 'PATCH_SECTION', path: ['sections', 0], patch: { name: 'x' } },
    { type: 'PATCH_SECTION_KEY', path: ['sections', 0], key: 'content', patch: { text: 'x' } },
    { type: 'TOGGLE_SECTION', path: ['sections', 0] },
    { type: 'ADD_SECTION', parentPath: ['sections'], index: 1, section: { id: 'b', type: 'heading' } },
    { type: 'DUPLICATE_SECTION', path: ['sections', 0] },
    { type: 'MOVE_SECTION', path: ['sections', 0], to: 0 },
    { type: 'REMOVE_SECTION', path: ['sections', 0] },
  ];
  for (const a of actions) {
    const s = editorReducer(start, a);
    assert.equal(s.contentDirty, true, `${a.type} did not raise contentDirty`);
    assert.equal(s.identityDirty, false, `${a.type} raised identityDirty`);
  }
});

// ── SAVE_OK clears only what it is told about ───────────────────────────────

const bothDirty = () => patch(patch(base(), { title: 'New' }), { slug: 'renamed' });

test('SAVE_OK clears only the domains it names', () => {
  const s = editorReducer(bothDirty(), { type: 'SAVE_OK', domains: ['content'], updatedAt: 'T1' });
  assert.equal(s.contentDirty, false, 'content was not cleared');
  assert.equal(s.identityDirty, true, 'identity was cleared by a content-only save');
  assert.equal(s.savedUpdatedAt, 'T1');
});

test('SAVE_OK naming both clears both', () => {
  const s = editorReducer(bothDirty(), { type: 'SAVE_OK', domains: ['content', 'identity'], updatedAt: 'T1' });
  assert.equal(s.contentDirty, false);
  assert.equal(s.identityDirty, false);
});

test('a domain edited DURING the save stays dirty', () => {
  const s = editorReducer(bothDirty(), {
    type: 'SAVE_OK', domains: ['content', 'identity'], dirtyDuring: ['content'], updatedAt: 'T1',
  });
  assert.equal(s.contentDirty, true, 'an edit made mid-save was lost');
  assert.equal(s.identityDirty, false);
});

test('SAVE_OK with no domains advances the token and clears nothing', () => {
  const s = editorReducer(bothDirty(), { type: 'SAVE_OK', domains: [], updatedAt: 'T9' });
  assert.equal(s.contentDirty, true);
  assert.equal(s.identityDirty, true);
  assert.equal(s.savedUpdatedAt, 'T9');
});

test('a content save means a draft is now pending', () => {
  const s = editorReducer(base(), { type: 'SAVE_OK', domains: ['content'], updatedAt: 'T1' });
  assert.equal(s.hadDraft, true);
});

test('conflict is WHOLE-DOCUMENT and terminal, not per-domain', () => {
  const s = editorReducer(bothDirty(), { type: 'SAVE_CONFLICT', message: 'moved' });
  assert.deepEqual(s.conflict, { message: 'moved' });
  assert.equal(s.saving, false);
  assert.deepEqual(Object.keys(s).filter((k) => /conflict/i.test(k)), ['conflict']);
});

test('DRAFT_DISCARDED clears the content flag and the pending-draft marker', () => {
  const dirty = editorReducer(patch(base(), { title: 'New' }), { type: 'SAVE_OK', domains: ['content'] });
  const s = editorReducer(dirty, { type: 'DRAFT_DISCARDED' });
  assert.equal(s.hadDraft, false);
  assert.equal(s.contentDirty, false);
});

// ── the orchestrator: which action, in which order, with which token ────────

function fakeActions(script = {}) {
  const calls = [];
  const mk = (name, result) => async (id, patchArg, token) => {
    calls.push({ name, id, patch: patchArg, token });
    return result ?? { ok: true, updatedAt: `${name}-token` };
  };
  return {
    calls,
    actions: {
      saveDraftContent: mk('saveDraftContent', script.content),
      updatePageIdentity: mk('updatePageIdentity', script.identity),
    },
  };
}

const PAGE = { ...LIVE, title: 'Typed', slug: 'typed-slug' };
const runArgs = (over = {}) => ({
  id: 'p1', page: PAGE, token: 'T0',
  contentKeys: DRAFT_CONTENT_KEYS, identityKeys: IDENTITY_KEYS,
  contentDirty: false, identityDirty: false, ...over,
});

test('content-only dirty calls saveDraftContent and NOT updatePageIdentity', async () => {
  const { calls, actions } = fakeActions();
  const out = await runSave(runArgs({ contentDirty: true, actions }));
  assert.deepEqual(calls.map((c) => c.name), ['saveDraftContent']);
  assert.deepEqual(out.saved, ['content']);
  assert.deepEqual(Object.keys(calls[0].patch).sort(), [...DRAFT_CONTENT_KEYS].sort());
});

test('identity-only dirty calls updatePageIdentity and NOT saveDraftContent', async () => {
  const { calls, actions } = fakeActions();
  const out = await runSave(runArgs({ identityDirty: true, actions }));
  assert.deepEqual(calls.map((c) => c.name), ['updatePageIdentity']);
  assert.deepEqual(out.saved, ['identity']);
  assert.deepEqual(Object.keys(calls[0].patch).sort(), [...IDENTITY_KEYS].sort());
});

test('both dirty: content first, and identity carries the token content returned', async () => {
  const { calls, actions } = fakeActions({
    content: { ok: true, updatedAt: 'T1' },
    identity: { ok: true, updatedAt: 'T2' },
  });
  const out = await runSave(runArgs({ contentDirty: true, identityDirty: true, actions }));
  assert.deepEqual(calls.map((c) => c.name), ['saveDraftContent', 'updatePageIdentity']);
  // THE TOKEN VALUE, not merely that both were called: passing T0 to the second
  // call would make the editor conflict with its own first write.
  assert.equal(calls[0].token, 'T0');
  assert.equal(calls[1].token, 'T1', 'the second call did not chain the first call token');
  assert.deepEqual(out.saved, ['content', 'identity']);
  assert.equal(out.updatedAt, 'T2');
});

test('neither dirty: no call at all', async () => {
  const { calls, actions } = fakeActions();
  const out = await runSave(runArgs({ actions }));
  assert.deepEqual(calls, []);
  assert.deepEqual(out.saved, []);
});

test('a conflict on the SECOND call keeps the first half saved', async () => {
  const { calls, actions } = fakeActions({
    content: { ok: true, updatedAt: 'T1' },
    identity: { ok: false, conflict: true, error: 'moved' },
  });
  const out = await runSave(runArgs({ contentDirty: true, identityDirty: true, actions }));
  assert.deepEqual(calls.map((c) => c.name), ['saveDraftContent', 'updatePageIdentity']);
  assert.deepEqual(out.saved, ['content'], 'the successful half was reported as lost');
  assert.equal(out.conflict, 'moved');

  // …and the reducer turns that into: content clean, identity dirty, terminal.
  let s = bothDirty();
  s = editorReducer(s, { type: 'SAVE_OK', domains: out.saved, updatedAt: out.updatedAt });
  s = editorReducer(s, { type: 'SAVE_CONFLICT', message: out.conflict });
  assert.equal(s.contentDirty, false, 'the saved half stayed dirty');
  assert.equal(s.identityDirty, true, 'the conflicted half was cleared');
  assert.deepEqual(s.conflict, { message: 'moved' });
});

test('a conflict on the FIRST call never reaches the second', async () => {
  const { calls, actions } = fakeActions({ content: { ok: false, conflict: true, error: 'moved' } });
  const out = await runSave(runArgs({ contentDirty: true, identityDirty: true, actions }));
  assert.deepEqual(calls.map((c) => c.name), ['saveDraftContent']);
  assert.deepEqual(out.saved, []);
  assert.equal(out.conflict, 'moved');
});

test('a plain error is reported without a conflict', async () => {
  const { actions } = fakeActions({ content: { ok: false, error: 'Slug นี้ถูกใช้แล้ว' } });
  const out = await runSave(runArgs({ contentDirty: true, actions }));
  assert.equal(out.conflict, null);
  assert.equal(out.error, 'Slug นี้ถูกใช้แล้ว');
});

// ── publish sequences flush → promote ───────────────────────────────────────

test('publish flushes FIRST and promotes with the token the flush returned', async () => {
  const order = [];
  const out = await runPublish({
    statusPatch: { status: 'published', publishStartDate: null, publishEndDate: null },
    flush: async () => { order.push('flush'); return { id: 'p1', updatedAt: 'T5' }; },
    publish: async (id, patchArg, token) => {
      order.push(`publish:${id}:${token}`);
      return { ok: true, status: 'published', updatedAt: 'T6' };
    },
  });
  assert.deepEqual(order, ['flush', 'publish:p1:T5'], 'publish did not flush first, or lost the token');
  assert.equal(out.ok, true);
});

test('CONTROL: a failed flush aborts, and nothing is promoted', async () => {
  // Publishing after a failed flush would promote a draft the server never got.
  const order = [];
  const out = await runPublish({
    statusPatch: { status: 'published' },
    flush: async () => { order.push('flush'); return null; },
    publish: async () => { order.push('publish'); return { ok: true }; },
  });
  assert.deepEqual(order, ['flush'], 'a failed flush still published');
  assert.equal(out.aborted, true);
  assert.equal(out.ok, false);
});

test('publish on an UNSAVED page promotes the id the flush minted', async () => {
  // B: the publish button has no pageId gate, so this path is reachable. The
  // flush creates, and the id it returns is what gets published.
  const seen = [];
  await runPublish({
    statusPatch: { status: 'published' },
    flush: async () => ({ id: 'freshly-created', updatedAt: 'T1' }),
    publish: async (id, _p, token) => { seen.push({ id, token }); return { ok: true }; },
  });
  assert.deepEqual(seen, [{ id: 'freshly-created', token: 'T1' }]);
});

// ── the mid-save comparison ─────────────────────────────────────────────────

test('domainChanged sees a change in its own half and ignores the other', () => {
  const before = { ...PAGE };
  const afterContent = { ...before, title: 'Edited' };
  const afterIdentity = { ...before, slug: 'edited' };
  assert.equal(domainChanged(before, afterContent, DRAFT_CONTENT_KEYS), true);
  assert.equal(domainChanged(before, afterContent, IDENTITY_KEYS), false);
  assert.equal(domainChanged(before, afterIdentity, IDENTITY_KEYS), true);
  assert.equal(domainChanged(before, afterIdentity, DRAFT_CONTENT_KEYS), false);
});

test('CONTROL: the same object reference is never "changed"', () => {
  assert.equal(domainChanged(PAGE, PAGE, DRAFT_CONTENT_KEYS), false);
});
