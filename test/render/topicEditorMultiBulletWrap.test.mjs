import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import ListItem from '@tiptap/extension-list-item';
import { topicEditorExtensions } from '@/components/admin/topicEditorExtensions';

/**
 * BUG: selecting several paragraphs and pressing the bullet-list button
 * converted only the FIRST one — reported with a DOM dump: before
 * `<p>asdasdasdasda</p><p>sdas</p><p>dasdasdda</p>`, after
 * `<ul><li><p>asdasdasdasda</p></li></ul><p>sdas</p><p>dasdasdda</p>`.
 *
 * ── THE MECHANISM, MEASURED NOT INFERRED ────────────────────────────────────
 * `TopicListItem`'s content spec used to be `paragraph bulletList*` — exactly
 * ONE required paragraph. ProseMirror's multi-block wrap
 * (`doWrapInList`, prosemirror-schema-list) wraps the WHOLE selected range in
 * one `<li>` first, then SPLITS it back apart at each paragraph boundary —
 * and a split only succeeds when every resulting fragment independently
 * satisfies the content expression. A one-paragraph-only spec can never
 * validate a remainder holding 2+ paragraphs, so the split (and, because the
 * initial wrap needs the same validity, the WHOLE command) failed —
 * SILENTLY: `toggleBulletList()` returned `false` and changed nothing for a
 * 2- or 3-paragraph selection, confirmed directly against the real extension
 * set before this fix; a 1-paragraph selection worked, which is why the
 * user's exact reported shape is reproduced byte-for-byte by confining the
 * selection to paragraph 1 alone (see the CONTROL below).
 *
 * ── WHY jsdom ─────────────────────────────────────────────────────────────
 * This is ProseMirror command-engine behaviour — pure JS over a document
 * model — not browser rendering or native DOM Selection semantics, so it
 * runs identically in jsdom. Precedent: test/render/imageNodeViewButton.
 * test.mjs's `mount()`, whose shape this copies.
 */

function mount(extensions, content) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const prev = { window: globalThis.window, document: globalThis.document, raf: globalThis.requestAnimationFrame };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  const element = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(element);
  const editor = new Editor({ element, extensions, content });

  return {
    editor,
    cleanup() {
      editor.destroy();
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.requestAnimationFrame = prev.raf;
    },
  };
}

const THREE_PARAS = '<p>asdasdasdasda</p><p>sdas</p><p>dasdasdda</p>';

test('selecting three paragraphs and toggling bullets wraps ALL THREE', () => {
  const { editor, cleanup } = mount(topicEditorExtensions(), THREE_PARAS);
  try {
    editor.commands.selectAll();
    const ok = editor.chain().focus().toggleBulletList().run();
    assert.equal(ok, true, 'toggleBulletList() must succeed for a real multi-paragraph selection');

    const html = editor.getHTML();
    const liCount = (html.match(/<li>/g) || []).length;
    assert.equal(liCount, 3, `expected 3 <li> elements, got ${liCount}: ${html}`);
    assert.equal(
      html,
      '<ul><li><p>asdasdasdasda</p></li><li><p>sdas</p></li><li><p>dasdasdda</p></li></ul>',
      'every paragraph must become its own list item, not one item holding all three',
    );
  } finally {
    cleanup();
  }
});

test('CONTROL: this reddens against the OLD single-paragraph content spec', () => {
  /**
   * An independent reimplementation of the extension the report was filed
   * against — not imported from source, so this control cannot be defeated
   * by the fix itself changing what it compares against. Proves the test
   * above is discriminating: it fails exactly the way the bug report
   * described, on the exact schema the report was filed against.
   */
  const OldTopicListItem = ListItem.extend({ content: 'paragraph bulletList*' });
  const oldExtensions = topicEditorExtensions().map((ext) => (ext.name === 'listItem' ? OldTopicListItem : ext));

  const { editor, cleanup } = mount(oldExtensions, THREE_PARAS);
  try {
    editor.commands.selectAll();
    const ok = editor.chain().focus().toggleBulletList().run();
    assert.equal(ok, false, 'the old spec must fail the multi-paragraph wrap entirely');
    assert.equal(editor.getHTML(), THREE_PARAS, 'the old spec must change nothing at all');
  } finally {
    cleanup();
  }
});

test('CONTROL: the exact reported "after" HTML is what a selection confined to paragraph 1 produces', () => {
  // Not proof of what the admin clicked — proof that the reported shape is
  // fully explained by a single-paragraph range reaching the OLD command,
  // which is the one operation the old spec never broke.
  const OldTopicListItem = ListItem.extend({ content: 'paragraph bulletList*' });
  const oldExtensions = topicEditorExtensions().map((ext) => (ext.name === 'listItem' ? OldTopicListItem : ext));
  const { editor, cleanup } = mount(oldExtensions, THREE_PARAS);
  try {
    editor.commands.setTextSelection({ from: 1, to: 13 }); // inside paragraph 1 only
    editor.chain().focus().toggleBulletList().run();
    assert.equal(
      editor.getHTML(),
      '<ul><li><p>asdasdasdasda</p></li></ul><p>sdas</p><p>dasdasdda</p>',
      'this must match the reported DOM dump exactly',
    );
  } finally {
    cleanup();
  }
});

test('a single paragraph selected still produces exactly one <li>', () => {
  const { editor, cleanup } = mount(topicEditorExtensions(), '<p>only one line</p>');
  try {
    editor.commands.selectAll();
    const ok = editor.chain().focus().toggleBulletList().run();
    assert.equal(ok, true);
    assert.equal(editor.getHTML(), '<ul><li><p>only one line</p></li></ul>');
  } finally {
    cleanup();
  }
});

test('toggling bullets OFF restores a plain paragraph', () => {
  // A cursor inside ONE item, not a selection spanning several — lifting a
  // MULTI-item selection back to plain paragraphs is a pre-existing
  // limitation this editor shares byte-for-byte with CourseBodyEditor's
  // stock ListItem (measured: `toggleBulletList()` on a 3-item selection
  // returns `true` but changes nothing in EITHER editor), so it is not this
  // fix's concern and not what "the inverse still works" means here.
  const { editor, cleanup } = mount(topicEditorExtensions(), '<ul><li><p>a bullet</p></li></ul>');
  try {
    editor.commands.setTextSelection(3); // cursor inside the one <li>
    const ok = editor.chain().focus().toggleBulletList().run();
    assert.equal(ok, true);
    assert.equal(editor.getHTML(), '<p>a bullet</p>', 'toggling off one bullet must restore a plain paragraph');
  } finally {
    cleanup();
  }
});

test('pressing Enter inside a bullet still creates a sibling <li>, not a second paragraph in one item', () => {
  // The everyday authoring path, unaffected by widening the content spec —
  // splitListItem is a dedicated command that never places two paragraphs in
  // one item to begin with.
  const { editor, cleanup } = mount(topicEditorExtensions(), '<ul><li><p>first bullet</p></li></ul>');
  try {
    const endPos = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(endPos);
    const ok = editor.commands.splitListItem('listItem');
    editor.commands.insertContent('second bullet');
    assert.equal(ok, true);
    assert.equal(
      editor.getHTML(),
      '<ul><li><p>first bullet</p></li><li><p>second bullet</p></li></ul>',
      'Enter inside a bullet must create a new <li>, not glue a second paragraph into the same one',
    );
  } finally {
    cleanup();
  }
});
