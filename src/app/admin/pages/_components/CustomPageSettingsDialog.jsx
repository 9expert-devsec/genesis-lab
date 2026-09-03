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
export function CustomPageSettingsDialog({ open, onClose, initialSection = null, ...bodyProps }) {
  return (
    <SettingsShell open={open} onClose={onClose}>
      {/*
        KEYED ON THE REQUESTED SECTION, the same way the builder's dialog is, so
        that opening from a different trigger really lands on that section rather
        than depending on whether Radix unmounts its content on close.
      */}
      <CustomPageSettingsBody
        key={initialSection ?? 'general'}
        initialSection={initialSection}
        {...bodyProps}
      />
    </SettingsShell>
  );
}
