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
 * ── รูปแบบ / จำนวน SPLITS IN TWO, MIRRORING THE PUBLIC TABLE'S รูปแบบ ──────
 *
 * The chip and the headcount were stacked in one cell. They are separate
 * columns now, which is the same move the public table made one commit ago and
 * for the same reason: a chip and a number stacked in one narrow cell make both
 * harder to scan than either would be alone.
 *
 *   วันที่ส่งคำขอ  11.2 → 10.0    it no longer carries the audit hint line
 *   บริษัท         17.2   unchanged
 *   หลักสูตรที่สนใจ 23.0 → 24.2
 *   ผู้ประสานงาน   16.5   unchanged
 *   รูปแบบ         new     6.5    the chip alone
 *   จำนวน          new     5.0    the count alone
 *   สถานะ          10.0   unchanged
 *
 * Total still 89.4%.
 *
 * ── THE CHROME GREW AGAIN, AND THE DRIFT IS WORTH STATING ─────────────────
 * A seventh column means a seventh 16px gap: chrome 151px → 167px. The shares
 * still total 89.4%, so at 1440 they over-account by ~14px — 89.4% of 1440 is
 * 1287px of content where only 1273px is available. `columnWidths` normalises
 * against the real chrome, so the columns fill exactly 100% and the RATIOS
 * between them are exact; each content column simply lands ~1.1% narrower than
 * its bare percentage.
 *
 * The public side went through this at its own split (145px → 163px). Both are
 * now in the same position, and the worked arithmetic in tableParts' docstring
 * describes the shape rather than either number.
 *
 * ── สถานะ RE-MEASURED AT THE NEW CHROME, AND IT STILL CLEARS ──────────────
 * 10.0% of 89.4 against 167px of chrome gives the chip 142.4px at a 1440
 * container, down from 144.2px. The derived floor is 135px — the widest live
 * label at a stated 0.65em advance plus the chip's padding — so the headroom is
 * 7.4px, down from 9.2px but still positive. It is therefore NOT raised to
 * 11.0%; that stays the proposal if the click-test shows otherwise.
 */
const COLUMNS = [
  { key: 'requested',   label: 'วันที่ส่งคำขอ',    share: 10.0 },
  { key: 'company',     label: 'บริษัท',           share: 17.2 },
  { key: 'course',      label: 'หลักสูตรที่สนใจ',  share: 24.2 },
  { key: 'coordinator', label: 'ผู้ประสานงาน',     share: 16.5 },
  { key: 'format',      label: 'รูปแบบ',           share:  6.5 },
  { key: 'count',       label: 'จำนวน',            share:  5.0 },
  { key: 'status',      label: 'สถานะ',            share: 10.0 },
];

const { widths, chevronWidth } = columnWidths({ columns: COLUMNS, gap: COLUMN_GAP });

/**
 * ── NO `lastEdited` PROP ANY MORE — THE HINT IS RULED OUT ON THIS TABLE ────
 *
 * The round-3 ruling moved `LastEditedHint` INTO the วันที่ส่งคำขอ cell to mirror
 * public. Seen in place, it was ruled back out: "13 ชม. ที่แล้ว · Yanisa P."
 * under every request date is a second timestamp competing with the one the
 * column is for.
 *
 * THE REVERSAL IS IN-HOUSE ONLY. Public keeps its hint, deliberately — see the
 * both-directions guard in test/render/registrationsInhouseTable, which reddens
 * if anybody sweeps this across both tables in either direction.
 *
 * The prop is DELETED rather than left unused and ignored, so the whole chain
 * goes with it: RegistrationsClient stops threading it here, and page.jsx stops
 * running the audit query for an in-house render at all.
 */
export function InhouseTable({ items, courseNames = null, detailHref }) {
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
              {/*
                วันที่ส่งคำขอ — the date alone.

                NO `entry`, and that omission is the whole opt-out: `DateCell` is
                shared with the public table and renders the hint only when it is
                given one. Public passes it; this does not.
              */}
              <td className="p-0 align-top">
                <CellLink href={to} first style={pad(0)}>
                  <DateCell iso={row.createdAt} />
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

              {/* รูปแบบ — the chip alone, vertically centred. */}
              <td className="p-0 align-top">
                <CellLink href={to} className="items-start" style={pad(4)}>
                  <FormatChip value={row.trainingFormat} />
                </CellLink>
              </td>

              {/*
                จำนวน — THE NUMBER ONLY, rendered exactly as the public table's
                ผู้เข้าอบรม cell renders its own. See CountCell.
              */}
              <td className="p-0 align-top">
                <CellLink href={to} style={pad(5)}>
                  <CountCell count={row.participantsCount} />
                </CellLink>
              </td>

              <td className="p-0 align-top">
                <CellLink href={to} style={pad(6)}>
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
 * รูปแบบ — the training-format chip, alone in its column.
 *
 * ── THE CHIP INVENTS NOTHING, WHICH IS WHY IT IS NOT ScheduleBadge ─────────
 * ScheduleBadge treats a falsy type as "Classroom" — a sensible default for a
 * public class, and a lie about an in-house enquiry, which is how the pre-split
 * table asserted a schedule type on every row. This chip has exactly three
 * outcomes and none of them invents anything: a known value renders its label,
 * an unknown value renders ITSELF (a future enum member shows up as its raw
 * string rather than as the wrong chip), and a missing value renders '—'.
 *
 * `w-fit` because this is a DIRECT child of `CellLink`, which is `flex
 * flex-col`: without it the column's default `align-items: stretch` blockifies
 * the chip and spreads it across the whole 6.5%. It had this already, from when
 * it was stacked above the count; the public schedule chip had to acquire it
 * when the same move made it a direct child.
 */
function FormatChip({ value }) {
  if (!value) return <span className="text-[12px] text-[var(--text-muted)]">—</span>;
  const known = TRAINING_FORMAT[value];
  return (
    <span className={cn(
      'inline-flex h-[23px] w-fit shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',
      known?.cls ?? 'bg-slate-100 text-slate-600'
    )}>
      {known?.label ?? value}
    </span>
  );
}

/**
 * จำนวน — THE NUMBER ONLY, phrased exactly as the public table phrases its own.
 *
 * ── WHY NOT "ประมาณ 15 คน", WHICH THE DESIGN'S DARK STRIP USES ─────────────
 * Three reasons, in increasing order of how much they matter.
 *
 * CONSISTENCY, which was the instruction: the public ผู้เข้าอบรม cell renders a
 * bare number, and two tables in one admin must not phrase a headcount two ways.
 * The classes here are the same ones that cell uses, not merely a similar size.
 *
 * SCANNING: a column of bare `tabular-nums` is comparable down the page at a
 * glance. Prefixing every row with the same word destroys that and costs the
 * width to do it — at 5.0% the cell has ~71px, and "ประมาณ 15 คน" does not fit
 * in it at any size this table uses.
 *
 * AND THE REAL ONE — "ประมาณ" IS A CLAIM ABOUT THE DATA THAT THE FIELD DOES NOT
 * MAKE. `participantsCount` is a stored number with a schema minimum of 15; it
 * is not flagged as an estimate anywhere. A hero strip may hedge because it is
 * summarising; a data table stating "approximately" would be the screen
 * asserting an imprecision the record does not record. That is the same rule
 * this table already keeps for its format chip and its status chip: no branch
 * may assert something the document does not hold.
 *
 * The header carries the unit. `?? '—'` guards a document written before the
 * field existed rather than an expected path — the count is a FLOOR and is
 * present on every stored enquiry.
 */
function CountCell({ count }) {
  return (
    <p className="text-[14px] font-bold leading-[17px] tabular-nums text-[var(--text-primary)]">
      {count ?? '—'}
    </p>
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

  return (
    <div title={title}>
      <div className="flex items-center gap-[6px]">
        {/*
          ── THE UNRESOLVED COURSE STILL SHOWS ITS CODE, IN THE NAME SLOT ─────

          `name ?? first` — when the lookup misses, the CODE takes the headline.
          That is a real state, not a hypothetical: in-house requests reference
          courses by code and the name comes from a lookup that can miss (upstream
          down, a course withdrawn, an id that no longer exists), which is exactly
          what ZZTEST-EXCEL-01 was doing in the screenshot.

          CHOSEN OVER A PLACEHOLDER because the record genuinely holds the code
          and nothing else identifies the course. A "—" or "ไม่พบหลักสูตร" would
          replace the only identifying string on the row with a word, and this
          screen exists to be scanned. Removing the code LINE therefore costs an
          unresolved row nothing — the code simply moves up.

          The mono/semibold styling is kept so a code is still visibly a code
          rather than a suspiciously short course name.
        */}
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
      {/*
        ── THE SECOND LINE IS THE MONTH, ALONE ─────────────────────────────────

        The course CODE used to share this row with the month — side by side in a
        flex line with a 7px gap, which is what the screenshot showed and is NOT
        the two-line shape the round-3 brief asked for. Verified in the markup
        before changing it rather than assumed from the commit message.

        The code line is now gone entirely, so the row holds one thing and the
        cell really is `bold name` over `เดือนที่สนใจ`.

        STILL CONDITIONAL, and it has to be: with the code gone the month is the
        row's ONLY content, so a request with no preferred month would render an
        empty 32px div. The guard is stronger than it was, not weaker — it used
        to be `showCode || month`, which a resolved course satisfied through the
        code alone.
      */}
      {month ? (
        <div className="flex h-[32px] items-center">
          <span className="truncate text-[13px] leading-[15px] text-[var(--text-secondary)]">
            {month}
          </span>
        </div>
      ) : null}
    </div>
  );
}
