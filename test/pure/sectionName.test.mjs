import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALL_SECTION_TYPES, sectionSchema } from '@/lib/schemas/pageBuilder';
import { baseSectionSchema } from '@/lib/schemas/sections/base';
import { newSection } from '@/lib/pageBuilder/newSection';
import { editorReducer, initialEditorState } from '@/components/pageBuilder/editor/editorReducer';
import { getAt } from '@/components/pageBuilder/editor/pagePath';

/**
 * Round 17 — the section `name`, made authorable.
 *
 * ── WHAT MAKES THIS FIELD DIFFERENT FROM EVERY OTHER ONE IN THE PANEL ──────
 * Every other control in SettingsPanel writes into a named SUB-OBJECT
 * (content / settings / style / layout / advanced) through PATCH_SECTION_KEY.
 * `name` is a top-level key on the section itself, so it needs the reducer's
 * other merge — PATCH_SECTION. Handing the sub-object merge a top-level string
 * key does not fail loudly; it spreads the string and leaves an OBJECT where
 * the name should be, which then fails at the schema, at save time, far from
 * the dispatch that caused it. That is the failure this file pins.
 *
 * PURE: editorReducer is a plain function and the schema is zod, so nothing
 * here needs React or a DOM.
 */

const PAGE = {
  slug: 's', title: 'T', pageType: 'general', status: 'draft', theme: 'default',
  showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', seo: {}, jsonLd: {}, slugHistory: [], sections: [],
};

const sec = (id, type, content = {}) => ({
  id, type, content, settings: {}, style: {}, layout: {}, advanced: {},
  enabled: true, sortOrder: 0, name: '',
});

/** A fresh editor state holding one heading at ['sections', 0]. */
const stateWith = (sections) => initialEditorState({ page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0' });
const PATH = ['sections', 0];

// ── 1. the field is on the BASE envelope, so on every type ─────────────────

test('name is declared on the shared envelope, not on any one section type', () => {
  assert.ok(Object.hasOwn(baseSectionSchema.shape, 'name'),
    'name must live on baseSectionSchema — every type extends that one object');
});

test('every section type in the union carries name, defaulted to the empty string', () => {
  /**
   * Exact and exhaustive, not a sample: the point of putting the field on the
   * base envelope is that no type can be missing it, and a spot check of three
   * types would not notice a 28th that was defined some other way.
   */
  const missing = ALL_SECTION_TYPES.filter((t) => !Object.hasOwn(newSection(t), 'name'));
  assert.deepEqual(missing, [], 'these types minted without a name field');

  const nonEmpty = ALL_SECTION_TYPES.filter((t) => newSection(t).name !== '');
  assert.deepEqual(nonEmpty, [], 'a fresh section must start unnamed');

  assert.equal(ALL_SECTION_TYPES.length, 27, 'the union size changed — recount before trusting the sweep above');
});

test('CONTROL: the sweep above is sensitive — a key that is NOT on the envelope is missing everywhere', () => {
  /**
   * Discrimination. Without this, "no type is missing name" would read the same
   * as "the filter never rejects anything".
   */
  const missing = ALL_SECTION_TYPES.filter((t) => !Object.hasOwn(newSection(t), 'nickname'));
  assert.deepEqual(missing, ALL_SECTION_TYPES, 'the has-own check does not discriminate');
});

// ── 2. the reducer writes it as a TOP-LEVEL key ────────────────────────────

test('PATCH_SECTION writes name at the top level and leaves the sub-objects untouched', () => {
  const before = stateWith([sec('a', 'heading', { text: 'สวัสดี' })]);
  const after = editorReducer(before, {
    type: 'PATCH_SECTION', path: PATH, patch: { name: 'แบนเนอร์บนสุด' },
  });
  const s = getAt(after.page, PATH);

  assert.equal(s.name, 'แบนเนอร์บนสุด');
  // …and nowhere else. Exact objects, so a name that ALSO landed inside one of
  // them would fail rather than pass on the top-level assertion alone.
  assert.deepEqual(s.content, { text: 'สวัสดี' });
  assert.deepEqual(s.settings, {});
  assert.deepEqual(s.style, {});
  assert.deepEqual(s.layout, {});
  assert.deepEqual(s.advanced, {});
  for (const key of ['content', 'settings', 'style', 'layout', 'advanced']) {
    assert.equal(Object.hasOwn(s[key], 'name'), false, `name leaked into ${key}`);
  }
});

test('CONTROL: PATCH_SECTION_KEY — the path every OTHER field uses — cannot carry this one', () => {
  /**
   * THE REASON THE PANEL DISPATCHES PATCH_SECTION INSTEAD.
   *
   * The sub-object merge spreads whatever it finds at the key. Pointed at
   * `name` it spreads a STRING, so the section ends up with an object of
   * character indices where its name should be — silently, in client state,
   * with the failure surfacing later at the schema. Asserting the wrong
   * outcome here is what stops someone "simplifying" the panel onto the
   * dispatch its neighbours use.
   */
  const before = stateWith([sec('a', 'heading')]);
  const after = editorReducer(before, {
    type: 'PATCH_SECTION_KEY', path: PATH, key: 'name', patch: { name: 'x' },
  });
  const s = getAt(after.page, PATH);

  assert.equal(typeof s.name, 'object', 'the sub-object merge produced a string — this control no longer discriminates');
  assert.notEqual(s.name, 'x');
  assert.throws(() => sectionSchema.parse(s), 'and the schema is where it would have surfaced');
});

test('naming a section marks the tree dirty, so it rides the ordinary autosave', () => {
  const before = stateWith([sec('a', 'heading')]);
  assert.equal(before.contentDirty, false);
  const after = editorReducer(before, {
    type: 'PATCH_SECTION', path: PATH, patch: { name: 'ก' },
  });
  assert.equal(after.contentDirty, true);
  assert.equal(after.identityDirty, false, 'a section name is content, not page identity');
});

test('CONTROL: a transition that is NOT an edit leaves the tree clean', () => {
  const before = stateWith([sec('a', 'heading')]);
  const after = editorReducer(before, { type: 'SELECT', path: PATH });
  assert.equal(after.contentDirty, false, 'if selecting dirtied the tree the assertion above would prove nothing');
});

// ── 3. it survives the validator the SERVER runs ───────────────────────────

test('a named section round-trips through the section schema unchanged', () => {
  const named = { ...sec('a', 'heading', { text: 'ก' }), name: 'ชื่อที่ตั้งเอง' };
  const parsed = sectionSchema.parse(named);
  assert.equal(parsed.name, 'ชื่อที่ตั้งเอง');
  // Twice through, because a default that fired on the second pass would blank
  // a stored name on every load.
  assert.equal(sectionSchema.parse(parsed).name, 'ชื่อที่ตั้งเอง');
});

test('CONTROL: the same parse DOES drop a key the envelope does not declare', () => {
  const parsed = sectionSchema.parse({ ...sec('a', 'heading'), nickname: 'ตกหล่น' });
  assert.equal(Object.hasOwn(parsed, 'nickname'), false,
    'if unknown keys survived, "name survived" would say nothing about name');
});
