import sanitizeHtml from 'sanitize-html';
import { clampDepth, MAX_TOPIC_DEPTH, separateAdjacentParagraphs } from '@/lib/courses/topicHtml';

/**
 * Sanitizer for rich `training_topics` bullets. Its own allow-list, on purpose.
 *
 * ══ WHY NOT src/lib/customPages/sanitizePageHtml.js ═════════════════════════
 *
 * That module is correct for what it guards — a whole custom PAGE body, where
 * `<div>`, `<table>`, `<h1>` and a host-allow-listed `<iframe>` are the point.
 * Every one of those is wrong INSIDE AN `<li>`:
 *
 *   · `<div>` / `<h1>` / `<table>` inside a list item is invalid nesting the
 *     browser silently reflows, and the reflow escapes the list;
 *   · the outline accordion body is a GRID TRACK animating 0fr -> 1fr, with the
 *     content in a `min-h-0 overflow-hidden` grid item. A block box in one
 *     bullet is measured into that track like anything else, so it does not
 *     clip — it simply makes one panel arbitrarily tall, pushing every topic
 *     below it off the screen. (The panel used to carry a `max-h-[800px]`
 *     ceiling, which clipped instead; that was its own defect and is fixed —
 *     see CourseOutline.jsx's header. The tag list is narrow for the layout
 *     reason above either way.)
 *   · `<iframe>` in an outline bullet is not a feature anyone asked for, and
 *     the page sanitizer's 11-host allow-list is a surface this field has no
 *     reason to carry.
 *
 * Reusing that config would also couple two unrelated blast radii: a relaxation
 * made for custom pages would silently widen what an outline bullet may hold.
 * One allow-list per surface, each as small as its surface needs.
 *
 * ══ ORDER: SANITISE FIRST, THEN CLAMP ══════════════════════════════════════
 *
 * Clamping LAST means the cap is enforced on the bytes actually returned,
 * whatever the sanitizer did to the tree on the way. That is the reason to
 * prefer this order.
 *
 * ── AND THE HONEST LIMIT OF THAT CLAIM, BECAUSE A CONTROL MEASURED IT ───────
 * An earlier draft of this header asserted the order was load-bearing because
 * "sanitisation changes nesting depth". SWAPPING THE TWO CALLS REDDENS NOTHING,
 * and the reason is not a weak test — it is that the two orders are currently
 * EQUIVALENT. Measured on div-wrapped, ol-nested and plain four-level fixtures:
 * byte-identical output either way.
 *
 * Why they are equivalent: `transformTags` below maps `ol` → `ul`, so this
 * config never DESTROYS a list element, and list depth is therefore invariant
 * across sanitisation. A disallowed wrapper like `<div>` is unwrapped, but a
 * `<div>` was never counted as a level.
 *
 * That equivalence is a property of THIS CONFIG, not a law, and it is exactly
 * the "two mechanisms covering one rule" shape test/run.mjs warns about. If
 * `ol` were ever merely disallowed rather than converted, sanitisation would
 * unwrap it, a level would vanish, and the order would start to matter. The
 * invariant that keeps the two safely interchangeable — no list element is
 * destroyed — is pinned by a test rather than left to this comment.
 *
 * ── `<ol>` IS CONVERTED, NOT DROPPED ────────────────────────────────────────
 * This round is bullet lists only. `transformTags` maps `ol` → `ul` rather than
 * leaving it disallowed, because the alternative is measurably worse: with `ol`
 * simply absent from the allow-list, sanitize-html unwraps it and orphans its
 * `<li>` children into malformed nesting (above), turning a pasted numbered
 * list into a mangled run. Converting keeps the admin's structure and still
 * emits no `<ol>`.
 *
 * ── FAILS CLOSED ────────────────────────────────────────────────────────────
 * Returns '' on any throw, matching sanitizePageHtml's posture: never emit
 * unsanitised HTML. '' is safe here in a way it is not for a page body, because
 * the rich copy is only ever an OVERLAY — the plain MSDB projection is what
 * renders when there is no usable HTML.
 */

/**
 * The complete tag allow-list. Inline marks, links, line breaks, and the two
 * list tags. Nothing that opens a block box.
 *
 * `ol` is absent DELIBERATELY and is not an oversight — transformTags below
 * rewrites it to `ul` before this list is consulted.
 */
export const ALLOWED_TOPIC_TAGS = Object.freeze([
  'ul', 'li', 'strong', 'em', 'u', 's', 'sup', 'sub', 'code', 'br', 'span', 'a',
]);

/**
 * Only colour and font-size, and only on `<span>`.
 *
 * AN UNRESTRICTED `style` IS A LAYOUT HOLE, NOT A COSMETIC ONE. `position:
 * fixed`, `width: 9999px` or `display: block` in a bullet escapes the accordion
 * body the same way a `<div>` would, which is the entire reason `<div>` is not
 * in the tag list. Allowing the attribute while filtering nothing would hand
 * back the hole the tag list just closed.
 *
 * Colour is hex or rgb()/rgba() — what a `<input type="color">` picker emits
 * (the pattern ArticleForm's ColorPicker already follows). Named colours are
 * not accepted: the set is large, partly browser-specific, and nothing in the
 * editor produces one.
 */
const TOPIC_STYLES = {
  span: {
    color: [
      /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i,
    ],
    'font-size': [/^\d{1,3}(?:\.\d+)?(?:px|pt|em|rem|%)$/],
  },
};

/**
 * The only URL schemes a bullet may link to.
 *
 * SET EXPLICITLY: sanitize-html's default is
 * ['http','https','ftp','mailto','tel'] — verified against 2.17.5 — so relying
 * on the default would silently admit `ftp://` and `tel:` into a course
 * outline.
 *
 * ONE CONSTANT, USED TWICE, DELIBERATELY. It is assigned both globally and
 * per-tag below, and a control measured that DELETING THE GLOBAL ONE REDDENS
 * NOTHING: `a[href]` is the only URL-bearing attribute on the whole allow-list
 * (no img, no iframe), and `allowedSchemesByTag` wins for it. So the global
 * assignment is unobservable TODAY and is defence for a tag that does not exist
 * yet. Naming that here rather than manufacturing a test for it, and
 * single-sourcing the value so the two cannot drift apart — which is the part
 * a test CAN see.
 */
export const ALLOWED_TOPIC_SCHEMES = Object.freeze(['http', 'https', 'mailto']);

const SANITIZE_CONFIG = {
  allowedTags: [...ALLOWED_TOPIC_TAGS],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['style'],
  },
  allowedStyles: TOPIC_STYLES,
  allowedSchemes: [...ALLOWED_TOPIC_SCHEMES],
  allowedSchemesByTag: { a: [...ALLOWED_TOPIC_SCHEMES] },
  /* A link with no usable href sanitises down to a bare `<a>` wrapping its
   * text. Harmless, and the text survives — which is the priority everywhere in
   * this pipeline — so it is left rather than dropped. */
  transformTags: { ol: 'ul' },
  /* No `nonTextTags` override: the defaults (style, script, textarea, option)
   * drop CONTENT as well as tag, which is right for those four and is the only
   * place in this config where text is deliberately not preserved. */
};

/**
 * Clean one row's rich bullet HTML, then enforce the nesting cap.
 *
 * Runs at RENDER time as well as at save time. The store is not a trust
 * boundary — the same rule sanitizePageHtml states and the same reason: a value
 * cleaned at save is a value cleaned by whatever the rules were on the day it
 * was saved.
 *
 * ══ separateAdjacentParagraphs RUNS FIRST, BEFORE THE UNWRAP THAT WOULD HIDE
 * THE BOUNDARY IT NEEDS TO SEE ═══════════════════════════════════════════════
 * `<p>` is not in `ALLOWED_TOPIC_TAGS`, so `sanitizeHtml` below UNWRAPS every
 * one of them — keeps the text, drops the tag. Two sibling `<p>`s would glue
 * into one word-boundary-free string with nothing between them if that ran
 * first. See `separateAdjacentParagraphs`'s own header (topicHtml.js) for why
 * this protection lives here rather than in the editor's content schema.
 */
export function sanitizeTopicHtml(html, { maxDepth = MAX_TOPIC_DEPTH } = {}) {
  if (!html) return '';
  try {
    const clean = sanitizeHtml(separateAdjacentParagraphs(String(html)), SANITIZE_CONFIG);
    return clampDepth(clean, maxDepth);
  } catch {
    return '';
  }
}
