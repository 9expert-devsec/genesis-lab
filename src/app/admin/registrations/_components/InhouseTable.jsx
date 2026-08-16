'use client';

import { cn } from '@/lib/utils';
import {
  CellLink,
  ChevronCell,
  CoordinatorCell,
  DateCell,
  StatusCell,
  Th,
  columnWidths,
} from './tableParts';

/**
 * THE IN-HOUSE TABLE BODY — a SEPARATE COMPONENT, not a `source ===` branch
 * inside the public one.
 *
 * The public body and this one share a shell (the panel, the header cell, the
 * row link) and share almost nothing else: an in-house enquiry has no class
 * date, no schedule type, no attendance mode and no payment record, and it
 * carries a company, a participants FLOOR and a preferred month that the public
 * shape has no concept of. Seven columns against six, and only three of them
 * mean the same thing.
 *
 * A shared body branching on `source` is the shape that PRODUCED the defect this
 * file fixes: the columns were one hardcoded public set, so an in-house row
 * resolved `row.courseName`, `row.coordinator.*` and `row.attendeesCount` to
 * undefined and rendered nine blank cells — and two of them defaulted to a
 * confident wrong answer rather than to blank. Adding a branch per cell would
 * put ten `source ===` tests inside one `<tr>`, and the next column added for one
 * source would have to be reasoned about for both.
 *
 * This follows SearchClient.jsx, which keeps five deliberately separate result
 * cards over one `<ResultCard>` shell for the same reason.
 *
 * ══ WHAT CHANGED IN ROUND 3 ══════════════════════════════════════════════════
 *
 *   · เลขอ้างอิง — GONE, as on the public side. refNo still heads the in-house
 *     detail page and search still cannot reach it: the in-house `$or` matches
 *     companyName and the contact's name and email, and `_id` is not among them.
 *     `refNo` is no longer imported here.
 *
 *   · LastEditedHint moved OUT of that cell and into วันที่ส่งคำขอ, mirroring
 *     public — the ruling asked for the mirror, and "when did this arrive" and
 *     "when was it last touched" belong on two lines of one cell.
 *
 *   · รูปแบบ and ผู้เข้าอบรม MERGED into รูปแบบ / จำนวน: the format chip on the
 *     first line, the participant count bold beneath it.
 *
 *   · เดือนที่สนใจ lost its column and kept its home. `preferredMonth` is the
 *     second line of the หลักสูตรที่สนใจ cell now, beside the course code — which
 *     mirrors the public course cell exactly, where the same slot holds the
 *     round date. ASKED RATHER THAN INFERRED: the field renders today and was
 *     not on the removal list, and the general rule is that silence is not a
 *     removal.
 *
 *   · contactPhone STAYS, by ruling. An in-house enquiry is followed up by
 *     telephone and the number is the one thing a salesperson needs straight off
 *     this screen. It is the third line of the coordinator cell — which is one
 *     more line than the geometry draws, and is the one place this table
 *     deliberately exceeds it.
 */

// ── Status ─────────────────────────────────────────────────────────
//
// NO LOCAL COLOUR MAP AND NO LOCAL CHIP. The สถานะ cell is `StatusCell` in
// tableParts, shared with the public table — the two bodies carried
// character-identical copies of it, which is one more place for the same
// vocabulary to drift. Both halves of the chip come from
// lib/registrations/statuses, so one enquiry cannot change colour or wording
// between this list, the summary card above it and the detail page it links to.
//
// The retired colours (`new` / `contacted` / `closed-won` / `closed-lost`) went
// with commit 1: the enum is narrowed, the migration has run, and the live
// collection holds pending / quoted / cancelled and nothing else.

// ── Training format ────────────────────────────────────────────────
//
// A REAL COLUMN, and it was nearly not one. All the stored enquiries say
// 'onsite', so the fill counts read as a constant — but the current zod schema
// makes `trainingFormat` a REQUIRED two-value enum with NO default, and records
// that the old 'flexible' default was removed precisely so the customer has to
// choose. All-onsite is a property of a handful of legacy records, not of the
// field.
//
// 'flexible' is a LEGACY VALUE: gone from the form and from the zod enum, still
// on the Mongoose enum, and still held by documents written before the change.
// It gets a label so an old enquiry does not render a bare enum.
const TRAINING_FORMAT = {
  onsite:   { label: 'Onsite',     cls: 'bg-sky-100 text-sky-700' },
  online:   { label: 'Online',     cls: 'bg-emerald-100 text-emerald-700' },
  flexible: { label: 'ยังไม่ระบุ', cls: 'bg-slate-100 text-slate-500' },
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/**
 * `preferredMonth` is stored as 'YYYY-MM' — a plain string, not a date.
 *
 * Rendered through the same Thai-month + Buddhist-year vocabulary as every other
 * date on this page, because '2026-11' in a column of '6 ส.ค. 2569' reads as a
 * different kind of thing. ANY value that is not exactly 'YYYY-MM' falls through
 * to the raw string rather than to '—': the field is free-form on the way in,
 * and showing what is actually stored beats inventing a blank.
 *
 * Returns '' rather than '—' for an ABSENT value, because this now shares a line
 * with the course code — an em-dash beside a code would read as part of it, and
 * the caller drops the segment entirely instead.
 */
function fmtMonth(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(String(value).trim());
  if (!m) return String(value);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return String(value);
  return `${THAI_MONTHS[monthIndex]} ${Number(m[1]) + 543}`;
}

/**
 * The columns, and their share of the table.
 *
 * SEVEN columns rather than the public six, and a 16px gap rather than 18px —
 * both come straight from the measurement. `columnWidths` turns the shares into
 * CSS that preserves the ratios at any width; the chevron is fixed and is not a
 * member here.
 */
const COLUMN_GAP = 16;

/**
 * ── REVISED AFTER THE CLICK-TEST: สถานะ 12.2 → 10.0, COURSE 20.8 → 23.0 ────
 *
 * The status column was too wide for a chip that sizes to its label, and the
 * 2.2% goes to หลักสูตรที่สนใจ — the in-house column most likely to truncate,
 * since it carries a full course NAME over its code and preferred month.
 *
 * The STRUCTURE is unchanged. รูปแบบ / จำนวน already stands alone here, so the
 * public table's chip extraction has no in-house counterpart; this side takes
 * the chip fix and the status narrowing only. The total is still 89.4% and the
 * 16px gap is unchanged, so the chrome stays 151px and the arithmetic in
 * tableParts still reconciles exactly on this side.
 */
const COLUMNS = [
  { key: 'requested',   label: 'วันที่ส่งคำขอ',    share: 11.2 },
  { key: 'company',     label: 'บริษัท',           share: 17.2 },
  { key: 'course',      label: 'หลักสูตรที่สนใจ',  share: 23.0 },
  { key: 'coordinator', label: 'ผู้ประสานงาน',     share: 16.5 },
  { key: 'mode',        label: 'รูปแบบ / จำนวน',   share: 11.5 },
  { key: 'status',      label: 'สถานะ',            share: 10.0 },
];

const { widths, chevronWidth } = columnWidths({ columns: COLUMNS, gap: COLUMN_GAP });

export function InhouseTable({ items, lastEdited = {}, courseNames = null, detailHref }) {
  /**
   * The route is fixed for this body, and that is not the same claim the public
   * side makes.
   *
   * `detailHref` arrives as a prop so both tables take the same shape and a test
   * can assert one rule about row links — but it DEFAULTS here, because this
   * body only ever renders in-house rows and there is no choice to make.
   * `detailHref` in RegistrationsClient exists to pick BETWEEN the two
   * collections' pages; that branch is already decided by the time this renders.
   */
  const href = detailHref ?? ((id) => `/admin/registrations/inhouse/${id}`);

  return (
    <table className="w-full table-fixed">
      <colgroup>
        {COLUMNS.map((c, i) => <col key={c.key} style={{ width: widths[i] }} />)}
        <col style={{ width: chevronWidth }} />
      </colgroup>

      <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
        <tr>
          {COLUMNS.map((c, i) => (
            <Th key={c.key} first={i === 0} gap={COLUMN_GAP}>{c.label}</Th>
          ))}
          <th scope="col" className="h-[42px]"><span className="sr-only">ดูรายละเอียด</span></th>
        </tr>
      </thead>

      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-[var(--text-muted)]">
              ไม่พบรายการที่ตรงกับเงื่อนไข
            </td>
          </tr>
        )}

        {items.map((row) => {
          const to  = href(row._id);
          const pad = (i) => ({
            paddingLeft:  i === 0 ? '18px' : undefined,
            paddingRight: `${COLUMN_GAP}px`,
          });

          return (
            <tr
              key={row._id}
              className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
            >
              {/* วันที่ส่งคำขอ — with the audit hint beneath, mirroring public. */}
              <td className="p-0 align-top">
                <CellLink href={to} first style={pad(0)}>
                  <DateCell iso={row.createdAt} entry={lastEdited[String(row._id)]} />
                </CellLink>
              </td>

              {/*
                บริษัท — `companyName`, NOT `quotationCompany`.

                The two are the same string on every enquiry the current form
                writes — the API route mirrors one onto the other in exactly one
                place — so the choice only bites on pre-mirror documents, where
                the contact section asked for a company separately and the two can
                genuinely differ. This column shows `companyName` because that is
                the field the search box actually matches: showing the other one
                would mean typing a company name straight off this screen returns
                nothing.
              */}
              <td className="p-0 align-top">
                <CellLink href={to} style={pad(1)}>
                  <p className="truncate text-[14px] font-bold leading-[20px] text-[var(--text-primary)]">
                    {row.companyName || '—'}
                  </p>
                </CellLink>
              </td>

              <td className="p-0 align-top">
                <CellLink href={to} style={pad(2)}>
                  <CourseCell
                    codes={row.coursesInterested}
                    courseNames={courseNames}
                    month={fmtMonth(row.preferredMonth)}
                  />
                </CellLink>
              </td>

              {/* ผู้ประสานงาน — name, email, and the phone kept by ruling. */}
              <td className="p-0 align-top">
                <CellLink href={to} style={pad(3)}>
                  <CoordinatorCell
                    name={`${row.contactFirstName ?? ''} ${row.contactLastName ?? ''}`}
                    email={row.contactEmail}
                    phone={row.contactPhone}
                  />
                </CellLink>
              </td>

              {/* รูปแบบ / จำนวน — the chip, then the count bold beneath it. */}
              <td className="p-0 align-top">
                <CellLink href={to} style={pad(4)}>
                  <ModeCell format={row.trainingFormat} count={row.participantsCount} />
                </CellLink>
              </td>

              <td className="p-0 align-top">
                <CellLink href={to} style={pad(5)}>
                  <StatusCell status={row.status} />
                </CellLink>
              </td>

              <ChevronCell href={to} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

/**
 * รูปแบบ / จำนวน — two columns merged into one cell.
 *
 * ── THE CHIP INVENTS NOTHING, WHICH IS WHY IT IS NOT ScheduleBadge ─────────
 * ScheduleBadge treats a falsy type as "Classroom" — a sensible default for a
 * public class, and a lie about an in-house enquiry, which is how the pre-split
 * table asserted a schedule type on every row. This chip has exactly three
 * outcomes and none of them invents anything: a known value renders its label,
 * an unknown value renders ITSELF (a future enum member shows up as its raw
 * string rather than as the wrong chip), and a missing value renders '—'.
 *
 * The COUNT is a participants FLOOR — the model's minimum is 15 — so it is a
 * real number on every stored enquiry, and `?? '—'` is the guard for a document
 * written before that field existed rather than an expected path.
 */
function ModeCell({ format, count }) {
  const known = format ? TRAINING_FORMAT[format] : null;
  return (
    <>
      {format ? (
        <span className={cn(
          'inline-flex h-[23px] w-fit shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',
          known?.cls ?? 'bg-slate-100 text-slate-600'
        )}>
          {known?.label ?? format}
        </span>
      ) : (
        <span className="text-[12px] text-[var(--text-muted)]">—</span>
      )}
      <p className="text-[13px] font-bold leading-[18px] tabular-nums text-[var(--text-primary)]">
        {count ?? '—'}
      </p>
    </>
  );
}

/**
 * One code → its course name, or null.
 *
 * ── WHY LOWERCASING BOTH SIDES IS SAFE HERE, AND IS NOT THE BUG THE CASING
 *    AUDIT IS ABOUT ────────────────────────────────────────────────────────
 * That audit is about the UPSTREAM query `?course_id=`, which is exact-match
 * case-sensitive and returns nothing when the case differs — a remote filter we
 * do not control. This is a LOCAL lookup in a map we just built from the full
 * list of every course, so lowercasing both sides cannot cause a wrong match:
 * `course_id` values are unique, and two ids differing only in case would be
 * the same course. Do NOT "fix" this back to an exact match — exact matching is
 * what makes the four known mixed-case ids (SQL-PG-Query, SQL-ADM-Tuning,
 * MS-SQL-19-Prov, SQL-ADM-Secure) unresolvable, and this is the one place we
 * are free of that constraint.
 *
 * An empty or whitespace-only name is a MISS, not a resolution: page.jsx never
 * stores one, and `|| null` here is the second guard. The caller must then show
 * the code, never ''.
 */
function resolveCourseName(code, courseNames) {
  if (!code || !courseNames) return null;
  return courseNames[String(code).trim().toLowerCase()] || null;
}

/**
 * หลักสูตรที่สนใจ — the course, and the month it is wanted in.
 *
 * ── THE SHAPE MIRRORS THE PUBLIC COURSE CELL, DELIBERATELY ─────────────────
 * Public renders a bold title over a 32px row holding the round date. This
 * renders a bold title over a 32px row holding the course CODE and the preferred
 * month. Same slot, same rhythm, the nearest equivalent facts: what is being
 * taught, and when.
 *
 * `preferredMonth` lives here because it was ASKED ABOUT rather than inferred
 * away. It renders today, it was not on the removal list, and the geometry gave
 * it no column — which under the general rule is a question, not a deletion.
 *
 * ── `coursesInterested` IS AN ARRAY, AND THE COLUMN HAS ROOM FOR ONE ───────
 * The current form is a single-select that wraps its one choice in an array, so
 * a second entry can only reach here from a legacy document or a hand-crafted
 * POST — the zod schema bounds the array below (min 1) and not above. Truncating
 * silently would make a two-course enquiry indistinguishable from a one-course
 * one, so the extras are COUNTED in the cell and every code is listed in the
 * title attribute; the detail page prints all of them joined.
 *
 * ── THE MISS PATH IS THE POINT ─────────────────────────────────────────────
 * When the name does not resolve — upstream down, a course withdrawn, an id that
 * no longer exists — the CODE becomes the primary line and is NOT repeated
 * underneath, because repeating it under itself says nothing. The month still
 * renders, alone, on the second row.
 *
 * And when there is neither a resolved name nor a month, the second row is
 * ABSENT rather than empty. That is the case this cell can actually produce — a
 * legacy enquiry with an unresolvable code and no preferred month — and it is
 * the empty-element defect this suite has shipped twice.
 */
function CourseCell({ codes, courseNames, month }) {
  const list = (Array.isArray(codes) ? codes : []).filter(Boolean);
  if (list.length === 0) {
    return <span className="text-[12px] text-[var(--text-muted)]">—</span>;
  }
  const [first, ...rest] = list;
  const name = resolveCourseName(first, courseNames);

  // Every code, each with its name when known — so a +N row can still be read
  // on hover rather than hiding what it holds.
  const title = list
    .map((c) => {
      const n = resolveCourseName(c, courseNames);
      return n ? `${c} — ${n}` : c;
    })
    .join('\n');

  // The second row carries the code ONLY when the code is not already the
  // headline, and the month whenever there is one.
  const showCode = Boolean(name);
  const hasSecondRow = showCode || Boolean(month);

  return (
    <div title={title}>
      <div className="flex items-center gap-[6px]">
        <p className={cn(
          'truncate leading-[20px] text-[var(--text-primary)]',
          name ? 'text-[15px] font-bold' : 'font-mono text-[13px] font-semibold'
        )}>
          {name ?? first}
        </p>
        {rest.length > 0 && (
          <span className="shrink-0 rounded bg-[var(--surface-muted)] px-[5px] text-[10px] font-semibold text-[var(--text-secondary)]">
            +{rest.length}
          </span>
        )}
      </div>
      {hasSecondRow ? (
        <div className="flex h-[32px] items-center gap-[7px]">
          {showCode ? (
            <span className="truncate font-mono text-[12px] leading-[15px] text-[var(--text-muted)]">
              {first}
            </span>
          ) : null}
          {month ? (
            <span className="truncate text-[13px] leading-[15px] text-[var(--text-secondary)]">
              {month}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
