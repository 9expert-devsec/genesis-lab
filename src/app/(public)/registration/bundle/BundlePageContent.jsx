import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublishedPageBuilderPageById } from "@/lib/actions/pageBuilder";
import { resolveSectionData } from "@/lib/pageBuilder/resolveSectionData";
import {
  resolveBundleRequest,
  isSilentRefusal,
} from "@/lib/registration/bundleRequest";
import {
  BUNDLE_CLOSED_MESSAGE,
  BUNDLE_UNAVAILABLE_MESSAGE,
} from "@/lib/pageBuilder/bundleRegistration";
import { chooseItemRound } from "@/lib/pageBuilder/chosenRounds";
import { formatRoundDays } from "@/lib/schedule/roundDateLabel";
import { siteCurrentYear, siteTodayKey } from "@/lib/articlePublishTime";
import { BundleWizard } from "@/components/registration/BundleWizard";
import { publicPageHref } from "@/lib/pages/promotionMode";
// The summary block. `trainingTypeLabel`, `formatPrice` and `discountPercent`
// moved WITH it and are no longer imported here — this route now derives the
// lines and hands them over, and does no formatting of its own beyond the date
// label it must produce from a threaded clock read.
import { BundleSummary } from "@/components/registration/BundleSummary";

/**
 * Base path for the bundle quotation wizard. The wizard pushes step-prefixed
 * URLs under this path (step-1 / step-2 / step-3), each of which renders this
 * file with the matching `step`.
 */
export const BUNDLE_BASE_PATH = "/registration/bundle";

/**
 * THE BUNDLE QUOTATION WIZARD, server half.
 *
 * URL: /registration/bundle/step-N?page=<pageId>&section=<sectionId>
 *      (the bare /registration/bundle?… redirects to step-1, preserving both)
 *
 * ══ THE RESOLVE RUNS ON EVERY STEP, AND THAT IS THE POINT ══════════════════
 *
 * Three steps, three routes, so a completed flow resolves the bundle three
 * times rather than once. Accepted deliberately. The pair in the URL is a
 * lookup key and nothing else — see below — so each step re-derives the package
 * from the stored page instead of trusting anything the client carried across.
 * A round that rolls off, or an author who closes the bundle, between step 1
 * and step 3 SHOULD change what the customer is shown; a flow that resolved
 * once and remembered could not notice.
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
export async function BundlePageContent({ searchParams, step }) {
  const params = (await searchParams) ?? {};
  const pageId = typeof params.page === "string" ? params.page : "";
  const sectionId = typeof params.section === "string" ? params.section : "";

  const doc = await getPublishedPageBuilderPageById(pageId);

  // The cheap pass: existence, visibility, the switch. No upstream call yet, so
  // a closed or unpublished bundle costs nothing to refuse.
  const cheap = resolveBundleRequest({ page: doc, sectionId });
  if (!cheap.ok) return renderRefusal(cheap.reason);

  const resolvedMap = await resolveSectionData([cheap.section]);
  const resolved = resolvedMap?.[cheap.section.id];
  const todayKey = siteTodayKey();
  const currentYear = siteCurrentYear();

  const gate = resolveBundleRequest({
    page: doc,
    sectionId,
    resolved,
    todayKey,
  });
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
      courseName: String(entry?.course?.course_name ?? "").trim(),
      courseId: String(entry?.courseId ?? item?.courseId ?? "").trim(),
      dates: formatRoundDays(round.dates, {
        showMonth: true,
        showYear: "auto",
        currentYear,
      }),
      type: round.live?.type ?? "classroom",
    };
  });

  // `== null` catches both null and an absent key, and — deliberately — NOT 0,
  // matching the section renderer: a free bundle is expressible, an unset price
  // is not a zero. The DERIVED numbers (percentage, amount) are BundleSummary's
  // to compute from these two, so that the block and the panel inside it cannot
  // be handed a percentage that disagrees with the prices beside it.
  const listPrice =
    typeof content.listPrice === "number" ? content.listPrice : null;
  const netPrice =
    typeof content.netPrice === "number" ? content.netPrice : null;

  /**
   * WHERE "กลับไปดูโปรโมชัน" GOES — or null, meaning render no link at all.
   *
   * ── NO NEW READ. NOT ONE. ─────────────────────────────────────────────────
   * `doc` is the page document this route already fetched to resolve the bundle
   * at all, and `getPublishedPageBuilderPageById` selects everything but
   * `draft` — so `slug`, `pageType`, `publishStartDate` and `publishEndDate` are
   * all already in hand. The link costs zero additional round trips, which
   * matters on a page whose resolve cost is already three times what it was.
   *
   * ── AND IT CANNOT GO STALE, BECAUSE IT IS THE SAME DOCUMENT ───────────────
   * The slug is read from the very document that had to resolve for this page
   * to render, in this request. A slug edited last week is simply the slug we
   * just read; there is no cached copy to disagree with. Deleted or unpublished
   * is unreachable from here for the same reason: the read filters
   * `status: 'published'`, so a missing or unpublished page has already been
   * refused above and there is no form to put a footer under.
   *
   * ── THE ONE GAP THAT IS REAL, AND WHY publicPageHref CLOSES IT ────────────
   * `status: 'published'` is NOT the destination's gate. Both public routes run
   * `isPubliclyVisible`, which also enforces the publish WINDOW — so a page
   * that is published but past its `publishEndDate` (or before its
   * `publishStartDate`) renders this quotation form perfectly while its own
   * detail page 404s. An EXPIRED PROMOTION is the single likeliest page for a
   * bundle to sit on, so this is not a hypothetical. `publicPageHref` applies
   * the destination's own predicate and answers null, and the footer then draws
   * no link rather than a link that spends the customer's click before failing.
   *
   * (That the bundle form still takes requests for an expired promotion page is
   * its own question, and a bigger one than a footer link. It is NOT decided
   * here — this code only declines to link somewhere that would 404.)
   */
  const backHref = publicPageHref(doc);

  return (
    /*
      max-w-[1200px], up from 880: the summary is a side card now and the shell
      is the masterclass registration's, whose own container is 1200. At 880 a
      330px card would leave the form ~518px wide.
    */
    <article className="mx-auto max-w-[1200px] px-4 py-10 lg:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          สมัครอบรม Bundle
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)] lg:text-3xl">
          {content.name || "แพ็กเกจอบรม"}
        </h1>
        {content.blurb ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {content.blurb}
          </p>
        ) : null}
      </header>

      {/*
        WHAT THEY ARE REQUESTING, before anything is asked of them. A quotation
        request for a package the customer cannot see the contents of is a
        request they cannot check, and the courses and rounds are the whole
        substance of what the price buys.

        PASSED INTO the client wizard rather than rendered beside it, so the
        wizard can place it per step — above the form on step 1, above the
        review on step 2, and not at all on step 3, where the request is already
        sent. It stays a SERVER component this way: its `lines` were formatted by
        `formatRoundDays` from the single threaded clock read above, and handing
        the client the raw rounds to format would be exactly the second clock
        read that module refuses to make.
      */}
      <BundleWizard
        pageId={String(doc._id)}
        sectionId={gate.section.id}
        bundleName={content.name || ""}
        courseCount={lines.length}
        step={step}
        basePath={BUNDLE_BASE_PATH}
        summary={
          <BundleSummary
            lines={lines}
            listPrice={listPrice}
            netPrice={netPrice}
          />
        }
        backHref={backHref}
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

  const closed = reason === "closed";
  return (
    <article className="mx-auto max-w-[680px] px-4 py-16 lg:px-6">
      <div
        data-testid={
          closed ? "bundle-refused-closed" : "bundle-refused-unavailable"
        }
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
            ? "ขณะนี้แพ็กเกจนี้ปิดรับลงทะเบียนอยู่ — สอบถามรอบถัดไปหรือเงื่อนไขล่าสุดได้จากทีมขาย"
            : "หากคุณเข้ามาจากลิงก์ที่บันทึกไว้ ลิงก์นั้นอาจไม่ตรงกับแพ็กเกจที่เปิดรับอยู่ในขณะนี้"}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm font-semibold">
          <Link
            href="/promotions"
            className="text-9e-action underline underline-offset-2"
          >
            ดูโปรโมชันทั้งหมด
          </Link>
          <Link
            href="/contact-us"
            className="text-9e-action underline underline-offset-2"
          >
            ติดต่อทีมขาย
          </Link>
        </div>
      </div>
    </article>
  );
}
