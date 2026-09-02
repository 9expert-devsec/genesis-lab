import { Node } from '@tiptap/core';

/**
 * Tiptap node that holds an opaque blob of HTML the editor's own schema
 * cannot represent, so it survives the parse → serialize round trip
 * byte-for-byte instead of being silently dropped or flattened.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Same family of defect as StyleNode and IframeNode, one tag along: StarterKit
 * and the other extensions have schema entries for a fixed vocabulary
 * (p/h1-h4/ul/li/strong/…), and ProseMirror DISCARDS or FLATTENS anything
 * outside it. A hand-written `<div class="…" style="…">` wrapper, or markup
 * whose nesting the schema does not model, does not survive:
 *
 *   1. `useEditor({ content: page.body })` — on LOAD.
 *   2. `toggleSourceMode()` → `editor.commands.setContent(sourceHtml)` — on the
 *      way back from Source HTML mode.
 *   3. `submit()` while still in source mode — the admin never touches the
 *      toggle, but the schema loss still happens because the NEXT load parses
 *      whatever got saved.
 *
 * This node does not decide WHEN to apply — that is `wrapIfLossy()` in
 * CustomPageForm.jsx, which round-trips a string through this exact schema and
 * only wraps it in `<div data-raw-html>` when the round trip would otherwise
 * change it. This node's job is just to make that wrapper survive once it
 * exists, at all three sites above, in one place.
 *
 * ── WHY THE PAYLOAD IS READ VIA innerHTML, NOT textContent ──────────────────
 * StyleNode reads `<style>` via `element.textContent` because `<style>` is a
 * raw-text element — a browser never parses its children as markup, so
 * `textContent` is exactly the unparsed source and stays unescaped on the way
 * back out. `<div>` has no such special casing: its children are real parsed
 * DOM nodes. Reading them back out as `textContent` would flatten every nested
 * tag to plain text, and writing them back in as a text child (StyleNode's
 * `['style', {}, css]` trick) would HTML-escape `<`, `>` and `&`, corrupting
 * exactly the nested markup this node exists to preserve. So the attribute is
 * read with `element.innerHTML` (real markup in, real markup captured) and
 * `renderHTML` builds and returns an actual DOM element with that string
 * assigned back via `.innerHTML` (real markup out) rather than an array output
 * spec, which has no "raw HTML fragment" primitive.
 *
 * ── THE NODE VIEW DELIBERATELY DOES NOT RENDER THE MARKUP LIVE ──────────────
 * Same posture as StyleNode: `renderHTML` produces the real element that
 * `getHTML()` serialises for the save; `addNodeView` replaces it with an inert
 * chip on the EDITING surface only. Arbitrary admin-authored markup can carry
 * its own `<style>`, `<img onerror>`, or worse, and none of that should run
 * inside the admin's own document just because the page was opened for
 * editing. The chip shows that a raw block is there and how big it is; the
 * markup itself is read and edited in Source HTML mode, where it is plain
 * text.
 *
 * ── NOT A SECURITY BOUNDARY ──────────────────────────────────────────────────
 * Same note as IframeNode and StyleNode: this controls only what the EDITOR
 * keeps. What is safe to serve is decided at render by `sanitizePageHtml`,
 * which strips `<script>`, event-handler attributes, and disallowed URL
 * schemes on every render regardless of what this node preserves.
 */

/** The raw markup, read from and written back to the element's children. */
function htmlAttribute() {
  return {
    default: '',
    // innerHTML, not textContent — see the file-level note on why a <div>'s
    // nested markup must be captured as markup, not flattened to text.
    parseHTML: (element) => element.innerHTML ?? '',
    // Never emitted as an HTML attribute — renderHTML below assigns it as the
    // element's real content instead.
    renderHTML: () => ({}),
  };
}

export const RawHtmlNode = Node.create({
  name: 'rawHtmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { html: htmlAttribute() };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-raw-html]',
        // Above the default (50) so this claims the element before any
        // generic block/paragraph rule can, however the schema evolves.
        priority: 100,
      },
    ];
  },

  /**
   * Returns a real DOM element (a valid DOMOutputSpec) rather than an array
   * spec, because `.innerHTML =` is the only way to place already-serialised
   * markup back into the tree unescaped. `toDOM`/`renderHTML` is not handed
   * the document being serialised into, so this relies on the ambient global
   * `document` — always the real one at runtime, since this editor only ever
   * runs client-side.
   */
  renderHTML({ node }) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-raw-html', '');
    wrapper.innerHTML = node.attrs.html ?? '';
    return wrapper;
  },

  addNodeView() {
    return ({ node }) => {
      const html = String(node.attrs.html ?? '');
      const firstLine = html.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

      const chip = document.createElement('div');
      chip.setAttribute('data-raw-html-node', '');
      chip.style.cssText = [
        'display:block',
        'border:1px dashed #94a3b8',
        'border-radius:6px',
        'background:#f8fafc',
        'color:#334155',
        'padding:6px 10px',
        'margin:8px 0',
        'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
        'cursor:pointer',
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis',
      ].join(';');

      const label = document.createElement('strong');
      label.textContent = `Raw HTML (${html.length} ตัวอักษร)`;
      label.style.marginRight = '8px';

      const preview = document.createElement('span');
      preview.style.opacity = '0.75';
      // textContent, never innerHTML — the preview must not become a second
      // way for authored bytes to enter the admin DOM as markup.
      preview.textContent = firstLine.length > 80
        ? `${firstLine.slice(0, 80)}…`
        : firstLine;

      chip.appendChild(label);
      chip.appendChild(preview);
      chip.title = 'บล็อก HTML ดิบ — แก้ไขได้ในโหมด Source HTML';

      return { dom: chip };
    };
  },
});

export default RawHtmlNode;
