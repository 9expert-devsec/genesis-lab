'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, History, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rowHealth } from '@/lib/audit/auditHealth';
import {
  fmtWhen, preview, rowSeverity, severityRowClass,
  SeverityIcon, AuditRowDetail, ActionChip,
} from '@/components/audit/auditRowParts';
import { HISTORY_STATE } from '@/lib/audit/auditQuery';

/**
 * The client half of RecordHistory. Receives already-authorised rows and makes
 * no request of its own.
 *
 * ── NO SPLICING ─────────────────────────────────────────────────────────────
 * There is deliberately no "add the row I just wrote" path. The panel shows
 * what the server sent; a save re-renders the screen and the panel comes back
 * with it. Splicing rows into client state is the stale-list bug class this
 * branch spent a whole sweep removing, and it buys nothing at all for a
 * read-only panel.
 *
 * Collapsed by default so it never pushes the editing UI down the page.
 *
 * ── `defaultOpen` IS FOR THE ONE MOUNT WHERE COLLAPSING IS WRONG ───────────
 * The registration detail screens give this panel a TAB of its own. A reader who
 * has just clicked ประวัติการดำเนินการ has already asked for the history, and
 * an accordion that then asks again is a second click for nothing.
 *
 * It defaults to FALSE, so every other mount — where the panel sits below an
 * editing surface it must not push down — is unchanged. It seeds `useState` and
 * is not synchronised afterwards: the reader's own open/closed choice must
 * survive a re-render, which is the same rule the tab state follows.
 */
export function RecordHistoryPanel({ state, rows, total, previewCount, title, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const [openRow, setOpenRow] = useState(null);

  const hasMore = total > rows.length;

  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <History className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        {state === HISTORY_STATE.OK && total > 0 && (
          <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--surface-border)] px-4 py-3">
          {/* ── the third empty state: not wired up yet ── */}
          {state === HISTORY_STATE.NOT_INSTRUMENTED && (
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              <strong className="text-[var(--text-secondary)]">เมนูนี้ยังไม่ได้เปิดบันทึกประวัติ</strong> —
              ระบบกำลังทยอยติดตั้งการบันทึกทีละเมนู หน้านี้ยังไม่ถึงคิว
              จึงยังไม่มีข้อมูล ไม่ใช่ว่าไม่มีใครเคยแก้ไข
            </p>
          )}

          {/* ── genuinely no history for this record ── */}
          {state === HISTORY_STATE.OK && rows.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              ยังไม่มีประวัติการแก้ไข — รายการนี้ยังไม่ถูกแก้ไขนับตั้งแต่เริ่มบันทึก
            </p>
          )}

          {state === HISTORY_STATE.OK && rows.length > 0 && (
            <>
              <ul className="divide-y divide-[var(--surface-border)]">
                {rows.map((row) => (
                  <HistoryLine
                    key={row._id}
                    row={row}
                    isOpen={openRow === row._id}
                    onToggle={() => setOpenRow(openRow === row._id ? null : row._id)}
                  />
                ))}
              </ul>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-3 text-xs font-medium text-9e-action hover:underline"
                >
                  ดูทั้งหมด ({total})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {showAll && (
        <HistoryModal
          rows={rows}
          total={total}
          previewCount={previewCount}
          title={title}
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  );
}

/** One compact line. Expands into the SAME detail block the central page uses. */
function HistoryLine({ row, isOpen, onToggle }) {
  const flags = rowHealth(row);
  const worst = rowSeverity(flags);

  return (
    <li className={cn('py-2', severityRowClass(worst))}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 shrink-0"><SeverityIcon level={worst} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ActionChip action={row.action} />
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              {preview(row.before)} <span className="text-[var(--text-muted)]">→</span> {preview(row.after)}
            </span>
          </span>
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            {fmtWhen(row.createdAt)} · {row.actor?.name || 'ไม่ทราบผู้ดำเนินการ'}
          </span>
        </span>
      </button>
      {isOpen && (
        <div className="mt-3 rounded-9e-md bg-[var(--surface-muted)] p-3">
          <AuditRowDetail row={row} flags={flags} />
        </div>
      )}
    </li>
  );
}

/**
 * "ดูทั้งหมด".
 *
 * Shows the rows already fetched and links to the central page for the rest,
 * rather than paginating here. The full history of one record is what
 * /admin/audit-log with a recordId filter is for; duplicating its pagination
 * into a modal would be a second implementation of the same thing.
 */
function HistoryModal({ rows, total, previewCount, title, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด">
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        </div>

        <ul className="divide-y divide-[var(--surface-border)]">
          {rows.map((row) => (
            <ModalLine key={row._id} row={row} />
          ))}
        </ul>

        {total > previewCount && (
          <p className="mt-4 rounded-9e-md bg-[var(--surface-muted)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            แสดง {rows.length} จาก {total} รายการ — ดูประวัติทั้งหมดของรายการนี้ได้ที่หน้า
            <strong> ประวัติการดำเนินการ</strong> โดยกรองด้วยรายการนี้
          </p>
        )}
      </div>
    </div>
  );
}

function ModalLine({ row }) {
  const flags = rowHealth(row);
  return (
    <li className={cn('py-3', severityRowClass(rowSeverity(flags)))}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ActionChip action={row.action} />
        <span className="text-xs text-[var(--text-muted)]">
          {fmtWhen(row.createdAt)} · {row.actor?.name || 'ไม่ทราบผู้ดำเนินการ'}
        </span>
      </div>
      <AuditRowDetail row={row} flags={flags} />
    </li>
  );
}
