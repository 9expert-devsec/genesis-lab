'use client';

/**
 * "You have unsaved changes" — Thai, Yes/No, for INTERCEPTABLE in-app exits.
 *
 * The browser's own `beforeunload` prompt covers close and refresh and cannot
 * be worded, so those two look different by necessity. This one is for the
 * cases we can actually intercept, where a real sentence is possible.
 *
 * Deliberately not a shared/ui Dialog: the repo's Radix dialog traps focus and
 * animates, and this fires on a click that has ALREADY been cancelled — the
 * admin is mid-navigation and needs the answer now, not a transition.
 */
export function UnsavedChangesDialog({ open, onLeave, onStay }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-9e-md bg-white p-5 shadow-9e-md dark:bg-[#111d2c]">
        <h2
          id="unsaved-title"
          className="text-base font-bold text-9e-navy dark:text-white"
        >
          ยังไม่ได้บันทึกการแก้ไข
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          คุณมีการแก้ไขที่ยังไม่ได้บันทึก หากออกจากหน้านี้ การแก้ไขทั้งหมดจะหายไป
          ต้องการออกจากหน้านี้หรือไม่?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onStay}
            className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            ไม่ อยู่หน้านี้ต่อ
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-9e-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            ใช่ ออกโดยไม่บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
