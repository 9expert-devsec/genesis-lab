import { renderTiptap } from '../richText/tiptapToReact';

/**
 * rich_text — renders Tiptap JSON (content.doc) directly to React via the
 * walker (no HTML string, no server-side sanitizer, no jsdom). Server
 * component. Typography comes from the `prose` plugin; links pick up the
 * section accent. The supported node/mark set is documented in the walker.
 */

/**
 * ── ROUND 60: THE SPACING, WHICH WAS NEVER TUNED ──────────────────────────
 * Not a regression — `prose prose-lg` has been this component's whole
 * typography since its first commit (d6aa2eb, 2026-07-22), so nothing made it
 * wrong; it was never set. That is why this ADDS the missing tuning rather than
 * reverting anything.
 *
 * MEASURED in Chrome, because round 23 established only a browser resolves this
 * and JSDOM resolves none of it (scripts/_probe-round60-prose-spacing.mjs):
 *
 *   p             font 18px / line 32px / margin 24px      gap p->p   24px
 *   li            margin 12px                              gap li->li 24px
 *   p inside li   margin 24px  <-- the list defect
 *
 * A reader measures LINE TO LINE, which is line-height plus gap: 32 + 24 = 56px
 * for both paragraphs and bullets. That is the ~60px in the report.
 *
 * ── WHY THE LIST WAS AS LOOSE AS THE PARAGRAPHS ──────────────────────────
 * Tiptap wraps every list item's text in a `<p>`, and @tailwindcss/typography
 * ships two rules for that paragraph:
 *
 *   .prose-lg :where(.prose-lg > ul > li p)            margin 0.8888889em (16px)
 *   .prose-lg :where(.prose-lg > ul > li > p:first-child)  margin-top 1.3333em (24px)
 *   .prose-lg :where(.prose-lg > ul > li > p:last-child)   margin-bottom  "     (24px)
 *
 * The first-child/last-child pair exists to separate the FIRST paragraph of a
 * MULTI-paragraph list item. A Tiptap item has exactly one paragraph, so that
 * paragraph is simultaneously :first-child AND :last-child, both rules fire, and
 * every bullet gets a full paragraph's margin on both sides. `li`'s own 12px
 * never wins because the child's larger margin collapses through it.
 *
 * ── THE VALUES, AND WHY THESE RATHER THAN MERELY SMALLER ─────────────────
 * A paragraph run and a bullet list want DIFFERENT spacing: paragraphs are
 * separate thoughts, list items are one group.
 *
 *   prose-p / prose-ul / prose-ol  my-4 = 16px — half the 32px line, and the
 *       exact value `.article-content p { margin: 0 0 1rem }` already uses for
 *       long-form prose. This surface now matches the article body instead of
 *       being looser than it. Line to line: 32 + 16 = 48px.
 *   prose-li  my-1 = 4px — the article body's `prose-li:my-1`, again. Items sit
 *       closer to each other than paragraphs do, so the list reads as one unit.
 *       Line to line: 32 + 4 = 36px.
 *   [&_li>p]  my-0 — removes the inner paragraph's margins entirely so the gap
 *       between items is the ITEM's, not its content's. Without this the two
 *       typography rules above still win and prose-li:my-1 is invisible.
 *
 * All stock spacing utilities: no minted scale (round 17), no arbitrary value,
 * no hex (round 30). `[&_li>p]` is an arbitrary VARIANT — a selector, not a
 * value — the shape MasterclassDetailClient already uses (`[&_p]:indent-8`). It
 * out-specifies the plugin at (0,1,2) against its `:where()`-wrapped (0,1,0).
 *
 * A class like that can compile to NOTHING and look perfect in the markup —
 * exactly the defect test/fs/tailwindArbitraryValueRules.test.mjs exists for —
 * so it is registered there, compiled from this file, not asserted as a string.
 *
 * ── THE OUTER MARGIN HAS TO BE PUT BACK, AND THE FIRST TRY DROPPED IT ────
 * Typography zeroes the block's own edges with
 * `.prose > :first-child { margin-top: 0 }` and `> :last-child { margin-bottom:
 * 0 }` — so a prose block contributes no margin of its own and the section's
 * spacingTop/spacingBottom presets are the only thing between it and its
 * neighbours. Those rules and `prose-p:my-4` are BOTH (0,1,0), so the utility
 * won on source order and the section silently gained 16px above and below.
 * Measured, not reasoned: first `p` margin-top went 0 -> 16px and the trailing
 * `ul` margin-bottom 0 -> 16px on the first run of this change.
 *
 * The two `[&>*:…]` variants restore it at (0,1,1), above both. They are on the
 * DIRECT children only, which is what typography scoped it to; a descendant
 * form would also zero the first bullet inside the list.
 */
const PROSE =
  'prose prose-lg max-w-none prose-headings:font-heading '
  + 'prose-a:text-[var(--pb-accent-text)] prose-img:rounded-9e-md dark:prose-invert '
  + 'prose-p:my-4 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 [&_li>p]:my-0 '
  + '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0';

export function RichTextSection({ content }) {
  const nodes = renderTiptap(content?.doc);
  if (!nodes) return null;
  return <div className={PROSE}>{nodes}</div>;
}
