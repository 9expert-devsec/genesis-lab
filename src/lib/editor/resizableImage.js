import Image from '@tiptap/extension-image';
import { NodeSelection } from '@tiptap/pm/state';

/**
 * The Tiptap image node used by BOTH admin editors.
 *
 * ── IT DOES NOT RESIZE ANYTHING ─────────────────────────────────────────────
 * The name is misleading and is kept only because renaming it would touch both
 * call sites and any stored-HTML expectations. There are NO drag handles, no
 * node view, no pointer logic — do not go looking for them. What this extension
 * actually does is add three attributes to the stock `@tiptap/extension-image`
 * node — `width`, `alt` and `style` — so that they SURVIVE A SAVE/RELOAD ROUND
 * TRIP. Stock Image parses and emits `src`/`alt`/`title` only, so a width an
 * admin set was silently dropped the next time the document was loaded.
 *
 * Each attribute therefore needs both halves: `renderHTML` to write it into the
 * saved markup and `parseHTML` to read it back out again. Losing either one
 * reintroduces the drop, and it fails quietly — the editor looks right until
 * the page is reloaded.
 *
 * ── ONE COPY, TWO EDITORS ───────────────────────────────────────────────────
 * Extracted from ArticleForm.jsx and CustomPageForm.jsx, which each carried a
 * byte-identical private copy (verified with `cmp` before merging, not by
 * reading). Two copies of a schema definition is how two editors start
 * disagreeing about what an image is, which then shows up as attributes lost on
 * whichever screen was edited second.
 *
 * Lives in `src/lib/` rather than `src/components/` because it is a schema
 * definition with no JSX — the same reason src/lib/address and src/lib/schedule
 * sit there.
 *
 * ── A KNOWN COLLISION, MEASURED AND DELIBERATELY NOT FIXED HERE ─────────────
 * `width.renderHTML` emits BOTH `width` and `style:'width:X'`, while
 * `style.renderHTML` emits `style` too. When both attributes are set the two
 * `style` keys collide in `mergeAttributes` and one silently wins. The parse
 * side can populate both from a single source, because `width.parseHTML` falls
 * back to `el.style.width` while `style.parseHTML` takes the whole attribute.
 *
 * Left exactly as it was found. Changing the attribute definitions would move
 * already-published articles, so the fix is gated on a count of how many
 * documents actually carry both — see the report for that round. Do not "tidy"
 * this without that number in hand.
 */
/**
 * The image attributes the properties modal applies, for each of its two modes.
 * Pure, so the one rule that differs can be checked without mounting an editor.
 *
 * ── THE TWO MODES DIFFER IN EXACTLY ONE FIELD: `src` ────────────────────────
 * INSERT builds a new node with `setImage` and must supply the source. EDIT
 * merges over an existing node with `updateAttributes` and must NOT: the
 * modal's URL box is read-only because replacing an image's source is a
 * different feature, and sending `src` from a modal whose state was captured on
 * open is how a stale value overwrites the node's real one.
 *
 * `alt` and `width` are handled identically in both modes — an empty box sends
 * `undefined`, which ProseMirror resolves to that attribute's schema default.
 *
 * ── A CLEARED FIELD REALLY DOES CLEAR, AND THAT WAS MEASURED ────────────────
 * It is natural to assume `updateAttributes` ignores `undefined` the way a
 * hand-rolled merge would, which would mean an admin blanking the width box
 * sees nothing happen. THAT IS NOT WHAT HAPPENS HERE, and it was checked by
 * running it rather than by reading:
 *
 *   @tiptap/core 2.27.2 builds the patch as `{ ...node.attrs, ...attributes }`
 *   (a plain spread, so `undefined` DOES overwrite), and prosemirror-model's
 *   `computeAttrs` then replaces an `undefined` value with the attribute's
 *   declared default. `width`'s default is `null`, so a cleared box lands the
 *   node at `width: null` and the rendered tag loses both `width` and `style`.
 *
 * Verified both spellings on a live editor: `{ width: undefined }` and
 * `{ width: null }` produce the SAME resulting attributes and the same HTML.
 * `undefined` is used because it keeps insert and edit on one shape and matches
 * what the insert path has always sent.
 *
 * @param {{mode: 'insert'|'edit', src?: string, alt?: string, width?: string}} p
 * @returns {object} attributes ready for `setImage` / `updateAttributes`
 */
export function imageModalAttrs({ mode, src, alt, width }) {
  const a = (alt ?? '').trim();
  const w = (width ?? '').trim();
  const shared = { alt: a || undefined, width: w || undefined };

  return mode === 'edit' ? shared : { src, ...shared };
}

/** The pencil, inline so the extension pulls in no icon dependency. */
const PENCIL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
  '<path d="m15 5 4 4"/></svg>';

export const ResizableImage = Image.extend({
  /**
   * `onEditImage` is OPTIONAL, and that is the whole wiring decision.
   *
   * This extension is shared by ArticleForm (which has an image-properties
   * modal) and CustomPageForm (which has none). The edit button is therefore
   * opt-in: an editor that supplies no opener gets NO button and no wrapper —
   * the node view falls back to a bare `<img>`, byte-for-byte the DOM
   * ProseMirror would have produced on its own. A pages editor that grew a
   * button doing nothing would be worse than the pages editor as it stands.
   *
   * @type {{ onEditImage: null | ((attrs: object, getPos: () => number) => void) }}
   */
  addOptions() {
    return {
      ...this.parent?.(),
      onEditImage: null,
    };
  },

  /**
   * A VISIBLE way to reach the image-properties modal.
   *
   * `handleDoubleClickOn` already opens it, but nothing on screen said so —
   * an admin had no way to learn the interaction exists. This adds the
   * affordance; the double-click stays, because two routes in is right here:
   * one discoverable, one fast.
   *
   * PLAIN DOM, not ReactNodeViewRenderer. This module lives in src/lib/
   * precisely because it carries no JSX, and one button does not need React
   * reconciliation running inside ProseMirror.
   *
   * ── WHEN THE BUTTON IS VISIBLE ──────────────────────────────────────────
   * Hover OR selection OR keyboard focus. Hover alone would be wrong twice
   * over: it does not exist on touch, and a keyboard user never fires it.
   * Selection covers click, tab-through and tablet in one rule; the focus flag
   * keeps the button from vanishing under its own keyboard focus.
   *
   * Hidden means `opacity:0` PLUS `pointer-events:none` — opacity alone would
   * leave an invisible but clickable target sitting over the image.
   *
   * ── NO contentDOM ───────────────────────────────────────────────────────
   * An image is an atom: it has no editable children. Supplying a contentDOM
   * would invite ProseMirror to place text inside the image node.
   */
  addNodeView() {
    const onEditImage = this.options.onEditImage;

    return ({ editor, node, getPos, HTMLAttributes }) => {
      const img = document.createElement('img');
      for (const [k, v] of Object.entries(HTMLAttributes ?? {})) {
        if (v !== null && v !== undefined) img.setAttribute(k, String(v));
      }

      // NO OPENER -> NO WRAPPER, NO BUTTON. Same DOM ProseMirror would build.
      if (typeof onEditImage !== 'function') {
        return { dom: img, ignoreMutation: () => true };
      }

      const wrap = document.createElement('div');
      // `display:inline-block` keeps the image in the flow exactly as it was:
      // `.article-content img` sets no display, so an image is an inline
      // replaced element today, and an inline-block wrapper preserves that.
      // `max-width:100%` so the wrapper cannot outgrow the column when the
      // image carries an explicit width. `position:relative` is what lets the
      // button sit over the image.
      wrap.style.cssText = 'position:relative;display:inline-block;max-width:100%';
      wrap.appendChild(img);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = PENCIL_SVG;
      btn.setAttribute('aria-label', 'แก้ไขรูปภาพ');
      btn.setAttribute('title', 'แก้ไขรูปภาพ');
      // Inside the editable area: it must not be editable, must not be a drag
      // source, and must not become a drop target. ProseMirror marks the node
      // view's own DOM `draggable="true"`, so the button opts out explicitly.
      //
      // setAttribute, not the `.contentEditable` property: the property alone
      // does not reflect into the attribute in every DOM implementation, and
      // the attribute is what both ProseMirror and the test can see.
      btn.setAttribute('contenteditable', 'false');
      btn.draggable = false;
      // Property-by-property rather than one `cssText` string. A single
      // declaration a parser dislikes takes the WHOLE string down with it when
      // assigned via cssText — which is exactly what happened here first time
      // round, leaving the button unpositioned and, worse, visible by default.
      Object.assign(btn.style, {
        position: 'absolute',
        top: '8px',
        right: '8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        border: '1px solid rgba(13,27,42,0.12)',
        background: 'rgba(255,255,255,0.92)',
        color: '#0D1B2A',
        cursor: 'pointer',
        zIndex: '1',
        transition: 'opacity 150ms ease',
      });
      wrap.appendChild(btn);

      let hovered = false;
      let selected = false;
      let focused = false;
      const sync = () => {
        const on = hovered || selected || focused;
        btn.style.opacity = on ? '1' : '0';
        btn.style.pointerEvents = on ? 'auto' : 'none';
      };

      // Establish the hidden state explicitly rather than leaning on the
      // initial style declaration — see the note above about cssText.
      sync();

      wrap.addEventListener('mouseenter', () => { hovered = true; sync(); });
      wrap.addEventListener('mouseleave', () => { hovered = false; sync(); });
      btn.addEventListener('focus', () => { focused = true; sync(); });
      btn.addEventListener('blur', () => { focused = false; sync(); });

      // `mousedown` is where ProseMirror starts a selection/drag, so it is
      // swallowed here as well as the click — otherwise pressing the button
      // would move the cursor before the click ever lands.
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // SELECT THE NODE FIRST. The modal's confirm runs
        // `updateAttributes('image', …)`, which applies to the current
        // selection — and a click on this button deliberately does not move
        // it (see stopEvent). Selecting here rather than in the caller keeps
        // the rule with the code that knows the position, and keeps every
        // consumer from having to remember it.
        try {
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (editor && typeof pos === 'number') {
            const { view } = editor;
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)),
            );
          }
        } catch {
          // A stale getPos (node already removed) must not stop the modal from
          // opening; it just means there is nothing to select.
        }
        onEditImage({ ...node.attrs });
      });

      return {
        dom: wrap,

        /**
         * ONLY events inside the button are swallowed.
         *
         * `stopEvent` returning true tells ProseMirror "this one is mine".
         * Scoping it to `btn.contains(target)` is what keeps BOTH halves
         * working: the button reliably receives its own click and never starts
         * a text selection, while every event on the image itself still
         * reaches ProseMirror — so clicking selects the node, double-click
         * still opens the modal via handleDoubleClickOn, drag still drags, and
         * Backspace on a selected image still deletes it.
         *
         * Returning true unconditionally is the tempting shortcut and it
         * breaks node selection outright.
         */
        stopEvent: (event) => btn.contains(event.target),

        /**
         * The wrapper and button are OURS, not ProseMirror's document. Without
         * this, toggling the button's inline styles reads to PM's
         * MutationObserver as an edit to the node and provokes a re-parse.
         * Safe here because there is no contentDOM to keep in sync.
         */
        ignoreMutation: () => true,

        selectNode: () => { selected = true; sync(); },
        deselectNode: () => { selected = false; sync(); },

        /**
         * Rebuild rather than patch. Returning false makes ProseMirror discard
         * this node view and construct a fresh one with newly-rendered
         * HTMLAttributes, which is exactly what should happen when the modal
         * changes a width — and it keeps this file from having to re-implement
         * attribute rendering a second time.
         */
        update: () => false,
      };
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) =>
          attrs.width ? { width: attrs.width, style: `width:${attrs.width}` } : {},
        parseHTML: (el) => el.getAttribute('width') || el.style.width || null,
      },
      alt: {
        default: '',
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {}),
        parseHTML: (el) => el.getAttribute('alt') || '',
      },
      style: {
        default: null,
        renderHTML: (attrs) => (attrs.style ? { style: attrs.style } : {}),
        parseHTML: (el) => el.getAttribute('style') || null,
      },
    };
  },
});
