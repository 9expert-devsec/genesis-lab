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
 * THE PUBLIC REGISTRATIONS TABLE.
 *
 * Extracted from RegistrationsClient, where it had been inline since the
 * in-house body was split out, and rebuilt to the measured column set. It is a
 * sibling of InhouseTable rather than a branch inside it, for the reason that
 * file's header gives at length: the two collections share a frame and almost no
 * columns, and a shared body branching on `source` is what once rendered an
 * in-house document through public cells.
 *
 * ══ WHAT LEFT THE TABLE, AND WHERE IT WENT ═══════════════════════════════════
 *
 * Eleven columns became six. Four of them were removed by ruling, and none of
 * the information is lost — it is on the detail page, which is one click away
 * and is where a reader goes to answer a question about ONE registration.
 *
 *   · เลขอ้างอิง — GONE ENTIRELY. It still heads the detail page, and search
 *     still cannot reach it: the public `$or` in lib/registrations/listFilter
 *     matches courseName and the coordinator's name and email, and `_id` is not
 *     among them and could not be, since the reference number is a computed
 *     suffix of the id rather than a stored field. So the column was a
 *     monospace identifier nobody could look up, occupying the leftmost slot.
 *     `refNo` is no longer imported here at all.
 *
 *   · ใบเสนอราคา and ชำระเงิน — the two tick columns, GONE. Both were
 *     single-glyph answers to questions the detail page answers properly, and
 *     the payment chip additionally asserted a method for rows that have no
 *     payment record at all.
 *
 *   · วันอบรม — folded INTO the course cell as its round-date line, which is
 *     what "หลักสูตร / รอบอบรม" means. It was rendering `row.classDate` twice on
 *     every row: once as its own column and once as the course cell's sub-line.
 *
 *   · รูปแบบ — folded into the course cell as the schedule chip, beside the
 *     round date it qualifies.
 *
 * `payment`, `pricing` and `requestInvoice` therefore leave the LIST PROJECTION
 * as well, in this commit — see listRegistrations. A projection that is a
 * superset of the render is dead weight over the wire; the rule this table has
 * always been held to is that the two lists are equal.
 *
 * ScheduleBadge STAYS WHOLE by ruling, which is why `scheduleType` AND
 * `attendanceMode` are both still projected: the chip says "Hybrid · Teams" or
 * "Hybrid · Class", and dropping the mode would turn two distinct arrangements
 * into one word.
 */

/**
 * The columns, and their share of the table.
 *
 * `share` is the design's percentage of a 1440-wide table, describing the
 * CONTENT box. `columnWidths` turns the set into CSS that preserves the ratios
 * at any width — see its docstring for the arithmetic and for how the reading
 * was confirmed against the design. The chevron is fixed and is not a member
 * here: it has no label, no share and no data.
 */
const COLUMN_GAP = 18;

const COLUMNS = [
  { key: 'date',        label: 'วันที่สมัคร',        share: 13.3 },
  { key: 'course',      label: 'หลักสูตร / รอบอบรม', share: 30.0 },
  { key: 'coordinator', label: 'ผู้ประสานงาน',       share: 20.3 },
  { key: 'attendees',   label: 'ผู้เข้าอบรม',        share: 11.7 },
  { key: 'status',      label: 'สถานะ',             share: 14.6 },
];

const SCHEDULE_BADGE = {
  hybrid:    'bg-violet-100 text-violet-700',
  online:    'bg-emerald-100 text-emerald-700',
  classroom: 'bg-sky-100 text-sky-700',
};

const { widths, chevronWidth } = columnWidths({ columns: COLUMNS, gap: COLUMN_GAP });

export function PublicTable({ items, lastEdited = {}, detailHref }) {
  return (
    <table className="w-full table-fixed">
      {/*
        `<colgroup>` plus `table-fixed`, rather than a width on each `<td>`. The
        widths are a property of the COLUMN, and stating them once means a cell
        cannot disagree with its header — which is the whole reason a table is
        the right element here and a grid of divs is not.
      */}
      <colgroup>
        {COLUMNS.map((c, i) => <col key={c.key} style={{ width: widths[i] }} />)}
        <col style={{ width: chevronWidth }} />
      </colgroup>

      <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
        <tr>
          {COLUMNS.map((c, i) => (
            <Th key={c.key} first={i === 0} gap={COLUMN_GAP}>{c.label}</Th>
          ))}
          {/*
            The chevron column has no label. `<th>` with no text rather than a
            `<td>`, so the header row is a complete row of header cells — and
            with a screen-reader name, because an unlabelled column header is
            announced as nothing at all.
          */}
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
          const href = detailHref(row._id);
          // One padding-left per column, so every cell's link fills its own box
          // and the clickable area has no seams. Column 0 also carries the edge.
          const pad = (i) => ({
            paddingLeft:  i === 0 ? '18px' : undefined,
            paddingRight: `${COLUMN_GAP}px`,
          });

          return (
            <tr
              key={row._id}
              className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
            >
              {/* วันที่สมัคร — the date, with the audit hint beneath it. */}
              <td className="p-0 align-top">
                <CellLink href={href} first style={pad(0)}>
                  <DateCell iso={row.createdAt} entry={lastEdited[String(row._id)]} />
                </CellLink>
              </td>

              {/* หลักสูตร / รอบอบรม — the title, then a 32px row holding the
                  round date and the schedule chip 7px after it. */}
              <td className="p-0 align-top">
                <CellLink href={href} style={pad(1)}>
                  <CourseCell
                    name={row.courseName}
                    classDate={row.classDate}
                    scheduleType={row.scheduleType}
                    attendanceMode={row.attendanceMode}
                  />
                </CellLink>
              </td>

              <td className="p-0 align-top">
                <CellLink href={href} style={pad(2)}>
                  <CoordinatorCell
                    name={`${row.coordinator?.firstName ?? ''} ${row.coordinator?.lastName ?? ''}`}
                    email={row.coordinator?.email}
                  />
                </CellLink>
              </td>

              {/*
                ผู้เข้าอบรม — THE NUMBER ONLY.

                The design puts a ครบ / ยังไม่ครบ / แจ้งภายหลัง chip under it. Ruled
                out, and the projection is deliberately NOT widened to derive one:
                that state would have to come from `attendeesListProvided` and the
                `attendees` array, neither of which this list fetches, and adding
                them would pull a personal-data array into a list query to render
                a three-way chip.
              */}
              <td className="p-0 align-top">
                <CellLink href={href} style={pad(3)}>
                  <p className="text-[14px] font-bold leading-[17px] tabular-nums text-[var(--text-primary)]">
                    {row.attendeesCount ?? '—'}
                  </p>
                </CellLink>
              </td>

              {/* สถานะ — the chip, and nothing under it. See StatusCell. */}
              <td className="p-0 align-top">
                <CellLink href={href} style={pad(4)}>
                  <StatusCell status={row.status} />
                </CellLink>
              </td>

              <ChevronCell href={href} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

/**
 * The course cell: a bold 18px title over a 32px row.
 *
 * ── THE SECOND ROW IS UNCONDITIONAL, AND THAT IS A DERIVED FACT ────────────
 * The row holds the round date and the schedule chip. The DATE is optional and
 * is guarded; the CHIP is not, because ScheduleBadge has no empty branch —
 * a falsy `scheduleType` renders "Classroom", which is the correct default for a
 * public class and is exactly why the ruling keeps that component whole.
 *
 * So the row can never be empty, and it is rendered unconditionally rather than
 * wrapped in a `hasSecondRow` test. Writing that test would have LOOKED like the
 * empty-element discipline while being vacuous — the chip is always truthy, so
 * the condition is always true and the guard proves nothing. A guard that cannot
 * fail is worse than no guard, because the next reader believes it.
 *
 * If ScheduleBadge ever gains a branch that renders nothing, this must gain the
 * test at the same time. The render tier would catch the gap: the empty-element
 * assertion runs over both tables.
 */
function CourseCell({ name, classDate, scheduleType, attendanceMode }) {
  return (
    <>
      <p className="truncate text-[15px] font-bold leading-[20px] text-[var(--text-primary)]">
        {name || '—'}
      </p>
      <div className="flex h-[32px] items-center gap-[7px]">
        {classDate ? (
          <span className="truncate text-[13px] leading-[15px] text-[var(--text-secondary)]">
            {classDate}
          </span>
        ) : null}
        <ScheduleBadge type={scheduleType} mode={attendanceMode} />
      </div>
    </>
  );
}

/**
 * The schedule chip: 23px tall, 7px of horizontal padding.
 *
 * KEPT WHOLE BY RULING — both `scheduleType` and `attendanceMode` stay in the
 * projection so a hybrid round can still say which way it runs. Collapsing it to
 * the type alone would make "Hybrid · Teams" and "Hybrid · Class" the same chip.
 *
 * `SCHEDULE_BADGE` is keyed by `scheduleType`, a course-schedule property with
 * its own vocabulary. It is NOT a status map and must not acquire an entry in
 * the status module — a test pins that it keeps its own neutral fallback, which
 * happens to be the same grey the neutral status chip uses and is not the same
 * decision.
 */
function ScheduleBadge({ type, mode }) {
  if (!type || type === 'classroom') {
    return (
      <span className={cn(
        'inline-flex h-[23px] shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',
        SCHEDULE_BADGE.classroom
      )}>
        Classroom
      </span>
    );
  }
  return (
    <span className={cn(
      'inline-flex h-[23px] shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',
      SCHEDULE_BADGE[type] ?? 'bg-slate-100 text-slate-600'
    )}>
      {type === 'hybrid'
        ? (mode === 'teams' ? 'Hybrid · Teams' : 'Hybrid · Class')
        : 'Online'}
    </span>
  );
}
