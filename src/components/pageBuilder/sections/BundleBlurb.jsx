import { renderTiptap } from '@/components/pageBuilder/richText/tiptapToReact';
import { resolveBlurbForRender } from '@/lib/bundle/blurb';
import { cn } from '@/lib/utils';

/**
 * ── THE BUNDLE'S คำโปรย, RENDERED FROM WHICHEVER FIELD IS CURRENT ──────────
 *
 * Two call sites — the promotion card's sub-line and the quotation page's
 * header — and ONE decision about which of `blurb` / `blurbDoc` to believe.
 * That decision is `resolveBlurbForRender` (lib/bundle/blurb.js): the doc only
 * when its own plain text still equals the string, otherwise the string. The
 * reasoning is in that module's header and it is operational — staging and
 * production share one MongoDB and production writes only the string.
 *
 * ── THE STRING BRANCH IS BYTE-IDENTICAL TO WHAT IT REPLACED ───────────────
 * `<p className={className}>{text}</p>`, with the caller passing the exact
 * class string it used before. That matters more than it looks: every bundle
 * section stored today is string-only, so this branch is what the live site
 * renders until an admin saves a section on staging. A restyle hidden inside a
 * refactor would be a visual change nobody asked for, on every promotion page.
 *
 * ── THE DOC BRANCH IS A <div>, AND IT HAS TO BE ───────────────────────────
 * `renderTiptap` emits one `<p>` per paragraph, so wrapping it in the caller's
 * `<p>` would nest a paragraph inside a paragraph — which browsers repair by
 * closing the outer one early, putting the text outside the styled element.
 * The wrapper carries the same typography classes instead and the inner
 * paragraphs inherit them.
 *
 * ── THE LINK COLOUR IS A PAIR, BECAUSE ONE COLOUR CANNOT MEET AA ON BOTH ──
 * globals.css states the rule at the tokens: `--9e-action` (#005CFF, ~5.3:1 on
 * white) for small text and links on a LIGHT background, and `--9e-air`
 * (#48B0FF) for DARK backgrounds only — explicitly "never small text on light".
 * #005CFF on the navy card (#0D1B2A) is roughly 2.8:1 and fails, so a single
 * blue was never an option here.
 *
 * `dark:` is the right mechanism for this element and NOT a violation of the
 * tile rule: `promotion_bundle` scopes `dark` onto the Navy CARD itself, so the
 * variant fires exactly on the dark surface. What may carry no `dark:` colours
 * is the course TILE, which is deliberately light inside that dark card — a
 * different subtree, with its own note. On the quotation page there is no card,
 * and the same pair then tracks the site theme, which is the same requirement
 * answered by the same two tokens.
 *
 * The underline is not decoration either: WCAG 1.4.1 does not let colour be the
 * only thing marking a link, and a blue word in a blue-adjacent palette is
 * exactly that.
 */

/**
 * `[&>p]:m-0` neutralises the browser's paragraph margin so a one-paragraph
 * blurb occupies the same box the `<p>` branch does, and `[&>p+p]:mt-1` is the
 * only spacing a two-line blurb gets — a sub-heading under a package name, not
 * prose. Written out in full rather than interpolated: Tailwind scans source
 * text and an arbitrary variant built by interpolation emits no rule at all.
 */
const DOC_CLASS = cn(
  '[&>p]:m-0 [&>p+p]:mt-1',
  '[&_a]:underline [&_a]:underline-offset-2',
  '[&_a]:text-9e-action dark:[&_a]:text-9e-air',
  '[&_a:hover]:text-9e-brand',
);

/**
 * @param {object} o
 * @param {object} o.content the section's stored content — both blurb fields
 * @param {string} o.className the typography the caller already applied to its
 *   own `<p>`; passed in rather than decided here so the string branch keeps
 *   rendering exactly what each surface rendered before.
 */
export function BundleBlurb({ content, className }) {
  const choice = resolveBlurbForRender(content);

  if (choice.kind === 'text') {
    // Nothing authored — the callers' old `{blurb && …}` / ternary, moved in so
    // neither has to ask twice.
    if (!choice.text) return null;
    return <p className={className}>{choice.text}</p>;
  }

  /**
   * `renderTiptap` never throws and returns null when there is nothing
   * renderable — so a doc that passed the drift rule but walks to nothing falls
   * through to drawing no sub-line at all, rather than an empty styled box.
   */
  const nodes = renderTiptap(choice.doc);
  if (!nodes) return null;

  return <div className={cn(className, DOC_CLASS)}>{nodes}</div>;
}
