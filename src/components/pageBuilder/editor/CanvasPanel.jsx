'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { themeSurface, themeStyle } from '@/lib/pageBuilder/presets';
import { SectionRenderer } from '../SectionRenderer';
import { useEditor } from './EditorProvider';
import { useCanvasFrame } from './useCanvasFrame';
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
 * ── It renders inside an IFRAME, and that is what makes the toggle true ───
 * The same render, portalled into a same-origin frame whose WIDTH is the device
 * the author picked. Tailwind's sm:/md:/lg: are viewport media queries, so they
 * now resolve against that width instead of against the browser window: a
 * three-column grid really becomes one column at 390px, headings really take
 * their smaller size, and settings.visibility stops inverting.
 *
 * ONE React root, in the parent. react-dom attaches its full delegated listener
 * set to a portal's container wherever that container lives, so the two
 * handlers below keep working through the frame boundary unchanged — no second
 * root, no message passing, and `dispatch` still closed over from useEditor().
 * The frame's document, styles and theme are useCanvasFrame's job.
 *
 * The published page is untouched by any of it: presets.js's class maps are the
 * same strings and SectionRenderer is the same renderer. Only the box those
 * classes are measured against changed, and that box exists only here.
 *
 * ── The canvas is inert ──────────────────────────────────────────────────
 * A click selects; it never activates. Sections contain real <a>s, real
 * buttons, and (via advanced.customHtml) real iframes, and a stray click on a
 * link would navigate the editor away mid-edit. beforeunload would catch a
 * dirty tree, but "clicking a link in my own page ejected me" is not editing,
 * and a clean tree would go without a word.
 *
 * That guarantee is now load-bearing in a second way: the leave guard's
 * document-level listener lives in the PARENT document and cannot see a click
 * inside the frame, so the capture-phase preventDefault below is the only thing
 * standing between a link in a section and a navigation. It must not be
 * relaxed.
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
      `[data-pb-path="${hoverKey}"] { outline: 1px dashed color-mix(in srgb, var(--9e-action) 50%, transparent); outline-offset: -1px; }`
    );
  }
  if (selKey) {
    rules.push(
      `[data-pb-path="${selKey}"] { outline: 2px solid var(--9e-action); outline-offset: -2px; }`
    );
  }
  return rules.join('\n');
}

/**
 * Device-preview widths — now the FRAME's width, which is to say the preview's
 * actual viewport. Every media query in the render is measured against these.
 *
 * `desktop: null` means the frame takes the full width of the editing column
 * rather than a number. That is the honest reading of "desktop" here: the frame
 * IS the viewport, so the only width it can claim without lying is the one it
 * actually has. Naming a figure instead — 1280, say — would render the page at
 * a width the frame does not occupy, which is the same class of untruth this
 * change removes, just pointed the other way.
 *
 * The consequence is worth stating because an author will meet it: on a laptop
 * the editing column is narrower than the screen, so at "เดสก์ท็อป" a preset
 * whose top step needs 1024px will not reach that step. The toolbar says so.
 */
export const VIEWPORT_WIDTH = { desktop: null, tablet: 768, mobile: 390 };

export function CanvasPanel() {
  const { page, selection, dispatch, resolvedData, previewViewport } = useEditor();
  const [hoverKey, setHoverKey] = useState(null);
  const { frameRef, frameDoc } = useCanvasFrame();

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
  const frameWidth = VIEWPORT_WIDTH[previewViewport] ?? null;

  if (!sections.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-center text-xs text-9e-slate-dp-50">
          หน้านี้ยังว่างอยู่ — เพิ่ม section แรกได้ที่แผง “โครงสร้างหน้า” ทางซ้าย
        </p>
      </div>
    );
  }

  // The canvas itself — unchanged from when it rendered in the parent document.
  // It is built here and portalled below rather than inlined into the JSX so
  // that "what the canvas is" and "where it is mounted" stay separable: the
  // handlers, the theme wrapper and the injected rules are the same objects
  // either side of the frame boundary.
  const canvas = (
    <div
      data-pb-canvas=""
      onClickCapture={onClickCapture}
      onMouseOver={onMouseOver}
      onMouseLeave={() => setHoverKey(null)}
      className={cn(pageClass, 'min-h-full')}
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
  );

  /**
   * ── ONE FRAME, RESIZED — NOT ONE FRAME PER VIEWPORT ──────────────────────
   * Switching device changes this element's width and nothing else. Keying the
   * frame by viewport, or unmounting it, would tear down the document on every
   * switch: the cloned stylesheets would have to reload, and the author would
   * watch an unstyled flash each time. A width change reflows; it does not
   * reload.
   *
   * The frame fills the column and scrolls itself (see useCanvasFrame for why
   * there is no content-height sync). The minimum-height override on the flex
   * chain is what lets it: the column is a flex child, and without that the
   * frame's own height would push the column open instead of being bounded by
   * it.
   */
  return (
    <div className="flex h-full min-h-0 justify-center">
      <iframe
        ref={frameRef}
        title="ตัวอย่างหน้าเว็บ"
        className={cn(
          'h-full min-h-0 border-0 bg-[var(--page-bg)]',
          frameWidth && 'border-x border-[var(--surface-border)]'
        )}
        style={{ width: frameWidth ? `${frameWidth}px` : '100%' }}
      />
      {frameDoc ? createPortal(canvas, frameDoc.body) : null}
    </div>
  );
}
