import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { editorReducer, initialEditorState } from '@/components/pageBuilder/editor/editorReducer';

/**
 * WHAT THE CANVAS DRAWS IS THE REDUCER'S WORKING TREE, NOT THE PAGE IT WAS
 * HANDED ON MOUNT.
 *
 * ── WHY THIS IS PINNED HERE AND NOT LEFT TO THE PROVIDER ───────────────────
 * The reported defect was "adding a section, or editing one, does not show in
 * the canvas until the page is saved and reopened", and the first hypothesis
 * for it was that the canvas had kept a reference to the `page` PROP. Round 45
 * measured that it had not — EditorProvider spreads `...state` into its context,
 * so `useEditor().page` IS `state.page` and CanvasPanel reads it fresh on every
 * render. The real cause was in the iframe layer (see
 * test/render/canvasFrameLateAttach).
 *
 * That refutation is worth a guard even though it came back clean, because the
 * arrangement it depends on is one line in a `useMemo` and nothing else asserts
 * it. Re-introducing the bug is as small as spreading the seed instead of the
 * state, or passing `page` down beside the context — and every symptom would be
 * blamed on the frame again.
 *
 * ── WHY IT RENDERS RATHER THAN INSPECTING STATE ────────────────────────────
 * `state.page.sections.length === 2` is satisfied by a reducer that works while
 * the canvas draws something else. The claim is about what an AUTHOR SEES, so
 * the assertion is over markup produced by the real SectionRenderer — the same
 * component CanvasPanel renders through.
 *
 * NOT covered here, deliberately: the iframe, the portal, and the click
 * handlers. Those need a DOM and live one tier up.
 */

const SAVED = {
  id: 's0', type: 'heading', enabled: true, sortOrder: 0,
  content: { text: 'หัวข้อที่บันทึกไว้แล้ว' },
};
const PAGE = { _id: 'p1', title: 'T', slug: 't', theme: 'default', sections: [SAVED] };

/** The canvas's own render, reduced to the part under test. */
function draw(page) {
  const sections = Array.isArray(page?.sections) ? page.sections : [];
  return renderToStaticMarkup(
    createElement(
      'div',
      { 'data-pb-canvas': '' },
      sections.map((section, i) =>
        createElement(SectionRenderer, {
          key: section?.id ?? i, section, depth: 0, path: ['sections', i],
        })
      )
    )
  );
}

const seed = () => initialEditorState({ page: PAGE, pageId: 'p1' });

test('a dispatched ADD is in the canvas render with no save in between', () => {
  const after = editorReducer(seed(), {
    type: 'ADD_SECTION', parentPath: ['sections'], index: 1,
    section: { id: 'added', type: 'heading', enabled: true, sortOrder: 9, content: { text: 'เพิ่งเพิ่ม' } },
  });
  const html = draw(after.page);
  assert.equal(html.includes('เพิ่งเพิ่ม'), true, 'the added section is not on the canvas');
  assert.equal(html.includes('data-pb-path="sections.1"'), true);
});

test('CONTROL: the SAME add is absent when the canvas is pointed at the mount-time page', () => {
  // The discrimination. `PAGE` is the object EditorProvider was constructed
  // with; the reducer copies rather than mutates, so drawing that object is
  // exactly the defect the hypothesis proposed. If this ever passed with the
  // text present, the assertion above would be proving nothing.
  const after = editorReducer(seed(), {
    type: 'ADD_SECTION', parentPath: ['sections'], index: 1,
    section: { id: 'added', type: 'heading', enabled: true, sortOrder: 9, content: { text: 'เพิ่งเพิ่ม' } },
  });
  assert.equal(after.page.sections.length, 2, 'the reducer did not add the section at all');
  const stale = draw(PAGE);
  assert.equal(stale.includes('เพิ่งเพิ่ม'), false);
  assert.equal(stale.includes('data-pb-path="sections.1"'), false);
});

test('a dispatched EDIT of an ALREADY-SAVED section is in the canvas render', () => {
  // The second of the two discriminating cases: this one and the add above went
  // through different code paths in the report, so both are pinned.
  const after = editorReducer(seed(), {
    type: 'PATCH_SECTION_KEY', path: ['sections', 0], key: 'content',
    patch: { text: 'แก้ไขข้อความเดิม' },
  });
  const html = draw(after.page);
  assert.equal(html.includes('แก้ไขข้อความเดิม'), true);
  assert.equal(html.includes('หัวข้อที่บันทึกไว้แล้ว'), false, 'the pre-edit text is still on the canvas');
});

test('CONTROL: the mount-time page still carries the PRE-edit text', () => {
  // Proves the test above is about the reducer's copy and not about a fixture
  // that never held the old value.
  editorReducer(seed(), {
    type: 'PATCH_SECTION_KEY', path: ['sections', 0], key: 'content',
    patch: { text: 'แก้ไขข้อความเดิม' },
  });
  assert.equal(PAGE.sections[0].content.text, 'หัวข้อที่บันทึกไว้แล้ว', 'the reducer MUTATED the seed');
  assert.equal(draw(PAGE).includes('แก้ไขข้อความเดิม'), false);
});

test('the seed is SHARED until a dispatch, and REPLACED by one', () => {
  // The mechanism behind both controls, stated once, and measured rather than
  // assumed: composeWorkingView returns a new page OBJECT but hands the same
  // `sections` ARRAY through — structural sharing, not a deep copy. So the two
  // stale controls above are not comparing a copy against a copy; they are
  // comparing the seed against a tree the reducer REPLACED it with.
  //
  // Which is the property that matters, and the one worth pinning: an edit must
  // produce a NEW array. A reducer that pushed into the shared one would make
  // every control here green while React saw no change and the canvas never
  // re-rendered — the reported symptom, arrived at from the other direction.
  const state = seed();
  assert.notEqual(state.page, PAGE, 'the working view is the seed object itself');
  assert.equal(state.page.sections, PAGE.sections, 'sections is no longer shared at seed time');

  const after = editorReducer(state, {
    type: 'ADD_SECTION', parentPath: ['sections'], index: 1,
    section: { id: 'added', type: 'heading', enabled: true, sortOrder: 9, content: { text: 'x' } },
  });
  assert.notEqual(after.page.sections, PAGE.sections, 'the reducer mutated the seed in place');
  assert.equal(PAGE.sections.length, 1);
});
