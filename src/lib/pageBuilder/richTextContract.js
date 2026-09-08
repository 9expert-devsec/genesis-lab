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
 * Node ATTRIBUTES the walker reads — the THIRD list, and the reason it has to
 * be a list of its own rather than an entry in either of the two above.
 *
 * ── AN ATTRIBUTE IS NOT A NAME, SO THE SCHEMA CHECK IS BLIND TO IT ───────
 * A node and a mark are both NAMES in the ProseMirror schema, which is what
 * makes the verification in this module's header possible: `getSchema` can be
 * asked "does the editor produce a name the walker doesn't render", and it can
 * answer. An ATTRIBUTE has no name of its own in that sense. `TextAlign` adds
 * `textAlign` to `paragraph` and `heading` and contributes NO node and NO mark
 * at all — the schema still reads `paragraph`, the walker's renderer tables
 * still cover exactly RICH_TEXT_NODES and RICH_TEXT_MARKS, and the fail-loudly
 * assertion in tiptapToReact.jsx stays green while alignment is dropped at
 * publish. The author sees a centred paragraph in the editor and a
 * left-aligned one on the page, with no error anywhere.
 *
 * That is exactly the trap RICH_TEXT_EXCLUDED named when it kept `textAlign`
 * out, and it is still true. What changed is that the trap is now CLOSED
 * rather than avoided: the attribute is declared here, the walker reads it, and
 * the check with teeth is a RENDER test — test/render/richTextAlign.test.mjs —
 * which puts `attrs.textAlign` on a document and asserts the class comes out.
 * A schema check structurally cannot do that; a render can.
 *
 * Keyed by node name, so a future attribute on some other node is an entry
 * here rather than a second mechanism somewhere else.
 */
export const RICH_TEXT_NODE_ATTRS = Object.freeze({
  paragraph: Object.freeze(['textAlign']),
  heading: Object.freeze(['textAlign']),
});

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
 *       MOVED, not deleted — it is now in RICH_TEXT_NODE_ATTRS above, and the
 *       reasoning it was excluded FOR is why that list exists. It is NOT a node
 *       or a mark but an ATTRIBUTE on paragraph/heading, so `getSchema` is blind
 *       to it and the walker's contract assertion would have stayed green while
 *       alignment vanished at publish. What changed is that the walker now reads
 *       it and a RENDER test pins that it does — the only instrument that can
 *       see an attribute. Section-level alignment (heading content.align) is
 *       untouched and still owns the whole-section case.
 */
export const RICH_TEXT_EXCLUDED = Object.freeze([
  'table', 'tableRow', 'tableCell', 'tableHeader',
  'codeBlock', 'youtube', 'subscript', 'superscript', 'textStyle', 'color',
]);
