'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ICON_NAMES, isKnownIconName, lucideIcon } from '@/lib/pageBuilder/lucideIcon';

/**
 * Choosing a Lucide icon by looking at it, instead of typing a PascalCase name
 * from memory and learning it was wrong from a warning afterwards.
 *
 * ── WHAT THIS CHANGES AND WHAT IT DOES NOT ─────────────────────────────────
 * It changes how a name is CHOSEN. It does not touch how a stored name is
 * JUDGED: `isKnownIconName` still decides, the editors still compute `iconBad`
 * from it, and a section saved with a name that later stops resolving still
 * shows its warning rather than silently blanking. The picker cannot produce
 * such a name — it only offers names the validator accepts — but a value can
 * arrive from an older save, an import, or a lucide upgrade that renamed
 * something, and those are exactly the cases the warning is for.
 *
 * ── REUSED FROM SectionPicker (rounds 9-13), AND WHAT HAD TO DIFFER ────────
 * REUSED: a portal-free body split out and exported so the render tier can
 * assert on it (Dialog.Portal draws nothing under renderToStaticMarkup); the
 * fixed-size dialog shell; the non-scrolling header holding the search box with
 * only the results scrolling, carrying the reserved scrollbar gutter so the
 * grid does not shift as results come and go; case-folded substring search over
 * the visible label.
 *
 * DIFFERENT, and both differences come from the size of the list:
 *   - No group pills. 27 section types divide into five meaningful groups;
 *     5000-odd icon names have no such grouping worth inventing, so search is
 *     the only filter.
 *   - A result CAP, which SectionPicker never needed. Every matching name is
 *     COUNTED, but only the first `ICON_RESULT_CAP` are drawn, and the dialog
 *     says how many it is not showing rather than pretending that is all of
 *     them. Rendering five thousand glyphs to a panel nobody scrolls through is
 *     a cost with no reader.
 *
 * Folding is plain `toLowerCase` here with none of SectionPicker's Thai
 * caveats: icon names are ASCII PascalCase, so case is the whole of it.
 */

/** How many matches are drawn at once. The rest are counted, not hidden silently. */
export const ICON_RESULT_CAP = 120;

export function matchesIconQuery(name, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return String(name).toLowerCase().includes(q);
}

/**
 * The matches for a query: how many there are, and the ones being drawn.
 *
 * `total` is deliberately the FULL count rather than `shown.length` — the
 * dialog tells the author how many it is holding back, and that number has to
 * come from the whole list or the message is a lie.
 */
export function iconResults(query, cap = ICON_RESULT_CAP) {
  const all = ICON_NAMES.filter((name) => matchesIconQuery(name, query));
  return { total: all.length, shown: all.slice(0, cap) };
}

/**
 * The picker's contents, WITHOUT the portal — see the note above on why the
 * split exists. `query` is a prop rather than state so the render tier can
 * assert the list at any filter value.
 */
export function IconPickerBody({ query, onQueryChange, value, onPick, onClear }) {
  const { total, shown } = iconResults(query);
  const hidden = total - shown.length;

  return (
    <>
      <div data-testid="icon-picker-header" className="mb-3 shrink-0 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50" aria-hidden />
          <input
            type="search"
            data-testid="icon-picker-search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ค้นหาไอคอน (ชื่อภาษาอังกฤษ)"
            aria-label="ค้นหาไอคอน"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] py-1.5 pl-8 pr-2 text-[13px] text-9e-navy placeholder:text-9e-slate-dp-50 focus:border-9e-action/40 focus:outline-none dark:text-white"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p data-testid="icon-picker-count" className="text-[10px] text-9e-slate-dp-50">
            {total === 0
              ? 'ไม่พบไอคอนที่ตรงกับคำค้นหา'
              : hidden > 0
                ? `แสดง ${shown.length} จาก ${total} ไอคอน — พิมพ์เพิ่มเพื่อค้นหาให้แคบลง`
                : `พบ ${total} ไอคอน`}
          </p>
          <button
            type="button" data-testid="icon-picker-clear" onClick={onClear}
            className="flex shrink-0 items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-2 py-1 text-[10px] text-9e-slate-dp-50 hover:border-9e-action/40 hover:text-9e-action"
          >
            <Ban className="h-3 w-3" aria-hidden /> ไม่ใช้ไอคอน
          </button>
        </div>
      </div>

      <div data-testid="icon-picker-scroll" className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
          {shown.map((name) => {
            const Icon = lucideIcon(name);
            const active = name === value;
            return (
              <button
                key={name}
                type="button"
                data-testid="icon-option"
                data-icon={name}
                data-active={active ? 'true' : 'false'}
                aria-pressed={active}
                title={name}
                onClick={() => onPick(name)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-9e-md border px-1 py-2',
                  active
                    ? 'border-9e-action/40 bg-9e-action/10 text-9e-action'
                    : 'border-[var(--surface-border)] text-9e-slate-dp-50 hover:border-9e-action/40 hover:text-9e-action'
                )}
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                <span className="w-full truncate text-[9px] leading-tight">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * The field control: a trigger showing the current choice, and the dialog.
 *
 * The trigger renders the STORED value even when it is not a known name, in the
 * invalid styling — the author has to be able to see what is actually saved,
 * and a control that showed "เลือกไอคอน" over a bad stored value would hide the
 * very thing the warning underneath is talking about.
 */
export function IconPicker({ value, onChange, invalid }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const name = String(value ?? '').trim();
  const Icon = lucideIcon(name);

  const choose = (next) => {
    onChange(next);
    setQuery('');
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) setQuery(''); setOpen(o); }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-testid="icon-picker-trigger"
          aria-invalid={invalid || undefined}
          className={cn(
            'flex w-full items-center gap-2 rounded-9e-md border border-[var(--surface-border)]',
            'bg-[var(--surface)] px-2 py-1.5 text-left text-[13px] text-9e-navy',
            'hover:border-9e-action/40 dark:text-white',
            invalid && 'border-red-400'
          )}
        >
          <span className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-9e-md',
            Icon ? 'bg-9e-action/10 text-9e-action' : 'bg-9e-ice text-9e-slate-dp-50 dark:bg-9e-navy'
          )} aria-hidden>
            {Icon ? <Icon className="h-4 w-4" /> : <Search className="h-3 w-3" />}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {name === '' ? <span className="text-9e-slate-dp-50">เลือกไอคอน</span> : name}
          </span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(40rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl',
            'flex flex-col h-[min(34rem,calc(100dvh-4rem))]'
          )}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">เลือกไอคอน</Dialog.Title>
            <Dialog.Close aria-label="ปิด" className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-9e-navy">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">ค้นหาและเลือกไอคอน Lucide สำหรับการ์ดนี้</Dialog.Description>

          <IconPickerBody
            query={query}
            onQueryChange={setQuery}
            value={isKnownIconName(name) ? name : ''}
            onPick={choose}
            onClear={() => choose('')}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
