'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { refNo } from '@/lib/refNo';
import { LastEditedHint } from '@/components/audit/auditRowParts';
import { statusBadge, statusLabel } from '@/lib/registrations/statuses';

/**
 * THE IN-HOUSE TABLE BODY — a SEPARATE COMPONENT, not a `source ===` branch
 * inside the public one.
 *
 * The public body and this one share a shell (a bordered box, a header row,
 * `Th`) and share almost nothing else: an in-house enquiry has no class date,
 * no schedule type, no attendance mode, no invoice flag and no payment record,
 * and it carries a company, a participants FLOOR and a preferred month that the
 * public shape has no concept of. Nine columns against eleven, and only four of
 * them mean the same thing.
 *
 * A shared body branching on `source` is the shape that PRODUCED the defect
 * this file fixes: the columns were one hardcoded public set, so an in-house row
 * resolved `row.courseName`, `row.coordinator.*` and `row.attendeesCount` to
 * undefined and rendered nine blank cells — and two of them defaulted to a
 * confident wrong answer rather than to blank (see the two notes below). Adding
 * a branch per cell would put ten `source ===` tests inside one `<tr>`, and the
 * next column added for one source would have to be reasoned about for both.
 *
 * This follows SearchClient.jsx, which keeps five deliberately separate result
 * cards over one `<ResultCard>` shell for the same reason, recorded there as:
 * "A shared `<ResultCard>` taking all of that would end up branching on
 * `isPromotion` / `isCourse` inside itself... tuning one card means editing that
 * card's JSX and touching nothing else."
 *
 * The concrete payoff here is the one this commit had to guarantee: the public
 * table is not edited AT ALL, so it cannot regress. `git diff -w` on
 * RegistrationsClient shows no change to any public cell.
 */

// ── Status ─────────────────────────────────────────────────────────
//
// NO LOCAL COLOUR MAP. Both halves of the chip — the Thai text and the Tailwind
// classes — now come from lib/registrations/statuses, so one enquiry cannot
// change colour or wording between this list, the summary card above it and the
// detail page it links to.
//
// ── THE RETIRED COLOURS ARE GONE, AND THIS IS THE MOMENT FOR IT ────
// Round 2 kept `new` / `contacted` / `closed-won` / `closed-lost` in a local
// map for the WINDOW between that code deploying and the migration's --apply,
// so unmigrated rows would not all render grey. Its comment said they are
// "deleted with the enum, not before it". The enum was narrowed to the three
// live values and the migration has since run — the collection now holds
// pending 5 / quoted 2 / cancelled 1 and nothing else — so no document can
// carry a retired status and the fallback they existed to avoid is unreachable.
//
// `statusBadge` returns the neutral grey chip for anything it does not know,
// which is the right answer for a value that should no longer exist at all.

// ── Training format ────────────────────────────────────────────────
//
// A REAL COLUMN, and it was nearly not one. All four stored enquiries say
// 'onsite', so the fill counts read as a constant — but the current zod schema
// makes `trainingFormat` a REQUIRED two-value enum with NO default, and records
// that the old 'flexible' default was removed precisely so the customer has to
// choose. All-onsite is a property of four legacy records, not of the field.
//
// 'flexible' is a LEGACY VALUE: gone from the form and from the zod enum, still
// on the Mongoose enum, and still held by documents written before the change.
// It gets a label so an old enquiry does not render a bare enum.
const TRAINING_FORMAT = {
  onsite:   { label: 'Onsite',            cls: 'bg-sky-100 text-sky-700' },
  online:   { label: 'Online',            cls: 'bg-emerald-100 text-emerald-700' },
  flexible: { label: 'ยังไม่ระบุ',        cls: 'bg-slate-100 text-slate-500' },
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * `preferredMonth` is stored as 'YYYY-MM' — a plain string, not a date.
 *
 * Rendered through the same Thai-month + Buddhist-year vocabulary as every other
 * date on this page, because '2026-11' in a column of '6 ส.ค. 2569' reads as a
 * different kind of thing. ANY value that is not exactly 'YYYY-MM' falls through
 * to the raw string rather than to '—': the field is free-form on the way in,
 * and showing what is actually stored beats inventing a blank. That is the same
 * rule the two fixed cells below follow.
 */
function fmtMonth(value) {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})$/.exec(String(value).trim());
  if (!m) return value;
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return value;
  return `${THAI_MONTHS[monthIndex]} ${Number(m[1]) + 543}`;
}

/*
 * ── NO OUTER CARD IN THIS FILE ──────────────────────────────────────────────
 * The bordered box and the horizontal-scroll wrapper this table used to draw
 * for itself now belong to ListPanel, which draws them ONCE for whichever body
 * is showing. They were duplicated here and in the public block, which is two
 * places for the panel chrome to drift apart — and while both were rendering,
 * an in-house page drew a card inside a card and painted two borders.
 */
export function InhouseTable({ items, lastEdited = {}, courseNames = null }) {
  return (
    <table className="w-full text-sm">
          <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
            <tr>
              <Th>เลขอ้างอิง</Th>
              <Th>บริษัท</Th>
              <Th>หลักสูตรที่สนใจ</Th>
              <Th>รูปแบบ</Th>
              <Th>ผู้ประสานงาน</Th>
              <Th center>ผู้เข้าอบรม</Th>
              <Th>เดือนที่สนใจ</Th>
              <Th>สถานะ</Th>
              <Th>วันที่ส่งคำขอ</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-[var(--text-muted)]">
                  ไม่พบรายการที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
            {items.map((row) => (
              <tr
                key={row._id}
                className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
              >
                <td className="px-4 py-3 font-mono text-xs font-bold text-9e-action">
                  {refNo(row._id)}
                  <LastEditedHint entry={lastEdited[String(row._id)]} />
                </td>

                {/*
                  `companyName`, NOT `quotationCompany`. The two are the same
                  string on every enquiry the current form writes — the API route
                  mirrors one onto the other in exactly one place — so the choice
                  only bites on pre-mirror documents, where the contact section
                  asked for a company separately and the two can genuinely differ.
                  This column shows `companyName` because that is the field the
                  search box actually matches: showing the other one would mean
                  typing a company name straight off this screen returns nothing.
                */}
                <td className="max-w-[200px] px-4 py-3">
                  <p className="truncate font-medium text-[var(--text-primary)]">
                    {row.companyName || '—'}
                  </p>
                </td>

                {/*
                  NAME over CODE — the same two-line shape the public หลักสูตร
                  cell uses, rather than a third arrangement. Sales staff know
                  these by code, so the code stays visible underneath instead of
                  being replaced. Slightly wider than the public cell's 180px
                  because a course NAME is much longer than a class date.
                */}
                <td className="max-w-[220px] px-4 py-3">
                  <CourseCell codes={row.coursesInterested} courseNames={courseNames} />
                </td>

                {/*
                  NOT ScheduleBadge. That component's `!type` branch prints
                  "Classroom", which is what made this cell state a falsehood on
                  every in-house row before it had a column of its own — an
                  in-house enquiry has no schedule type at all. This chip has no
                  such branch: a value it does not recognise prints itself, and
                  an absent one prints '—'.
                */}
                <td className="px-4 py-3">
                  <TrainingFormatChip value={row.trainingFormat} />
                </td>

                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--text-primary)]">
                    {`${row.contactFirstName ?? ''} ${row.contactLastName ?? ''}`.trim() || '—'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{row.contactEmail}</p>
                  {row.contactPhone && (
                    <p className="text-xs text-[var(--text-muted)]">{row.contactPhone}</p>
                  )}
                </td>

                <td className="px-4 py-3 text-center tabular-nums text-[var(--text-primary)]">
                  {row.participantsCount ?? '—'}
                </td>

                <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                  {fmtMonth(row.preferredMonth)}
                </td>

                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                    statusBadge(row.status)
                  )}>
                    {statusLabel(row.status)}
                  </span>
                </td>

                <td className="px-4 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                  {fmtDate(row.createdAt)}
                </td>

                <td className="px-4 py-3 text-right">
                  {/*
                    Unconditional: this body only ever renders in-house rows, so
                    there is no choice to make. `detailHref` in RegistrationsClient
                    exists to pick BETWEEN the two collections' pages (266de12) —
                    the branch it encodes is already decided here.
                  */}
                  <Link
                    href={`/admin/registrations/inhouse/${row._id}`}
                    className="text-xs font-semibold text-9e-action hover:underline whitespace-nowrap"
                  >
                    ดูรายละเอียด →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
    </table>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Th({ children, center }) {
  return (
    <th className={cn(
      'px-4 py-3 text-xs font-medium text-[var(--text-secondary)]',
      center ? 'text-center' : 'text-left'
    )}>
      {children}
    </th>
  );
}

/**
 * Onsite / Online, rendered as themselves.
 *
 * THE RULE THIS CHIP EXISTS TO KEEP: no branch may substitute a value the
 * document does not hold. ScheduleBadge treats a falsy type as "Classroom" — a
 * sensible default for a public class, and a lie about an in-house enquiry,
 * which is how the pre-fix table asserted a schedule type on all four rows.
 *
 * So there are exactly three outcomes and none of them invents anything:
 * a known value renders its label, an unknown value renders ITSELF (a future
 * enum member shows up as its raw string rather than as the wrong chip), and a
 * missing value renders '—'.
 */
function TrainingFormatChip({ value }) {
  if (!value) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  const known = TRAINING_FORMAT[value];
  return (
    <span className={cn(
      'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
      known?.cls ?? 'bg-slate-100 text-slate-600'
    )}>
      {known?.label ?? value}
    </span>
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
 * `coursesInterested` is an ARRAY, and the column has room for one course.
 *
 * The current form is a single-select that wraps its one choice in an array, so
 * a second entry can only reach here from a legacy document or a hand-crafted
 * POST — the zod schema bounds the array below (min 1) and not above. Truncating
 * silently would make a two-course enquiry indistinguishable from a one-course
 * one, so the extras are COUNTED in the cell and every code is listed in the
 * title attribute; the detail page prints all of them joined.
 *
 * THE MISS PATH IS THE POINT. When the name does not resolve — upstream down,
 * a course withdrawn, an id that no longer exists — the CODE becomes the primary
 * line and the second line is dropped, because repeating the code under itself
 * says nothing. What must never happen is an empty cell: that is indistinguishable
 * from missing data, and this table exists because of cells that looked empty.
 */
function CourseCell({ codes, courseNames }) {
  const list = (Array.isArray(codes) ? codes : []).filter(Boolean);
  if (list.length === 0) {
    return <span className="text-xs text-[var(--text-muted)]">—</span>;
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

  return (
    <div title={title}>
      <div className="flex items-center gap-1.5">
        <p className={cn(
          'truncate',
          name
            ? 'font-medium text-[var(--text-primary)]'
            : 'font-mono text-xs font-semibold text-[var(--text-primary)]'
        )}>
          {name ?? first}
        </p>
        {rest.length > 0 && (
          <span className="shrink-0 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
            +{rest.length}
          </span>
        )}
      </div>
      {name && (
        <p className="truncate font-mono text-xs text-[var(--text-muted)]">{first}</p>
      )}
    </div>
  );
}
