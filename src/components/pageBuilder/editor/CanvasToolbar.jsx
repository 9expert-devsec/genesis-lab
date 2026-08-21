'use client';

import { Monitor, Tablet, Smartphone, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { previewViewportCaveat } from '@/lib/pageBuilder/previewViewportCaveat';
import { useEditor } from './EditorProvider';

/**
 * Canvas device-preview toggle — a segmented Desktop / Tablet / Mobile control
 * over the canvas.
 *
 * WHAT IS TRUE: it sets ONLY the canvas WIDTH (previewViewport in
 * EditorProvider). The canvas still renders through the real SectionRenderer
 * (see CanvasPanel's header) — NOT an iframe, NOT a re-render, a width clamp on
 * the one real render. Ephemeral view state, never saved to the page.
 *
 * WHAT IS NOT, and this docstring used to claim it was: sections do NOT reflow
 * "exactly as they will in production". Tailwind's sm:/md:/lg: compile to
 * VIEWPORT media queries, which ask the browser window rather than the box the
 * element sits in, so clamping an outer div changes none of them. On a 1440px
 * screen in "มือถือ" a 3-column grid still draws three columns, and
 * settings.visibility INVERTS — a mobile_only section vanishes while a
 * desktop_only one shows. The measurement and the exact preset classes are in
 * lib/pageBuilder/previewViewportCaveat.js, which also owns the caveat this
 * toolbar renders when the clamp is on. Real-viewport checking is the Preview
 * link, not this control.
 */
const VIEWPORTS = [
  { key: 'desktop', label: 'เดสก์ท็อป', Icon: Monitor },
  { key: 'tablet', label: 'แท็บเล็ต', Icon: Tablet },
  { key: 'mobile', label: 'มือถือ', Icon: Smartphone },
];

export function CanvasToolbar() {
  const { previewViewport, setPreviewViewport } = useEditor();
  // null on 'desktop' (no clamp, nothing to be misled about); the copy otherwise.
  const caveat = previewViewportCaveat(previewViewport);

  return (
    <div className="flex flex-col items-center gap-1 border-b border-[var(--surface-border)] bg-[var(--surface)] px-3 py-1.5">
      <div className="inline-flex rounded-9e-md border border-[var(--surface-border)] p-0.5">
        {VIEWPORTS.map(({ key, label, Icon }) => {
          const active = previewViewport === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPreviewViewport(key)}
              aria-pressed={active}
              title={label}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'bg-9e-action text-white'
                  : 'text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* VISIBLE text, not a title attribute. A tooltip is not an answer to a
          control that appears to promise a device preview — the author has to be
          able to read this without hovering, at the moment they switch. */}
      {caveat && (
        <p className="flex items-start gap-1 text-center text-[10px] leading-snug text-9e-slate-dp-50">
          <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span>{caveat}</span>
        </p>
      )}
    </div>
  );
}
