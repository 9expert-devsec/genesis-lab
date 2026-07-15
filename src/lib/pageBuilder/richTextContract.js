/**
 * The rich-text node/mark contract, as DATA.
 *
 * Two sides must agree and they live in different worlds: the server walker
 * (components/pageBuilder/richText/tiptapToReact.jsx) renders a Tiptap doc, and
 * the editor's Tiptap extensions (components/pageBuilder/editor/richText/
 * tiptapExtensions.js) produce one. The walker's renderer tables have always
 * BEEN the contract — but only as prose in a comment, which nothing can check.
 *
 * So the names live here, in a pure module both sides import and a plain Node
 * script can read:
 *
 *   - the walker asserts at module load that its renderer tables cover exactly
 *     this set (same fail-loudly pattern as presets.js), so the contract can't
 *     drift from the thing that implements it;
 *   - the editor builds its extension list to produce exactly this set, and is
 *     verified against the ProseMirror schema those extensions generate.
 *
 * ── Why the direction matters ────────────────────────────────────────────
 * The dangerous question is NOT "can the walker render what Tiptap produces" —
 * it is "can Tiptap produce something the walker doesn't handle". Only the
 * second finds the gap, because the walker never errors on one: an unknown
 * BLOCK node is unwrapped into a <span> so its text survives, and an unknown
 * MARK is dropped while its text survives. A table would publish as a run of
 * naked text; a code block as an unformatted line. The author sees a correct
 * editor and a quietly wrong page — no warning in production, nothing to
 * notice until someone reads the live page.
 *
 * Adding a node/mark is additive: add it here, add its renderer, add its
 * extension. All three, or the assertions fail.
 */

/** Nodes the walker renders. `text` is handled inline (marks), not by a table. */
export const RICH_TEXT_NODES = Object.freeze([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'horizontalRule',
  'hardBreak',
  'image',
]);

/** Marks the walker applies. `link` is handled outside MARK_WRAPPERS (outermost). */
export const RICH_TEXT_MARKS = Object.freeze([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
]);

/**
 * Deliberately absent, with the reason — so a future reader knows these were
 * decided, not forgotten:
 *
 *   table / tableRow / tableCell / tableHeader
 *       requirement §8 "ถ้าจำเป็น" — not implemented. The walker is structured
 *       so it can be added without touching the walk itself.
 *   codeBlock
 *       StarterKit ships it ON by default; the walker has no renderer, so it
 *       must be switched OFF or a code block publishes as unformatted text.
 *   youtube
 *       an embed is an `embed` SECTION's job, not an inline rich-text node.
 *   subscript / superscript / textStyle / color
 *       no walker support; textStyle+color would also be a raw-hex route into
 *       the page, which MANIFESTO §7 forbids.
 *   textAlign
 *       NOT a node or a mark — an ATTRIBUTE on paragraph/heading. The walker
 *       reads neither, so alignment would be silently lost on publish. Section
 *       -level alignment already exists where it belongs (heading content.align).
 */
export const RICH_TEXT_EXCLUDED = Object.freeze([
  'table', 'tableRow', 'tableCell', 'tableHeader',
  'codeBlock', 'youtube', 'subscript', 'superscript', 'textStyle', 'color', 'textAlign',
]);
