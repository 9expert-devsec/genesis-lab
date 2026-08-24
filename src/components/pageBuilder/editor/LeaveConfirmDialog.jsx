'use client';

import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "You have unsaved work — really leave?", for the two exits a browser lets us
 * ask about in our own UI: the BACK button and an in-app link. (Tab close and
 * reload get the browser's own generic string via beforeunload; no page can
 * word that one.)
 *
 * ── NOT window.confirm, and not for taste ──────────────────────────────────
 * `window.confirm` is synchronous and blocks the main thread, cannot carry the
 * one sentence that actually matters here (the work exists only in this tab),
 * and is styled by the browser — the author would meet a system alert in the
 * middle of an editor that has asked them nothing that way before. The section
 * delete already asks with Radix (StructurePanel's ConfirmDeleteDialog); this
 * is the same primitive, the same shape, and the same reasoning: focus trap,
 * Escape, and aria are what a hand-rolled modal gets subtly wrong.
 *
 * ── Focus is NOT on the destructive button ─────────────────────────────────
 * `onOpenAutoFocus` is prevented and focus moved to ยกเลิก, exactly as the
 * delete confirm does. This dialog often opens because the author pressed Back
 * — a key press they may still be repeating — and a focused "leave" button one
 * Enter away from discarding the work would make the guard the hazard.
 *
 * ── The width literal is REUSED, deliberately ──────────────────────────────
 * `w-[min(30rem,calc(100vw-2rem))]` is the exact string ConfirmDeleteDialog
 * already ships. Tailwind scans source text for complete literals, so reusing
 * this one generates nothing new — and a fresh arbitrary value here would be a
 * second modal width for no reason.
 */

// Why leaving is blocked → what to tell the author. The conflict case is
// genuinely different and gets its own line: autosave has STOPPED for that
// session, so "it will save in a moment" would be a lie.
const REASON_COPY = {
  conflict: 'การแก้ไขนี้ชนกับการแก้ไขของคนอื่น ระบบจึงหยุดบันทึกอัตโนมัติไปแล้ว — งานที่ค้างอยู่มีอยู่แค่ในแท็บนี้เท่านั้น ออกไปแล้วจะหายทั้งหมด',
  saving: 'กำลังบันทึกอยู่ ยังไม่เสร็จ — ถ้าออกตอนนี้ การบันทึกอาจถูกยกเลิกกลางคัน และงานที่ค้างอยู่มีอยู่แค่ในแท็บนี้เท่านั้น',
  dirty: 'ยังมีการแก้ไขที่ยังไม่ได้บันทึก — งานที่ค้างอยู่มีอยู่แค่ในแท็บนี้เท่านั้น ออกไปแล้วจะไม่สามารถกู้คืนได้',
};

export function LeaveConfirmDialog({ open, reason, onCancel, onConfirm }) {
  const cancelRef = useRef(null);

  return (
    <Dialog.Root open={Boolean(open)} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); cancelRef.current?.focus(); }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl'
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">
                ออกจากหน้านี้โดยไม่บันทึก ?
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-9e-slate-dp-50">
                {REASON_COPY[reason] ?? REASON_COPY.dirty}
              </Dialog.Description>
              {/* The way out that keeps the work. Named, because "cancel" only
                  tells the author what NOT to do. */}
              <p className="mt-2 text-xs text-9e-slate-dp-50">
                กด “อยู่ต่อ” แล้วกดบันทึกก่อน ถ้าไม่อยากเสียงานที่ทำไว้
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                ref={cancelRef}
                type="button"
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                อยู่ต่อ
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-9e-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              ออกโดยไม่บันทึก
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
