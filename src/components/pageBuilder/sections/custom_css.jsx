import { scopeCss } from '@/lib/pageBuilder/scopeCss';

/**
 * custom_css — a developer-tier scoped-CSS block (§5.5). Server component.
 *
 * SCOPING (the load-bearing decision): the section's `content.css` is confined
 * to `#<advanced.sectionId>` via the SAME scopeCss used for the envelope's
 * `advanced.customCss` — one scoper, no second rule. `domId` is supplied by the
 * renderer and is set ONLY when `advanced.sectionId` is a valid id (the renderer
 * drops an invalid one). So:
 *
 *   - no Section ID (or an invalid one) → `domId` is undefined → inject NOTHING.
 *   - CSS present but scopeCss rejects it (unparseable / document-level / oversize)
 *     → '' → inject NOTHING.
 *
 * Either way the editor warns (SectionContentEditor) — an author must learn now,
 * not from a rule that silently never applied. A generated fallback id was
 * rejected on purpose: a generated id is not stable across move/copy, so CSS
 * referencing it would break silently later.
 *
 * The rules are scoped to this section's own wrapper, so custom_css styles THIS
 * section's subtree, exactly like advanced.customCss — it is not a page-global
 * escape hatch (scopeCss drops html/body/:root selectors outright).
 */
export function CustomCssSection({ content, domId }) {
  const css = typeof content?.css === 'string' ? content.css : '';
  if (!css.trim() || !domId) return null;
  const scoped = scopeCss(css, domId);
  if (!scoped) return null;
  return <style dangerouslySetInnerHTML={{ __html: scoped }} />;
}
