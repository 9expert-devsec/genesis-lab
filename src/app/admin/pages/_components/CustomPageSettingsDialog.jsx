'use client';

import { SettingsShell } from '@/components/admin/pageSettings/SettingsShell';
import { CustomPageSettingsBody } from './CustomPageSettingsBody';

/**
 * The Advanced HTML editor's ตั้งค่าหน้า dialog — the SHARED shell, wrapped.
 *
 * Everything visible comes from SettingsShell (the frame, the 93px header band)
 * and CustomPageSettingsBody (the menu, the sections, the 66px footer band).
 * This file contributes no markup of its own on purpose: a wrapper that drew
 * even one border would be the beginning of the second dialog the shared shell
 * exists to prevent.
 *
 * It is separate from the body for the reason the builder's wrapper is —
 * a Radix `Dialog.Portal` renders zero bytes under renderToStaticMarkup, so
 * anything on this side of the split is unreachable from the render tier. The
 * body is exported and rendered directly by test/render/customPageSettings.
 */
export function CustomPageSettingsDialog({
  open, onClose, initialSection = null, slugErrorAt = 0, ...bodyProps
}) {
  return (
    <SettingsShell open={open} onClose={onClose}>
      {/*
        KEYED ON THE REQUESTED SECTION, the same way the builder's dialog is, so
        that opening from a different trigger really lands on that section rather
        than depending on whether Radix unmounts its content on close.

        ── AND ON slugErrorAt, WHICH IS WHY IT IS A COUNTER ────────────────────
        A save refused for the slug must land on ข้อมูลหน้า with the field
        focused, EVERY time — including the second bad slug in a row, and
        including when the author had left the menu on SEO. Both of those are
        remount problems: the body's `section` initialises from `initialSection`,
        and `autoFocus` fires on mount. Folding the counter into the key makes
        each refusal a remount, so both happen without an effect, a ref, or a
        second source of truth about which section is showing.

        It is reset to 0 by the form when the dialog is opened by the ตั้งค่าหน้า
        button or closed, so an ordinary open does not re-key and does not steal
        focus for an error that is no longer being reported.
      */}
      {/*
        `open` is threaded to the BODY as well as to the shell. The activity
        list fetches on open and must not fetch while the dialog is closed —
        the same contract the builder's dialog gives ActivityTrail.
      */}
      <CustomPageSettingsBody
        key={`${initialSection ?? 'general'}:${slugErrorAt}`}
        initialSection={initialSection}
        open={open}
        slugErrorAt={slugErrorAt}
        {...bodyProps}
      />
    </SettingsShell>
  );
}
