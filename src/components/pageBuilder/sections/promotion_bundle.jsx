import Image from 'next/image';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

import { cn, formatPrice, courseHref } from '@/lib/utils';
import { cardSurfaceClass, accentButtonClass } from '@/lib/pageBuilder/presets';
import { discountPercent } from '@/lib/pageBuilder/bundlePricing';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { scheduleRegistrationHref } from '@/lib/schedule/scheduleRegistrationHref';
import { resolveDerivedRoundBadge } from '@/lib/scheduleStatus';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';
import { siteCurrentYear, siteTodayKey } from '@/lib/articlePublishTime';
import { CopyCodeButton } from '../CopyCodeButton';

/**
 * promotion_bundle — ONE bundle promotion: a name, a blurb, ราคาปกติ and
 * ราคาสุทธิ, a discount code, an open/closed switch, and (from the next commit)
 * an ordered list of course+round item cards.
 *
 * A page carries SEVERAL of these, one per bundle, because a bundle is a
 * section rather than a row in a table. One page still produces ONE card on
 * /promotions — nothing here touches the grid, the loader or `promotionOrder`.
 *
 * Server component. The one client module it reaches for is `CopyCodeButton`,
 * which states its own case for existing (an interaction and a permission-gated
 * browser API that no string field can express); the CODE itself is rendered
 * here, as selectable text, so the button is an accelerator and never the only
 * path to the value.
 *
 * ── FAILS CLOSED ONLY ON NOTHING-AT-ALL ───────────────────────────────────
 * Mirrored by `sectionRendersEmpty`'s `promotion_bundle` case, which is a
 * second reader of the guard below and says so. A bundle with a price but no
 * items yet RENDERS — a just-added section that drew nothing would read as a
 * broken canvas, and the panel is this type's own content rather than a frame
 * around its items.
 *
 * ── WHY `formatPrice` AND NOT `coursePriceLabel` ──────────────────────────
 * `coursePriceLabel` is "THE price label for a COURSE" and carries a semantic
 * this type does not have: it answers 0 / null / non-numeric with
 * `Inhouse Only`, which is a real fact about a course with no public seat price
 * and a lie about a bundle. A 0-baht bundle is not an in-house engagement.
 *
 * `formatPrice` (lib/utils) is the general money formatter — `Intl` th-TH
 * currency, no fraction digits — and is already what the shared `CourseCard`
 * uses, so a bundle's price and a course's price are formatted by one function.
 * An unset price is `null` and is never passed to it: the element is not
 * rendered at all. That is what keeps `null` (unset) and `0` (free) apart all
 * the way to the screen.
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
 */
const CLOSED_MESSAGE = 'โปรโมชันนี้ปิดรับสมัครแล้ว';

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
 * ── THE TWO LINKS ARE BUILT BY THE ONE BUILDER EACH ──────────────────────
 * `scheduleRegistrationHref` for ลงทะเบียน (it owns the `&class=` parameter
 * that skips the wizard's round-confirm step, AND the refusal that makes a full
 * round unclickable) and `courseHref` for รายละเอียดหลักสูตร. Neither is
 * re-templated here; round 81 deleted the last local copy of the first one and
 * test/fs/registrationEntryPointClassParam refuses a second.
 *
 * A round that is `elapsed` or `missing` gets NO registration link at all —
 * `/registration/public?class=<id>` for an id upstream does not have renders a
 * blank step 1 — and no status chip, because a status is the seats-left signal
 * and cannot be true about a round nobody can fetch. The snapshot schema strips
 * both, so there is nothing here to draw them from even by mistake.
 */
function BundleItemCard({ entry, item, todayKey, currentYear }) {
  const course = entry?.course ?? null;
  const code = String(entry?.courseId ?? item?.courseId ?? '').trim();
  const round = chooseItemRound(entry?.rounds, item, todayKey);

  const isLive = round?.state === 'live';
  // `isLive &&` guards the builder for the same reason course_schedule does:
  // the derived states have no upstream row to hand it, and the builder is
  // about a round that exists.
  const registerHref = isLive ? scheduleRegistrationHref(round.live, code) : null;
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
      className="flex flex-col overflow-hidden rounded-9e-md border border-[var(--surface-border)]"
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
          <h4 className="line-clamp-2 text-sm font-bold text-[var(--text-primary)]">{title}</h4>
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

        {dateLabel && dateLabel !== '-' && (
          <p data-testid="bundle-item-dates" className="text-xs text-[var(--text-secondary)]">
            รอบอบรม {dateLabel}
          </p>
        )}
        {derived && (
          <span
            data-testid="bundle-item-round-state"
            className={cn('self-start rounded-full px-2 py-0.5 text-[11px] font-bold', derived.soft)}
          >
            {derived.action}
          </span>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {/*
            ── THIS BUTTON IS NOT GOVERNED BY THE BUNDLE'S SWITCH ───────────
            `registrationOpen` closes the BUNDLE's own registration. This one
            points at an ordinary round of an ordinary course, and a promotion
            ending does not close a course's rounds. `BundleItemCard` is not
            passed the switch at all, which is what makes that structural
            rather than a rule someone has to remember.
          */}
          {registerHref && (
            <Link
              href={registerHref}
              data-testid="bundle-item-register"
              className="inline-flex flex-1 items-center justify-center rounded-9e-md bg-9e-action px-3 py-2 text-xs font-bold text-white hover:bg-9e-brand"
            >
              ลงทะเบียน
            </Link>
          )}
          {detailHref && (
            <Link
              href={detailHref}
              data-testid="bundle-item-detail"
              className="inline-flex flex-1 items-center justify-center rounded-9e-md border border-[var(--surface-border)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-9e-action/40 hover:text-9e-action"
            >
              รายละเอียดหลักสูตร
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export function PromotionBundleSection({ content, data, style }) {
  const name = typeof content?.name === 'string' ? content.name.trim() : '';
  const blurb = typeof content?.blurb === 'string' ? content.blurb.trim() : '';
  const code = typeof content?.discountCode === 'string' ? content.discountCode.trim() : '';

  // `== null` catches both null and an absent key, and — deliberately — NOT 0.
  // A free bundle is expressible; an unset price is not a zero.
  const listPrice = typeof content?.listPrice === 'number' ? content.listPrice : null;
  const netPrice = typeof content?.netPrice === 'number' ? content.netPrice : null;
  const discount = discountPercent(listPrice, netPrice);

  const items = Array.isArray(content?.items) ? content.items : [];

  // ABSENT MEANS OPEN. `!== false`, never truthiness: this field can only ever
  // REMOVE the button, so anything other than a literal `false` an author wrote
  // has to leave the bundle open. (A `.lean()` read applies no Mongoose
  // defaults and JSON drops `undefined`, so a key can arrive absent.)
  const open = content?.registrationOpen !== false;

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
      className={cn('flex flex-col gap-4 rounded-9e-lg p-6', cardSurfaceClass('promotion_bundle', style))}
    >
      {name && <h3 className="font-heading text-xl font-bold text-[var(--text-primary)]">{name}</h3>}
      {blurb && <p className="text-sm text-[var(--text-secondary)]">{blurb}</p>}

      {items.length > 0 && (
        <ul
          data-testid="bundle-items"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((it, i) => (
            /**
             * Keyed by the ITEM'S OWN id, never by index and never by course
             * code: the same course can appear twice in one bundle, so a code
             * key would collide, and an index key would carry a card's identity
             * to its neighbour when the author reorders. The id is required by
             * the schema for exactly this. `|| i` is the last resort for a
             * document written before the id existed — there are none today,
             * and a React key warning is a better failure than a crash.
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
      )}

      {(listPrice != null || netPrice != null) && (
        <p data-testid="bundle-prices" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {netPrice != null && (
            <span
              data-testid="bundle-net-price"
              className="font-heading text-3xl font-bold text-[var(--pb-accent-text)]"
            >
              {formatPrice(netPrice)}
            </span>
          )}
          {listPrice != null && (
            <span
              data-testid="bundle-list-price"
              className="text-sm text-9e-slate-dp-50 line-through dark:text-[#94a3b8]"
            >
              {formatPrice(listPrice)}
            </span>
          )}
          {/*
            ── DERIVED, NEVER STORED ────────────────────────────────────────
            The two prices are what must match a real quotation; this is
            display. `discountPercent` answers null for every pair that cannot
            honestly produce a number — either price unset, a zero list price,
            or a net price ABOVE the list — so there is no path here that draws
            `ลด -8%`.

            `> 0` on top of that, because 0 IS an honest answer (a bundle sold
            at its list price) and "ลด 0%" is a chip that advertises nothing.
          */}
          {discount != null && discount > 0 && (
            <span
              data-testid="bundle-discount"
              className="rounded-9e-sm bg-[color:var(--pb-accent-fill)]/10 px-1.5 py-0.5 text-xs font-bold text-[var(--pb-accent-text)]"
            >
              ลด {discount}%
            </span>
          )}
        </p>
      )}

      {/*
        ── THE BUNDLE-LEVEL AFFORDANCE, AND THE ONE THING IT MUST NOT REACH ──
        This block is the whole of what `registrationOpen` controls. The
        per-course ลงทะเบียน buttons live in the ITEM CARDS below and point at
        ordinary rounds through `scheduleRegistrationHref`, which has its own
        `full` refusal — a promotion ending does not close a course's rounds, so
        closing a bundle must leave those alone.

        The two sit in one component, so nothing structural keeps them apart.
        This comment is the statement and test/render/promotionBundle is the
        enforcement; if the switch is ever widened, that test says so.
      */}
      {open
        ? code && (
            <div data-testid="bundle-offer" className="flex flex-wrap items-center gap-3">
              {/*
                The code as TEXT, always, and before the button. It is the value;
                the button is only a faster way to take it. A visitor with no
                JavaScript, or a blocked clipboard, can still read and select it.
              */}
              <code
                data-testid="bundle-code"
                className="rounded-9e-sm border border-[var(--surface-border)] px-3 py-2 font-en text-sm font-bold tracking-wider text-[var(--pb-accent-text)]"
              >
                {code}
              </code>
              <CopyCodeButton code={code} className={accentButtonClass('promotion_bundle', style)} />
            </div>
          )
        : (
          <p
            data-testid="bundle-closed"
            className="rounded-9e-md border border-[var(--surface-border)] px-4 py-3 text-sm font-bold text-9e-slate-dp-50 dark:text-[#94a3b8]"
          >
            {CLOSED_MESSAGE}
          </p>
        )}
    </div>
  );
}
