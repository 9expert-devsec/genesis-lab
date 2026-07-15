'use client';

import { Eye, Save, Settings, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditor } from './EditorProvider';

const STATUS_LABEL = {
  draft: 'ฉบับร่าง', scheduled: 'ตั้งเวลา', published: 'เผยแพร่แล้ว',
  closed: 'ปิดแล้ว', archived: 'เก็บถาวร',
};

function savedAgo(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'บันทึกอัตโนมัติเมื่อสักครู่';
  return `บันทึกอัตโนมัติเมื่อ ${mins} นาทีที่แล้ว`;
}

/**
 * Editor top bar: status badge, autosave indicator, page settings, save,
 * preview, publish.
 *
 * Tier gating here is an AFFORDANCE, never the guard: canPublish disables the
 * publish button, but updatePageStatus re-checks the tier server-side. The UI
 * must never be the only thing standing between a tier and an action.
 *
 * Page settings (item 6), preview (item 6) and publish (item 7) are wired in
 * their own items; their handlers are passed in.
 */
export function EditorTopBar({ onSave, onOpenSettings, onOpenPreview, onPublish }) {
  const { page, dirty, saving, lastSavedAt, conflict, tier } = useEditor();
  const status = page?.status ?? 'draft';

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--surface-border)] bg-[var(--surface)] px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {STATUS_LABEL[status] ?? status}
        </span>
        <p className="truncate text-sm font-bold text-9e-navy dark:text-white">
          {page?.title || '(ไม่มีชื่อ)'}
        </p>
        <span className="truncate text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {conflict ? '' : saving ? 'กำลังบันทึก…' : dirty ? 'ยังไม่ได้บันทึก' : savedAgo(lastSavedAt) ?? ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <Settings className="h-4 w-4" /> ตั้งค่าหน้า
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || Boolean(conflict)}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          บันทึกฉบับร่าง
        </button>
        <button
          type="button"
          onClick={onOpenPreview}
          disabled={!tier?.canManagePreview}
          title={tier?.canManagePreview ? undefined : 'ต้องมีสิทธิ์ marketing ขึ้นไป'}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <Eye className="h-4 w-4" /> Preview
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={!tier?.canPublish || Boolean(conflict)}
          title={tier?.canPublish ? undefined : 'ต้องมีสิทธิ์ marketing ขึ้นไปเพื่อเผยแพร่'}
          className={cn(
            'rounded-9e-md px-4 py-1.5 text-sm font-bold text-white',
            'bg-9e-action hover:bg-9e-brand disabled:opacity-50'
          )}
        >
          เผยแพร่
        </button>
      </div>
    </header>
  );
}
