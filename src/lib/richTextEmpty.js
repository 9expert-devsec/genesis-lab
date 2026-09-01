/**
 * Is a Tiptap-authored HTML string EMPTY, for purposes of "should a fallback
 * render instead"?
 *
 * ── WHY THIS EXISTS AS ITS OWN MODULE ────────────────────────────────────────
 * `docs/audit/unsanitized-html-render-sites.md` §2.2 measured this rather than
 * assuming it: the repo already had THREE separate, ad hoc, non-shared
 * implementations (ArticleForm.jsx, CustomPageForm.jsx, and a third regex in
 * page.jsx's reading-time estimate), none of which handled Tiptap's actual
 * "nothing typed" output robustly — a paragraph containing only a `<br>` (what
 * StarterKit emits for an empty line, distinct from a bare `<p></p>`) slipped
 * past the `<p>\s*<\/p>` pattern the first two share. This is the first of the
 * four call sites to need a real answer rather than a regex that happened to
 * work for one editor's output, so it is written once, correctly, here.
 *
 * ── STRIP EVERY TAG, THEN LOOK FOR TEXT — NOT A LIST OF "EMPTY SHAPES" ───────
 * A pattern-per-empty-shape (`<p></p>`, `<p><br></p>`, `<p><br/></p>`, …) is a
 * list that is only ever as complete as the last editor output it was checked
 * against, and StarterKit's exact empty-paragraph markup is not a stable
 * contract this module should depend on. Stripping every tag and testing what
 * text remains answers the actual question — "did the admin type anything" —
 * for ANY markup shape, including ones no editor in this repo emits today.
 *
 * ── THIS IS ABOUT TEXT, NOT ABOUT CONTENT ────────────────────────────────────
 * An image-only or table-only body (no prose, real embedded content) reads as
 * EMPTY by this definition, because stripping tags leaves no text behind. That
 * is not a bug in this module — it is the definition the caller was given:
 * "markup with no text content" falls back to the teaser. A caller for whom a
 * text-only image caption is not "having content" needs a different check, not
 * a change to this one.
 */

/**
 * @param {string|null|undefined} html
 * @returns {boolean}
 */
export function isEmptyRichHtml(html) {
  if (!html) return true;
  const text = String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .trim();
  return text.length === 0;
}
