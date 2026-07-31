'use client';

import { Monitor, Tablet, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditor } from './EditorProvider';

/**
 * Canvas device-preview toggle — a segmented Desktop / Tablet / Mobile control
 * over the canvas. It sets ONLY the canvas WIDTH (previewViewport in
 * EditorProvider): the canvas still renders through the real SectionRenderer (see
 * CanvasPanel's header), so sections reflow under real CSS media queries exactly
 * as they will in production. NOT an iframe, NOT a re-render — a width clamp on
 * the one real render. Ephemeral view state, never saved to the page.
 */
const VIEWPORTS = [
  { key: 'desktop', label: 'เดสก์ท็อป', Icon: Monitor },
  { key: 'tablet', label: 'แท็บเล็ต', Icon: Tablet },
  { key: 'mobile', label: 'มือถือ', Icon: Smartphone },
];

export function CanvasToolbar() {
  const { previewViewport, setPreviewViewport } = useEditor();

  return (
    <div className="flex items-center justify-center border-b border-[var(--surface-border)] bg-[var(--surface)] px-3 py-1.5">
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
    </div>
  );
}
