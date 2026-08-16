'use client';

import { useState } from 'react';
import { Check, Circle, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rowHealth } from '@/lib/audit/auditHealth';
import {
  fmtWhen, hasDiff, rowSeverity, severityRowClass,
  AuditDiff, AuditRowDetail,
} from '@/components/audit/auditRowParts';
import { auditRowTitle, buildOriginEntry } from '@/lib/audit/registrationHistory';

/**
 * THE THIRD CONTAINER FOR AN AUDIT ROW.
 *
 * ── WHY A THIRD ONE IS ALLOWED, WHEN A SECOND SEVERITY SCHEME IS NOT ───────
 *
 * auditRowParts' premise, in its own words: the central page and the inline
 * panel "differ in their CONTAINERS and should — a `<tr>` does not belong in a
 * sidebar. What must NOT differ is everything inside: the timestamp format, the
 * payload preview, the severity colour, and the expanded before/after block."
 *
 * This is a third container — a feed of 82px entries, for the registration
 * detail screens' ประวัติการดำเนินการ tab — and it obeys that line exactly. The
 * timestamp comes from `fmtWhen`, the diff from `AuditDiff`, the severity from
 * `rowSeverity`/`severityRowClass`, and the expanded evidence from
 * `AuditRowDetail`. Nothing about a ROW is re-implemented here; only the box
 * around it is new.
 *
 * ── WHY THE ACCORDION PANEL WAS NOT SIMPLY RESTYLED ────────────────────────
 *
 * `RecordHistoryPanel` has EIGHT mount points — articles, the cache console
 * twice, career-path registrations, courses, masterclass registrations and the
 * two registration detail pages. Restyling it in place would have changed six
 * screens this round was not asked about. So the feed is a variant the panel
 * selects, and every other mount renders byte-identically.
 *
 * ── WHY THE CARD CHROME IS WRITTEN OUT HERE ───────────────────────────────
 *
 * The header's numbers — 21.8px in, 19.8px down, a 29x29 icon, the title block
 * at 38px — are the same ones `SectionCard` uses in the registrations shell,
 * because the design has one card style. It is NOT imported: that component
 * lives in `app/admin/registrations/_components`, and an audit component
 * reaching into a screen's private folder is a layering inversion that would
 * make this file unmountable anywhere else. Ten lines of chrome is the price.
 */

/**
 * @param {object[]} props.rows already-authorised audit rows, newest first
 * @param {number} props.total how many exist, which may exceed `rows.length`
 * @param {Record<string,string>} props.titles action -> Thai, chosen SERVER-side
 *        by menu/entity and handed over as a plain object — a function cannot
 *        cross that boundary and a map can
 * @param {{createdAt: string, source: string, label: string}} [props.origin]
 *        the document's own creation facts, for the synthesised oldest entry
 */
export function HistoryFeed({
  state, rows = [], total = 0, titles = {}, origin = null, title, description,
}) {
  const [openRow, setOpenRow] = useState(null);

  /**
   * THE THIRD EMPTY STATE TRAVELS WITH THE ROWS.
   *
   * `NOT_INSTRUMENTED` — the menu has not been swept yet — is a different fact
   * from "this record has never been edited", and the accordion panel already
   * says so at length. It has to be said HERE too rather than left to the
   * caller: a feed that rendered an empty list for an un-swept menu would tell a
   * reader nobody has ever touched the record, which is the one thing that state
   * exists to deny.
   *
   * The synthesised creation entry is suppressed with it. It is derived from the
   * document and would be perfectly true, but standing alone under a heading
   * that says no history is recorded it reads as the only thing that ever
   * happened.
   */
  const notInstrumented = state === 'not_instrumented';

  /**
   * The synthesised entry is appended ONLY when the feed is showing every row.
   * A truncated list whose bottom entry says "created" asserts a completeness it
   * does not have — see `buildOriginEntry`.
   */
  const originEntry = notInstrumented ? null : buildOriginEntry(origin, total <= rows.length);

  const entries = notInstrumented ? [] : [
    ...rows.map((row) => ({ kind: 'audit', row, createdAt: row.createdAt })),
    ...(originEntry ? [originEntry] : []),
  ];

  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] px-[21.8px] pb-[19.8px] pt-[19.8px]">
      {/*
        The 53.8px header: a 29x29 icon, then a TWO-LINE title block at 38px from
        the inner left (so 9px after a 29px box). NO แก้ไข button — there is
        nothing on this card to edit, and a card whose header carries an edit
        affordance claims otherwise.
      */}
      <div className="flex h-[53.8px] items-center gap-[9px]">
        <span className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-9e-md bg-[var(--surface-muted)] text-[var(--text-secondary)]">
          <History aria-hidden="true" className="h-[15px] w-[15px]" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold leading-[23px] text-[var(--text-primary)]">{title}</h2>
          {description ? (
            <p className="truncate text-[11px] leading-[17px] text-[var(--text-muted)]">{description}</p>
          ) : null}
        </div>
      </div>

      {notInstrumented ? (
        <p className="pt-[17px] text-[12px] leading-[19px] text-[var(--text-muted)]">
          <strong className="text-[var(--text-secondary)]">เมนูนี้ยังไม่ได้เปิดบันทึกประวัติ</strong> —
          ระบบกำลังทยอยติดตั้งการบันทึกทีละเมนู หน้านี้ยังไม่ถึงคิว
          จึงยังไม่มีข้อมูล ไม่ใช่ว่าไม่มีใครเคยแก้ไข
        </p>
      ) : entries.length === 0 ? (
        <p className="pt-[17px] text-[12px] leading-[19px] text-[var(--text-muted)]">
          ยังไม่มีประวัติการแก้ไข — รายการนี้ยังไม่ถูกแก้ไขนับตั้งแต่เริ่มบันทึก
        </p>
      ) : (
        <ul className="divide-y divide-[var(--surface-border)] pt-[17px]">
          {entries.map((entry, i) => (
            <HistoryEntry
              key={entry.kind === 'audit' ? entry.row._id : 'origin'}
              entry={entry}
              titles={titles}
              newest={i === 0}
              isOpen={entry.kind === 'audit' && openRow === entry.row._id}
              onToggle={() => setOpenRow((cur) => (cur === entry.row._id ? null : entry.row._id))}
            />
          ))}
        </ul>
      )}

      {/*
        THE TRUNCATION IS SAID OUT LOUD. Without it a five-entry feed on a
        record with twelve rows looks like the whole history, and the
        synthesised creation entry — which is suppressed in exactly this case —
        would have been the only hint that something was missing.
      */}
      {total > rows.length ? (
        <p className="mt-[16px] rounded-9e-md bg-[var(--surface-muted)] p-[12px] text-[11px] leading-[18px] text-[var(--text-secondary)]">
          แสดง {rows.length} จาก {total} รายการ — ดูประวัติทั้งหมดของรายการนี้ได้ที่หน้า
          <strong> ประวัติการดำเนินการ</strong> โดยกรองด้วยรายการนี้
        </p>
      ) : null}
    </section>
  );
}

/**
 * One 82px entry.
 *
 * ── THE ICON SAYS WHICH ONE IS MOST RECENT, POSITIONALLY ──────────────────
 * A check mark on the first entry and a dot on the rest, which is what the frame
 * draws. It is an index test rather than a timestamp comparison because the rows
 * arrive sorted `createdAt: -1` from `RECORD_HISTORY_SORT` — asking the clock a
 * second time would be a second ordering to disagree with the first.
 *
 * ── THE ENTRY IS ONLY INTERACTIVE WHEN THERE IS EVIDENCE TO SHOW ──────────
 * The raw before/after block STAYS — it is the audit evidence and the design
 * simply did not draw a collapsed affordance for it. But a row that records the
 * act and no payload has nothing to expand INTO: its detail block would be
 * `ก่อน: —` over `หลัง: —`, which is the `update — → —` defect relocated one
 * disclosure deeper.
 *
 * So the disclosure exists exactly when `hasDiff(row) || row.meta != null`. A
 * row with nothing recorded is a plain `<div>` — not a button that opens onto
 * two dashes.
 */
function HistoryEntry({ entry, titles, newest, isOpen, onToggle }) {
  const isAudit = entry.kind === 'audit';
  const row = entry.row;
  const flags = isAudit ? rowHealth(row) : [];
  const worst = isAudit ? rowSeverity(flags) : null;
  const expandable = isAudit && (hasDiff(row) || row.meta != null);

  const title = isAudit ? auditRowTitle(row, titles) : entry.title;

  /**
   * THE THIRD LINE IS WHAT SEPARATES A SYNTHESISED ENTRY FROM AN AUDIT ONE, IN
   * WORDS. Every audit entry says who did it; the document-derived one says it
   * is not a record of anyone doing anything. `data-origin` says the same thing
   * structurally, so a test can assert it without reading Thai.
   */
  const originLine = isAudit
    ? `ดำเนินการโดย ${row.actor?.name || 'ไม่ทราบผู้ดำเนินการ'}`
    : 'ข้อมูลจากตัวรายการ ไม่ใช่บันทึกการดำเนินการ';

  const body = (
    <div className="relative flex h-[82px] items-start">
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-[2px] top-[13px] flex h-[29px] w-[29px] items-center justify-center rounded-full',
          newest ? 'bg-9e-brand/10 text-9e-action' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
        )}
      >
        {newest
          ? <Check className="h-[14px] w-[14px]" />
          : <Circle className="h-[8px] w-[8px] fill-current" />}
      </span>

      <div className="min-w-0 flex-1 pl-[48px] pt-[13px]">
        <p className="truncate text-[13px] font-bold leading-[18px] text-[var(--text-primary)]">
          {title}
        </p>
        {/*
          THE DESCRIPTION LINE IS ABSENT, NOT BLANK, when the row records no
          before/after. `AuditDiff` returns null for an act-only row — a field
          edit carries no payload on purpose, because it would carry names,
          emails, phone numbers and tax ids into an append-only collection. An
          empty 19px paragraph reserving the space is the same defect a text
          assertion cannot see.
        */}
        {isAudit
          ? <AuditDiffLine row={row} />
          : <p className="truncate text-[12px] leading-[19px] text-[var(--text-secondary)]">{entry.description}</p>}
        <p className="truncate text-[11px] leading-[19px] text-[var(--text-muted)]">{originLine}</p>
      </div>

      <span className="w-[150px] shrink-0 pt-[13px] text-right text-[11px] leading-[14.25px] text-[var(--text-muted)]">
        {fmtWhen(entry.createdAt)}
      </span>
    </div>
  );

  return (
    <li data-origin={isAudit ? 'audit' : 'document'} className={cn(severityRowClass(worst))}>
      {expandable ? (
        <button type="button" onClick={onToggle} aria-expanded={isOpen} className="block w-full text-left">
          {body}
        </button>
      ) : (
        body
      )}
      {isOpen ? (
        <div className="mb-[16px] rounded-9e-md bg-[var(--surface-muted)] p-[12px]">
          <AuditRowDetail row={row} flags={flags} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The diff, wrapped in the entry's 19px description line — or NOTHING.
 *
 * `AuditDiff` already returns null for a row with no before/after; this keeps
 * the wrapper on the same side of that decision, so an act-only row emits no
 * paragraph rather than a paragraph containing nothing. Putting the `<p>`
 * outside would have reinstated the empty element one level up, which is
 * precisely how the original `— → —` survived a text-matching guard.
 */
function AuditDiffLine({ row }) {
  if (!hasDiff(row)) return null;
  return (
    <p className="truncate text-[12px] leading-[19px] text-[var(--text-secondary)]">
      <AuditDiff row={row} />
    </p>
  );
}
