import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getPublishedPageBuilderPageById } from '@/lib/actions/pageBuilder';
import { resolveSectionData } from '@/lib/pageBuilder/resolveSectionData';
import { resolveBundleRequest, isSilentRefusal } from '@/lib/registration/bundleRequest';
import {
  BUNDLE_CLOSED_MESSAGE,
  BUNDLE_UNAVAILABLE_MESSAGE,
} from '@/lib/pageBuilder/bundleRegistration';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';
import { discountPercent } from '@/lib/pageBuilder/bundlePricing';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
// THE shared label, not a local map. Its own header records that a survey found
// ELEVEN separate classroom/hybrid/online literals across this repo, none of
// them agreeing on wording — writing a twelfth here is the exact thing that
// module was created to stop, and the public registration summary strip (which
// a customer may see minutes earlier) already reads it.
import { trainingTypeLabel } from '@/lib/schedule/trainingTypeLabel';
import { siteCurrentYear, siteTodayKey } from '@/lib/articlePublishTime';
import { formatPrice } from '@/lib/utils';
import { BundleRegisterForm } from '@/components/registration/BundleRegisterForm';

export const metadata = { title: 'ขอใบเสนอราคาแพ็กเกจ - 9Expert Training' };

/**
 * THE BUNDLE QUOTATION FORM.
 *
 * URL: /registration/bundle?page=<pageId>&section=<sectionId>
 *
 * ══ THE PAIR IS A LOOKUP KEY AND NOTHING ELSE ══════════════════════════════
 *
 * It arrives in a link — a bookmark, a forwarded message, a hand-edited query
 * string — so everything shown below is re-derived from the stored page:
 * the name, the courses, the rounds, the prices, and whether the bundle is
 * taking registrations at all. `resolveBundleRequest` is the whole refusal and
 * this route only chooses how to render its answer.
 *
 * ══ THE RESOLVE PATH IS THE SECTION'S OWN, NOT A SECOND ONE ════════════════
 *
 * `resolveSectionData` → `assembleResolved` → `chooseItemRound`, exactly what
 * `PromotionBundleSection` renders from. So the card a customer clicked and the
 * summary they land on are drawn from the same fetch, the same course map, the
 * same round selection and the same live / elapsed / missing split. A second
 * path here would be the one place the form could name a different package
 * from the page.
 *
 * `todayKey` and `currentYear` are read ONCE and threaded, for the reason the
 * section states: two reads either side of midnight can disagree, and
 * `formatRoundDays` refuses to read the clock at all.
 *
 * ══ TWO SPOKEN REFUSALS, ONE SILENT ════════════════════════════════════════
 *
 * `notFound()` for a pair that names nothing — there is no true sentence to say
 * about a section id nobody ever authored. A SPOKEN panel otherwise, because
 * the customer clicked a real button on a real page and deserves to know the
 * package is unavailable rather than that the page does not exist. The two
 * sentences come from `bundleRegistration.js`, beside the predicate: CLOSED
 * means an author has turned registration off, UNAVAILABLE means we cannot
 * assemble the package right now. Both point at the sales team, and NEITHER
 * claims the promotion is over — see the note on the closed sub-line below,
 * which is what that wording used to get wrong.
 */
export default async function Page({ searchParams }) {
  const params = (await searchParams) ?? {};
  const pageId = typeof params.page === 'string' ? params.page : '';
  const sectionId = typeof params.section === 'string' ? params.section : '';

  const doc = await getPublishedPageBuilderPageById(pageId);

  // The cheap pass: existence, visibility, the switch. No upstream call yet, so
  // a closed or unpublished bundle costs nothing to refuse.
  const cheap = resolveBundleRequest({ page: doc, sectionId });
  if (!cheap.ok) return renderRefusal(cheap.reason);

  const resolvedMap = await resolveSectionData([cheap.section]);
  const resolved = resolvedMap?.[cheap.section.id];
  const todayKey = siteTodayKey();
  const currentYear = siteCurrentYear();

  const gate = resolveBundleRequest({ page: doc, sectionId, resolved, todayKey });
  if (!gate.ok) return renderRefusal(gate.reason);

  const content = gate.content;
  const items = Array.isArray(content.items) ? content.items : [];
  const entries = Array.isArray(resolved) ? resolved : [];

  /**
   * The lines the customer is asked to confirm. Every one of them resolved —
   * `resolveBundleRequest` has already refused the whole request if any item's
   * course or round could not be named, so there is no marked or partial row to
   * render here and no branch that could draw one.
   */
  const lines = items.map((item, i) => {
    const entry = entries[i] ?? null;
    const round = chooseItemRound(entry?.rounds, item, todayKey);
    return {
      key: item?.id || `item-${i}`,
      courseName: String(entry?.course?.course_name ?? '').trim(),
      courseId: String(entry?.courseId ?? item?.courseId ?? '').trim(),
      dates: formatRoundDays(round.dates, { showMonth: true, showYear: 'auto', currentYear }),
      type: round.live?.type ?? 'classroom',
    };
  });

  const listPrice = typeof content.listPrice === 'number' ? content.listPrice : null;
  const netPrice = typeof content.netPrice === 'number' ? content.netPrice : null;
  const discount = discountPercent(listPrice, netPrice);

  return (
    <article className="mx-auto max-w-[880px] px-4 py-10 lg:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          ขอใบเสนอราคาแพ็กเกจ
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)] lg:text-3xl">
          {content.name || 'แพ็กเกจอบรม'}
        </h1>
        {content.blurb ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{content.blurb}</p>
        ) : null}
      </header>

      {/*
        WHAT THEY ARE REQUESTING, before anything is asked of them. A quotation
        request for a package the customer cannot see the contents of is a
        request they cannot check, and the courses and rounds are the whole
        substance of what the price buys.
      */}
      <section
        data-testid="bundle-summary"
        className="mb-8 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6"
      >
        <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">
          หลักสูตรในแพ็กเกจ ({lines.length} หลักสูตร)
        </h2>
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li
              key={line.key}
              data-testid="bundle-summary-item"
              className="flex flex-col gap-0.5 border-b border-[var(--surface-border)] pb-3 last:border-b-0 last:pb-0"
            >
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {line.courseName || line.courseId}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                รอบอบรม {line.dates} · {trainingTypeLabel(line.type)}
              </span>
            </li>
          ))}
        </ul>

        {(listPrice != null || netPrice != null) && (
          <p data-testid="bundle-summary-price" className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
            {/*
              `> 0` on top of the null check, matching the section's own chip:
              0 is an honest answer (a bundle sold at list price) and "ลด 0%"
              advertises nothing.
            */}
            {discount != null && discount > 0 && (
              <span className="rounded-9e-sm bg-9e-brand/10 px-1.5 py-0.5 text-xs font-bold text-9e-brand">
                ลด {discount}%
              </span>
            )}
          </p>
        )}

        {/*
          A QUOTATION REQUEST, SAID OUT LOUD. The price above is what the
          package costs, and nothing on this page takes payment — a customer who
          expects a checkout and gets an email two days later has been misled by
          a screen that showed them a total.
        */}
        <p className="mt-4 text-xs text-[var(--text-secondary)]">
          นี่คือการขอใบเสนอราคา ยังไม่มีการชำระเงินในขั้นตอนนี้ — ทีมขายจะติดต่อกลับพร้อมใบเสนอราคา
        </p>
      </section>

      <BundleRegisterForm
        pageId={String(doc._id)}
        sectionId={gate.section.id}
        bundleName={content.name || ''}
        courseCount={lines.length}
      />
    </article>
  );
}

/**
 * The refusal, rendered.
 *
 * `isSilentRefusal` decides which of the two shapes applies — the mapping is a
 * property of the REASON and lives with the reasons, so this route cannot
 * accidentally render "ปิดรับสมัครแล้ว" for a section id that never existed.
 */
function renderRefusal(reason) {
  if (isSilentRefusal(reason)) notFound();

  const closed = reason === 'closed';
  return (
    <article className="mx-auto max-w-[680px] px-4 py-16 lg:px-6">
      <div
        data-testid={closed ? 'bundle-refused-closed' : 'bundle-refused-unavailable'}
        data-reason={reason}
        className="rounded-9e-lg border border-dashed border-[var(--surface-border)] px-6 py-12 text-center"
      >
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {closed ? BUNDLE_CLOSED_MESSAGE : BUNDLE_UNAVAILABLE_MESSAGE}
        </h1>
        {/*
          ── THE CLOSED LINE CLAIMS ONLY WHAT THE SWITCH ACTUALLY MEANS ──────
          It used to read 'โปรโมชันนี้สิ้นสุดแล้ว' — "this promotion has ended".
          The switch does not mean that. `registrationOpen: false` means an
          author turned registration off, and the reasons are ordinary: the
          rounds may be full, the offer may be paused, the terms may be under
          revision, or the page may be mid-edit. Telling a visitor the promotion
          is over sends them away from something that may be selling again on
          Monday, and it is a claim this page has no way to check.

          So it states the observable — registration is closed at the moment —
          and points at the people who DO know. No "ชั่วคราว" and no "ยังไม่
          เปิด" either: both predict a reopening we cannot promise.

          Still clearly distinct from the unavailable line below it, which is
          about a STALE LINK rather than a decision.
        */}
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {closed
            ? 'ขณะนี้แพ็กเกจนี้ปิดรับลงทะเบียนอยู่ — สอบถามรอบถัดไปหรือเงื่อนไขล่าสุดได้จากทีมขาย'
            : 'หากคุณเข้ามาจากลิงก์ที่บันทึกไว้ ลิงก์นั้นอาจไม่ตรงกับแพ็กเกจที่เปิดรับอยู่ในขณะนี้'}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm font-semibold">
          <Link href="/promotions" className="text-9e-action underline underline-offset-2">
            ดูโปรโมชันทั้งหมด
          </Link>
          <Link href="/contact-us" className="text-9e-action underline underline-offset-2">
            ติดต่อทีมขาย
          </Link>
        </div>
      </div>
    </article>
  );
}
