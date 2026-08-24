'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LAYOUT_TYPES, CONTENT_TYPES, CARD_TYPES, DYNAMIC_TYPES, ADVANCED_TYPES,
} from '@/lib/schemas/pageBuilder';
import { isContainer } from '@/lib/pageBuilder/containerSlots';
import { isAdvancedType } from '@/lib/pages/tierSanitize';
import { labelOf } from '@/lib/pageBuilder/sectionLabels';
import { iconOf } from '@/lib/pageBuilder/sectionIcons';
import { RENDERABLE_SECTION_TYPES } from '../SectionRenderer';
import { useEditor } from './EditorProvider';

/**
 * The add-section picker.
 *
 * ── Displays every type; ENABLES only what can actually be added ─────────
 * The trap the picker exists to prevent is offering a type that validates,
 * saves, and publishes nothing — so a type is CLICKABLE only if it is in
 * RENDERABLE_SECTION_TYPES (the renderer's registry) and not blocked by tier.
 * That invariant is unchanged and load-bearing.
 *
 * But absent ≠ safe: hiding Card/Dynamic/Advanced entirely left an author
 * unable to tell those types exist. So they are SHOWN, disabled, with a reason
 * — "เร็ว ๆ นี้" for the ones whose components are a later phase, a lock + tier
 * note for advanced types a non-developer can't use. A disabled button cannot
 * call onPick, so the trap stays closed; the author just stops wondering
 * whether the feature is missing or the tool is broken.
 *
 * Radix Dialog rather than a hand-rolled modal: focus trap / escape / aria are
 * exactly what a hand-rolled one gets subtly wrong.
 */

// 'add' → clickable. 'soon' → exists, component is a later phase. 'locked' →
// exists, needs a higher tier. Only 'add' reaches onPick.
//
// ── 'soon' IS UNREACHABLE TODAY, BY MEASUREMENT — AND STAYS ─────────────────
// After 2C.2b every type declared in lib/schemas/sections/* has a component in
// SectionRenderer's REGISTRY, so `renderable` is true for every type the picker
// draws and no button can currently reach 'soon'. That is MEASURED, not
// assumed: test/render/sectionTypeCoverage.test.mjs subtracts
// RENDERABLE_SECTION_TYPES from ALL_SECTION_TYPES and asserts the remainder is
// empty. It is self-retiring — the day a declared type ships without a
// component it goes red and names the type.
//
// DO NOT DELETE THE BRANCH ON THAT BASIS. It is the fail-closed path: it is the
// only thing that keeps a schema-only type DISABLED here instead of clickable,
// and a clickable type with no component throws in newSection() or publishes an
// empty section. The branch is unreachable because the codebase is currently in
// a good state, not because the state it guards cannot happen.
function typeState(type, canUseAdvanced) {
  const renderable = RENDERABLE_SECTION_TYPES.includes(type);
  if (isAdvancedType(type)) {
    // ── The developer-tier gate ──────────────────────────────────────────
    // GATES: authoring an Advanced-category section (custom_html / custom_css /
    // embed / debug_json). WHY: those are raw HTML / CSS / JSON escape hatches,
    // so a non-developer must not be able to add one — they see 'locked', a
    // developer sees it offered. This is only the PICKER half; the server-side
    // enforcement that STRIPS a non-developer's advanced section on save is
    // sanitizePageForTier in lib/pages/tierSanitize.js.
    //
    // UNEXERCISED FROM INTRODUCTION UNTIL 2C: before 2C the advanced types had
    // no component, so this branch could only ever return 'locked' (non-dev) or
    // 'soon' (dev) — the canUseAdvanced → 'add' path never actually fired on a
    // real, offerable type. 2C shipped the four components, so as of this pass
    // the gate decides 'add' vs 'locked' for the first time since it was written
    // (docs/page-builder-status.md forward-dependency 3).
    if (!canUseAdvanced) return 'locked';
    return renderable ? 'add' : 'soon';
  }
  return renderable ? 'add' : 'soon';
}

const GROUPS = [
  { title: 'เนื้อหา', types: CONTENT_TYPES },
  { title: 'เลย์เอาต์', types: LAYOUT_TYPES },
  { title: 'การ์ด', types: CARD_TYPES },
  { title: 'ไดนามิก', types: DYNAMIC_TYPES },
  { title: 'ขั้นสูง (developer)', types: ADVANCED_TYPES },
];

function TypeButton({ type, state, onPick }) {
  const disabled = state !== 'add';
  const Icon = iconOf(type);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : () => onPick(type)}
      title={state === 'locked' ? 'ต้องมีสิทธิ์ developer' : state === 'soon' ? 'กำลังจะมาในเร็ว ๆ นี้' : undefined}
      className={cn(
        'flex items-start justify-between gap-2 rounded-9e-md border border-[var(--surface-border)] px-3 py-2.5 text-left text-[13px]',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'text-9e-navy hover:border-9e-action/40 hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]'
      )}
    >
      {/* Leading icon — a quiet muted recognition aid (never a colourful accent),
          top-aligned so it sits with the label when a container subtitle wraps
          below. Decorative: the label is the accessible name, so aria-hidden. */}
      <span className="flex min-w-0 items-start gap-2">
        <Icon className="mt-px h-[18px] w-[18px] shrink-0 text-9e-slate-dp-50" aria-hidden />
        <span className="min-w-0">
          <span className="font-medium">{labelOf(type)}</span>
          {state === 'add' && isContainer(type) && (
            <span className="mt-0.5 block text-[10px] text-9e-slate-dp-50">ใส่ section ซ้อนข้างในได้</span>
          )}
        </span>
      </span>
      {state === 'soon' && (
        <span className="shrink-0 rounded-full bg-9e-ice px-1.5 py-px text-[9px] text-9e-slate-dp-50 dark:bg-[#0D1B2A]">
          เร็ว ๆ นี้
        </span>
      )}
      {state === 'locked' && <Lock className="mt-0.5 h-3 w-3 shrink-0 text-9e-slate-dp-50" aria-hidden />}
    </button>
  );
}

export function SectionPicker({ open, onClose, onPick }) {
  const { tier } = useEditor();
  const canUseAdvanced = Boolean(tier?.canUseAdvanced);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl',
            'max-h-[calc(100dvh-4rem)] overflow-y-auto'
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">เพิ่ม section</Dialog.Title>
            <Dialog.Close aria-label="ปิด" className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">เลือกชนิดของ section ที่ต้องการเพิ่ม</Dialog.Description>

          {GROUPS.map((group) => (
            <div key={group.title} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-9e-slate-dp-50">{group.title}</p>
              <div className="grid grid-cols-2 gap-2">
                {group.types.map((type) => (
                  <TypeButton key={type} type={type} state={typeState(type, canUseAdvanced)} onPick={onPick} />
                ))}
              </div>
            </div>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
