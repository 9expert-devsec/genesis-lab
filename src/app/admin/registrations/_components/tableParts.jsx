'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LastEditedHint } from '@/components/audit/auditRowParts';
import { statusBadge, statusLabel } from '@/lib/registrations/statuses';

/**
 * THE PIECES BOTH REGISTRATION TABLES ARE BUILT FROM — atoms, never a row.
 *
 * ── THIS IS NOT THE SHARED-BODY SHAPE INHOUSETABLE WAS SPLIT OUT OF ─────────
 * That split exists because a single `<tr>` branching on `source` per cell is
 * how an in-house document came to be rendered through public columns: ten
 * `source ===` tests inside one row, and a column added for one side that had to
 * be reasoned about for both. Nothing here branches on `source`. Nothing here
 * knows there are two collections.
 *
 * What IS shared is the stuff that would otherwise be typed twice and drift:
 * the column-width arithmetic, the header cell, the link that makes a row
 * clickable, and the three cells whose contents are the same KIND of thing on
 * both sides (a date, a status chip, a chevron). Each takes its data as props
 * and has no idea which table it is in.
 *
 * The test for whether something belongs here is not "do both tables use it" —
 * it is "would a change to this be wrong for one of them". A date is a date.
 * A column SET is not, which is why the two column lists live with their tables.
 */

// ── Column widths ──────────────────────────────────────────────────────────

/**
 * The measured column proportions, as CSS widths that survive a reflow.
 *
 * ── WHY THE PERCENTAGES CANNOT GO STRAIGHT ONTO THE `<col>`s ────────────────
 * The design gives each column a percentage of a 1440-wide table, and those
 * percentages describe the CONTENT box: they sum to 89.9% for public, with the
 * remaining ~10% being the gaps, the edge padding and the fixed chevron. Putting
 * 13.3% on a `<col>` under `table-fixed` sets the whole cell box INCLUDING its
 * padding, so every column would come out narrow and the leftover 10% would be
 * distributed by the browser in a way the spec leaves open.
 *
 * ── THE ARITHMETIC IS EXACT, AND THAT IS HOW THE READING WAS CONFIRMED ──────
 * The chrome is a fixed number of pixels: one left edge, one gap after each
 * column, the chevron, and one right edge. For public that is
 * 18 + 18x5 + 22 + 15 = 145px. Checking the reading against the design:
 *
 *     13.3% of 1440                     = 191.5px
 *     (13.3 / 89.9) x (1440 - 145)      = 191.6px
 *
 * They agree to a rounding error, which is what says the percentages really are
 * content widths and the 145px really is everything else. The in-house side has
 * a 16px gap and seven columns — 18 + 16x6 + 22 + 15 = 151px — and lands the
 * same way, so one function serves both.
 *
 * So each column gets `calc((100% - <chrome>px) * <ratio> + <its padding>px)`,
 * and the widths sum to exactly 100% by construction: the ratios sum to 1 and
 * the paddings sum to the chrome. The RATIOS are what is preserved, which is the
 * requirement — the layout has to survive the admin sidebar collapsing, and an
 * absolute px width would not.
 *
 * @param {object} spec
 * @param {Array<{share: number}>} spec.columns content columns, in order
 * @param {number} spec.gap px between every column
 * @param {number} [spec.edgeLeft] px before the first column
 * @param {number} [spec.chevron] px of the fixed trailing column
 * @param {number} [spec.edgeRight] px after the chevron
 * @returns {{ widths: string[], chevronWidth: string, pads: number[], chrome: number }}
 */
export function columnWidths({ columns, gap, edgeLeft = 18, chevron = 22, edgeRight = 15 }) {
  const n = columns.length;
  const chrome = edgeLeft + gap * n + chevron + edgeRight;
  const totalShare = columns.reduce((sum, c) => sum + c.share, 0);

  // Column 0 carries the left edge as well as its own trailing gap.
  const pads = columns.map((_, i) => (i === 0 ? edgeLeft + gap : gap));

  const widths = columns.map((c, i) => {
    const ratio = c.share / totalShare;
    return `calc((100% - ${chrome}px) * ${ratio.toFixed(6)} + ${pads[i]}px)`;
  });

  return { widths, chevronWidth: `${chevron + edgeRight}px`, pads, chrome };
}

// ── Chrome ─────────────────────────────────────────────────────────────────

/**
 * A header cell: the row is 42px and the label sits 13.375px from its top.
 *
 * `align-top` plus an explicit padding rather than vertical centring, because
 * the measurement is from the TOP of the row and a centred label drifts the
 * moment the type size changes.
 */
export function Th({ children, first, gap, edgeLeft = 18, edgeRight = 15 }) {
  return (
    <th
      scope="col"
      className="h-[42px] pt-[13.375px] align-top text-left text-[12px] font-medium leading-[15px] text-[var(--text-secondary)]"
      style={{
        paddingLeft:  first ? `${edgeLeft}px` : undefined,
        paddingRight: `${gap ?? edgeRight}px`,
      }}
    >
      {children}
    </th>
  );
}

/**
 * ── THE ROW IS A REAL LINK, AND IT IS A LINK IN EVERY CELL ─────────────────
 *
 * The requirement is that middle-click, cmd-click and keyboard focus all work,
 * which rules out `onClick={() => router.push(…)}` entirely: a div with a click
 * handler opens nothing in a new tab, has no href to copy, and is invisible to
 * keyboard navigation.
 *
 * ── WHY EVERY CELL, RATHER THAN ONE STRETCHED LINK ──────────────────────────
 * The tidy version of "whole row clickable" is one `<Link>` with
 * `position:absolute; inset:0` over a `position:relative` row. That was
 * considered and rejected: relative positioning on a `<tr>` was undefined in CSS
 * 2.1 and is a comparatively recent addition to the table layout spec, and the
 * failure mode if a browser declines is not subtle — `inset:0` resolves against
 * the next positioned ancestor instead, which is the panel, so ONE row's link
 * would cover the ENTIRE table and every row would navigate to that row's
 * record. A silent, data-wrong failure that no server-rendered test can see is
 * not worth the tidier markup.
 *
 * So each cell holds its own link to the same href, carrying the cell's padding
 * and the 82px row height. There is no positioning at all, it is correct in
 * every browser, and the clickable area is exactly the row.
 *
 * ── THE COST, STATED ───────────────────────────────────────────────────────
 * Six links per row instead of one. `tabIndex={-1}` on all but the first keeps
 * the keyboard to ONE stop per row — otherwise a page of 20 rows would be 120
 * tab stops — while leaving every cell genuinely clickable and middle-clickable.
 * A screen reader navigating by link will still announce them; that is the
 * trade, and it is the honest direction to err in, because the alternative
 * failure silently sends people to the wrong record.
 */
export function CellLink({ href, first, children, className, style }) {
  return (
    <Link
      href={href}
      tabIndex={first ? undefined : -1}
      className={cn('flex h-[82px] flex-col justify-center', className)}
      style={style}
    >
      {children}
    </Link>
  );
}

/** The 22px chevron, vertically centred. Decorative — the row is the link. */
export function ChevronCell({ href, edgeRight = 15 }) {
  return (
    <td className="p-0 align-top">
      <CellLink href={href} className="items-center" style={{ paddingRight: `${edgeRight}px` }}>
        <ChevronRight aria-hidden="true" className="h-[22px] w-[22px] text-[var(--text-muted)]" />
      </CellLink>
    </td>
  );
}

// ── Cells ──────────────────────────────────────────────────────────────────

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/** "6 ส.ค. 2569" — Thai month, Buddhist year. */
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * The date cell: a bold 16px line, then a 14px sub-line.
 *
 * ── THE SUB-LINE IS THE AUDIT HINT, ON BOTH SIDES ──────────────────────────
 * `LastEditedHint` used to hang off the เลขอ้างอิง cell, which this round
 * deletes. It moves here — on public and on in-house alike, which is what the
 * ruling asked for — because "when did this arrive" and "when was it last
 * touched" are the same question asked twice, and reading them on two different
 * lines of the same cell is how you notice they differ.
 *
 * IT RENDERS NOTHING WHEN THERE IS NO ENTRY, by its own definition, and this
 * cell adds no wrapper of its own around it. Wrapping it in a fixed-height
 * `<p>` would put an empty 14px element in every row that predates the audit
 * log — which is most of them — and that is precisely the defect the
 * empty-element guard exists for.
 *
 * ── ONE HONEST DEVIATION FROM THE GEOMETRY ─────────────────────────────────
 * The slot is 14px, and the hint sets its own 12px type because it is a SHARED
 * component rendered on several admin lists. Restyling it here would either
 * change it everywhere or fork it; neither is worth 2px, and the slot's leading
 * is what holds the rhythm.
 */
export function DateCell({ iso, entry }) {
  return (
    <>
      <p className="text-[13px] font-bold leading-[16px] text-[var(--text-primary)]">
        {fmtDate(iso)}
      </p>
      <LastEditedHint entry={entry} />
    </>
  );
}

/**
 * The coordinator cell: a bold 17.25px line over a 14.25px small line.
 *
 * `phone` is optional and is the in-house side's third line — kept by ruling,
 * because an in-house enquiry is followed up by telephone and the number is the
 * one thing a salesperson needs off this screen. It is a PROP rather than a
 * `source` test: this component does not know which table it is in.
 *
 * EVERY LINE IS CONDITIONAL, and the whole cell falls back to a dash. A record
 * with a name and no email must render one line, not one line and an empty one.
 */
export function CoordinatorCell({ name, email, phone }) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed && !email && !phone) {
    return <p className="text-[13px] leading-[17.25px] text-[var(--text-muted)]">—</p>;
  }
  return (
    <>
      {trimmed ? (
        <p className="truncate text-[14px] font-bold leading-[17.25px] text-[var(--text-primary)]">
          {trimmed}
        </p>
      ) : null}
      {email ? (
        <p className="truncate text-[12px] leading-[14.25px] text-[var(--text-muted)]">{email}</p>
      ) : null}
      {phone ? (
        <p className="truncate text-[12px] leading-[14.25px] text-[var(--text-muted)]">{phone}</p>
      ) : null}
    </>
  );
}

/**
 * The status cell: a 26px chip with 9px of horizontal padding. THE CHIP ONLY.
 *
 * ── THE SECOND LINE FROM THE MOCKUP IS RULED OUT, AND NOT REPLACED ─────────
 * The design puts a line under the chip — ชำระ 13 ส.ค. 2569, รอตรวจสอบข้อมูล,
 * ส่งเอกสารแล้ว, รอจัดส่งเอกสาร, ดูข้อมูลได้อย่างเดียว. It is not built, and it is
 * not built as '—' or any other placeholder either: an em-dash in every row is a
 * column that says nothing, in a table this round is shortening.
 *
 * The honest reason is in the data. Records exist whose `status` is `paid` while
 * `payment.omiseStatus` still reads `pending`, and whose `payment.paidAt` is
 * absent altogether. A "ชำระ <date>" line under a paid chip would therefore have
 * needed a rule for a case the data does not support — pick one field and it is
 * wrong for those rows, pick the other and it contradicts the chip. Not having
 * the line means not needing the rule.
 *
 * ── AND NO GLYPH IN THE LABEL ──────────────────────────────────────────────
 * The design writes the lock inline as `ชำระแล้ว` plus a padlock. The label comes
 * from the shared module and stays the label; the lock is an affordance on the
 * overview CARD. See `lockedLabels` in RegistrationsClient.
 */
/**
 * ── `w-fit` IS LOAD-BEARING, AND `inline-flex` ALONE IS NOT ────────────────
 *
 * MEASURED FROM A CLICK-TEST: the chip rendered as a full-width block across the
 * whole สถานะ column. The class list already said `inline-flex`, which is exactly
 * why the existing assertions could not see it.
 *
 * The cause is the PARENT, not this element. `CellLink` is `flex flex-col`, so
 * every direct child is a flex item — and a flex item's `display` is BLOCKIFIED
 * (`inline-flex` computes to `flex`) while the column container's default
 * `align-items: stretch` sizes it to the full cross axis. Nothing about writing
 * `inline-flex` survives that.
 *
 * The two chips that were already correct show both ways out, and this takes the
 * one that matches rather than inventing a third:
 *
 *   · PublicTable's ScheduleBadge is NOT a direct child of CellLink — it sits in
 *     a `flex items-center` ROW, where there is no cross-axis stretch to escape.
 *   · InhouseTable's ModeCell chip IS a direct child, and carries `w-fit`.
 *
 * This is a direct child, so it takes `w-fit`, character for character as
 * ModeCell has it.
 *
 * ── WHAT WAS CONSIDERED AND NOT DONE ──────────────────────────────────────
 * `items-start` on CellLink would fix the container once and make every future
 * chip correct without opting in. It is arguably the better fix and it is not
 * this commit's: it changes the cross-axis sizing of EVERY cell on both tables,
 * including the `truncate` paragraphs whose ellipsis depends on being given a
 * width, and this is a presentation-only round with two defects to close. Noted
 * rather than taken.
 */
export function StatusCell({ status }) {
  return (
    <span className={cn(
      'inline-flex h-[26px] w-fit items-center whitespace-nowrap rounded-full px-[9px] text-[12px] font-semibold',
      statusBadge(status)
    )}>
      {statusLabel(status)}
    </span>
  );
}
