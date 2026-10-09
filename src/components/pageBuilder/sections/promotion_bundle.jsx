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
// rule in this repo. THE ROUNDS, TWO AT A TIME. The chip itself is still
// `components/ScheduleCard` — the same one the course card draws — but it is
// now mounted by the carousel rather than by this file, so the import moved
// there with it. This card used to stack its own cream boxes, which was a
// second round visual competing with the one the site already had; then it
// stacked the shared chip, which was the same height problem in the right
// colours.
import { BundleRoundCarousel } from './BundleRoundCarousel';
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
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. ONE spelling of the wizard link, shared with the wizard
// and the registration route, including its preview flag.
import { bundleRegisterHref as buildBundleRegisterHref } from '@/lib/registration/bundlePreview';

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
/**
 * ── THE SHARED CHIP WIDTH IS GONE, WITH THE STACK IT EXISTED FOR ─────────
 * `bundleChipWidthStyle`, `CHIP_PER_CHAR_REM` and `CHIP_CHROME_REM` stood
 * here. They computed one width for every round chip in a bundle, from the
 * LONGEST label across all of its tiles, because the chips live in separate
 * containers (one row per tile) and no amount of CSS can equalise siblings
 * that share no grid — `subgrid` does not reach across them. The factor was
 * measured against ten real Thai labels (0.36rem per character, an upper
 * bound) rather than `ch`, which is the width of "0" and about 40% too wide
 * for a string that is mostly Thai glyphs and dots.
 *
 * ALL OF IT IS DELETED, AND THE PREMISE IS WHAT MOVED. A fixed track as wide
 * as the longest date fits ONE column in a ~200-230px tile, so a five-round
 * course stacked five chips one per row and grew to three times the height of
 * its neighbours. The rounds are a CAROUSEL now — two boxes, each half the
 * track minus half the gap — so the equal width is a consequence of the
 * layout rather than an estimate handed down from the section, and there is
 * nothing left to guess about how wide a Thai date renders in a fallback
 * font. See BundleRoundCarousel.
 *
 * DO NOT BRING IT BACK to make a chip wider. The two boxes are equal to each
 * other and equal across every tile already; a width in rem would only break
 * that on the first tile narrower than the number.
 */

/**
 * THE OFFERED ROUNDS OF ONE ITEM, as rows a chip can be drawn from.
 *
 * ONE CALLER NOW, AND IT STAYS AT MODULE SCOPE. The SECTION used to call it
 * too — it had to know the longest label across every tile before any tile
 * rendered, to compute the shared chip width — and that width is gone with
 * the carousel that replaced the stack. It is left here rather than folded
 * into `BundleItemCard` because it is the join between three sources (the
 * resolved rounds, the stored item and `roundChoices`) and reads better named
 * than inline; nothing about it depends on the card.
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
          ── EVERY OFFERED ROUND, TWO AT A TIME ───────────────────────────
          The card used to draw ONE round box. An item offers several now and
          the applicant picks one, so all of them are listed — the visitor has
          to be able to see whether any date suits them before starting a
          quotation.

          AND THEY STOPPED FITTING. The chips sat in a track as wide as the
          longest date label in the whole bundle, which is ONE column on a
          ~200-230px tile — so a five-round course stacked `12-13 พ.ย. 69`,
          `8-9 ธ.ค. 69`, `27-28 ม.ค. 70`, `24-25 ก.พ. 70` and `18-19 มี.ค. 70`
          one per row and grew to roughly three times the height of its
          neighbours. The row of tiles then read as though the course with the
          most choice were the most important thing on the card.

          `BundleRoundCarousel` shows two and scrolls. It is the ONE client
          island on this otherwise wholly server-rendered card, and that is
          deliberate rather than incidental: arrows that disable at the ends,
          a `กำลังแสดงรอบ a–b จาก N` line that follows the track, and the two
          of them agreeing with a finger swipe all need state. See its header.

          NON-PICKABLE ROUNDS STAY VISIBLE. Removing them would make the card
          shorter the moment a round filled, which is the same
          silently-shrinking failure `chooseRounds` already refuses for a
          rolled-off round: a visitor who can see a date is spoken for knows
          to pick another, one whose option vanished does not know it ever
          existed. Scrolling is not hiding — the count in the heading says how
          many there are.

          WHAT THEY DO NOT SAY is unchanged and the reasoning for it has moved
          with the chip into the carousel: no status word, no dot, no pick
          deadline, and the Thai reason carried as `sr-only` because greying is
          a colour. `formatRoundDays` is still the only date formatter and the
          label is the same string this card already rendered.
        */}
        {!!offeredRows.length && <BundleRoundCarousel rows={offeredRows} />}
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

export function PromotionBundleSection({ content, data, style, pageId = null, sectionId = '', preview = false }) {
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
  /*
    BUILT BY THE SHARED HELPER, not spelled here. The wizard, the route and
    this card all have to agree about the shape of this link — including
    the preview flag, which decides WHICH document the other two read — and
    a second spelling is how one of them ends up carrying a parameter the
    others do not honour. `preview` is a routing hint only: the wizard
    re-verifies the page's preview cookie before it reads a draft.
  */
  const bundleRegisterHref = buildBundleRegisterHref({ pageId, sectionId, preview });

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
