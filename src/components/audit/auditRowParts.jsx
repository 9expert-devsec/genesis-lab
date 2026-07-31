'use client';

/**
 * The shared presentation of an audit row.
 *
 * ── WHY THIS IS A MODULE AND NOT COPIED INTO BOTH SURFACES ──────────────────
 * Two surfaces render audit rows: the central page (a table) and the inline
 * RecordHistory widget (a compact panel). Their CONTAINERS differ and should —
 * a <tr> does not belong in a sidebar. What must NOT differ is everything
 * inside: the timestamp format, the payload preview, the severity colour, and
 * the expanded before/after block.
 *
 * A row flagged amber on the central page has to look amber here too. A second
 * severity scheme is how a reader learns to distrust both.
 */

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HEALTH_LEVEL, HEALTH_LABEL } from '@/lib/audit/auditHealth';
import { displayRecordId } from '@/lib/refNo';

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/** "31 ก.ค. 2569 17:38" — absolute, for the central page and the modal. */
export function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${hh}:${mm}`;
}

/**
 * "2 ชม. ที่แล้ว" — relative, for the inline hint on list pages.
 *
 * Relative because the question there is "is this recent?", not "when exactly?".
 * Past about a week it falls back to the absolute date, since "43 วันที่แล้ว"
 * is harder to read than the date itself.
 */
export function fmtRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'เมื่อครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม. ที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} วันที่แล้ว`;
  return fmtWhen(iso).slice(0, -6); // drop the clock time, keep the date
}

/** Compact one payload for a single line. The full object lives in the detail. */
export function preview(value) {
  if (value == null) return '—';
  if (typeof value !== 'object') return String(value);
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'status') return String(value.status);
  return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}}`;
}

/** The worst level among a row's flags, or null when it is clean. */
export function rowSeverity(flags = []) {
  if (flags.some((f) => HEALTH_LEVEL[f] === 'red')) return 'red';
  return flags.length ? 'amber' : null;
}

/** Tailwind classes for a row background at a given severity. */
export function severityRowClass(level) {
  if (level === 'red') return 'bg-rose-50/60 dark:bg-rose-500/10';
  if (level === 'amber') return 'bg-amber-50/60 dark:bg-amber-500/10';
  return '';
}

export function LevelDot({ level }) {
  return (
    <span className={cn('h-2 w-2 shrink-0 rounded-full',
      level === 'red' ? 'bg-rose-500' : 'bg-amber-500')} />
  );
}

export function SeverityIcon({ level }) {
  if (!level) return <span className="text-xs text-emerald-600">✓</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <LevelDot level={level} />
      <AlertTriangle className={cn('h-3.5 w-3.5', level === 'red' ? 'text-rose-600' : 'text-amber-600')} />
    </span>
  );
}

export function HealthFlagList({ flags = [] }) {
  if (!flags.length) return null;
  return (
    <ul className="mb-3 space-y-1">
      {flags.map((f) => (
        <li key={f} className="flex items-center gap-2 text-xs">
          <LevelDot level={HEALTH_LEVEL[f]} />
          <span className="text-[var(--text-primary)]">{HEALTH_LABEL[f]}</span>
        </li>
      ))}
    </ul>
  );
}

export function Payload({ title, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">{title}</p>
      <pre className="overflow-x-auto rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-primary)]">
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** The expanded body of a row — identical on both surfaces. */
export function AuditRowDetail({ row, flags }) {
  return (
    <>
      <HealthFlagList flags={flags} />
      <div className="grid gap-4 md:grid-cols-2">
        <Payload title="ก่อน" value={row.before} />
        <Payload title="หลัง" value={row.after} />
        {row.meta != null && <Payload title="meta" value={row.meta} />}
      </div>
    </>
  );
}

/**
 * The record's identity as a human reads it.
 *
 * `displayRecordId` shortens a Mongo/MSDB ObjectId to its reference number and
 * leaves an already-readable id (a course code, a role key) alone.
 */
export function RecordIdentity({ row }) {
  return (
    <>
      <p className="truncate text-[var(--text-primary)]">{row.recordLabel || '—'}</p>
      <p className="truncate font-mono text-xs text-[var(--text-muted)]">
        {displayRecordId(row.recordId) || '—'}
      </p>
    </>
  );
}

/**
 * The list-page "edited last" hint.
 *
 * Renders NOTHING when there is no entry. Deliberate: most rows predate the log
 * and a column full of "ไม่ทราบ" reads as data loss rather than as a feature
 * that started recording last week. Absent means absent.
 *
 * A hint, not a data column — one muted line, no header of its own.
 */
export function LastEditedHint({ entry }) {
  if (!entry?.createdAt) return null;
  const when = fmtRelative(entry.createdAt);
  const who = entry.actorName;
  return (
    <span className="block truncate text-xs text-[var(--text-muted)]" title={fmtWhen(entry.createdAt)}>
      {[when, who].filter(Boolean).join(' · ')}
    </span>
  );
}

export function ActionChip({ action }) {
  return (
    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 font-mono text-xs text-[var(--text-primary)]">
      {action}
    </span>
  );
}
