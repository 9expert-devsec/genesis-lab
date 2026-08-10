import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ResizableImage } from '@/lib/editor/resizableImage';

/**
 * The image node view's edit button is OPT-IN, and this is the guard on that.
 *
 * ── THE CONSTRAINT ──────────────────────────────────────────────────────────
 * `src/lib/editor/resizableImage.js` is imported by BOTH admin editors.
 * ArticleForm has an image-properties modal and passes `onEditImage`;
 * CustomPageForm has no modal at all and passes nothing. A button in the pages
 * editor would be a control that does nothing, which is worse than the pages
 * editor as it stands — so the node view must render NO button and NO wrapper
 * when no opener is configured.
 *
 * That coupling is invisible from either call site: someone hardening the node
 * view, or "simplifying" the option away, breaks the pages editor while the
 * articles editor keeps working and every other test stays green. It is the
 * part of this feature most likely to be broken by a future edit, so it is the
 * part that is pinned.
 *
 * ── WHY jsdom, AND WHY IT IS NOW ALLOWED ────────────────────────────────────
 * A node view only exists once a real editor mounts against a real DOM, so
 * neither the pure tier nor a `renderToStaticMarkup` pass can observe it —
 * `renderHTML` is a different code path and is exactly the one that must NOT
 * change.
 *
 * test/render/chatTranscript records a standing rule against building guards on
 * jsdom, because it was an UNDECLARED transitive dependency (via
 * isomorphic-dompurify) — "a package nobody chose". That objection is addressed
 * rather than ignored: jsdom is now a declared devDependency, pinned exactly,
 * so this guard rests on a chosen package. No new code entered the tree; it was
 * already installed.
 *
 * NOT re-tested here: the insert-vs-edit attribute shape, which
 * test/pure/imageModalAttrs already owns.
 */

/** A live editor against a real DOM. Returns the editor and its root element. */
function mount(imageOptions) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // ProseMirror's focus path schedules through rAF, which jsdom does not
  // provide. A synchronous shim is enough — nothing here awaits a frame.
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  const element = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      ResizableImage.configure({ inline: false, allowBase64: false, ...imageOptions }),
    ],
    content: '<p>a</p><img src="/a.jpg" alt="hero" width="320px"><p>b</p>',
  });

  return {
    editor,
    root: editor.view.dom,
    cleanup() {
      editor.destroy();
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.requestAnimationFrame = prev.raf;
    },
  };
}

test('the edit button renders only when an opener is configured', () => {
  // ARTICLES — an opener is supplied, so the affordance exists.
  const withOpener = mount({ onEditImage: () => {} });
  try {
    const btn = withOpener.root.querySelector('button[aria-label="แก้ไขรูปภาพ"]');
    assert.ok(btn, 'the configured editor must render the edit button');

    // Hidden at rest: opacity alone would leave an invisible click target
    // sitting over the image, so pointer-events has to go with it.
    assert.equal(btn.style.opacity, '0', 'hidden at rest');
    assert.equal(btn.style.pointerEvents, 'none', 'and not clickable while hidden');

    // Inside a contentEditable region it must not be editable or draggable.
    assert.equal(btn.getAttribute('contenteditable'), 'false');
    assert.equal(btn.getAttribute('draggable'), 'false');

    // The wrapper exists and positions the button, and the <img> is still its
    // direct child — a node view that reparented or replaced the image would
    // pass a naive "button is present" check while breaking the image.
    const wrap = btn.parentElement;
    assert.equal(wrap.style.position, 'relative', 'the wrapper anchors the button');
    assert.ok(wrap.querySelector(':scope > img'), 'the image is still a direct child');
  } finally {
    withOpener.cleanup();
  }

  // PAGES — no opener, so no button AND no wrapper.
  const noOpener = mount({});
  try {
    assert.equal(
      noOpener.root.querySelector('button'),
      null,
      'an editor with no opener must render no button — CustomPageForm has no modal',
    );
    const img = noOpener.root.querySelector('img');
    assert.ok(img, 'the image still renders');
    assert.equal(
      img.parentElement,
      noOpener.root,
      'and with no wrapper — the img sits directly under the ProseMirror root',
    );
  } finally {
    noOpener.cleanup();
  }
});

test('CONTROL: the absence assertion is discriminating, not vacuous', () => {
  /**
   * Without this, `querySelector('button') === null` would also pass if the
   * node view stopped rendering anything at all, if the selector were
   * misspelled, or if the editor failed to mount. So the same query is fired at
   * the configured editor and must FIND something — the two halves together are
   * what make the pages assertion mean "no button" rather than "no editor".
   */
  const withOpener = mount({ onEditImage: () => {} });
  try {
    assert.ok(
      withOpener.root.querySelector('button'),
      'the very query used for the absence check must match when configured',
    );
    assert.ok(withOpener.root.querySelector('img'), 'and the image renders in both');
  } finally {
    withOpener.cleanup();
  }
});
