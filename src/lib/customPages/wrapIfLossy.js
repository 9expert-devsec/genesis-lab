import { createNodeFromContent, getHTMLFromFragment } from '@tiptap/core';

/**
 * Decides whether an HTML string can pass through a Tiptap schema without
 * losing anything, wrapping it in an opaque `<div data-raw-html>` block when
 * it can't.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * CustomPageForm's editor schema (StarterKit + a fixed set of extensions) has
 * no entry for arbitrary markup — a hand-written `<div class="…" style="…">`
 * wrapper, or nesting the schema doesn't model. ProseMirror discards or
 * reshapes anything outside its vocabulary, and that happens at three sites
 * in CustomPageForm.jsx: the initial `content:` parse on load, `setContent()`
 * coming back from Source HTML mode, and a save made directly from Source
 * HTML mode without the toggle ever being touched. `wrapIfLossy` is the one
 * check all three call before handing HTML to the editor or to `body`, so a
 * page that would otherwise lose content on any of those three paths instead
 * gets it preserved verbatim inside `rawHtmlBlock` (see RawHtmlNode.js).
 *
 * ── WHY "LOST", NOT "CHANGED" ────────────────────────────────────────────────
 * A byte-exact "does the round trip change anything" comparison is too
 * strict: Tiptap's own extensions routinely reshape schema-valid content on
 * an ordinary round trip that loses nothing — the Link extension adds its
 * default `rel`/`target`, StarterKit wraps list-item text in a `<p>`. Both
 * are additions, not loss, and a byte-exact comparison would wrap an entirely
 * ordinary page just for containing a link or a bullet list. `lostContent`
 * instead checks CONTAINMENT — is everything the input had still present in
 * the output — and ignores anything the round trip only adds.
 */

/**
 * A rough content fingerprint of an HTML string: a multiset (counted, not
 * merely present/absent — two `<style>` blocks where only one survives must
 * still be caught) of what it contains — element tag names, attribute
 * name/value pairs, and whitespace-normalised text runs.
 */
function contentMultiset(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  const counts = new Map();
  const bump = (key) => counts.set(key, (counts.get(key) ?? 0) + 1);
  (function walk(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      bump(`tag:${node.tagName.toLowerCase()}`);
      for (const attr of node.attributes) bump(`attr:${attr.name}=${attr.value}`);
      node.childNodes.forEach(walk);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (text) bump(`text:${text}`);
    }
  })(root);
  return counts;
}

/**
 * True iff something present in `inputHtml` is absent, or reduced in count,
 * in `outputHtml` — i.e. the editor's schema round trip LOST something. This
 * checks containment (output ⊇ input), not equality: anything the round trip
 * only ADDS — Link's default `rel`/`target`, the `<p>` StarterKit wraps
 * list-item text in — is not loss and is ignored, which is what keeps an
 * ordinary document (headings, a link, a bullet list, an image) from being
 * wrapped just because the schema normalises it.
 *
 * A value REWRITTEN rather than added or removed (an attribute whose value
 * changed, text reflowed into different text nodes) shows the OLD pair/text
 * as missing from the output — deliberately treated as loss rather than
 * special-cased, because the two ways this check can be wrong are not
 * symmetric: wrapping a page that didn't need it costs WYSIWYG editing on
 * that one page and is reversible from Source HTML mode; failing to wrap one
 * that did destroys the content on the next save. Ambiguous cases lean
 * toward wrapping.
 */
export function lostContent(inputHtml, outputHtml) {
  const input = contentMultiset(inputHtml);
  const output = contentMultiset(outputHtml);
  for (const [key, count] of input) {
    if ((output.get(key) ?? 0) < count) return true;
  }
  return false;
}

/**
 * @param {string} html
 * @param {import('@tiptap/pm/model').Schema} schema The exact schema the
 *   editor this HTML will enter is built from (`editor.schema`) — must
 *   include `rawHtmlBlock` (RawHtmlNode) or a wrapped result will not survive
 *   its own next round trip. Taking the schema rather than an extension list
 *   means this always matches what `editor.getHTML()`/`setContent()` do,
 *   with no separate list to keep in sync with `useEditor()`'s own — see
 *   `getHTMLFromFragment`'s use inside `Editor.prototype.getHTML` in
 *   `@tiptap/core` for the pair this mirrors.
 */
export function wrapIfLossy(html, schema) {
  if (!html) return html;
  const fragment = createNodeFromContent(html, schema, { slice: true });
  const roundTripped = getHTMLFromFragment(fragment, schema);
  if (!lostContent(html, roundTripped)) {
    return html;
  }
  // `=""`, not a bare attribute: RawHtmlNode's own renderHTML sets it via
  // `setAttribute('data-raw-html', '')`, and a real DOM element always
  // serialises an empty-string attribute with `=""`. Writing the bare form
  // here would make wrapIfLossy see its OWN wrapper as having lost that
  // attribute on the very next call and wrap it again — every load adding
  // one more layer.
  return `<div data-raw-html="">${html}</div>`;
}
