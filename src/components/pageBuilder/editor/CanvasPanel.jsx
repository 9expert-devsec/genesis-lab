'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { themeSurface, themeStyle } from '@/lib/pageBuilder/presets';
import { SectionRenderer } from '../SectionRenderer';
import { useEditor } from './EditorProvider';
import { keyToPath, pathToKey } from './pagePath';

/**
 * Canvas — the page as it will publish, with click-to-select on top.
 *
 * ── It renders through SectionRenderer, and that is the point ─────────────
 * Not a preview approximation, not a second tree walk: the real renderer, the
 * real presets, the real theme wrapper. A canvas that reimplements any of that
 * drifts, and a drifted canvas lies about what will publish — the failure class
 * the reuse rule in lib/pageBuilder/containerSlots.js exists to prevent.
 *
 * ── Array order, NOT sortOrder ───────────────────────────────────────────
 * PageBuilderView sorts top-level sections by `sortOrder`; this does not, and
 * must not. The editor reorders the ARRAY (MOVE_SECTION → moveWithin), and
 * nothing renumbers `sortOrder` client-side — the server does it on save
 * (renumberSections, in lib/pages/tierSanitize.js). So between a move and the
 * next save the working tree's sortOrder is stale, and a canvas that sorted by
 * it would show the author the PRE-MOVE order while the tree showed the new
 * one. Array order is what will be saved and renumbered, so array order is the
 * truth here. For a saved doc the two agree, which is why PageBuilderView's
 * sort is a no-op in practice — it is defence for docs written by the granular
 * section actions, not a second ordering rule.
 *
 * ── The canvas is inert ──────────────────────────────────────────────────
 * A click selects; it never activates. Sections contain real <a>s, real
 * buttons, and (via advanced.customHtml) real iframes, and a stray click on a
 * link would navigate the editor away mid-edit. beforeunload would catch a
 * dirty tree, but "clicking a link in my own page ejected me" is not editing,
 * and a clean tree would go without a word.
 *
 * ── Hidden sections do not appear here ───────────────────────────────────
 * SectionRenderer drops enabled === false (and visibility: hidden) sections, so
 * they are absent from the canvas by construction. That is the honest split:
 * the canvas shows what publishes, the Structure tree shows everything and is
 * where a hidden section is seen (struck through) and brought back.
 */

// Selection/hover are painted with ONE injected rule each, keyed by the exact
// data-pb-path. The alternative — outlining `[data-pb-path]:hover` in CSS —
// outlines every ANCESTOR of the hovered section too, because :hover matches up
// the tree. Tracking the innermost target in JS keeps the outline where the
// author's eye is.
function canvasCss(hoverKey, selKey) {
  const rules = ['[data-pb-canvas] iframe { pointer-events: none; }'];
  if (hoverKey && hoverKey !== selKey) {
    rules.push(
      `[data-pb-path="${hoverKey}"] { outline: 1px dashed rgba(0,92,255,.5); outline-offset: -1px; }`
    );
  }
  if (selKey) {
    rules.push(
      `[data-pb-path="${selKey}"] { outline: 2px solid #005CFF; outline-offset: -2px; }`
    );
  }
  return rules.join('\n');
}

// Device-preview widths. The clamp is an OUTER container's max-width — the real
// render inside reflows under real media queries at that width, exactly as it
// will in production. desktop = no clamp (full width, unchanged).
const VIEWPORT_MAXW = { desktop: null, tablet: 768, mobile: 390 };

export function CanvasPanel() {
  const { page, selection, dispatch, resolvedData, previewViewport } = useEditor();
  const [hoverKey, setHoverKey] = useState(null);

  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const selKey = selection ? pathToKey(selection) : null;

  // Capture phase: the section's own handlers must never see the click.
  const onClickCapture = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.target?.closest?.('[data-pb-path]');
    dispatch({ type: 'SELECT', path: el ? keyToPath(el.dataset.pbPath) : null });
  }, [dispatch]);

  // mouseover (not mouseenter) bubbles, so one listener covers the whole tree;
  // closest() from the target resolves to the innermost section under the
  // cursor, which is the one the author means.
  const onMouseOver = useCallback((e) => {
    const el = e.target?.closest?.('[data-pb-path]');
    setHoverKey(el?.dataset.pbPath ?? null);
  }, []);

  const { pageClass } = themeSurface(page?.theme);
  const clampWidth = VIEWPORT_MAXW[previewViewport] ?? null;

  if (!sections.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-center text-xs text-9e-slate-dp-50">
          หน้านี้ยังว่างอยู่ — เพิ่ม section แรกได้ที่แผง “โครงสร้างหน้า” ทางซ้าย
        </p>
      </div>
    );
  }

  // Device preview is a WIDTH CLAMP on the SAME real render — the outer container
  // centres it and caps its max-width; the inner `data-pb-canvas` render (through
  // the real SectionRenderer, real theme wrapper, click-to-select and hover, all
  // acting on the same DOM) is untouched at every width. `px-4` when clamped gives
  // a visible gutter; the transition makes switching feel intentional. NOT an
  // iframe, NOT a re-render.
  return (
    <div className={cn('mx-auto transition-[max-width] duration-300 ease-9e', clampWidth && 'px-4')}
      style={clampWidth ? { maxWidth: clampWidth } : undefined}
    >
      <div
        data-pb-canvas=""
        onClickCapture={onClickCapture}
        onMouseOver={onMouseOver}
        onMouseLeave={() => setHoverKey(null)}
        className={cn(pageClass)}
        style={themeStyle(page?.theme)}
        data-pb-theme={page?.theme || 'default'}
      >
        <style dangerouslySetInnerHTML={{ __html: canvasCss(hoverKey, selKey) }} />
        {sections.map((section, i) => (
          <SectionRenderer
            key={section?.id ?? i}
            section={section}
            depth={0}
            path={['sections', i]}
            resolvedData={resolvedData}
          />
        ))}
      </div>
    </div>
  );
}
