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
import { statusLabel } from '@/lib/registrations/statuses';

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

/**
 * Compact one payload for a single line. The full object lives in the detail.
 *
 * ── A `{status}` PAYLOAD RENDERS ITS THAI LABEL, LIVE OR RETIRED ────────────
 *
 * `{status}` is the ONE payload this trail is allowed to carry (see the PII
 * note in lib/actions/registrations.js), so it is also the one a human actually
 * reads on the line: `รอดำเนินการ → ส่งใบเสนอราคาแล้ว`. It used to print the
 * raw enum, which was tolerable while the values were the only vocabulary
 * anyone saw.
 *
 * ROUND 2 MADE IT INTOLERABLE. admin_audit_logs holds in-house rows carrying
 * `new`, `contacted`, `closed-won` and `closed-lost` — values that no longer
 * exist anywhere else in the product. Those rows are HISTORICAL FACT and are
 * deliberately NOT migrated (the trail is only evidence because nothing in it
 * is ever rewritten), so without a legacy lookup they would sit in the history
 * as bare English enum strings that nothing else on any screen can explain.
 *
 * `statusLabel` answers for the live vocabulary AND for the four retired
 * values, from two DELIBERATELY SEPARATE maps — live statuses drive the filters
 * and the buttons, legacy labels only ever decorate history, and merging them
 * would make a retired value selectable again. It returns an unknown value
 * UNCHANGED, so a payload from a collection this module has never heard of
 * still shows what it holds rather than being hidden behind a dash.
 *
 * ── THE `Payload` BLOCKS BELOW ARE DELIBERATELY LEFT RAW ────────────────────
 * They are `JSON.stringify` of the stored object, and that is their job: the
 * expanded detail is the evidence exactly as recorded. Labelling it there would
 * mean the compact line and the detail disagreed about what the row SAYS, and
 * the detail is the half that has to be literal.
 */
export function preview(value) {
  if (value == null) return '—';
  if (typeof value !== 'object') return String(value);
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'status') return statusLabel(value.status);
  return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}}`;
}

/**
 * Does this row actually RECORD a change, as opposed to recording that one
 * happened?
 *
 * ── THE ROW THAT READ `update — → —` ────────────────────────────────────────
 *
 * A field edit on a registration renders — rendered — as `update` followed by
 * `— → —`: an arrow between two dashes, which reads as a broken row. The data is
 * correct and the emptiness is DELIBERATE. lib/actions/registrations.js records
 * no before/after for a field edit, and its own comment says why at length:
 *
 *     "THE ACT ONLY. This edits the record wholesale — the `update` object can
 *      carry the customer's name, email, phone, tax id and every attendee's
 *      contact details. None of it goes in the trail. Which FIELDS changed is
 *      answerable from a backup; who edited the registration and when is not."
 *
 * The audit collection is append-only and presently forever, so a payload copied
 * into it cannot be redacted when a deletion request arrives. Status transitions
 * are the ONE exception — `{status}` is a short enum with no personal data in it
 * — and everything else records the act and the id.
 *
 * ── SO THIS IS A DISPLAY FIX AND NOT A DATA ONE ────────────────────────────
 *
 * The row is not wrong and it is not missing. What is wrong is that the
 * PRESENTATION promises a diff and then has none to show. A row with nothing
 * recorded should read as what it is — an edit was made, by whom, when — which
 * is what the action chip and the actor line already say.
 *
 * Do NOT "complete" this by adding the diff. The reason it is empty is in the
 * action, in a comment, and it is a privacy decision rather than an oversight.
 * Do NOT remove the row either: that an edit happened is exactly the fact the
 * trail exists to hold.
 *
 * Status transitions keep their `pending → cancelled` rendering, which is
 * readable and carries the round-2 legacy label map through `preview`.
 */
export function hasDiff(row) {
  return row?.before != null || row?.after != null;
}

/**
 * The compact `before → after` line, or NOTHING.
 *
 * ── IT RETURNS `null`, NOT AN EMPTY ELEMENT ────────────────────────────────
 * A `<span></span>` standing in for the missing diff would satisfy every
 * assertion that reads for the ABSENCE of a dash while leaving the row exactly
 * as broken — invisible to text matching, which is why the guard on this is
 * written against element SHAPE rather than against the string "—".
 *
 * Shared by both surfaces on purpose. This module's whole premise is that the
 * central page and the inline panel differ in their CONTAINER and in nothing
 * inside it; a diff line fixed on one and left alone on the other is the second
 * severity scheme that premise exists to prevent.
 */
export function AuditDiff({ row }) {
  if (!hasDiff(row)) return null;
  return (
    <span className="font-mono text-xs text-[var(--text-secondary)]">
      {preview(row.before)} <span className="text-[var(--text-muted)]">→</span> {preview(row.after)}
    </span>
  );
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
