'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { History, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ประวัติการแก้ไข, as a toolbar button and a dialog.
 *
 * ── WHY IT IS A DIALOG AND NOT A BLOCK UNDER THE FORM ──────────────────────
 * It WAS a block under the form — `<RecordHistory>` mounted as a sibling after
 * `<ArticleForm>` in the edit page — and that stopped being reachable. The form
 * declares `h-[100dvh]`, so the block started exactly at the bottom of the
 * viewport and was only ever visible by scrolling the admin layout's `<main>`.
 * Measured at 1920x945 with the shell at 0..945: the block's top was 969 and
 * its heading's box 982..1002. Then `main` became `overflow-y-clip` on every
 * full-height route (it had to — something other than the user was scrolling
 * it), `main.scrollTop` was pinned at 0, and the panel became unreachable
 * rather than merely awkward.
 *
 * Giving it a surface of its own is the fix the courses editor already made for
 * the same problem: `CourseForm` puts ประวัติการแก้ไข in a TAB inside its own
 * shell rather than below it. A dialog is that answer for an editor whose
 * header bar is the only chrome it has.
 *
 * ── THE LOOK IS SettingsShell'S, DELIBERATELY ──────────────────────────────
 * The frame classNames below are the ones `@/components/admin/pageSettings/
 * SettingsShell` uses for the page-settings dialog both page editors share —
 * the same overlay, the same centred panel, the same header band and the same
 * 34px close square. That dialog is where the Page Builder keeps ITS history
 * (`HistorySection` → `VersionHistory`), so matching it is matching the surface
 * an admin has already learned.
 *
 * It is NOT imported, and that is a judgement rather than an oversight.
 * SettingsShell hardcodes `PAGE SETTINGS` / `ตั้งค่าหน้า` / a page-settings
 * description in its header band; reusing it here would mean widening a
 * component shared by two page editors with three header props in order to
 * overwrite all three at this one call site. The shell is the page-settings
 * shell. This borrows its geometry.
 *
 * ── ACCESSIBILITY IS STRUCTURAL, NOT A LIST OF ATTRIBUTES ──────────────────
 * `Dialog.Root` is UNCONTROLLED and the button is its `Dialog.Trigger`. That is
 * what makes the three requirements hold by construction rather than by code
 * that could rot: Radix closes on Escape, traps focus while open, and returns
 * focus TO THE TRIGGER on close because it knows which element the trigger is.
 * A `useState` + a bare button would need `onCloseAutoFocus` and a ref to do
 * the same job less reliably. `aria-haspopup="dialog"` is added explicitly —
 * Radix sets `aria-expanded` and `aria-controls` on a trigger but not that.
 *
 * NO `focus-visible:` CLASSES, and that is also deliberate: `globals.css` gives
 * `*:focus-visible` a `ring-2 ring-9e-brand ring-offset-2`, so every button in
 * this header bar already has the brand focus ring. A ring class here would be
 * a second, slightly different one.
 *
 * @param {import('react').ReactNode} children the RecordHistory panel, RENDERED
 *        BY THE PAGE AND HANDED IN. It is a SERVER component that awaits
 *        `auth()` and re-checks `canAccess` itself, so this `'use client'`
 *        toolbar cannot mount one — the same slot, for the same reason, as
 *        `InhouseDetailClient`'s `history` prop.
 */
export function ArticleHistoryDialog({ children }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          data-testid="article-history-trigger"
          /* Preview's classNames, verbatim. Two buttons side by side in one
             header bar; if they ever differ it should be because someone
             changed this line on purpose. */
          className="inline-flex items-center gap-1.5 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <History className="h-4 w-4" /> ประวัติการแก้ไข
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          data-testid="article-history-dialog"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[min(57.5rem,calc(100vw-2rem))] flex-col',
            '-translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-lg',
            'h-[42.5rem] max-h-[calc(100dvh-4rem)]'
          )}
        >
          <div className="flex min-h-[93px] shrink-0 items-start justify-between border-b border-[var(--surface-border)] px-5 pb-4 pt-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">ARTICLE</p>
              <Dialog.Title className="mt-0.5 text-xl leading-7 text-9e-navy dark:text-white">
                ประวัติการแก้ไข
              </Dialog.Title>
              <p className="mt-1 text-xs text-9e-slate-dp-50">
                ใครแก้ไขบทความนี้ล่าสุด และแก้อะไรไว้
              </p>
            </div>
            <Dialog.Close
              aria-label="ปิด"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-9e-sm text-9e-slate-dp-50 hover:bg-[var(--surface-hover)]"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          {/* The panel owns its own rows; this column owns the scrolling, the
              way every other full-height surface in the admin does. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
