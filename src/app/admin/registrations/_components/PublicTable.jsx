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
 * Eleven columns became six in the round-3 rebuild, and SEVEN after the
 * click-test put รูปแบบ back into a column of its own (see the note on COLUMNS).
 * Four were removed by ruling, and none of that information is lost — it is on
 * the detail page, which is one click away and is where a reader goes to answer
 * a question about ONE registration.
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
 *   · รูปแบบ — folded into the course cell in the rebuild, and UN-FOLDED after
 *     the click-test: it is a column again, between หลักสูตร and ผู้ประสานงาน.
 *     Sharing the course cell's 32px line was costing the course NAME enough
 *     width to truncate it on the first row.
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

/**
 * ── REVISED AFTER THE CLICK-TEST. SIX COLUMNS, NOT FIVE. ───────────────────
 *
 * รูปแบบ is its own column now, between หลักสูตร and ผู้ประสานงาน, and three
 * other shares moved with it. The shares still sum to 89.9% — the design's
 * total — so the set is a redistribution rather than a widening.
 *
 *   วันที่สมัคร        13.3 → 13.0
 *   หลักสูตร / รอบอบรม  30.0 → 32.0   gains the chip's space, and more
 *   รูปแบบ             new    8.5
 *   ผู้ประสานงาน       20.3 → 20.0
 *   ผู้เข้าอบรม        11.7 →  5.5   it holds ONE number
 *   สถานะ             14.6 → 10.9
 *
 * WHY THE COURSE CELL GAINS MORE THAN THE CHIP TOOK: the course name was
 * truncating on the very first row — "Data Analysis Expression (D…" — because
 * the chip competed for that cell's width on the same 32px line as the round
 * dates. Moving the chip out frees the line; the extra 2% is the name getting
 * back what it had lost.
 *
 * ผู้เข้าอบรม was sized when it still carried the ครบ / ยังไม่ครบ / แจ้งภายหลัง
 * chip that was ruled out. It has held a single number ever since, and 11.7% of
 * a 1440 table for two digits was the ruling's leftover, not a measurement.
 *
 * ── THE CHROME GREW WITH THE COLUMN, AND THE TWO NO LONGER RECONCILE EXACTLY
 * A sixth column means a sixth 18px gap, so the fixed chrome goes from 145px to
 * 163px while the shares still total 89.9%. At 1440 those over-account by ~18px,
 * where the five-column set reconciled to the pixel. `columnWidths` normalises
 * the ratios against whatever the chrome actually is, so the columns still fill
 * exactly 100% and the RATIOS between them are exactly as specified — each
 * content column simply lands ~1.4% narrower than its bare percentage would
 * suggest. Stated because the arithmetic in tableParts' docstring is what
 * confirmed the original reading, and it no longer closes as neatly.
 */
const COLUMNS = [
  { key: 'date',        label: 'วันที่สมัคร',        share: 13.0 },
  { key: 'course',      label: 'หลักสูตร / รอบอบรม', share: 32.0 },
  { key: 'format',      label: 'รูปแบบ',            share:  8.5 },
  { key: 'coordinator', label: 'ผู้ประสานงาน',       share: 20.0 },
  { key: 'attendees',   label: 'ผู้เข้าอบรม',        share:  5.5 },
  { key: 'status',      label: 'สถานะ',             share: 10.9 },
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
                  round dates. The schedule chip has moved to its own column. */}
              <td className="p-0 align-top">
                <CellLink href={href} style={pad(1)}>
                  <CourseCell name={row.courseName} classDate={row.classDate} />
                </CellLink>
              </td>

              {/*
                รูปแบบ — the chip alone, vertically centred.

                It was inside the course cell, sharing the 32px line with the
                round dates, and it competed for that width badly enough that the
                first row's course name truncated. Its own column costs 8.5% and
                gives 2% of it back to the name.
              */}
              <td className="p-0 align-top">
                <CellLink href={href} className="items-start" style={pad(2)}>
                  <ScheduleBadge type={row.scheduleType} mode={row.attendanceMode} />
                </CellLink>
              </td>

              <td className="p-0 align-top">
                <CellLink href={href} style={pad(3)}>
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
                <CellLink href={href} style={pad(4)}>
                  <p className="text-[14px] font-bold leading-[17px] tabular-nums text-[var(--text-primary)]">
                    {row.attendeesCount ?? '—'}
                  </p>
                </CellLink>
              </td>

              {/* สถานะ — the chip, and nothing under it. See StatusCell. */}
              <td className="p-0 align-top">
                <CellLink href={href} style={pad(5)}>
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
 * The course cell: a bold 18px title over a 32px row of round dates.
 *
 * ── THE SECOND ROW IS CONDITIONAL AGAIN, AND THAT CHANGED WITH THE CHIP ────
 * It used to be unconditional, and the previous version of this comment
 * explained why at length: the row held the round date AND the schedule chip,
 * the chip has no empty branch (a falsy `scheduleType` renders "Classroom"), so
 * the row could never be empty and a `hasSecondRow` test would have been vacuous
 * — a guard that cannot fail.
 *
 * MOVING THE CHIP OUT INVERTED THAT. The row now holds the round dates and
 * nothing else, and `classDate` is genuinely optional, so a course with no round
 * date would render 32px of nothing. The guard is real now and it is measured:
 * the sparse fixture in the render tests carries `classDate: ''`, and deleting
 * this condition reddens the empty-element assertion.
 *
 * The lesson is the reason the old comment was written down rather than the
 * guard just being added: whether a guard is real depends on what else is in the
 * box, and that changes when columns move.
 */
function CourseCell({ name, classDate }) {
  return (
    <>
      <p className="truncate text-[15px] font-bold leading-[20px] text-[var(--text-primary)]">
        {name || '—'}
      </p>
      {classDate ? (
        <div className="flex h-[32px] items-center">
          <span className="truncate text-[13px] leading-[15px] text-[var(--text-secondary)]">
            {classDate}
          </span>
        </div>
      ) : null}
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
 *
 * ── `w-fit` ARRIVED WHEN THE CHIP MOVED, AND IT IS NOT COSMETIC ────────────
 * Inside the course cell this chip sat in a `flex items-center` ROW, where there
 * was no cross-axis stretch and it sized itself. In its own column it is a
 * DIRECT CHILD of `CellLink`, which is `flex flex-col` — so it inherits exactly
 * the defect the status chip was just fixed for: a flex item is blockified and
 * the column's default `align-items: stretch` spreads it across the whole 8.5%.
 *
 * Moving an element between boxes can change whether it needs a width
 * constraint, which is why the compiled-CSS guard sweeps EVERY chip in both
 * tables rather than naming the one that was broken.
 */
function ScheduleBadge({ type, mode }) {
  if (!type || type === 'classroom') {
    return (
      <span className={cn(
        'inline-flex h-[23px] w-fit shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',
        SCHEDULE_BADGE.classroom
      )}>
        Classroom
      </span>
    );
  }
  return (
    <span className={cn(
      'inline-flex h-[23px] w-fit shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',
      SCHEDULE_BADGE[type] ?? 'bg-slate-100 text-slate-600'
    )}>
      {type === 'hybrid'
        ? (mode === 'teams' ? 'Hybrid · Teams' : 'Hybrid · Class')
        : 'Online'}
    </span>
  );
}
