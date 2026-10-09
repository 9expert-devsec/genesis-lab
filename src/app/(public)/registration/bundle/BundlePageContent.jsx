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
  BUNDLE_EXPIRED_MESSAGE,
} from "@/lib/pageBuilder/bundleRegistration";
/*
  `chooseItemRound` — the SINGULAR one — is no longer imported. It picked the
  default round this route used to hand the summary, which is the defect the
  pick step removes; an import with no reader is the thing this project keeps
  out. The function itself stays: `assembleResolved` still runs it, and four
  other call sites read it.
*/
import { chooseItemRounds } from "@/lib/pageBuilder/chosenRounds";
import { formatRoundDays } from "@/lib/schedule/roundDateLabel";
import { siteCurrentYear, siteTodayKey } from "@/lib/articlePublishTime";
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The one assembler of live round status for a bundle,
// shared with the registration route; it applies the admin override layer the
// bundle path was missing entirely.
import { bundleLiveStatusById } from "@/lib/registration/bundleLiveRounds";
import { BundleWizard } from "@/components/registration/BundleWizard";
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The SAME sub-line component the promotion card draws, so
// the page a customer lands on cannot word the package differently from the
// card they clicked.
import { BundleBlurb } from "@/components/pageBuilder/sections/BundleBlurb";
import { publicPageHref } from "@/lib/pages/promotionMode";
/*
  `BundleSummary` IS NO LONGER IMPORTED HERE. The block moved one level down,
  into BundleWizard, because its round lines now follow the applicant's picks
  and those are client state. This route still derives the LINES — including
  every round label, from the one threaded clock read — and hands them over as
  data; what it no longer does is instantiate the component.
*/
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. PREVIEW MODE: the flag the card forwards, and the words
// shown when it is honoured or refused.
import {
  wantsBundlePreview,
  BUNDLE_PREVIEW_BANNER,
  BUNDLE_PREVIEW_FORBIDDEN,
  BUNDLE_PREVIEW_FORBIDDEN_BODY,
} from "@/lib/registration/bundlePreview";
// ADDED beside the statement above rather than folded into it — the gate is
// the server-only half (cookies + an unfiltered page load) and is a separate
// module from the pure helpers above.
import { resolveBundlePreviewPage } from "@/lib/registration/bundlePreviewGate";

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

  /**
   * ── PREVIEW MODE, DECIDED ONCE ────────────────────────────────────────
   * The flag only says WHICH document is meant. `resolveBundlePreviewPage`
   * is the authorisation: it re-checks this page's preview settings and
   * verifies the slug-scoped cookie, and a failure is a 403 rather than a
   * fall-through — continuing on the published document would put an
   * unauthorised caller into the REAL wizard, whose submit really writes.
   *
   * The route makes the same call for the same reason, which is why the gate
   * is a shared module: the cheaper of the two mistakes to make here would
   * be the route accepting a cookie this page rejected.
   */
  const preview = wantsBundlePreview(params);

  let doc;
  if (preview) {
    const gatePreview = await resolveBundlePreviewPage(pageId);
    if (!gatePreview.ok) return renderPreviewForbidden();
    doc = gatePreview.page;
  } else {
    // `getPublishedPageBuilderPageById` selects `-draft`, so a request that
    // did not ask for preview cannot read draft content even by accident.
    doc = await getPublishedPageBuilderPageById(pageId);
  }

  // The cheap pass: existence, visibility, the switch. No upstream call yet, so
  // a closed or unpublished bundle costs nothing to refuse.
  // `allowUnpublished` only ever carries the value the preview GATE produced
  // — see the note at resolveBundleRequest. A failed gate returned above.
  const cheap = resolveBundleRequest({ page: doc, sectionId, allowUnpublished: preview });
  if (!cheap.ok) return renderRefusal(cheap.reason);

  /**
   * ── `revalidate: 0` — THE OTHER HALF OF READING LIVE ───────────────────
   * `export const dynamic = 'force-dynamic'` on the step pages stops NEXT
   * caching the rendered HTML. It does nothing about the schedules FETCH,
   * which carries its own 1800s window inside `listSchedulesByCourse` — so
   * without this the wizard would re-render on every request and keep handing
   * out the same half-hour-old round list.
   *
   * Scoped to the SCHEDULES fetch: courses, instructors and filters keep their
   * normal windows, because their staleness costs a title or a cover rather
   * than a pick the server will refuse.
   */
  const resolvedMap = await resolveSectionData([cheap.section], { revalidate: 0 });
  const resolved = resolvedMap?.[cheap.section.id];
  const todayKey = siteTodayKey();

  /**
   * The LIVE status of every round this bundle offers, admin overrides applied.
   * Shared with the registration route so the wizard cannot offer a round the
   * server will refuse — see bundleLiveRounds.js for why that module exists.
   */
  const liveStatusById = await bundleLiveStatusById(resolved);
  const currentYear = siteCurrentYear();

  const gate = resolveBundleRequest({
    page: doc,
    sectionId,
    resolved,
    todayKey,
    allowUnpublished: preview,
  });
  if (!gate.ok) return renderRefusal(gate.reason);

  const content = gate.content;
  const items = Array.isArray(content.items) ? content.items : [];
  const entries = Array.isArray(resolved) ? resolved : [];

  /**
   * itemId → the course name the pick control labels its row with.
   *
   * Built here rather than in the client component because the NAME is
   * resolver data: the browser is handed the stored items, which carry a
   * course CODE and nothing a customer would recognise. Falls back to the
   * code inside the component when a course does not resolve — which
   * resolveBundleRequest has already refused the whole request for, so it
   * is a belt-and-braces path rather than a reachable one.
   */
  const courseTitleByItemId = {};
  for (const entry of entries) {
    const id = String(entry?.id ?? '').trim();
    const title = entry?.course?.course_name ?? entry?.course?.title ?? '';
    if (id && title) courseTitleByItemId[id] = String(title);
  }

  /**
   * The lines the customer is asked to confirm. Every one of them resolved —
   * `resolveBundleRequest` has already refused the whole request if any item's
   * course or round could not be named, so there is no marked or partial row to
   * render here and no branch that could draw one.
   *
   * ── NO DEFAULT ROUND. THAT WAS THE DEFECT. ─────────────────────────────
   * This used to call `chooseItemRound` and hand the summary ONE round per
   * course — the author-ordered first one still open — which the card printed
   * as `รอบอบรม 12-13 พ.ย.` while the pick controls beside it still read
   * "— เลือกรอบ —". The customer was shown a round nobody had chosen, on the
   * screen where they were choosing it.
   *
   * So every OFFERED round is sent instead, keyed by its id, and the client
   * half shows the one the applicant picked and ยังไม่ได้เลือกรอบ until they
   * have. `chooseItemRounds` is the same function the public bundle card draws
   * its chips from, so the summary cannot list a round the card does not.
   *
   * THE LABELS ARE WRITTEN HERE, and that is the invariant rather than a
   * convenience: `formatRoundDays` refuses to read a clock, the pair it needs
   * was read once at the top of this function, and the client half is a
   * `use client` component that must never make a second read. It picks a
   * string out of this map; it does not format a date.
   */
  const lines = items.map((item, i) => {
    const entry = entries[i] ?? null;
    const roundsById = {};
    for (const row of chooseItemRounds(entry?.rounds, item, todayKey)) {
      const id = String(row?.id ?? "").trim();
      if (!id) continue;
      roundsById[id] = {
        dates: formatRoundDays(row.dates, {
          showMonth: true,
          showYear: "auto",
          currentYear,
        }),
        type: row.live?.type ?? row.type ?? "classroom",
      };
    }
    return {
      key: item?.id || `item-${i}`,
      itemId: String(item?.id ?? "").trim(),
      courseName: String(entry?.course?.course_name ?? "").trim(),
      courseId: String(entry?.courseId ?? item?.courseId ?? "").trim(),
      roundsById,
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
      {/*
        ── THE PREVIEW BANNER, ON THE SERVER AND ABOVE EVERYTHING ──────────
        Rendered here rather than inside the wizard, and that placement is
        the "persistent" half of the requirement: this file renders on every
        step — step-1, step-2 and step-3 all call it — so the banner is above
        the form, above the picks AND above the success screen without the
        client component having to remember it in three places.

        `sticky` so it survives a long step-1 form; a mode warning that
        scrolls away is a mode warning that is read once and then forgotten
        while the author fills in a real-looking order.
      */}
      {preview && (
        <p
          data-testid="bundle-preview-banner"
          className="sticky top-0 z-50 -mx-4 mb-6 border-b border-9e-lime bg-9e-lime px-4 py-2 text-center text-sm font-bold text-9e-navy lg:-mx-6"
        >
          {BUNDLE_PREVIEW_BANNER}
        </p>
      )}
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          สมัครอบรม Bundle
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)] lg:text-3xl">
          {content.name || "แพ็กเกจอบรม"}
        </h1>
        {/*
          The same two-field decision the card makes, from the same component.
          A customer who clicked a card showing rich text must not land on a
          header showing something else.
        */}
        <BundleBlurb
          content={content}
          className="mt-2 text-sm text-[var(--text-secondary)]"
        />
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
        step={step}
        /*
          THE PICK INPUTS. The stored items (not the resolved entries): the
          pure core reads offered rounds and pickUntil off the DOCUMENT, and
          takes status from the live map beside it. Passing the resolved
          entries instead would hand the browser a course object and a
          cover URL it has no use for.
        */
        pickItems={gate.content.items}
        sequential={gate.content.sequential === true}
        liveStatusById={liveStatusById}
        today={todayKey}
        courseTitleByItemId={courseTitleByItemId}
        basePath={BUNDLE_BASE_PATH}
        /*
          THE MODE, THREADED. The client half needs it for four things, each
          of which would be wrong to infer: the banner, the submit label, the
          flag on its own step links (lose it and step 2 silently drops back
          to the published bundle), and the flag on its POST.
        */
        preview={preview}
        /*
          THE SUMMARY AS DATA, NOT AS A RENDERED NODE. It was built here and
          passed down as an element, which it could be while its round lines
          came from a round this route chose. They follow the APPLICANT now, and
          the pick is client state — so the wizard renders `BundleSummary`
          itself, from these lines and these two prices. The block is still a
          presentational component with no hooks and no clock, which is what
          lets either tier render it.
        */
        summaryLines={lines}
        listPrice={listPrice}
        netPrice={netPrice}
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
/**
 * THE PREVIEW REFUSAL, and it says the same thing for all four causes.
 *
 * `resolveBundlePreviewPage` distinguishes no-page / disabled / expired /
 * locked, and this deliberately does not: a screen that told an
 * unauthorised caller which gate stopped them would be a probe for which
 * unpublished pages exist and which of them have preview switched on.
 *
 * NOT `notFound()`. A 404 would be the same answer this route gives for a
 * section id nobody authored, and the two are different facts — one of them
 * is "you are not allowed", which an author who mistyped a password needs to
 * be able to tell apart from "this does not exist".
 */
function renderPreviewForbidden() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1
        data-testid="bundle-preview-forbidden"
        className="text-xl font-bold text-[var(--text-primary)]"
      >
        {BUNDLE_PREVIEW_FORBIDDEN}
      </h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        {BUNDLE_PREVIEW_FORBIDDEN_BODY}
      </p>
    </main>
  );
}

function renderRefusal(reason) {
  if (isSilentRefusal(reason)) notFound();

  /**
   * THREE spoken refusals, and the reason picks one. It was a boolean over two.
   *
   * `expired` is not a softer `unavailable`: that sentence opens with
   * "ขณะนี้ยังไม่สามารถ…" and invites the visitor back, which is honest for an
   * unpublished page and a lie about a promotion whose end date has passed.
   * Nor is it `closed`, which is a switch someone can flip back.
   *
   * A LOOKUP rather than nested ternaries, so adding a fourth reason is one row
   * and cannot leave a message paired with the wrong testid.
   */
  const SPOKEN = {
    closed: {
      testid: "bundle-refused-closed",
      heading: BUNDLE_CLOSED_MESSAGE,
      sub: "ขณะนี้แพ็กเกจนี้ปิดรับลงทะเบียนอยู่ — สอบถามรอบถัดไปหรือเงื่อนไขล่าสุดได้จากทีมขาย",
    },
    page_expired: {
      testid: "bundle-refused-expired",
      heading: BUNDLE_EXPIRED_MESSAGE,
      sub: "ช่วงเวลาของโปรโมชันนี้ผ่านไปแล้ว — สอบถามโปรโมชันที่กำลังจัดอยู่ได้จากทีมขาย",
    },
  };
  const spoken = SPOKEN[reason] ?? {
    testid: "bundle-refused-unavailable",
    heading: BUNDLE_UNAVAILABLE_MESSAGE,
    sub: "หากคุณเข้ามาจากลิงก์ที่บันทึกไว้ ลิงก์นั้นอาจไม่ตรงกับแพ็กเกจที่เปิดรับอยู่ในขณะนี้",
  };

  return (
    <article className="mx-auto max-w-[680px] px-4 py-16 lg:px-6">
      <div
        data-testid={spoken.testid}
        data-reason={reason}
        className="rounded-9e-lg border border-dashed border-[var(--surface-border)] px-6 py-12 text-center"
      >
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {spoken.heading}
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

          Still clearly distinct from the two lines beside it: `unavailable` is
          about a STALE LINK rather than a decision, and `expired` is about a
          DATE. The expired sub-line is the one place the set says plainly that
          the offer is over — which the CLOSED line above may never say, for the
          reasons just given — and it still points at the sales team, because
          "this offer ended" and "there is nothing for you" are different
          sentences and only the first is true.
        */}
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {spoken.sub}
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
