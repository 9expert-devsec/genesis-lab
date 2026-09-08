import Image from 'next/image';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

import { cn, formatBaht, courseHref } from '@/lib/utils';
/**
 * `backgroundClass` and `ratioClass` are REUSED rather than re-spelt. Both are
 * single-source maps this module already owns for the two_column type, and
 * writing `bg-[var(--pb-bg-soft-gray)]` or `lg:grid-cols-[3fr_7fr]` by hand here
 * would be a second copy of a value that is allowed to change in one place.
 */
import {
  cardSurfaceClass,
  accentButtonClass,
  backgroundClass,
  ratioClass,
} from '@/lib/pageBuilder/presets';
import { discountPercent } from '@/lib/pageBuilder/bundlePricing';
// The ONE definition of "is this bundle taking registrations". Imported rather
// than spelled here, because the bundle quotation form has to answer the same
// question and a page that shows the closed message while the form still
// accepts a submission is a closed bundle registerable through a stale link.
import { BUNDLE_CLOSED_MESSAGE, isBundleRegistrationOpen } from '@/lib/pageBuilder/bundleRegistration';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { resolveDerivedRoundBadge } from '@/lib/scheduleStatus';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';
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
function BundleItemCard({ entry, item, todayKey, currentYear }) {
  const course = entry?.course ?? null;
  const code = String(entry?.courseId ?? item?.courseId ?? '').trim();
  const round = chooseItemRound(entry?.rounds, item, todayKey);

  /**
   * `isLive` SURVIVED the per-course button's removal, and `round.live` did
   * not — the two used to go together and only one of them was about the link.
   *
   * `registerHref` was the sole reader of `round.live` in this file, so
   * `scheduleRegistrationHref` and its import went with the button. `isLive`
   * stays because the DERIVED BADGE below is keyed on it: a round that is
   * `elapsed` or `missing` still has to say so.
   *
   * `chooseItemRound` still RETURNS `live` and that is not now a field with no
   * reader — four other call sites take it (the bundle route's `emailCourses`,
   * `bundleLegs`' round fields, the bundle page's summary, and
   * `course_schedule`). What went is this card's use of it, not the field.
   */
  const isLive = round?.state === 'live';
  // A derived state has no upstream status to resolve and must not be handed
  // one — resolveDerivedRoundBadge is for exactly this call site.
  const derived = round && !isLive ? resolveDerivedRoundBadge(round.state) : null;

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
      className="flex flex-col overflow-hidden rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)]"
    >
      <div className="relative aspect-video w-full bg-9e-ice dark:bg-9e-navy">
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
          <p data-testid="bundle-item-unresolved" className="text-sm font-bold text-amber-700 dark:text-amber-400">
            {code || 'ไม่ได้ระบุคอร์ส'}
            <span className="mt-0.5 block text-xs font-normal">ไม่พบคอร์สนี้แล้ว</span>
          </p>
        )}

        {/*
          ── THE ROUND BOX ────────────────────────────────────────────────
          The label and the date on two lines inside a bordered, pale-warm
          box, where they used to be one muted sentence.

          THE COLOUR IS THE VAR FORM, NOT `bg-9e-orange-900`, AND THAT IS THE
          WHOLE POINT. The Tailwind token compiles to the LIGHT hex (#FFF4E9)
          in both themes — tailwind.config.js says so where the accent scales
          are declared: those hexes are light-mode and the dark adaptation
          lives only in the `--9e-<name>-<step>` vars. Taking the token here
          would paint a cream slab on a dark page, which is exactly the defect
          presets.js records shipping once. `courseStatusBadge` already builds
          a soft tinted box this way (`border-[var(--9e-green-800)]
          bg-[var(--9e-green-900)]`); this is that construction in orange.

          `formatRoundDays` is UNCHANGED and no second formatter was added —
          the date string is the same one this card already rendered; only the
          box around it is new.
        */}
        {dateLabel && dateLabel !== '-' && (
          <div
            data-testid="bundle-round-box"
            className="rounded-9e-md border border-[var(--9e-orange-800)] bg-[var(--9e-orange-900)] px-3 py-2"
          >
            <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
              รอบอบรม
            </span>
            <span
              data-testid="bundle-item-dates"
              className="block text-xs font-bold text-[var(--text-primary)]"
            >
              {dateLabel}
            </span>
          </div>
        )}
        {derived && (
          <span
            data-testid="bundle-item-round-state"
            className={cn('self-start rounded-full px-2 py-0.5 text-[11px] font-bold', derived.soft)}
          >
            {derived.action}
          </span>
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
            <Link
              href={detailHref}
              data-testid="bundle-item-detail"
              className="inline-flex w-full items-center justify-center rounded-9e-md border border-[var(--surface-border)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-9e-action/40 hover:text-9e-action"
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

  return (
    <div
      data-pb-bundle=""
      className={cn(
        'grid grid-cols-1 gap-6 rounded-9e-lg p-6',
        // A THIRD AND THE REST, and it stacks below `lg` — which is the mobile
        // order the round asked for, for free: one column, LEFT BLOCK FIRST, so
        // a customer on a phone meets the price and the button before the course
        // list, exactly as the desktop reading order does.
        ratioClass('30-70'),
        backgroundClass('soft_gray'),
        cardSurfaceClass('promotion_bundle', style),
      )}
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
      {label && (
        <span
          data-testid="bundle-label"
          className="w-fit rounded-9e-sm bg-9e-navy px-2.5 py-1 text-xs font-bold text-9e-lime"
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
      {open
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
              {code && (
                <code
                  data-testid="bundle-code"
                  className="rounded-9e-sm border border-[var(--surface-border)] px-3 py-2 font-en text-sm font-bold tracking-wider text-[var(--pb-accent-text)]"
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
            {BUNDLE_CLOSED_MESSAGE}
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
                    />
                  ))}
                </ul>
          </>
        )}
      </div>
    </div>
  );
}
