import Image from 'next/image';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

import { cn, formatBaht, courseHref } from '@/lib/utils';
/**
 * `ratioClass` is REUSED rather than re-spelt. It is a single-source map this
 * module already owns for the two_column type, and writing
 * `lg:grid-cols-[3fr_7fr]` by hand here would be a second copy of a value that
 * is allowed to change in one place.
 *
 * `backgroundClass` is BACK, and `cardSurfaceClass` is still gone. The two were
 * removed together by the navy round and only one of them should have been:
 *
 *   · `backgroundClass('soft_gray')` is the สีขาว style's surface, and it
 *     returns. The navy round's objection was never to the function — it was
 *     that the call was UNCONDITIONAL, so the card painted soft gray whatever
 *     the author chose. It is now inside the `light` branch, which is what the
 *     author chose when they chose it. (The panel's own background control
 *     remains inert for this type: the card paints its own surface in both
 *     styles. That is recorded in docs/section-control-audit.md rather than
 *     fixed here.)
 *   · `cardSurfaceClass` stays OUT. It read `style.cardStyle`, a cap
 *     `promotion_bundle` no longer declares — and neither whole-card style can
 *     express it, so this is not a removal to revisit when the light style came
 *     back. Removing the read and removing the control are one edit (2C.3).
 */
import {
  accentButtonClass,
  ratioClass,
  backgroundClass,
} from '@/lib/pageBuilder/presets';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The navy round's two gated helpers: each returns the
// static class AND the inline custom properties carrying the author's colours,
// because an interpolated Tailwind arbitrary value emits no CSS here.
import { bundleGlowFor, cardBorderFor } from '@/lib/pageBuilder/presets';
// ADDED beside the statement above rather than folded into it. The
// selectable-card round: which whole-card style this section takes, the class
// that forces a course tile onto the light token set, and the filter that takes
// the `dark:` utilities out of the tile's three class strings.
import {
  bundleCardThemeFor,
  withoutDarkVariants,
  BUNDLE_TILE_LIGHT_CLASS,
} from '@/lib/pageBuilder/presets';
import { discountPercent } from '@/lib/pageBuilder/bundlePricing';
// The ONE definition of "is this bundle taking registrations". Imported rather
// than spelled here, because the bundle quotation form has to answer the same
// question and a page that shows the closed message while the form still
// accepts a submission is a closed bundle registerable through a stale link.
import { BUNDLE_CLOSED_MESSAGE, isBundleRegistrationOpen } from '@/lib/pageBuilder/bundleRegistration';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. THE SAME CHIP THE COURSE CARD DRAWS: this card used to
// stack its own cream boxes, which was a second round visual competing with
// the one the site already had. `resolveDerivedRoundBadge` left on the same
// line it arrived on — the per-tile status badge it fed is gone.
import ScheduleCard from '@/components/ScheduleCard';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The multi-round round: ALL of an item's offered rounds.
import { chooseItemRounds, offeredRoundsOf } from '@/lib/pageBuilder/chosenRounds';
// Pickability, the reason and the effective deadline — computed once for the
// section and never re-derived per tile, so the card cannot disagree with the
// wizard or the server.
import { roundChoices, bundleRegistrable } from '@/lib/pageBuilder/bundleRoundChoice';
// The Thai reason words and the auto-close sentence, beside the author's own
// closed message so one surface cannot word a refusal differently from another.
import { PICK_REASON_TEXT, BUNDLE_NO_ROUNDS_MESSAGE } from '@/lib/pageBuilder/bundleRegistration';
// ADDED beside the statement above rather than folded into it. The ONE label
// for an offered round, shared with the editor and the wizard.
import { bundleRoundLabel } from '@/lib/pageBuilder/bundleRegistration';
import { siteCurrentYear, siteTodayKey } from '@/lib/articlePublishTime';

/**
 * promotion_bundle — ONE bundle promotion: a name, a blurb, ราคาปกติ and
 * ราคาสุทธิ, a discount code, an open/closed switch, and (from the next commit)
 * an ordered list of course+round item cards.
 *
 * A page carries SEVERAL of these, one per bundle, because a bundle is a
 * section rather than a row in a table. One page still produces ONE card on
 * /promotions — nothing here touches the grid, the loader or `promotionOrder`.
 *
 * Server component, and now a WHOLLY server-rendered one: it reached for
 * `CopyCodeButton` — the one client module the page-builder's public render
 * added — until the register button replaced the copy button, at which point
 * that component had no callers left and was deleted. The discount CODE is
 * still rendered here as selectable text, because `content.discountCode` is a
 * schema field and a field with no reader is the thing this repo keeps
 * removing.
 *
 * ── FAILS CLOSED ONLY ON NOTHING-AT-ALL ───────────────────────────────────
 * Mirrored by `sectionRendersEmpty`'s `promotion_bundle` case, which is a
 * second reader of the guard below and says so. A bundle with a price but no
 * items yet RENDERS — a just-added section that drew nothing would read as a
 * broken canvas, and the panel is this type's own content rather than a frame
 * around its items.
 *
 * ── WHY `formatBaht` AND NOT `coursePriceLabel`, NOR `formatPrice` ────────
 * `coursePriceLabel` is "THE price label for a COURSE" and carries a semantic
 * this type does not have: it answers 0 / null / non-numeric with
 * `Inhouse Only`, which is a real fact about a course with no public seat price
 * and a lie about a bundle. A 0-baht bundle is not an in-house engagement. That
 * refusal still stands and is why it was not reached for again.
 *
 * `formatPrice` WAS used here and is not any more, and the premise moved rather
 * than the preference: it emits `฿38,990`, and this panel writes บาท after the
 * number, so the unit appeared TWICE — `฿55,700 บาท` on screen. `formatBaht`
 * (lib/utils, beside `formatPrice`) is that same `Intl` th-TH number with the
 * symbol left off, so the Thai unit is the only one.
 *
 * An unset price is `null` and is never passed to either: the element is not
 * rendered at all. That is what keeps `null` (unset) and `0` (free) apart all
 * the way to the screen, and `formatBaht` answers `'-'` on null exactly as
 * `formatPrice` does so the two cannot disagree about the empty case.
 */

/**
 * ── THE STATE MESSAGE, AND WHAT IT REPLACES ───────────────────────────────
 * `registrationOpen: false` closes THIS BUNDLE'S registration. The bundle stays
 * VISIBLE — hiding it would read as a broken page to anyone holding a link —
 * and its button is replaced by this.
 *
 * The discount CODE goes with the button rather than staying on screen beside
 * the message. A code that is displayed is an invitation to use it, and a
 * closed bundle's code will not be honoured; leaving it visible would send a
 * visitor to try it and be refused somewhere this page cannot see.
 *
 * A fixed string, not an author field. The decided scope is "a state message",
 * and an author-written one would be a fourth thing to keep right per bundle
 * with no reader that behaves differently for it.
 *
 * ── IT IS NO LONGER PRIVATE TO THIS FILE, AND THE PREMISE THAT CHANGED ────
 * It was a `const` here because this component was its only reader. It is not
 * any more: the bundle quotation form shows the SAME sentence when a stale
 * link reaches a closed bundle, and a visitor who is told one thing on the
 * page and another on the form has been told nothing. So the string moved to
 * `lib/pageBuilder/bundleRegistration.js`, beside the predicate that decides
 * when it is shown — one rule, one wording, imported by both.
 */

/**
 * ── ONE ITEM CARD: ONE COURSE, ONE ROUND OF IT ────────────────────────────
 *
 * ── WHAT IS RESOLVED AND WHAT IS SNAPSHOTTED, AND WHY THE SPLIT IS THERE ──
 * Everything about the COURSE is resolved at render time — the cover, the
 * title, the detail link. Only the ROUND has a stored fallback, and the
 * asymmetry is measured rather than preferred: round 63 found 39 of 88 rounds
 * had their dates MUTATED in place and every one of those rounds was still
 * live, so a stored copy of a fetchable thing is a lie the site cannot detect.
 * A round that has ROLLED OFF is not fetchable at all, so its snapshot is the
 * only thing that can draw it. A course code behaves like the first case: one
 * that stops resolving is a withdrawal the author has to see.
 *
 * ── AN UNRESOLVED COURSE IS MARKED, NOT DROPPED ──────────────────────────
 * `bundle_courses` fails closed and simply draws fewer cards. That is right for
 * a plain grid and wrong here, and the difference is deliberate rather than an
 * inconsistency to tidy away: A BUNDLE STATES ONE PACKAGE PRICE COMPUTED OVER N
 * NAMED COURSES, so rendering N−1 of them leaves the price on screen wrong in a
 * way no reader can detect. The row survives carrying its stored code, marked,
 * and the editor warns in red. Same rule round 64 settled for a chosen round —
 * never silently dropped — applied where the consequence is larger.
 *
 * ── ONE LINK NOW, AND IT IS NOT THE REGISTRATION ONE ─────────────────────
 * The card used to carry TWO: `scheduleRegistrationHref` for a per-course
 * ลงทะเบียน, and `courseHref` for รายละเอียดหลักสูตร. THE FIRST IS GONE — this
 * panel sells a package, and a button offering one course of it at its own
 * price competed with the bundle's own register button and gave a customer a
 * cheaper-looking way out of the offer. The card describes what is in the
 * package; it is not a second till.
 *
 * `courseHref` remains and is not re-templated here.
 * `scheduleRegistrationHref` is untouched as a module and still has five other
 * callers (/schedule, /search, the training-course card, course_schedule); what
 * went is this file's import of it.
 *
 * A round that is `elapsed` or `missing` still gets no status chip, because a
 * status is the seats-left signal and cannot be true about a round nobody can
 * fetch — the snapshot schema strips it, so there is nothing to draw from even
 * by mistake. It draws the DERIVED badge instead. The clause that used to sit
 * here about such a round getting "no registration link either" is gone with
 * the link: no round of any state has one now.
 */
/**
 * ── ONE CHIP WIDTH FOR A WHOLE BUNDLE, AND WHY IT IS ESTIMATED ───────────
 * 0b845005 gave each chip `w-max`, so every chip was exactly as wide as its
 * own date — and a row of tiles came out ragged, `12-13 พ.ย. 69` beside
 * `8-9 ธ.ค. 69` beside `27-28 ม.ค. 70`, none of them lining up.
 *
 * The chips live in SEPARATE containers (one row per course tile), so no
 * amount of CSS can equalise them: there is no shared grid to belong to and
 * `subgrid` does not reach across siblings. The width has to be computed
 * from the labels and handed down, which is what this does.
 *
 * ── THE FACTOR IS MEASURED, NOT GUESSED, AND IT IS NOT `ch` ──────────────
 * `ch` is the width of "0", and in this font at this size that is 7.75px —
 * while the real Thai labels measure 4.41-5.50px PER CHARACTER, because a
 * date is mostly Thai glyphs, dots, commas and spaces rather than digits.
 * A `ch`-based width would have been ~40% too wide on every chip.
 *
 * Measured in Chrome against the rendered chip (0.72rem, font-bold, the
 * real font stack), over ten real labels from one-day to cross-month:
 *
 *   8-9 ธ.ค. 69             11 chars   57.20px   5.20 / char
 *   16-17 ก.ย. 69           13 chars   67.17px   5.17 / char
 *   27-28 ม.ค. 70           13 chars   71.45px   5.50 / char   ← worst
 *   1, 3, 5 มี.ค. 70        16 chars   70.52px   4.41 / char
 *   30 ธ.ค. 69 - 2 ม.ค. 70  22 chars  109.77px   4.99 / char
 *
 * 5.50px at an 11.52px font is 0.344rem, so PER_CHAR_REM is 0.36 — the worst
 * observed case plus about 5%. It is deliberately an UPPER bound: too wide
 * is a chip with some air in it, too narrow is a date that wraps.
 *
 * CHROME_REM is exact rather than estimated: `px-2` twice plus `border-2`
 * twice is 20px, confirmed by measuring a chip at 90.61px against its
 * 70.61px date.
 *
 * THE LONGEST LABEL BY CHARACTER COUNT is what is measured, and that is safe
 * even though the widest label is not always the longest one (`27-28 ม.ค.
 * 70` at 13 chars is wider than `1, 3, 5 มี.ค. 70` at 16): the factor is an
 * upper bound for EVERY label, so the longest string always estimates at
 * least as wide as the widest one actually renders.
 *
 * If the webfont fails and a wider fallback is used the estimate can fall
 * short. Nothing breaks: the chip is `max-w-full` and the date wraps, which
 * is the same degradation a tile narrower than the chip already gets.
 */
const CHIP_PER_CHAR_REM = 0.36;
const CHIP_CHROME_REM = 1.25;

/** The inline custom property the chip grid reads. `null` when there are no
  * rounds at all, so the style attribute is not written for nothing. */
export function bundleChipWidthStyle(labels) {
  const longest = (Array.isArray(labels) ? labels : [])
    .reduce((n, l) => Math.max(n, typeof l === 'string' ? l.length : 0), 0);
  if (!longest) return null;
  const rem = (longest * CHIP_PER_CHAR_REM + CHIP_CHROME_REM).toFixed(3);
  return { '--bundle-chip-w': `${rem}rem` };
}

/**
 * THE OFFERED ROUNDS OF ONE ITEM, as rows a chip can be drawn from.
 *
 * Module scope rather than inline in the card because the SECTION needs the
 * labels too — it has to know the longest one across every tile before any
 * tile renders. One function, called from both places, so the card and the
 * width can never disagree about what a round is called.
 */
function offeredRowsFor({ entry, item, todayKey, choice, round }) {
  return chooseItemRounds(entry?.rounds, item, todayKey)
    .map((row) => {
      // THE SHARED LABEL. Same chain as the editor and the wizard — live
      // dates, then the stored snapshot — so one round cannot be named three
      // ways. `row.dates` already carries the snapshot fallback from
      // `chooseRounds`, which is why this passes it as the live side.
      const { text: dateLabel, hasDates } = bundleRoundLabel(round, { dates: row.dates });
      // A round NOTHING can date is omitted here, and that differs from the
      // editor on purpose: an author needs to be told their round went stale
      // so they can replace it, a visitor has nothing to do with that
      // sentence and an undated row gives them nothing to choose by.
      if (!hasDates) return null;
      const option = choice?.options?.find((o) => o.roundId === row.id) ?? null;
      const pickable = option ? option.pickable : false;
      const reason = option?.reason ?? 'closed';
      return {
        key: row.id,
        dateLabel,
        pickable,
        reason,
        reasonLabel: PICK_REASON_TEXT[reason] ?? PICK_REASON_TEXT.closed,
        type: row.type,
      };
    })
    .filter(Boolean);
}

function BundleItemCard({ entry, item, todayKey, currentYear, lightScope = false, choice = null, orderLabel = null }) {
  /**
   * ── THE TILE'S HALF OF THE LIGHT SCOPE ──────────────────────────────────
   * `.pb-bundle-tile-light` (globals.css) re-declares the semantic TOKENS this
   * subtree reads, which covers every var-based colour in it — the tile
   * surface and border, the title, the round-dates box, the detail button. It
   * cannot touch Tailwind's `dark:` utilities: they compile to
   * `:is(.dark *)`, which matches a descendant of ANY `.dark` ancestor, so the
   * card's own `dark` class keeps them firing however deeply they nest, and
   * they hard-code their colour rather than reading a var.
   *
   * `lit` is that other half. The three class strings in this component that
   * carry a `dark:` variant go through it, and ONLY when the card is navy —
   * so the สีขาว tile keeps its `dark:` forms and renders exactly as it did
   * before this round.
   */
  const lit = (cls) => (lightScope ? withoutDarkVariants(cls) : cls);
  const course = entry?.course ?? null;
  const code = String(entry?.courseId ?? item?.courseId ?? '').trim();
  const round = chooseItemRound(entry?.rounds, item, todayKey);

  /**
   * ── EVERY OFFERED ROUND, AS A DRAWABLE ROW ──────────────────────────────
   * `chooseItemRounds` gives the display facts (dates, state, the live row);
   * `choice` — this item's row from `roundChoices`, computed once for the
   * whole section — gives pickability, the reason and the effective deadline.
   * Neither is recomputed here: the card must not be able to disagree with the
   * wizard or the server about whether a round can be picked.
   *
   * A round with no readable dates is DROPPED from the list rather than drawn
   * as an empty box. That is the one case where silence beats a row: there is
   * nothing for a visitor to read and nothing for them to choose by.
   */
  const offeredRows = offeredRowsFor({ entry, item, todayKey, choice, round });

  /**
   * ── `isLive` AND `derived` ARE GONE, WITH THE BADGE THEY EXISTED FOR ─────
   * They fed the per-tile status pill (`จบไปแล้ว` and its siblings) under the
   * rounds. That pill described the ONE round `chooseItemRound` picked, while
   * the list beside it already showed EVERY offered round — so on an item
   * offering three rounds it was a verdict about one of them, printed once,
   * with nothing saying which. It is removed rather than repaired: each chip
   * now carries its own state, and a chip that cannot be picked says so by
   * being greyed (and in an `sr-only` word, because greying is a colour).
   *
   * `chooseItemRound` and `round` SURVIVE — `bundleRoundLabel` still takes the
   * live row as the first half of the date chain, and `data-round-state` on
   * the tile still reports it. `chooseItemRound` still RETURNS `live`, read by
   * four other call sites (the bundle route's `emailCourses`, `bundleLegs`'
   * round fields, the bundle page's summary, and `course_schedule`). What went
   * is this card's use of it, not the field.
   */

  /**
   * `showYear: 'auto'` prints the year only when the round is not in the
   * current one, which is what the reference design shows (`20 – 21 ส.ค. 69`)
   * and what a promotion page needs — a bundle can name a round months out.
   *
   * `currentYear` is a PROP, never read from the clock here. `formatRoundDays`
   * THROWS without a number, deliberately: Vercel runs UTC, so for seven hours
   * every 31 December the server and the visitor disagree about the year, and
   * the module refuses to render two different labels rather than guess. The
   * section reads it once from `siteCurrentYear()` (Asia/Bangkok) and threads
   * it, exactly as it threads `todayKey`.
   */
  const dateLabel = round
    ? formatRoundDays(round.dates, { showMonth: true, showYear: 'auto', currentYear })
    : null;
  const cover = typeof course?.course_cover_url === 'string' ? course.course_cover_url : '';
  const title = typeof course?.course_name === 'string' ? course.course_name : '';
  const detailHref = code ? courseHref(String(code).toLowerCase()) : null;

  return (
    <li
      data-testid="bundle-item"
      data-course={code}
      data-round-state={round?.state ?? 'none'}
      data-resolved={course ? 'yes' : 'no'}
      /*
        THE SITE'S ORDINARY CARD SURFACE, taken rather than invented:
        `bg-[var(--surface)]` is what `src/components/ui/card.jsx` paints the
        `Card` primitive with, and `Card` is what the shared course card
        (`src/components/course/CourseCard.jsx`) is built on. Its own note says
        why it is a variable: #FFFFFF in light, #132638 in dark, so one card
        renders correctly in both themes.

        These cards had NO background at all and showed the panel's grey
        through, which was fine while the panel was transparent and stopped
        being fine when it became grey. The border was already
        `--surface-border`, the same half of the `Card` pair, so this completes
        a match that was half made.

        The PANEL's own soft-grey and the ROUND BOX's cream are untouched.
      */
      /*
        ROUND 80-FIX. `--text-primary` added beside the surface it belongs to:
        this `<li>` paints an OPAQUE, theme-aware surface (`--surface` is #FFFFFF
        light / #132638 dark) and named no text colour, so anything inside it
        that does not name one takes whatever the SECTION is declaring — which
        round 80 made author-dependent.

        LATENT, NOT LIVE, and stated so rather than dressed up: every text node
        in this card already pins its own colour today (the title, both lines of
        the round box, the status chip, the detail link), so this changes the
        class attribute and changes no rendered colour. It is here because the
        rule is about the SURFACE, not about which descendants happen to exist
        this week — the next text node added inside would inherit, and would do
        it silently.
      */
      className={cn(
        'flex flex-col overflow-hidden rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)]',
        // The token re-declaration. Every colour above is a var, so this one
        // class repaints the whole tile light without touching any of them.
        lightScope && BUNDLE_TILE_LIGHT_CLASS,
      )}
    >
      <div className={lit('relative aspect-video w-full bg-9e-ice dark:bg-9e-navy')}>
        {cover ? (
          <Image src={cover} alt={title} fill sizes="(min-width: 1024px) 320px, 100vw" className="object-cover" />
        ) : (
          // No cover, or no course at all. A neutral glyph rather than a broken
          // image or an empty box — the same fallback /search draws.
          <span className="flex h-full w-full items-center justify-center text-9e-slate-dp-50">
            <GraduationCap className="h-8 w-8" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {/*
          ── THE LEARNING ORDER, STATED ON THE TILE ────────────────────────
          Only when the bundle is sequential. The tiles are already in order,
          but order alone does not say that the order is a RULE — and the rule
          is what makes an earlier round unpickable for a later course.
        */}
        {orderLabel && (
          <span
            data-testid="bundle-item-order"
            className="w-fit rounded-9e-sm bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]"
          >
            {orderLabel}
          </span>
        )}
        {course ? (
          <h4 className="line-clamp-2 h-10 text-sm font-bold text-[var(--text-primary)]">{title}</h4>
        ) : (
          /**
           * THE MARKED ROW. The course code is what the author stored and the
           * only thing the site still knows, so it is what is shown — never a
           * blank card and never nothing at all. Amber rather than red: the
           * page is not broken, one reference has gone stale, and the author is
           * who can fix it.
           */
          <p data-testid="bundle-item-unresolved" className={lit('text-sm font-bold text-amber-700 dark:text-amber-400')}>
            {code || 'ไม่ได้ระบุคอร์ส'}
            <span className="mt-0.5 block text-xs font-normal">ไม่พบคอร์สนี้แล้ว</span>
          </p>
        )}

        {/*
          ── EVERY OFFERED ROUND, NOT JUST ONE ────────────────────────────
          The card used to draw ONE round box. An item offers several now and
          the applicant picks one, so all of them are listed — the visitor has
          to be able to see whether any date suits them before starting a
          quotation.

          NON-PICKABLE ROUNDS STAY VISIBLE. Removing them would make the card
          shorter the moment a round filled, which is the same
          silently-shrinking failure `chooseRounds` already refuses for a
          rolled-off round: a visitor who can see a date is spoken for knows
          to pick another, one whose option vanished does not know it ever
          existed.

          ── WHAT THEY NO LONGER SAY, AND WHY THAT IS NOT A LOSS ──────────
          They used to be labelled too — a Thai reason word under each date
          ("เต็ม", "ปิดรับ", "เริ่มแล้ว") and a `เลือกได้ถึง <date>` line under
          the pickable ones. Both are gone from the PUBLIC card, and from the
          public card only:

            · the reason word, because a greyed chip beside a coloured one
              already says "not this one" at a glance, and four refusal
              vocabularies on a card that sells a package is a card arguing
              with itself. The word survives where it changes what someone
              does — the wizard still tells an applicant why a round cannot
              be picked — and it is still IN this chip as `sr-only` text,
              because greying is a colour and WCAG 1.4.1 does not let colour
              be the only carrier.
            · the pick deadline, because it is a date about the BUYING
              process printed beside the date the training actually runs. The
              author still sees it in the editor.

          THE CREAM BOX WENT WITH THEM. It was this file drawing a second
          round visual — `bg-[var(--9e-orange-900)]`, with `opacity-60` for
          the faded state — while the site already had one. The chips below
          are `components/ScheduleCard`, the same component the course card
          draws, so there is no longer a bundle-shaped round and a
          course-shaped round to keep in step. The var-not-token reasoning
          that note carried still holds for every other colour on this tile,
          and is stated where those colours are.

          `formatRoundDays` is UNCHANGED and no second formatter was added —
          the date string is the same one this card already rendered.
        */}
        {!!offeredRows.length && (
          <div data-testid="bundle-round-list" className="flex flex-col gap-2">
            {/*
              `gap-2`, UP FROM `gap-1`. Measured in the builder canvas at a
              207px tile: the label's bottom was 793 and the first box's top
              797 — four pixels, which at an 11px label reads as the box
              sitting ON the word rather than under it. It was reported as the
              round box covering the label; the DOM says they never actually
              intersect, and what was wrong is that nothing separated them.
            */}
            <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
              {/*
                ONE STRING, NOT A COUNT-DEPENDENT PAIR. This read
                `offeredRows.length > 1 ? 'รอบที่เลือกได้' : 'รอบอบรม'`, so a
                row of tiles headed its rounds two different ways depending on
                how many each course happened to offer — a difference a reader
                has to account for before deciding it meant nothing. The label
                names WHAT THE CHIPS ARE, which does not change with their
                number, and the chips themselves already say how many there
                are.
              */}
              รอบอบรม
            </span>
            {/*
              ── A WRAPPING ROW, NOT TWO FIXED COLUMNS ─────────────────────
              This was `grid grid-cols-2`, borrowed from
              training-course/CourseCard so a round would read the same on
              both surfaces. The borrowing was wrong, and the reason is that
              the two surfaces are not the same width.

              A course card's chip gets half of a ~250px card. A bundle course
              tile is ~200-230px and the grid gave each chip half of THAT —
              83-100px — against a Thai round label that needs ~110px. So
              `16-17 ก.ย. 69` broke across two lines, and it did so EVEN FOR A
              COURSE WITH ONE ROUND, because a two-column grid reserves the
              second column whether anything occupies it or not. The constant
              shape that CourseCard's note calls a feature is, at this width, a
              column of empty space paid for by the date.

              A wrapping flex row inverts the relationship: the CHIP asks for
              the width its date needs (`w-max` below) and the row decides how
              many fit, breaking to a second line when they do not. One round
              draws one chip as wide as its date and no wider; three draw three
              and wrap. No chip is ever narrower than its content because of a
              neighbour that does not exist.

              ── AND NOW A GRID, BECAUSE A ROW CANNOT EQUALISE WIDTHS ──────
              `w-max` per chip made every chip exactly as wide as its own
              date, which is right for ONE chip and ragged for a row of
              tiles: `12-13 พ.ย. 69` beside `8-9 ธ.ค. 69` beside
              `27-28 ม.ค. 70`, none of them lining up.

              The track is a FIXED width shared by the whole bundle —
              `--bundle-chip-w`, set once on the items list from the longest
              label anywhere in the section (see bundleChipWidthStyle). Every
              chip in every tile therefore measures the same.

              `minmax(0,var(…))` rather than the bare variable, and that is
              the narrow-tile safety: a bare fixed track wider than its
              container overflows it, while `minmax(0,X)` lets the track
              shrink below X when there is not room, at which point the date
              wraps instead of spilling. Nothing clips and nothing scrolls.

              `auto-fill` rather than `auto-fit`, and NOT `1fr`: both of
              those collapse or stretch the track to the container when only
              one chip is present, which would make a single round a
              full-width slab — the opposite of the shared width.

              NOTHING ELSE IS ON THIS ELEMENT, and that is a finding rather
              than a minimal first draft. The two-round tile first rendered
              76.8px-tall chips — the height of its whole two-line row — beside
              34.4px ones on every single-round tile. `content-start`,
              `items-start` and `shrink-0` were each tried here and each
              measured EXACTLY the same 76.8, so none of them is the cause and
              none of them stayed. The cause was `h-full` on the chip itself,
              proven by setting `height: auto` on it in the live DOM and
              watching the chips return to 34.4 while this row stayed 76.8 —
              correct, because 34.4 + 8 + 34.4 is two lines. See `fillHeight`
              in ScheduleCard, which the call site below turns off.
            */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(0,var(--bundle-chip-w)))] items-stretch gap-2">
              {offeredRows.map((row) => (
                <div
                  key={row.key}
                  data-testid="bundle-round-box"
                  data-pickable={row.pickable ? 'yes' : 'no'}
                  data-reason={row.reason ?? undefined}
                  /*
                    `w-full` — the chip fills its GRID TRACK, and the track is
                    the width the whole bundle agreed on. This was `w-max`,
                    which sized each chip to its own date and is exactly what
                    made the rows ragged.

                    `max-w-full` stays as the floor under the track: the
                    shared width is computed from a label, not from the tile,
                    so on a narrow screen it can exceed the space available.
                    The cap wins, the date wraps, and nothing clips or
                    scrolls sideways.
                  */
                  className="w-full max-w-full"
                >
                  {/*
                    ── NO `status`, SO NO BADGE — AND THAT IS THE RULING ──────
                    `resolveScheduleBadge('')` returns null and ScheduleCard
                    draws no pill for it. The pill it would otherwise draw for
                    an open round is the green `ลงทะเบียน` one, and a bundle
                    chip must not offer it: registration happens through the
                    bundle's own button, and a register pill per round would
                    say each round is separately bookable. These chips are not
                    links and not buttons.

                    A NON-PICKABLE ROUND SHOWS NO WORD AT ALL, only the greyed
                    `muted` tone — and therefore carries `srStatus`, because
                    greying is a colour and WCAG 1.4.1 does not let colour be
                    the only carrier. The Thai reason is the SAME
                    `PICK_REASON_TEXT` the wizard words its refusals with, so
                    the two surfaces cannot disagree about why.

                    `scoped` rather than the default tone, because a tile can
                    carry `.pb-bundle-tile-light` and stay light inside a navy
                    card — where ScheduleCard's own `dark:text-white` would
                    paint the date white on near-white. See the tone note
                    there.
                  */}
                  {/*
                    NO DOT. It was moved inline in 3b74d7a6 because the corner
                    version overlapped a wrapped date; inline it stopped
                    overlapping and went on costing width — a dot plus its gap
                    — on the one surface with none to spare.

                    It was never carrying information HERE. On a course card
                    the dot names the delivery type against the
                    Classroom/Hybrid legend printed above it. A bundle tile has
                    no legend, so the dot was an undecodable colour, and the
                    chip's BORDER is already that same colour. Dropping it
                    gives the width to the date, which is the thing a visitor
                    is actually reading.
                  */}
                  <ScheduleCard
                    dateLabel={row.dateLabel}
                    type={row.type}
                    status=""
                    tone={row.pickable ? 'scoped' : 'muted'}
                    srStatus={row.pickable ? '' : row.reasonLabel}
                    showDot={false}
                    fillHeight={false}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {/*
          ── ONE BUTTON, AND THE ลงทะเบียน ONE IS NOT COMING BACK ───────────
          THIS PANEL SELLS A PACKAGE. A per-course ลงทะเบียน button took the
          customer to register for ONE course at its own price — competing with
          the bundle's own register button a column away, and offering a
          cheaper-looking way out of the offer the page exists to make. A card
          here is a description of what is IN the package, not a second place to
          buy one piece of it.

          The earlier design had the pair, and a previous round argued at length
          that the bundle's `registrationOpen` switch must NOT reach these
          buttons. That argument was right and is now moot: there is no
          per-course button for the switch to reach or spare. See the note on
          `registrationOpen` in lib/schemas/sections/dynamic.js, which was
          rewritten in the same commit rather than left describing a control
          that no longer exists.

          รายละเอียดหลักสูตร takes the FULL WIDTH the pair used to share —
          `w-full` in place of the two `flex-1`s. A single button left at half
          width would leave a visibly empty half-row, which reads as a button
          that failed to render rather than as a deliberate one.
        */}
        {detailHref && (
          <div className="mt-auto pt-2">
            {/*
              ── IT NEEDED NO RECOLOURING, AND THAT IS THE LIGHT SCOPE WORKING
              Border and text are both TOKENS, so `.pb-bundle-tile-light`
              already gives this the dark outline and dark text the round asked
              for on the #F8FAFD tile — rgba(13,27,42,0.12) and #0D1B2A. The
              hover pair is `9e-action` (#005CFF), declared once in `:root` with
              no dark form, so it is the same visible blue on either surface.

              `focus-visible` is ADDED, and it is the one thing here that was
              missing rather than merely untested: the button had a hover state
              and no focus state at all, so a keyboard user following the tile's
              one link had nothing to see. It uses the same `9e-action` as the
              hover so the two read as one affordance, and `ring-offset` picks
              up the tile's own surface token — which means it works on both
              card styles without a second rule.

              Unconditional rather than navy-only. It is invisible until
              keyboard focus, so the สีขาว tile still LOOKS exactly as it did,
              which is what R2 asks; scoping an accessibility fix to one style
              would be the odder choice.
            */}
            <Link
              href={detailHref}
              data-testid="bundle-item-detail"
              className="inline-flex w-full items-center justify-center rounded-9e-md border border-[var(--surface-border)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-9e-action/40 hover:text-9e-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
            >
              รายละเอียดหลักสูตร
            </Link>
          </div>
        )}
      </div>
    </li>
  );
}

export function PromotionBundleSection({ content, data, style, pageId = null, sectionId = '' }) {
  const name = typeof content?.name === 'string' ? content.name.trim() : '';
  const blurb = typeof content?.blurb === 'string' ? content.blurb.trim() : '';
  /**
   * The short label — the pill, and the word inside the course-list heading.
   * Trimmed like every other string here, so a label of spaces is absent rather
   * than an empty pill: `'   '` is truthy and would otherwise draw one.
   */
  const label = typeof content?.label === 'string' ? content.label.trim() : '';
  const code = typeof content?.discountCode === 'string' ? content.discountCode.trim() : '';

  // `== null` catches both null and an absent key, and — deliberately — NOT 0.
  // A free bundle is expressible; an unset price is not a zero.
  const listPrice = typeof content?.listPrice === 'number' ? content.listPrice : null;
  const netPrice = typeof content?.netPrice === 'number' ? content.netPrice : null;
  const discount = discountPercent(listPrice, netPrice);

  const items = Array.isArray(content?.items) ? content.items : [];

  /**
   * The BUNDLE-LEVEL register link, or null when this render cannot build one.
   *
   * IT IS NOW THE ONLY REGISTRATION LINK ON THIS SECTION. It used to be named
   * apart from `BundleItemCard`'s `registerHref` deliberately — two links, two
   * audiences, two rules, and one shared name would have been the first step to
   * someone applying one rule to both. That per-course link is gone, so the
   * distinction the name was defending no longer exists; the name stays because
   * it is accurate, not because there is a second thing to tell it from.
   *
   * `pageId` is absent on the editor canvas (which renders SectionRenderer
   * directly) and on any caller that does not thread it, and a link missing
   * half its key is worse than no link: it would resolve to a different bundle
   * on a duplicated page, or to nothing at all.
   *
   * `section.id` reaches this component only as part of the pair the PAGE
   * threads — a section component is not handed its own id — so the id comes
   * from `content` having been resolved under it upstream. It is passed as
   * `sectionId` alongside `pageId` for that reason.
   */
  const bundleRegisterHref =
    pageId && sectionId
      ? `/registration/bundle?page=${encodeURIComponent(pageId)}&section=${encodeURIComponent(sectionId)}`
      : null;

  // ABSENT MEANS OPEN, and the rule lives in `isBundleRegistrationOpen` rather
  // than in this line. It used to be `content?.registrationOpen !== false`
  // written out here, which was correct and was about to acquire a second copy:
  // the bundle quotation form must refuse a submission on exactly the same
  // condition that removes the button, and two spellings of one rule is how a
  // closed bundle stays registerable through a stale link. See that module for
  // why it is `!== false` and never truthiness.
  const open = isBundleRegistrationOpen(content);


  // The guard `sectionRendersEmpty` mirrors. Nothing authored at all → nothing
  // drawn; the editor warns and the structure tree marks it.
  if (!name && !blurb && !code && listPrice == null && netPrice == null && !items.length) {
    return null;
  }

  /**
   * The resolved list, PARALLEL to `items` — same length, same order, one entry
   * each (see assembleResolved). Indexed rather than keyed by course code
   * because the same course may legitimately appear twice in one bundle, for
   * two different rounds.
   *
   * `data` is undefined until the canvas's fetch lands, and `[]` if the section
   * resolved to nothing. Both mean "draw the item from what the DOCUMENT says",
   * which is the marked row — never a shorter bundle. `?? null` per entry keeps
   * that decision inside BundleItemCard rather than making it twice.
   */
  const resolved = Array.isArray(data) ? data : [];

  // Read ONCE, here, and threaded down. Both are Asia/Bangkok clock reads; a
  // per-card read would let two cards in one render disagree about the date at
  // a midnight boundary, and formatRoundDays refuses to read the clock at all.
  const todayKey = siteTodayKey();
  const currentYear = siteCurrentYear();

  const sequential = content?.sequential === true;

  /**
   * ── PICKABILITY, COMPUTED ONCE FOR THE WHOLE SECTION ───────────────────
   * Every round of every item, keyed by id, from the LIVE rows the resolver
   * fetched. The snapshot is deliberately not consulted for status: it carries
   * none, and a frozen one would be a second, stale answer.
   */
  const liveStatusById = {};
  for (const entry of Array.isArray(data) ? data : []) {
    for (const row of Array.isArray(entry?.rounds) ? entry.rounds : []) {
      const id = String(row?._id ?? '');
      if (id) liveStatusById[id] = { status: row?.status, dates: row?.dates };
    }
  }

  /**
   * ── THE CARD ASKS WITHOUT THE SEQUENCE; AUTO-CLOSE ASKS WITH IT ────────
   * `sequential: false` here ON PURPOSE, and it is the subtle call of this
   * commit. With the real flag and no picks, every round of every course after
   * the first would come back `previous_not_picked` — true, and useless on a
   * card: the card is not a picker, so fading an entire course's dates behind
   * "choose the previous course first" would hide the dates a visitor came to
   * read. So each round is shown with its OWN state — closed, full, started,
   * deadline passed — which is exactly the four labels the ruling lists, and
   * the sequence is stated once as a rule below the list.
   *
   * `bundleRegistrable` DOES get the real flag, because that question is
   * "could anyone complete this", and under sequential the answer genuinely
   * depends on the chain.
   */
  const choices = roundChoices({
    items,
    sequential: false,
    liveStatusById,
    picks: {},
    today: todayKey,
  });
  const choiceByItemId = new Map(choices.map((c) => [c.itemId, c]));

  /**
   * ── THE ONE CHIP WIDTH, DECIDED HERE AND NOWHERE ELSE ─────────────────
   * Every round chip in this bundle is the same width, and the width is the
   * longest label across ALL of its tiles. That cannot be decided inside a
   * tile — a tile only knows its own rounds — so it is decided here, where
   * every item is in hand, and handed down as one inline custom property on
   * the list below.
   *
   * `offeredRowsFor` is the SAME function each tile draws from, so the
   * labels measured here are character-for-character the labels rendered.
   * Calling it twice is the price of not threading rows through the tree,
   * and it is pure: same inputs, same rows.
   */
  const chipWidthStyle = bundleChipWidthStyle(
    items.flatMap((it, i) => {
      const id = String(it?.id ?? '').trim();
      const entry = resolved[i] ?? null;
      return offeredRowsFor({
        entry,
        item: it,
        todayKey,
        choice: choiceByItemId.get(id) ?? null,
        round: chooseItemRound(entry?.rounds, it, todayKey),
      }).map((r) => r.dateLabel);
    }),
  );

  /**
   * ── AUTO-CLOSE (R5), AND WHY THE AUTHOR'S SWITCH STILL WINS ───────────
   * A bundle nobody can complete must not offer a register button. But the two
   * refusals are different facts and are kept apart: `open === false` is the
   * author saying no, and it is checked FIRST, so an author who closed a
   * bundle is never told instead that the schedule did.
   *
   * AN ITEMLESS BUNDLE IS NOT AUTO-CLOSED, and the distinction is the point.
   * `bundleRegistrable` answers false for it, correctly — there is no chain
   * over zero courses — but "ยังไม่มีรอบที่เปิดรับครบทุกหลักสูตร" would be a
   * claim about ROUNDS, and a bundle with no courses has none to make it
   * about. It is UNFINISHED: the editor warns, `publishBlockers` refuses the
   * publish, and `resolveBundleRequest` refuses the quotation. Telling a
   * visitor the schedule is full would be the one wrong sentence available.
   */
  const chainPossible =
    items.length === 0 ||
    bundleRegistrable({ items, sequential, liveStatusById, today: todayKey });

  /**
   * ── THE NAVY SURFACE, ITS GLOWS AND ITS OPTIONAL BORDER ──────────────────
   * Both helpers gate on `SECTION_STYLE_CAPS` before reading anything, so the
   * props cannot be read by a type that is not offered the controls. Each hands
   * back `{ className, vars }`; the border's are BOTH empty when the author has
   * not switched it on, so spreading them unconditionally is safe and an off
   * border leaves no trace at all.
   */
  const glow = bundleGlowFor('promotion_bundle', style);
  const border = cardBorderFor('promotion_bundle', style);

  /**
   * ── WHICH OF THE TWO WHOLE-CARD STYLES ──────────────────────────────────
   * `light` is the resolved default, so a section with nothing stored — which
   * is every section authored before this field existed — takes the pre-navy
   * card. `glow` is already empty for a light card (the gate is in
   * `bundleGlowFor`), so this flag decides only the two things the resolver
   * cannot: which SURFACE class to apply, and whether to scope `dark`.
   */
  const isNavy = bundleCardThemeFor('promotion_bundle', style) === 'navy';

  return (
    <div
      data-pb-bundle=""
      /**
       * ── `dark` IS SCOPED ONTO THE CARD, AND IT IS LOAD-BEARING ───────────
       * The base is the navy token in BOTH site themes, so the card no longer
       * follows the theme it sits in — but everything inside it still reads the
       * semantic tokens, and in LIGHT mode `--text-primary` is #0D1B2A. That is
       * the navy itself: the title would be navy-on-navy, invisible, and the
       * round-dates box and course rows would paint their light forms on a dark
       * ground.
       *
       * `darkMode: 'class'` (tailwind.config.js) plus `.dark { --token: … }` as
       * a BARE class selector in globals.css is what makes this work in one
       * attribute: custom properties inherit, so re-declaring them here hands
       * the whole subtree the dark set, and Tailwind's `dark:` variants compile
       * to `.dark &` so every `dark:` class on a DESCENDANT activates too. One
       * attribute, and the fourteen colour sites inside the card are correct
       * without being touched — which is why this is the mechanism rather than
       * repainting each of them.
       *
       * Nesting it inside the real `.dark` on <html> is a no-op: same selector,
       * same values.
       *
       * The card ROOT's own `dark:` variants would NOT activate (an element is
       * not its own descendant). It has none, and must not grow any — its
       * colours come from the navy class and the two helpers.
       */
      className={cn(
        'grid grid-cols-1 gap-6 rounded-9e-lg p-6',
        // A THIRD AND THE REST, and it stacks below `lg` — which is the mobile
        // order the round asked for, for free: one column, LEFT BLOCK FIRST, so
        // a customer on a phone meets the price and the button before the course
        // list, exactly as the desktop reading order does.
        ratioClass('30-70'),
        /**
         * THE SURFACE, AND THE ONE THING THAT MUST NOT LEAK BETWEEN STYLES.
         * `glow.className` carries the navy base; `backgroundClass('soft_gray')`
         * is the สีขาว surface. Exactly one is applied, because applying both
         * would paint navy under soft gray (the glow layers are a
         * background-IMAGE, so a background-color beside them would show
         * through their transparent tails).
         *
         * `dark` is scoped for navy ONLY. For สีขาว its absence IS the feature:
         * the card follows the site theme again, which is what the pre-navy
         * card did and what this style exists to restore.
         */
        isNavy ? cn('dark', glow.className) : backgroundClass('soft_gray'),
        border.className,
      )}
      style={{ ...glow.vars, ...border.vars }}
    >
      {/*
        ── THE LEFT COLUMN: the offer ────────────────────────────────────────
        Pill, headline, discount chip, struck-through list price, the large net
        price, the VAT footnote, then the button. Ordered exactly as they are
        read, so the DOM order and the visual order are the same thing and the
        stacked layout needs no reordering rule.
      */}
      <div data-testid="bundle-left" className="flex flex-col gap-3">
      {/*
        ── THE SHORT LABEL, ABOVE THE HEADLINE ───────────────────────────────
        Rendered only when the author typed one. ABSENT DRAWS NOTHING — not an
        empty pill, not a placeholder, and not a number derived from this
        section's position among its siblings. "Bundle 1" looks like an index
        and is not one; reordering the page must not rename anything.

        `w-fit` rather than an inline-block: this is a flex column, so a bare
        <span> would stretch to the full width and read as a bar.
      */}
      {/*
        ── THE EYEBROW: LIME ON THE NAVY, NOT A NAVY PILL ON SOFT GRAY ──────
        It was `bg-9e-navy` + `text-9e-lime` — a dark pill, which is what a lime
        word needs when the card behind it is soft gray. The card is navy now,
        so that pill is navy-on-navy: an invisible box around visible text, and
        the padding it still reserved made the eyebrow sit lower than the
        reference's.

        A VERY SUBTLE LIME TINT, not transparent. `bg-9e-lime/10` keeps the
        shape legible as a deliberate eyebrow rather than a stray line, and the
        opacity modifier is available here because `9e-lime` is a plain hex in
        tailwind.config.js (#D4F73F) — this is a static class Tailwind scans,
        not an interpolated arbitrary value.

        The lime token is theme-invariant (`--9e-lime` is #D4F73F in both the
        `:root` and `.dark` blocks), so it needs no dark form and the scoped
        `dark` on the card root does not change it. Measured on #0D1B2A:
        14.23:1.

        ── AND THE NAVY PILL IS BACK, FOR สีขาว ────────────────────────────
        Both forms now exist because both cards do. The navy pill is the
        pre-navy-round eyebrow restored BYTE-IDENTICALLY — `bg-9e-navy` +
        `text-9e-lime` — because on a soft-gray card a lime word needs a dark
        ground behind it, which is the whole reason it was a pill in the first
        place. The tint form is for the navy card, where that pill would be
        navy-on-navy: an invisible box around visible text.

        Which is to say the two are not a style preference between them: each is
        the only legible form on its own surface.
      */}
      {label && (
        <span
          data-testid="bundle-label"
          className={cn(
            'w-fit rounded-9e-sm px-2.5 py-1 text-xs font-bold text-9e-lime',
            isNavy ? 'bg-9e-lime/10 tracking-wide' : 'bg-9e-navy',
          )}
        >
          {label}
        </span>
      )}
      {name && <h3 className="font-heading text-xl font-bold text-[var(--text-primary)]">{name}</h3>}
      {blurb && <p className="text-sm text-[var(--text-secondary)]">{blurb}</p>}

      {/*
        ── DERIVED, NEVER STORED ──────────────────────────────────────────
        The two prices are what must match a real quotation; this is display.
        `discountPercent` answers null for every pair that cannot honestly
        produce a number — either price unset, a zero list price, or a net
        price ABOVE the list — so there is no path here that draws `ลด -8%`.

        `> 0` on top of that, because 0 IS an honest answer (a bundle sold at
        its list price) and "ลด 0%" is a chip that advertises nothing.

        ON ITS OWN LINE now, and painted with the orange TOKEN rather than the
        accent var it used to take. `9e-orange-50` is #FF9124 in BOTH themes —
        globals.css declares it identically in the light and `.dark` blocks —
        so unlike the -900 step used by the round box, the token is safe here
        and no var indirection is needed.
      */}
      {discount != null && discount > 0 && (
        <span
          data-testid="bundle-discount"
          className="w-fit rounded-9e-sm bg-9e-orange-50 px-2 py-0.5 text-xs font-bold text-white"
        >
          ลด {discount}%
        </span>
      )}

      {/*
        ── THE PRICE: THREE LINES, AND THE BIG ONE IS THE ANCHOR ───────────
        ราคาปกติ <struck-through> บาท, then the net price large and red with a
        small dark บาท on the same baseline, then the VAT footnote.

        `items-baseline` is what puts บาท ON the price's baseline rather than
        centred against a 36px number — the two are different type sizes and
        centring them reads as a mistake.

        Red comes from Tailwind's own palette with a dark pairing, which is
        what this codebase already does for red everywhere else; there is no
        9e red token to take.
      */}
      {(listPrice != null || netPrice != null) && (
        <div data-testid="bundle-prices" className="flex flex-col gap-1">
          {listPrice != null && (
            <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ราคาปกติ{' '}
              <span data-testid="bundle-list-price" className="line-through">
                {formatBaht(listPrice)}
              </span>{' '}
              บาท
            </p>
          )}
          {netPrice != null && (
            <p className="flex items-baseline gap-2">
              <span
                data-testid="bundle-net-price"
                className="font-heading text-4xl font-bold text-red-600 dark:text-red-400"
              >
                {formatBaht(netPrice)}
              </span>
              <span className="text-base font-bold text-[var(--text-primary)]">บาท</span>
            </p>
          )}
          <p data-testid="bundle-vat-note" className="text-xs text-[var(--text-secondary)]">
            * ราคาดังกล่าวยังไม่รวม VAT 7%
          </p>
        </div>
      )}



      {/*
        ── THE BUNDLE-LEVEL AFFORDANCE, AND THE WHOLE OF WHAT THE SWITCH DOES ─
        This block is all `registrationOpen` controls, and now that is a plain
        statement rather than a boundary anyone has to hold.

        IT USED TO BE A BOUNDARY. The item cards carried their own per-course
        ลงทะเบียน buttons into ordinary rounds, and the rule was that closing a
        bundle must leave those alone — a promotion ending does not close a
        course's rounds. Two kinds of button in one component, nothing
        structural keeping them apart, and a comment plus a test doing the work.

        THAT BUTTON IS GONE (this panel sells a package; see the note in
        `BundleItemCard`). So the switch has nothing to over-reach into: the
        cards contain one link each, to a course DETAIL page, which is not a
        registration affordance in any state. The test that pinned the old
        distinction was rewritten in the same commit rather than deleted — it
        now asserts the cards carry no registration link at all, which is the
        stronger claim and the one that would catch the button coming back.
      */}
      {open && chainPossible
        ? (bundleRegisterHref || code) && (
            /*
              A COLUMN now, not a row. The button takes the full width of the
              left column — it is the panel's call to action, and a 102px link
              floating under a 36px price read as an afterthought — and the code
              chip sits under it rather than beside it, where a `flex-wrap` row
              would have put it at some widths and not others.

              A PLAIN BLOCK COMMENT, not the braced JSX form: this position is
              inside the `&& (` expression, not JSX children, and a braced
              comment there parses as an object literal.
            */
            <div data-testid="bundle-offer" className="mt-1 flex flex-col items-start gap-3">
              {/*
                ── THE REGISTER BUTTON, AND WHAT IT REPLACED ──────────────────
                Until this commit the bundle-level affordance was a
                คัดลอกรหัสส่วนลด button beside the code: the visitor took a
                string away and used it somewhere this page could not see. The
                button asks for the package instead, and the request is stored
                as an ordinary quotation the sales team already knows how to
                answer.

                THE CODE STAYS, AS SELECTABLE TEXT. Only the COPY BUTTON was
                removed. `content.discountCode` is a schema field and the rule
                in this repo is that no field ships without a named reader —
                this chip is it, along with the editor's own input and
                `sectionRendersEmpty`'s guard. Deleting the chip too would have
                left the field read by nothing.

                THE LABEL SAYS สมัคร; THE FLOW IS STILL A QUOTATION REQUEST.
                Only the wording changed here — the href, the switch that
                removes it and everything downstream are untouched. Worth
                knowing because the confirmation mail this produces still opens
                "เราได้รับคำขอใบเสนอราคาสำหรับ …", so button and mail describe
                the same act in two registers. That is the wording the round
                asked for; if the mail should follow, it is its own decision and
                its own commit.

                THE LINK CARRIES (pageId, sectionId) AND NOT sectionId ALONE.
                `duplicatePageBuilderPage` keeps section ids by design, so two
                bundles on a duplicated promotion page share one — a quotation
                keyed on the id alone could not say which page it came from.

                NO BUTTON WITHOUT A pageId. The editor canvas renders
                SectionRenderer directly and passes none, so a bundle on the
                canvas draws the code and no button. That is right: the canvas
                previews a page that may not be published, and the form would
                refuse such a link anyway — better to draw nothing than a link
                that leads to a refusal.

                The link is NOT validated here and must not be: it is a lookup
                key, and `resolveBundleRequest` re-derives everything from the
                stored page at both ends. A page that could go stale between
                render and click is exactly why the guard lives there.
              */}
              {bundleRegisterHref && (
                <Link
                  href={bundleRegisterHref}
                  data-testid="bundle-register"
                  /**
                   * THE PRESET PAINTS IT; THIS SIZES IT.
                   * `BUTTON_STYLE_CLASS` carries colour and hover ONLY — no
                   * display, no padding, no radius — so a call site that passes
                   * it alone gets a bare 24px-tall text link, which is what this
                   * button was. The per-course ลงทะเบียน buttons in the cards
                   * below already spell their own box the same way; this is that
                   * construction one step larger, because it is the panel's
                   * primary call to action rather than one of a pair.
                   */
                  className={cn(
                    'inline-flex w-full items-center justify-center rounded-9e-md px-4 py-3 text-sm font-bold',
                    accentButtonClass('promotion_bundle', style),
                  )}
                >
                  สมัคร Bundle นี้
                </Link>
              )}
              {/*
                ── THE CHIP MOVES FROM THE ACCENT'S TEXT TO ITS FILL/ON PAIR ──
                It was `--pb-accent-text` on no background. That was right on
                soft gray and is NOT right on navy: `--pb-accent-text` for the
                default `brand_blue` resolves to `--9e-action` (#005CFF), which
                is declared in `:root` only — it has no dark form, so the scoped
                `dark` on the card root cannot help it. MEASURED on #0D1B2A:
                3.29:1, below AA for 14px bold text. The navy base degraded this
                one element, so it is corrected in the same round rather than
                left as a regression the design shipped with.

                `--pb-accent-fill` + `--pb-accent-on` is the SANCTIONED pair for
                "text on the accent" and needs no new mechanism: presets.js
                already picks `on` by contrast (`accentContrastOk` gives a dark
                accent the light token and a pale one the dark token), so this
                is legible for a CUSTOM accent too, not just the five presets.
                Measured for each preset pair: brand_blue 5.05, navy 16.64,
                cyan 8.42, orange 7.73, green 6.98 — all past AA.

                THE SECTION STAYS AN ACCENT CONSUMER, which matters beyond
                looks: test/pure/sectionControlAudit asserts the direct-consumer
                set as an EXACT list and its message says a REMOVAL "means a
                type stopped following the author's accent, which is the
                original defect coming back". This still reads `--pb-accent-*`,
                so the chip remains the surface that keeps `promotion_bundle` in
                that set — see the doc's addendum, which now cites this element.

                The border drops `--surface-border` with it: a 1px border the
                same value as the fill it surrounds is invisible, and on the
                navy it was nearly so anyway.
              */}
              {code && (
                <code
                  data-testid="bundle-code"
                  className="rounded-9e-sm bg-[var(--pb-accent-fill)] px-3 py-2 font-en text-sm font-bold tracking-wider text-[var(--pb-accent-on)]"
                >
                  {code}
                </code>
              )}
            </div>
          )
        : (
          /*
            ── THE CLOSED STATE IS BUTTON-SHAPED, AND INERT ─────────────────
            It sits where the live button sits and matches its box exactly —
            `w-full`, the same `rounded-9e-md px-4 py-3 text-sm font-bold`, the
            same `inline-flex items-center justify-center`. Only the surface and
            the cursor differ. A left-aligned sentence in a bordered box read as
            an error notice rather than as the button's disabled twin.

            ── WHY A <span>, AND NOT THE TWO OBVIOUS ALTERNATIVES ───────────
            NOT a `<button disabled>`: a real button is a control, and a control
            that exists in order to do nothing is a promise the page cannot
            keep. Screen readers announce it as a dimmed button, which invites
            the question "how do I enable it" that this element cannot answer.

            NOT an `<a>` without an href: that is not a link at all — it is a
            placeholder anchor with no role, which some readers still announce
            and which is exactly the dead stop the round asked to avoid.

            A `<span>` is neither. It has no implicit role, takes no tab stop
            (no href, no tabindex, not a form control), and cannot be activated
            — so a keyboard user tabs from the price straight past it to the
            course links, which is where anything actionable actually is. The
            sentence is still read in document order by a screen reader, because
            it is ordinary text; it simply is not offered as a control.

            `select-none` because it is chrome rather than copyable content, and
            `cursor-default` so a mouse never shows the pointer that would
            suggest it does something. No hover state, deliberately: a hover
            that changes nothing is the same false promise in another form.

            NO BORDER, AND THAT IS A MEASUREMENT RATHER THAN A PREFERENCE. It
            had one and was 46px tall against the live button's 44px — the
            accent button is a filled box with no border, so a 1px border here
            added 2px and the two boxes did not line up. The muted fill already
            delineates the shape. Measured again after: 328.8×44 at 1440 and
            311×44 at 375, identical to the button in both.

            ONE SHAPE, TWO TEXTS. The same element carries the expiry wording
            when that state can reach a panel — see the note beside the message
            constants. Today only the switch reaches it, because a page past its
            publish window 404s before any section renders.
          */
          <span
            data-testid="bundle-closed"
            aria-disabled="true"
            className="inline-flex w-full cursor-default select-none items-center justify-center rounded-9e-md bg-[var(--surface-muted)] px-4 py-3 text-center text-sm font-bold text-9e-slate-dp-50 dark:text-[#94a3b8]"
          >
            {open ? BUNDLE_NO_ROUNDS_MESSAGE : BUNDLE_CLOSED_MESSAGE}
          </span>
        )}
      </div>

      {/*
        ── THE RIGHT COLUMN: what is in the package ────────────────────────
        The heading, then one card per item side by side. It was built in the
        single column last commit and MOVED here rather than duplicated — the
        heading has exactly one definition, and its label-less form travelled
        with it unchanged.

        `min-w-0` is a PRECAUTION, and the measurement says so rather than the
        other way round. A grid track is `min-content` at its floor, so a child
        whose content cannot shrink can push a track past its fr share; this is
        the standard guard against that.

        IT IS NOT LOAD-BEARING ON TODAY'S CONTENT, and the first draft of this
        note claimed it was. Stripping the class from the live page at 1440 and
        re-measuring gave an identical column width (767.2px) and no horizontal
        overflow either way — the card grid's own tracks already constrain this
        column, so nothing here is currently relying on it. Kept because the
        content is authored and a long unbroken course title is exactly the case
        it exists for; described honestly because a comment claiming a measured
        fact it does not have is worse than no comment.
      */}
      <div
        data-testid="bundle-right"
        className="flex min-w-0 flex-col gap-3 lg:border-l lg:border-[var(--surface-border)] lg:pl-6"
      >
        {items.length > 0 && (
          <>
            {/*
                  ── THE COURSE-LIST HEADING, AND ITS LABEL-LESS FORM ────────────────
                  With a label:    หลักสูตรที่ร่วมรายการ Bundle 1 (2 คอร์ส)
                  Without one:     หลักสูตรที่ร่วมรายการ (2 คอร์ส)

                  The label AND ITS SPACE drop together — the alternative was a
                  stand-in word like "แพ็กเกจ", which invents a name the author
                  declined to type and is the opposite of "absent renders nothing".
                  One string with one optional interpolation, so the two forms cannot
                  drift into two sentences.

                  The count is `items.length` — what the DOCUMENT says — and not the
                  resolved length. A course that no longer resolves still draws its
                  marked card, and a heading that counted only the resolvable ones
                  would disagree with the cards directly beneath it.
                */}
                <h4
                  data-testid="bundle-items-heading"
                  className="font-heading text-base font-bold text-[var(--text-primary)]"
                >
                  {`หลักสูตรที่ร่วมรายการ${label ? ` ${label}` : ''} (${items.length} คอร์ส)`}
                </h4>
                <ul
                  data-testid="bundle-items"
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  /*
                    THE SHARED CHIP WIDTH, as an inline custom property on the
                    one element every tile descends from. A custom property is
                    what crosses this boundary rather than a class, because the
                    value is DATA — it changes with the longest label — and a
                    Tailwind arbitrary value built by interpolation compiles to
                    nothing at all: Tailwind scans source text and never
                    evaluates it. The class that reads this lives on the chip
                    grid and is written out in full.

                    `null` when the bundle offers no dated round anywhere, so
                    no style attribute is written for a variable nothing reads.
                  */
                  style={chipWidthStyle ?? undefined}
                >
                  {items.map((it, i) => (
                    /**
                     * Keyed by the ITEM'S OWN id, never by index and never by course
                     * code: the same course can appear twice in one bundle, so a code
                     * key would collide, and an index key would carry a card's
                     * identity to its neighbour when the author reorders. The id is
                     * required by the schema for exactly this. `|| i` is the last
                     * resort for a document written before the id existed — there are
                     * none today, and a React key warning is better than a crash.
                     */
                    <BundleItemCard
                      key={it?.id || `item-${i}`}
                      item={it}
                      entry={resolved[i] ?? null}
                      todayKey={todayKey}
                      currentYear={currentYear}
                      /**
                       * A LIGHT tile is needed exactly when the CARD is dark.
                       * Passed as the card's own question rather than as
                       * `theme`, so the tile does not have to know the
                       * vocabulary — if a third dark style ever lands, this
                       * call site changes and the tile does not.
                       */
                      lightScope={isNavy}
                      choice={choiceByItemId.get(String(it?.id ?? '').trim()) ?? null}
                      orderLabel={sequential ? `ลำดับที่ ${i + 1}` : null}
                    />
                  ))}
                </ul>
              {/*
                ── THE SEQUENCE RULE IS NOT STATED HERE ANY MORE ──────────
                It read `เลือกรอบตามลำดับ — รอบของหลักสูตรถัดไปต้องเริ่มหลัง
                หลักสูตรก่อนหน้าจบ` under the list. It was true, and it was
                answering a question nobody has yet: this card describes what
                is IN the package, and the constraint only bites once someone
                is choosing dates.

                WHERE IT WENT, rather than simply going: the wizard states the
                same sentence above its controls (BundleRoundPicks), and says
                it per option too — a round that cannot follow the previous
                course is disabled there with its own reason. So the rule is
                read at the moment it applies instead of on a card the visitor
                is still only browsing.

                `ลำดับที่ N` stays on each tile. That is the ORDER, which is a
                fact about the package and readable here; the rule about how
                rounds must chain is not.
              */}
          </>
        )}
      </div>
    </div>
  );
}
