import { CalendarDays, MapPin } from "lucide-react";

import { trainingTypeLabel } from "@/lib/schedule/trainingTypeLabel";
import {
  discountAmount,
  discountPercent,
} from "@/lib/pageBuilder/bundlePricing";
import { formatPrice } from "@/lib/utils";

/**
 * WHAT THE CUSTOMER IS REQUESTING — the courses, their rounds, and the price.
 *
 * ══ ONE BLOCK, TWO SCREENS ═════════════════════════════════════════════════
 *
 * Moved out of app/(public)/registration/bundle/page.jsx so the landing screen
 * and the review step render the SAME component. A quotation request whose
 * review step showed a different package from the page that offered it would be
 * a review of something else, and two copies of this markup is exactly how the
 * two would come to disagree — silently, since nothing compares them.
 *
 * ══ IT FORMATS NOTHING THAT NEEDS A CLOCK ══════════════════════════════════
 *
 * `lines[].dates` arrives ALREADY FORMATTED, by `formatRoundDays` on the
 * server, from a `todayKey`/`currentYear` pair read once and threaded. That is
 * not incidental: `formatRoundDays` refuses to read the clock at all, because
 * Vercel runs UTC and for seven hours every 31 December the server and the
 * visitor disagree about the year. This component is rendered on both the
 * server page and inside a client form, so it is the LAST place that read
 * could safely happen — and it does not happen here.
 *
 * For the same reason there is no second date formatter in this file, and must
 * not be one: the repo has an open ticket about a drifted formatter printing
 * dates that do not exist, and a restyle is exactly where the next one gets
 * written. The design this block was styled to shows `19 - 20 ม.ค. 2027`; that
 * is an artefact of the mock, in TWO ways — the site prints Buddhist years and
 * prints them two-digit, so the same round reads `19-20 ม.ค. 70`. The mock is
 * authoritative for LAYOUT and for nothing else.
 *
 * ══ THE DELIVERY LABEL IS `trainingTypeLabel`, WHOLE ═══════════════════════
 *
 * Em dash and venue included — `Classroom — อบรมที่ห้องอบรม 9Expert`, not
 * `Classroom`. That module's own header records that a survey found ELEVEN
 * separate classroom/hybrid/online literals across this repo, none agreeing;
 * shortening the string to fit the pin row would write the twelfth. The row is
 * built to wrap instead (`min-w-0` on the text column, `shrink-0` on the icon),
 * which is a layout answer to a layout problem — measured at 375, where the
 * label wraps to a second line and the card grows to fit it.
 *
 * ══ IT IS PRESENTATIONAL, SO BOTH TIERS CAN RENDER IT ══════════════════════
 *
 * No hooks, no `next/*`, no db, no clock — every prop is a plain string or
 * number. That is what lets the server page render it directly and the client
 * review step render it from props passed down through the form.
 */
export function BundleSummary({
  lines = [],
  listPrice = null,
  netPrice = null,
}) {
  const percent = discountPercent(listPrice, netPrice);
  const amount = discountAmount(listPrice, netPrice);

  /**
   * ── THE BREAKDOWN BRANCH, NAMED RATHER THAN IMPLIED ──────────────────────
   *
   * The three-line panel — ราคาปกติ, ส่วนลดแพ็กเกจ N%, ราคาสุทธิ — can only be
   * drawn when there is a real discount to break down. It needs BOTH prices
   * (to have a ราคาปกติ at all) and a positive amount (to have a middle line
   * worth printing).
   *
   * `amount != null` already implies both prices are set and the pair is not
   * inverted — those are `discountAmount`'s own refusals, shared case for case
   * with `discountPercent`'s, which is why `percent` can be interpolated into
   * the middle line's label without a second null check. `> 0` on top of that
   * is the same guard the ลด N% chip has always carried: a bundle sold at list
   * price has a discount of nothing, and a `-฿0` line advertises nothing.
   *
   * Everything else — one price set and not the other, an inverted pair, a
   * free bundle — falls to the single net line below, which is what this block
   * showed before the restyle. A bundle with no discount is an ordinary thing
   * to author, not an error, and it must still render its price.
   */
  const showsBreakdown = amount != null && amount > 0;

  return (
    /*
      NO OUTER MARGIN. It carried `mb-8` while it was a block in the form's
      flow; it is a SIDE CARD now, rendered in two places at two breakpoints,
      and a margin baked into the card would follow it into both. Spacing is the
      container's — see BundleWizard's two-column shell.
    */
    <section
      data-testid="bundle-summary"
      className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6"
    >
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-bold text-[var(--text-primary)]">
          หลักสูตรในแพ็กเกจ
        </h2>
        {/*
          The count moves out of the heading text and into a chip, which is the
          design's layout. The WORDING is the site's own — `N หลักสูตร`, as the
          admin schedules screen and the submitted panel both say — not the
          mock's. It counts COURSES and nothing else: a bundle is one person
          attending every course in it, and this block must not imply otherwise.
        */}
        <span
          data-testid="bundle-summary-count"
          className="rounded-9e-sm bg-9e-brand/10 px-2 py-0.5 text-xs font-bold text-9e-brand"
        >
          {lines.length} หลักสูตร
        </span>
      </div>

      {/*
        An ORDERED list now that the rows are numbered, so the ordinal a sighted
        reader sees is the one the document actually has. The visual badge is
        `aria-hidden` for that reason — with the <ol> carrying the numbering,
        reading "01" aloud before every course name would say it twice.
      */}
      <ol className="flex flex-col gap-4">
        {lines.map((line, i) => (
          <li
            key={line.key}
            data-testid="bundle-summary-item"
            className="flex gap-3 border-b border-[var(--surface-border)] pb-4 last:border-b-0 last:pb-0"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-9e-md bg-9e-brand/10 font-en text-xs font-bold text-9e-brand"
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            {/*
              `min-w-0` is load-bearing, not decoration. A flex child's default
              `min-width: auto` refuses to shrink below its content, so without
              it the full delivery label pushes this column past the card at
              375 instead of wrapping inside it.
            */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {line.courseName || line.courseId}
              </span>
              <span className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <CalendarDays className="mt-px h-4 w-4 shrink-0" aria-hidden />
                <span>รอบอบรม {line.dates}</span>
              </span>
              <span className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <MapPin className="mt-px h-4 w-4 shrink-0" aria-hidden />
                <span>{trainingTypeLabel(line.type)}</span>
              </span>
            </div>
          </li>
        ))}
      </ol>

      {showsBreakdown && (
        <dl
          data-testid="bundle-summary-price"
          className="mt-5 flex flex-col gap-2 border-t border-[var(--surface-border)] pt-4"
        >
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-[var(--text-secondary)]">
              ราคาปกติ (รวม {lines.length} หลักสูตร)
            </dt>
            <dd className="font-en text-sm text-[var(--text-secondary)]">
              {formatPrice(listPrice)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-[var(--text-secondary)]">
              ส่วนลด
              {/* ส่วนลดแพ็กเกจ {percent}% */}
            </dt>
            {/*
              The amount is `list - net`, not the rounded percentage applied to
              the list — see discountAmount's own note. That is what makes these
              three lines add up for every pair, in front of a customer who can
              do the subtraction in their head. The minus sign belongs to the
              LINE, not to the number: discountAmount returns a positive.
            */}
            <dd className="font-en text-sm font-bold text-9e-brand">
              -{formatPrice(amount)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-[var(--surface-border)] pt-3">
            <dt className="text-sm font-bold text-[var(--text-primary)]">
              ราคาสุทธิ
            </dt>
            <dd className="font-heading text-2xl font-bold text-[var(--text-primary)]">
              {formatPrice(netPrice)}
            </dd>
          </div>
        </dl>
      )}

      {!showsBreakdown && (listPrice != null || netPrice != null) && (
        <p
          data-testid="bundle-summary-price"
          className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--surface-border)] pt-4"
        >
          {netPrice != null && (
            <span className="font-heading text-2xl font-bold text-[var(--text-primary)]">
              {formatPrice(netPrice)}
            </span>
          )}
          {listPrice != null && (
            <span className="text-sm text-9e-slate-dp-50 line-through dark:text-[#94a3b8]">
              {formatPrice(listPrice)}
            </span>
          )}
        </p>
      )}

      {/*
        THE VAT FOOTNOTE. Copied byte-for-byte from the two sites that already
        carry this sentence — CourseHero.jsx and EarlyBirdBanner.jsx, which
        agree with each other exactly (sha256 cd7e5136…, 109 bytes). It is NOT
        retyped and NOT reworded: a fourth copy differing by one character is
        worse than three that agree. Extracting all four to a shared constant is
        filed as a ticket rather than done here, because it reaches three
        surfaces this round has no business changing.
      */}
      {(listPrice != null || netPrice != null) && (
        <p
          data-testid="bundle-summary-vat"
          className="mt-3 text-xs text-[var(--text-secondary)]"
        >
          *ราคาดังกล่าวยังไม่รวมภาษีมูลค่าเพิ่ม
        </p>
      )}

      {/*
        ── THE "THIS IS A QUOTATION, NOTHING IS BEING CHARGED" LINE IS GONE ───
        DELIBERATELY DISABLED, by the product owner, and then deleted here
        rather than left commented out.

        It read:
          นี่คือการขอใบเสนอราคา ยังไม่มีการชำระเงินในขั้นตอนนี้ — ทีมขายจะติดต่อกลับพร้อมใบเสนอราคา

        The argument that used to sit here said the line was what stopped a
        customer reading the total as a checkout. That argument no longer
        describes this component, so it is not left standing over code that does
        not run: a commented-out block under a live-sounding rationale is read by
        the next person as an accident to undo.

        DO NOT RESTORE IT ON THE STRENGTH OF THE OLD REASONING. Removing it was
        a decision, not a regression. If it should come back, that is a fresh
        call about what this screen says, made with the terms modal — which now
        carries the flow's payment-adjacent copy — in view.
      */}
    </section>
  );
}
