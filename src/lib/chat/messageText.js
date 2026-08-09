// src/lib/chat/messageText.js
//
// ── THIS IS A BULLET GLYPH SUBSTITUTION. IT IS NOT A MARKDOWN RENDERER. ──────
//
// Read that line before adding anything to this file.
//
// It swaps one character at the start of a line. It does not parse, it does not
// build a tree, it does not emit HTML, and it never touches
// dangerouslySetInnerHTML. Its output is plain text that React escapes like any
// other string, so it adds NO XSS surface — which is the entire reason it is
// allowed to exist while a markdown library is not.
//
// If someone wants **bold**, or links, or headings, or ordered lists: that is a
// DIFFERENT decision with a different risk profile, because every one of those
// needs real parsing and produces real markup from a string we do not control.
// This function is not the precedent for it and must not be cited as one. The
// answer there is a deliberately scoped allow-listed renderer, decided on its
// own terms — not another case bolted on here.
//
// ── WHY IT EARNS ITS PLACE AT ALL ───────────────────────────────────────────
// Measured on a real reply: the upstream emits markdown bullets as `*` followed
// by three spaces at the start of a line, with nested items indented four more.
// Rendered literally on a Thai marketing site, a column of asterisks reads as a
// broken system rather than as a list. One character fixes that. Nothing else
// in the observed payload needs fixing: zero inline `**bold**`, zero `1.`
// ordered lists, zero headings.

/**
 * Replace a leading markdown bullet marker with a bullet glyph.
 *
 * ONLY `*` at the start of a line, after optional leading whitespace, and only
 * when followed by whitespace. Everything else is returned untouched:
 *
 *   "*   Course A"        → "•   Course A"     (top level)
 *   "    *   detail"      → "    •   detail"   (indent preserved — it is the
 *                                               only thing marking the nesting)
 *   "2 * 3 = 6"           → unchanged          (not at a line start)
 *   "**bold**"            → unchanged          (no space after the marker)
 *   "*emphasis*"          → unchanged          (same reason)
 *
 * The `(?=\s)` is what separates a bullet from emphasis: a markdown bullet
 * requires whitespace after the marker, `*bold*` does not have it. Without that
 * lookahead this would turn `*emphasis*` into `•emphasis*`, which is worse than
 * leaving it alone.
 */
export function toBulletGlyphs(text) {
  return String(text ?? '').replace(/^([ \t]*)\*(?=\s)/gm, '$1•');
}
