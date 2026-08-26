'use client';

import { Monitor, Tablet, Smartphone, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditor } from './EditorProvider';

/**
 * Canvas device-preview toggle — a segmented Desktop / Tablet / Mobile control
 * over the canvas.
 *
 * WHAT IS TRUE NOW: it sets the WIDTH OF THE FRAME the canvas renders in, and
 * that frame has its own viewport. Tailwind's sm:/md:/lg: are viewport media
 * queries, so they resolve against the width picked here: grids really change
 * column count, headings really change size, and settings.visibility no longer
 * inverts. Ephemeral view state, never saved to the page.
 *
 * WHAT IT USED TO SAY, kept because the shape of the mistake is worth
 * remembering: it claimed sections reflowed "exactly as they will in
 * production" while the control was an outer max-width, which changes no media
 * query at all. A later pass replaced the claim with a caveat rather than a
 * fix. This is the fix, so the caveat module is gone — but the note below took
 * its place rather than disappearing with it, because a frame is still not a
 * phone.
 *
 * The note is deliberately shown at EVERY viewport, including เดสก์ท็อป, which
 * is a reversal: the old caveat was hidden there on the grounds that an
 * unclamped canvas had nothing to mislead about. A frame always has a width, so
 * เดสก์ท็อป is now a claim too — the width of the editing column, which on a
 * laptop is narrower than the screen it is standing in for.
 */

/**
 * What the frame does and does not reproduce. ONE string, so the toolbar cannot
 * reword it and a test can pin it exactly.
 *
 * Both directions are stated on purpose. Understating it is what the old copy
 * did; overstating it in the other direction — implying this is a device — is
 * the failure the old copy was written to correct, and shipping a real viewport
 * makes that easier to do by accident, not harder.
 */
export const PREVIEW_FRAME_NOTE =
  'ตัวอย่างนี้เป็นวิวพอร์ตจริง — breakpoint ทำงานตามความกว้างของกรอบนี้ '
  + '(“เดสก์ท็อป” = ความกว้างของพื้นที่แก้ไข ไม่ใช่ขนาดจอจริง) '
  + 'ยังไม่จำลอง: การสัมผัส ความหนาแน่นพิกเซลของจอ (DPR) และแถบของเบราว์เซอร์บนมือถือ';
const VIEWPORTS = [
  { key: 'desktop', label: 'เดสก์ท็อป', Icon: Monitor },
  { key: 'tablet', label: 'แท็บเล็ต', Icon: Tablet },
  { key: 'mobile', label: 'มือถือ', Icon: Smartphone },
];

export function CanvasToolbar() {
  const { previewViewport, setPreviewViewport } = useEditor();

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

      {/* VISIBLE text, not a title attribute, and unconditional. A tooltip is
          not an answer to a control that makes a claim about a device — the
          author has to be able to read this without hovering, at the moment
          they switch, and at the viewport they are already on. */}
      <p
        data-testid="preview-frame-note"
        className="flex items-start gap-1 text-center text-[10px] leading-snug text-9e-slate-dp-50"
      >
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
        <span>{PREVIEW_FRAME_NOTE}</span>
      </p>
    </div>
  );
}
