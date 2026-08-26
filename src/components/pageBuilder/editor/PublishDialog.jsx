'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Globe, Clock, FileText, Archive, Ban, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isPubliclyVisible, invisibleReason } from '@/lib/pageBuilder/visibility';
import { publishBlockers } from '@/lib/pageBuilder/publishReadiness';
import { Field, Group, Warn, INPUT_CLASS } from './fields';
import { useEditor } from './EditorProvider';
import { hasPendingDraft } from '@/lib/pageBuilder/editorStatus';

/**
 * Publish / schedule / retire (item 7).
 *
 * Publishing here is a FULL SAVE with a new status (useEditorSave.publish), not
 * the updatePageStatus action — see the note in useEditorSave.js for why using
 * that action from the editor would publish stale content AND invalidate the
 * conflict token.
 *
 * ── The badge and the URL can disagree, so this says which ───────────────
 * Status alone does not make a page public. A page can read "เผยแพร่แล้ว" in
 * the top bar and 404 for every visitor:
 *   - scheduled with no start date  → never goes live; nothing flips it
 *   - published with a future start → not live yet
 *   - any status past the end date  → already expired
 * Nothing errors in any of those. So the dialog runs the SAME predicate the
 * public route runs (lib/pageBuilder/visibility.js — one definition, imported
 * by both) against the tree as it will be saved, and states the outcome
 * plainly before the author commits to it.
 */

const OPTIONS = [
  { status: 'published', label: 'เผยแพร่', desc: 'ให้ทุกคนเข้าถึงได้ทันที', Icon: Globe, publishy: true },
  { status: 'scheduled', label: 'ตั้งเวลา', desc: 'เผยแพร่อัตโนมัติตามวันที่เริ่ม', Icon: Clock, publishy: true },
  { status: 'draft',     label: 'ฉบับร่าง', desc: 'ยกเลิกเผยแพร่ กลับไปแก้ไข', Icon: FileText },
  { status: 'closed',    label: 'ปิด',      desc: 'จบแคมเปญแล้ว — ยังอยู่ในรายการหลังบ้าน', Icon: Ban },
  { status: 'archived',  label: 'เก็บถาวร', desc: 'ซ่อนจากรายการหลังบ้านค่าเริ่มต้น', Icon: Archive },
];

const REASON_TEXT = {
  scheduled_no_start: 'ตั้งเวลาไว้แต่ยังไม่ได้ระบุวันเริ่ม — หน้านี้จะไม่ขึ้นเลย ไม่มีอะไรมาเปลี่ยนสถานะให้',
  scheduled_future:   'จะขึ้นอัตโนมัติเมื่อถึงวันเริ่ม',
  published_future:   'ตั้งเป็นเผยแพร่ แต่วันเริ่มยังมาไม่ถึง — ตอนนี้ยังเข้าไม่ได้',
  expired:            'เลยวันสิ้นสุดแล้ว — หน้านี้เข้าไม่ได้ แม้สถานะจะเป็นเผยแพร่',
  not_public_status:  'สถานะนี้ไม่เปิดให้สาธารณะเข้าถึง',
};

const toInput = (v) => (v ? String(v).slice(0, 10) : '');
const fromInput = (v) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);

export function PublishDialog({ open, onClose, onPublish }) {
  const editor = useEditor();
  const { page, tier } = editor;
  const [status, setStatus] = useState(page?.status ?? 'draft');
  const [start, setStart] = useState(toInput(page?.publishStartDate));
  const [end, setEnd] = useState(toInput(page?.publishEndDate));

  // Evaluate the page AS IT WOULD BE SAVED, with the same predicate the public
  // route uses — not a paraphrase of it.
  const next = {
    status,
    publishStartDate: fromInput(start),
    publishEndDate: fromInput(end),
  };
  const willBeVisible = isPubliclyVisible(next);
  const reason = invisibleReason(next);

  const isPublishy = status === 'published' || status === 'scheduled';
  // Readiness blockers apply to the public-facing statuses (they include the
  // empty-field cases). draft/closed/archived still need a non-empty title/slug
  // to satisfy the schema on save, so enforce that minimum separately for them.
  const readiness = publishBlockers(page, status);
  const hardMissing = [];
  if (!String(page?.title ?? '').trim()) hardMissing.push('ต้องมีชื่อหน้าก่อนบันทึก');
  if (!String(page?.slug ?? '').trim()) hardMissing.push('ต้องมี URL (slug) ก่อนบันทึก');
  const messages = isPublishy ? readiness.map((b) => b.message) : hardMissing;
  const blocked = messages.length > 0;

  const apply = () => {
    if (blocked) return; // the server re-checks; this just avoids a doomed round-trip
    onPublish(next);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl',
            'max-h-[calc(100dvh-4rem)] overflow-y-auto'
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">เผยแพร่หน้านี้</Dialog.Title>
            <Dialog.Close aria-label="ปิด" className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-9e-navy">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">เลือกสถานะการเผยแพร่และช่วงเวลาที่หน้านี้เข้าถึงได้</Dialog.Description>

          {!tier?.canPublish && <Warn tone="red">ต้องมีสิทธิ์ marketing ขึ้นไปเพื่อเผยแพร่หรือตั้งเวลา</Warn>}
          {/* Each reason names its field and what to do — a bare "cannot
              publish" would send the author hunting. */}
          {messages.map((m) => <Warn key={m} tone="red">{m}</Warn>)}

          {/* What เผยแพร่ will actually put live. The author is looking at
              the draft in the canvas, so "publish" reads as "publish what I
              see" — which is true, and worth saying out loud precisely
              because the currently-public page says something else. Uses the
              file's existing Warn/info tone; no new component for one line. */}
          {hasPendingDraft(editor) && (
            <Warn tone="info">การเผยแพร่จะใช้เนื้อหาฉบับร่างล่าสุด ไม่ใช่เนื้อหาที่เผยแพร่อยู่ในขณะนี้</Warn>
          )}
          <Group title="สถานะ">
            <div className="space-y-1">
              {OPTIONS.map(({ status: s, label, desc, Icon, publishy }) => {
                const locked = publishy && !tier?.canPublish;
                return (
                  <label key={s} className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-9e-md border p-2',
                    status === s ? 'border-9e-action/40 bg-9e-action/10' : 'border-[var(--surface-border)]',
                    locked && 'cursor-not-allowed opacity-40'
                  )}>
                    <input type="radio" name="pb-status" className="mt-0.5" value={s} checked={status === s}
                      disabled={locked} onChange={() => setStatus(s)} />
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-9e-slate-dp-50" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-9e-navy dark:text-white">{label}</span>
                      <span className="block text-[10px] text-9e-slate-dp-50">{desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Group>

          <Group title="ช่วงเวลา">
            <Field label="วันเริ่ม" hint="เว้นว่าง = ทันทีที่เผยแพร่">
              <input type="date" className={INPUT_CLASS} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="วันสิ้นสุด" hint="เว้นว่าง = ไม่มีวันสิ้นสุด">
              <input type="date" className={INPUT_CLASS} value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </Group>

          {/* The honest bottom line: what a visitor gets, not what the badge says. */}
          <div className={cn(
            'mb-3 flex items-start gap-1.5 rounded-9e-md p-2 text-[11px]',
            willBeVisible
              ? 'bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
          )}>
            {willBeVisible
              ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              : <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span>
              {willBeVisible
                ? 'หลังบันทึก ผู้เข้าชมจะเปิดหน้านี้ได้'
                : `หลังบันทึก ผู้เข้าชมจะยังเปิดหน้านี้ไม่ได้ — ${REASON_TEXT[reason] ?? 'สถานะนี้ไม่เปิดสาธารณะ'}`}
            </span>
          </div>
          {status === 'scheduled' && start && (
            <p className="mb-3 text-[10px] text-9e-slate-dp-50">
              หน้าเว็บสาธารณะ cache ไว้ 1 ชั่วโมง — หน้าที่ตั้งเวลาไว้อาจขึ้นช้ากว่าเวลาเริ่มได้ถึง 1 ชั่วโมง
            </p>
          )}

          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={onClose}
              className={cn(INPUT_CLASS, 'w-auto cursor-pointer')}>ยกเลิก</button>
            <button type="button" onClick={apply} disabled={blocked}
              className={cn(
                'rounded-9e-md px-4 py-1 text-xs font-bold text-white',
                'bg-9e-action hover:bg-9e-brand disabled:opacity-40'
              )}>
              บันทึกและใช้สถานะนี้
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
