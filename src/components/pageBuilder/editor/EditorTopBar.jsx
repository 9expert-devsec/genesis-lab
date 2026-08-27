'use client';

import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Eye, Save, Settings, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditor } from './EditorProvider';
import { hasPendingDraft, canDiscardDraft, statusLine } from '@/lib/pageBuilder/editorStatus';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory.
import { draftSaverLine } from '@/lib/pageBuilder/editorStatus';
// ADDED beside the two statements above rather than folded into either — the
// standing rule in this directory.
import { canOfferPublishedView, publishedViewHref } from '@/lib/pageBuilder/previewMode';

const STATUS_LABEL = {
  draft: 'ฉบับร่าง', scheduled: 'ตั้งเวลา', published: 'เผยแพร่แล้ว',
  closed: 'ปิดแล้ว', archived: 'เก็บถาวร',
};

/**
 * Confirm before throwing the draft away.
 *
 * NOT StructurePanel's ConfirmDeleteDialog: that one reads
 * `pending.section.type` and counts descendants, so it is a section dialog
 * rather than a generic one, and generalising it would be a refactor of a file
 * this round has no other reason to touch. This mirrors its SHAPE — the same
 * Radix primitives, the same focus-the-cancel-button behaviour, the same
 * red-tone framing — without pretending one component serves both.
 */
function ConfirmDiscardDialog({ open, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
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
                ทิ้งฉบับร่าง
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-9e-slate-dp-50">
                ทิ้งฉบับร่างที่ยังไม่เผยแพร่ทั้งหมด และกลับไปใช้เนื้อหาที่เผยแพร่อยู่ตอนนี้ใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้
              </Dialog.Description>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                ref={cancelRef}
                type="button"
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy dark:text-white"
              >
                ยกเลิก
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
            >
              ทิ้งฉบับร่าง
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Editor top bar: status badge, pending-draft chip, save indicator, page
 * settings, save, discard, preview, publish.
 *
 * Tier gating here is an AFFORDANCE, never the guard: canPublish disables the
 * publish button, but publishPageStatus re-checks the tier server-side. The UI
 * must never be the only thing standing between a tier and an action.
 *
 * ── TWO CHIPS, BECAUSE THEY ARE TWO FACTS ─────────────────────────────────
 * The amber status badge says what the PUBLIC sees. The indigo draft chip says
 * the SERVER is holding content the public does not see yet. A published page
 * can carry a pending draft and a draft-status page can carry none, so merging
 * them into one label would state something neither of them means. The chip
 * reads `hadDraft`, not `contentDirty` — see lib/pageBuilder/editorStatus.js.
 */
export function EditorTopBar({ onSave, onOpenSettings, onOpenPreview, onPublish, onDiscard }) {
  const editor = useEditor();
  const { page, saving, conflict, tier } = editor;
  const status = page?.status ?? 'draft';
  const pendingDraft = hasPendingDraft(editor);
  const saver = draftSaverLine(editor);
  const offerPublished = canOfferPublishedView({
    pendingDraft,
    publishedVersion: editor?.publishedVersion,
    hasVersionRow: false,
    previewEnabled: editor?.previewEnabled,
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--surface-border)] bg-[var(--surface)] px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {STATUS_LABEL[status] ?? status}
        </span>
        {pendingDraft && (
          <span
            data-testid="pending-draft-chip"
            className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
          >
            มีฉบับร่างที่ยังไม่เผยแพร่
          </span>
        )}
        {/*
          THE WAY TO GO AND LOOK, on the chip's own condition plus two more.

          The requirement puts this above the canvas, paired with a sentence
          saying the change is saved but not yet on the site. The SENTENCE is
          not shipped — it is a fourth way of saying what the chip beside it
          already says, and round 27 refused a second save vocabulary. What is
          new is the control, so the control is all that is added, and it sits
          on the fact it relates to rather than in a band of its own.

          A plain anchor, not a button: it is a navigation to a read-only view,
          it opens in a new tab so the editor is never navigated away from with
          unsaved work, and rel=noreferrer keeps the admin URL out of the
          destination's referer.
        */}
        {offerPublished && (
          <a
            data-testid="view-published-link"
            href={publishedViewHref(page?.slug)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-[11px] text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-9e-navy"
          >
            <Eye className="h-3 w-3" aria-hidden /> ดูเวอร์ชันที่เผยแพร่อยู่
          </a>
        )}
        {/*
          WHO holds the pending draft, beside the chip that says one exists —
          the two are one fact about the SERVER and share one condition, so they
          appear and disappear together. It is deliberately not in statusLine
          below: that line reports what THIS TAB did, and this is true of a page
          this tab has never written. Reads draft.savedBy, never updatedBy,
          which round 33 measured frozen at creation.
        */}
        {saver && (
          <span data-testid="draft-saver-line" className="truncate text-xs text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
            {saver}
          </span>
        )}
        <p className="truncate text-sm font-bold text-9e-navy dark:text-white">
          {page?.title || '(ไม่มีชื่อ)'}
        </p>
        <span className="truncate text-xs text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
          {statusLine(editor)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-9e-navy"
        >
          <Settings className="h-4 w-4" /> ตั้งค่าหน้า
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || Boolean(conflict)}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-9e-navy"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          บันทึกฉบับร่าง
        </button>
        {pendingDraft && (
          <button
            type="button"
            data-testid="discard-draft-button"
            onClick={() => setConfirmDiscard(true)}
            disabled={!canDiscardDraft(editor)}
            className="inline-flex items-center gap-1 rounded-9e-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> ทิ้งฉบับร่าง
          </button>
        )}
        <button
          type="button"
          onClick={onOpenPreview}
          disabled={!tier?.canManagePreview}
          title={tier?.canManagePreview ? undefined : 'ต้องมีสิทธิ์ marketing ขึ้นไป'}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-9e-navy"
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

      <ConfirmDiscardDialog
        open={confirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); onDiscard?.(); }}
      />
    </header>
  );
}
