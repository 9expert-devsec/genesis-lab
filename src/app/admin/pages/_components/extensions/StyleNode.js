import { Node } from '@tiptap/core';

/**
 * Tiptap node that preserves a `<style>` block through the editor's
 * parse → serialize round-trip.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * Exactly the one IframeNode beside this file was written for, one tag along.
 * StarterKit and the other extensions have NO schema entry for `<style>`, and
 * ProseMirror DISCARDS any element it does not recognise. That happens twice on
 * this screen, and the first one is the damaging one:
 *
 *   1. `useEditor({ content: page.body })` — on LOAD. Merely opening an
 *      Advanced HTML page in the editor drops its `<style>`, before the admin
 *      touches anything. The next save then writes the stripped body back.
 *   2. `toggleSourceMode()` → `editor.commands.setContent(sourceHtml)` — on the
 *      way BACK from embed mode, which is where the admin actually sees it
 *      vanish and is what they reported.
 *
 * The save action stores `body` verbatim (lib/actions/customPages.js), so there
 * was never a sanitiser between the textarea and Mongo. The loss was the
 * editor's own schema, and the stored /yearly-promotion document had already
 * been flattened to Tiptap's vocabulary — h1/h2/p/ul/li/strong/hr/br/a/u and
 * not one `div`, `span` or `style` — before this was investigated.
 *
 * ── WHY THE CSS LIVES IN AN ATTRIBUTE ───────────────────────────────────────
 * `atom: true` with the stylesheet held in `css` rather than as node content.
 * ProseMirror content is a sequence of nodes and marks; CSS is an opaque string
 * that must survive byte-for-byte, and giving it to the schema as text would
 * invite the same normalisation that lost it in the first place.
 *
 * ── THE NODE VIEW DELIBERATELY DOES NOT APPLY THE CSS ───────────────────────
 * `renderHTML` emits a real `<style>`, which is what `getHTML()` serialises for
 * the save; `addNodeView` replaces that with an inert chip on the EDITING
 * surface only. The two are allowed to differ and here they must.
 *
 * A `<style>` element mounted inside the editor is not scoped to it — it is
 * global to the admin document. An author's `body { display: none }`, or any
 * rule broad enough to hit the surrounding chrome, would black out the admin UI
 * that contains the only control able to undo it, with the offending CSS
 * reachable afterwards only through the database. The chip shows that a
 * stylesheet is there, how big it is, and its first rule, which is what an
 * author needs in order to find and select it; the stylesheet itself is read
 * and edited in Source HTML mode, where it is plain text.
 *
 * ── NOT A SECURITY BOUNDARY ─────────────────────────────────────────────────
 * Same posture as IframeNode's docstring: this controls only what the EDITOR
 * keeps. What is safe to serve is decided at render by `sanitizePageHtml`,
 * which drops `<style>` for every caller except the one that opts in. See that
 * module's `allowStyle` note.
 */

/** The stylesheet text, read from and written back to the element itself. */
function cssAttribute() {
  return {
    default: '',
    // `textContent`, not innerHTML: `<style>` is a raw-text element, so its
    // children are never markup and reading it as markup would re-encode
    // `>` and `&` inside selectors and `content:` strings.
    parseHTML: (element) => element.textContent ?? '',
    // Never emitted as an HTML attribute — `renderHTML` below places it as the
    // element's text child instead. Returning {} keeps `css="…"` off the tag.
    renderHTML: () => ({}),
  };
}

export const StyleNode = Node.create({
  name: 'styleBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { css: cssAttribute() };
  },

  parseHTML() {
    return [{ tag: 'style' }];
  },

  /**
   * `['style', {}, css]` — the third member is a TEXT child, so the serializer
   * builds a real `<style>` element containing the stylesheet. Because `<style>`
   * is a raw-text element, `getHTML()` writes that text back unescaped and the
   * CSS survives the round trip character for character.
   */
  renderHTML({ node }) {
    return ['style', {}, node.attrs.css ?? ''];
  },

  addNodeView() {
    return ({ node }) => {
      const css = String(node.attrs.css ?? '');
      // The first non-blank line, as a hint for telling two blocks apart.
      const firstRule = css.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

      const chip = document.createElement('div');
      chip.setAttribute('data-style-node', '');
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
      label.textContent = `CSS (${css.length} ตัวอักษร)`;
      label.style.marginRight = '8px';

      const preview = document.createElement('span');
      preview.style.opacity = '0.75';
      // textContent, never innerHTML — the preview must not become a second
      // way for authored bytes to enter the admin DOM as markup.
      preview.textContent = firstRule.length > 80
        ? `${firstRule.slice(0, 80)}…`
        : firstRule;

      chip.appendChild(label);
      chip.appendChild(preview);
      chip.title = 'บล็อก <style> — แก้ไขได้ในโหมด Source HTML';

      return { dom: chip };
    };
  },
});

export default StyleNode;
