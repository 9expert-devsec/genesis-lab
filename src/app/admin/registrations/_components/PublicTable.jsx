'use client';

import { cn } from '@/lib/utils';
// The ONE label map. `statusLabel` is imported rather than a literal written
// here for the divergence sub-line — see `mixedStatusNote`.
import { statusLabel } from '@/lib/registrations/statuses';
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
 * THE ROW GEOMETRY OF A FOLDED REQUEST.
 *
 * `ROW_BASE_H` is `CellLink`'s own 82px — the height of every row on this table
 * before the fold and the height of every single-course row still. A request
 * with N courses is that plus one `LEG_ROW_H` per EXTRA course, so a one-course
 * row computes to exactly 82 and is given no height at all (see the row body:
 * `undefined` keeps the original `h-[82px]` class and the original markup).
 *
 * 34px per course line holds a 17px course name over a 14px round date with
 * 3px between — the same two-line shape the unfolded course cell has always
 * had, at the smaller size a list of several wants.
 *
 * Both are NUMBERS, not classes. They are multiplied, and an assembled
 * `h-[${n}px]` compiles to nothing at all — see the note on `CellLink`.
 */
const ROW_BASE_H = 82;
const LEG_ROW_H  = 34;

/**
 * The sub-line under a folded row's status chip, naming every status its legs
 * hold. Only rendered when they disagree.
 *
 * Read through `statusLabel` rather than written out: the label is the
 * vocabulary's, byte for byte, or this line and the card above it stop agreeing
 * about what a status is called. That is the drift lib/registrations/statuses
 * exists to prevent, and a sentence is exactly where a hand-written label looks
 * harmless.
 */
function mixedStatusNote(statuses) {
  const list = (Array.isArray(statuses) ? statuses : []).map((s) => statusLabel(s));
  return `หลายสถานะ: ${list.join(' · ')}`;
}

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

          /**
           * ── HOW TALL THIS ROW IS ──────────────────────────────────────────
           *
           * `undefined` for a single-course row, which is 41 of the 46 records
           * this collection last held — those keep the fixed 82px box and their
           * markup is unchanged to the byte.
           *
           * A request with N courses grows by one LEG_ROW per extra course, and
           * EVERY cell of the row is given the same number so the course lines
           * and their chips share baselines across two `<td>`s.
           */
          const legs = Array.isArray(row.legs) ? row.legs : [];
          const multi = legs.length > 1;
          const heightPx = multi ? ROW_BASE_H + (legs.length - 1) * LEG_ROW_H : undefined;

          return (
            <tr
              key={row._id}
              className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
            >
              {/* วันที่สมัคร — the date, with the audit hint beneath it. */}
              <td className="p-0 align-top">
                <CellLink href={href} first style={pad(0)} heightPx={heightPx}>
                  <DateCell iso={row.createdAt} entry={lastEdited[String(row._id)]} />
                </CellLink>
              </td>

              {/* หลักสูตร / รอบอบรม — the title, then a 32px row holding the
                  round dates. The schedule chip has moved to its own column.
                  A folded request lists every course it asked for. */}
              <td className="p-0 align-top">
                <CellLink href={href} style={pad(1)} heightPx={heightPx}>
                  <CourseCell
                    name={row.courseName}
                    classDate={row.classDate}
                    bundle={row.bundle}
                    legs={legs}
                  />
                </CellLink>
              </td>

              {/*
                รูปแบบ — the chip alone, vertically centred.

                It was inside the course cell, sharing the 32px line with the
                round dates, and it competed for that width badly enough that the
                first row's course name truncated. Its own column costs 8.5% and
                gives 2% of it back to the name.

                ONE CHIP PER COURSE on a folded row, in the same order and on the
                same baselines as the course lines beside it — a package whose
                three courses run classroom, online and hybrid says exactly that,
                and a reader can tell WHICH course is which because the two cells
                line up.
              */}
              <td className="p-0 align-top">
                <CellLink href={href} className="items-start" style={pad(2)} heightPx={heightPx}>
                  {multi ? (
                    <>
                      {/*
                        Matches the Bundle chip's block in the course cell so
                        the first course line starts level in both columns.
                        (The chip read `แพ็กเกจ: <name>` when this was written;
                        only its TEXT changed, and the 24px block it occupies —
                        which is what this spacer mirrors — did not.)
                        `aria-hidden` because it is spacing, not content — and
                        the empty-element guard excludes exactly that.
                      */}
                      <div aria-hidden="true" className="h-[24px] w-full" />
                      {legs.map((leg) => (
                        <div key={String(leg._id)} className="flex h-[34px] items-center">
                          <ScheduleBadge type={leg.scheduleType} mode={leg.attendanceMode} />
                        </div>
                      ))}
                    </>
                  ) : (
                    <ScheduleBadge type={row.scheduleType} mode={row.attendanceMode} />
                  )}
                </CellLink>
              </td>

              <td className="p-0 align-top">
                <CellLink href={href} style={pad(3)} heightPx={heightPx}>
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
                <CellLink href={href} style={pad(4)} heightPx={heightPx}>
                  <p className="text-[14px] font-bold leading-[17px] tabular-nums text-[var(--text-primary)]">
                    {row.attendeesCount ?? '—'}
                  </p>
                </CellLink>
              </td>

              {/*
                สถานะ — the chip, and under it NOTHING unless the request's legs
                disagree.

                ── THE ONE THING A FOLDED ROW MUST NOT HIDE ──────────────────
                A request counts once, into one status — see
                lib/registrations/requestStatus for the precedence and why
                `cancelled` is not at the top of it. That single word is lossy
                by construction: a three-course request with one course
                cancelled and two awaiting a quotation is filed under
                รอดำเนินการ, which is the honest answer to "what needs doing"
                and says nothing about the cancelled one.

                So where the legs disagree the row SAYS SO, in words, naming
                every status present. A request filed under one status whose
                other legs are elsewhere must not look like a request whose legs
                agree.
              */}
              <td className="p-0 align-top">
                <CellLink href={href} style={pad(5)} heightPx={heightPx}>
                  <StatusCell status={row.status} />
                  {row.mixedStatus ? (
                    <span
                      data-testid="mixed-status-note"
                      className="mt-[3px] truncate text-[11px] leading-[14px] text-[var(--text-muted)]"
                    >
                      {mixedStatusNote(row.statuses)}
                    </span>
                  ) : null}
                </CellLink>
              </td>

              <ChevronCell href={href} heightPx={heightPx} />
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
 *
 * ── THE BUNDLE LINE, AND WHY IT IS IN THIS CELL ──────────────────────────
 * A bundle quotation request is stored as ONE ROW PER COURSE. Three rows, same
 * coordinator, same minute, three different courses — and without this line
 * they read as three unrelated people who happened to book on the same
 * afternoon. Nothing else on the row could tell you otherwise.
 *
 * It goes in the COURSE cell rather than in a column of its own for the reason
 * round 3 gave when it deleted four columns: the question this line answers is
 * "what is this row about", which is what this cell is for, and a seventh
 * column for a fact that is absent from almost every row would spend width the
 * course name has already been measured to need.
 *
 * ── IT READS "Bundle", AND NAMES NO PACKAGE ────────────────────────────────
 *
 * It used to read `แพ็กเกจ: <name>`, falling back to `แพ็กเกจ` alone when the
 * bundle had none — an author may ship an unnamed bundle and the storage floor
 * accepts it, so the fallback was load-bearing. Both are now the SAME string,
 * which makes that whole branch disappear: named and unnamed bundles chip
 * identically, and there is no "value that failed to load" case left to guard.
 *
 * THE CONSEQUENCE IS ACCEPTED, NOT OVERLOOKED. With several bundle requests in
 * the list, every chip reads the same, so this table no longer says WHICH
 * package a row belongs to — only THAT it belongs to one. That was the product
 * owner's call. The package name is still on the detail screen, in its own
 * แพ็กเกจ row and in the header subtitle, both of which are deliberately
 * untouched and are where a reader goes to find out which package this is.
 *
 * The course COUNT stays on the folded chip. It is a different fact, it was
 * added to close a filed defect (see below), and nothing about dropping the
 * name argues for dropping it.
 */
function CourseCell({ name, classDate, bundle, legs = [] }) {

  /**
   * ── THE FOLDED CASE: EVERY COURSE THE REQUEST ASKED FOR ──────────────────
   *
   * The chip now carries the COURSE COUNT as well as the name, and that is the
   * fix for the thing this table could not previously say. Before the fold a
   * reader could see that a row belonged to a package and could not see how big
   * the package was — so a two-leg wreck of a three-course bundle read as an
   * ordinary two-course bundle, which is the defect
   * docs/ticket-bundle-request-completeness-unqueryable.md was filed for. The
   * count is derived from the legs actually present, so it reports what IS
   * rather than what was ordered; the authored total is still not stored.
   *
   * Each course gets its own line with its own round date, because a package's
   * courses run on different days and a single date would be a lie about the
   * other two.
   */
  if (legs.length > 1) {
    return (
      <>
        <div className="flex h-[24px] items-center">
          <span
            data-testid="bundle-leg-chip"
            className="inline-flex w-fit max-w-full items-center truncate rounded-9e-sm bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
          >
            Bundle · {legs.length} หลักสูตร
          </span>
        </div>
        {legs.map((leg) => (
          <div key={String(leg._id)} className="flex h-[34px] flex-col justify-center">
            <p className="truncate text-[13px] font-semibold leading-[17px] text-[var(--text-primary)]">
              {leg.courseName || '—'}
            </p>
            {/*
              Conditional for the same reason the single-course round line is:
              `classDate` is genuinely optional, and an unconditional element
              would render an empty span the empty-element guard would catch.
            */}
            {leg.classDate ? (
              <span className="truncate text-[11px] leading-[14px] text-[var(--text-secondary)]">
                {leg.classDate}
              </span>
            ) : null}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <p className="truncate text-[15px] font-bold leading-[20px] text-[var(--text-primary)]">
        {name || '—'}
      </p>
      {bundle ? (
        <span
          data-testid="bundle-leg-chip"
          className="mt-0.5 inline-flex w-fit max-w-full items-center truncate rounded-9e-sm bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
        >
          Bundle
        </span>
      ) : null}
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
