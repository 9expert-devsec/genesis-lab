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
/**
 * ── ROUND 65: THE BODY SCALE — 16px DESKTOP, 14px MOBILE ──────────────────
 *
 * `prose-lg` was this component's size from its first commit and was never
 * chosen: round 60 measured it at 18px/32px at EVERY viewport and left the
 * scale alone on purpose, because that round was spacing. The author has now
 * asked for 16 and 14, so `prose-sm md:prose-base` replaces it.
 *
 * Stock modifiers, no minted scale (round 17), no arbitrary value: `sm`, `base`
 * and `lg` are three of the five sizes @tailwindcss/typography registers, and
 * this only stops using the largest.
 *
 * ── WHY `md:` (768px) AND NOT `sm:` OR `lg:` ──────────────────────────────
 * Not a taste call — the repo already defines its three viewports, in the
 * editor's own device preview:
 *
 *   CanvasPanel.VIEWPORT_WIDTH = { desktop: null, tablet: 768, mobile: 390 }
 *
 * `md` is `768px` in tailwind.config.js, which is EXACTLY the tablet width, and
 * a min-width query matches at its own boundary. So the author's two sizes land
 * on the author's own three buttons with no third behaviour invented: mobile
 * (390) is 14px, tablet (768) and desktop are 16px. `lg:` would have made the
 * tablet button show the mobile size, which is a decision nobody asked for.
 *
 * The canvas is an iframe (round 20), so the media query resolves against the
 * FRAME's width, not the browser's — which is what makes the device-preview
 * buttons genuinely preview the type scale rather than merely the layout.
 * Measured, in Chrome: scripts/_measure-round65-type-scale.mjs.
 *
 * ── WHAT ELSE THE MODIFIER CARRIES, AND WHY NOTHING INVERTS ───────────────
 * The size modifier scales every element off the root, so this is not only the
 * body. Measured at both viewports (the same probe):
 *
 *              was (prose-lg)    desktop (base)    mobile (sm)
 *   p / li     18 / 32           16 / 28           14 / 24
 *   h2         30 / 40           24 / 32           20 / 28
 *   h3         24 / 36           20 / 32           18 / 28
 *   blockquote 18 / 32           16 / 28           14 / 24
 *   code       16                14                12
 *
 * The hierarchy holds at both: h2 > h3 > body everywhere, so no heading lands
 * under its own siblings — the defect a body-only fix arrives at by this exact
 * route. The smallest thing on the page is 12px inline `code` on mobile; that
 * is the plugin's own 0.857em ratio, not a value invented here, and it is one
 * step under the 14px body rather than a break in the scale.
 *
 * ── THE SPACING IS RE-DECIDED, NOT INHERITED ──────────────────────────────
 * Round 60's numbers are ABSOLUTE px chosen against an 18px/32px body: `my-4`
 * was "half the 32px line", and also the 1rem `.article-content p` already
 * uses. Half of a line is not 16px any more.
 *
 *   desktop  line 28px   my-4 = 16px   57% of the line
 *   mobile   line 24px   my-4 = 16px   67% of the line   <-- backwards
 *
 * Keeping one number would give MOBILE more relative air than desktop, which is
 * the opposite of what a narrow screen wants. So the paragraph/list gap keeps
 * `my-4` at `md:` and up — where round 60's second reason, matching the article
 * body's 1rem, still holds exactly — and drops to `my-3` (12px) below it, which
 * is round 60's own "half the line" rule applied to the 24px mobile line.
 *
 * `prose-li:my-1` (4px) is deliberately NOT scaled. It is already the tightest
 * useful step, a list is one unit at any size, and 2px would be a gap a reader
 * cannot see. Same value at both viewports, on purpose.
 *
 * `[&_li>p]:my-0` and the two `[&>*:…]` edge resets are unchanged and still
 * load-bearing for the reasons above — they are scale-independent.
 *
 * Every one of these compiles or the spacing silently reverts to the plugin
 * default, which is exactly the failure test/fs/tailwindArbitraryValueRules
 * exists for; the three `md:`-prefixed ones are registered there too.
 */
const PROSE =
  'prose prose-sm md:prose-base max-w-none prose-headings:font-heading '
  + 'prose-a:text-[var(--pb-accent-text)] prose-img:rounded-9e-md dark:prose-invert '
  + 'prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 [&_li>p]:my-0 '
  + 'md:prose-p:my-4 md:prose-ul:my-4 md:prose-ol:my-4 '
  + '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0';

export function RichTextSection({ content }) {
  const nodes = renderTiptap(content?.doc);
  if (!nodes) return null;
  return <div className={PROSE}>{nodes}</div>;
}
