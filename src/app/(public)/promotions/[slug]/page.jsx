import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolvePromotion } from "@/lib/resolvePromotion";
import { getPageBuilderPageBySlugAny } from "@/lib/actions/pageBuilder";
import { promotionDetailTarget } from "@/lib/pages/promotionMode";
import { PageBuilderView } from "@/components/pageBuilder/PageBuilderView";
import { stripDraft } from "@/lib/pageBuilder/draftState";
import { sanitizeRichHtml } from "@/lib/sanitizeRichHtml";
/**
 * The Advanced HTML branch. ADDED beside the statements above rather than folded
 * into any — the standing rule in this repo.
 *
 * `getCustomPageBySlug` is the PUBLISHED-only read and it strips the draft
 * INSIDE the action (registered `stripped` in the CUSTOM_PAGE_READS sweep), so
 * there is deliberately no second stripDraft() at the call sites below —
 * double-stripping would contradict the register. The builder read is different:
 * getPageBuilderPageBySlugAny is any-status and shared with the preview route,
 * which is why ITS guard sits here at the call site.
 */
import { getCustomPageBySlug } from "@/lib/actions/customPages";
import { CustomPageView } from "@/app/(public)/[...slug]/_components/CustomPageView";
import { buildPageJsonLd } from "@/lib/customPages/buildPageJsonLd";

export const revalidate = 3600;

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function formatThaiLong(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear() + 543;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${year}`;
}

function dateRangeLong(startISO, endISO) {
  const start = formatThaiLong(startISO);
  const end = formatThaiLong(endISO);
  if (start && end) return `${start} – ${end}`;
  if (end) return `วันนี้ – ${end}`;
  return start;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const segment = String(slug);

  // ONE precedence decision, shared with the render below and defined once in
  // promotionDetailTarget: builder → custom → msdb → 404.
  //
  // Canonical is FORCED to /promotions/<slug> on BOTH page branches (auto-derived
  // — the author never types it, and seo.canonicalUrl / canonicalUrl are
  // deliberately ignored here so a promotion's one home is always
  // /promotions/<slug>).
  //
  // stripDraft on the BUILDER read only — getPageBuilderPageBySlugAny is shared
  // with the preview route, which may see a draft, so the guard belongs at this
  // call site. getCustomPageBySlug strips inside the action and is published-only.
  const builderPage = stripDraft(await getPageBuilderPageBySlugAny(segment));
  const customPage = await getCustomPageBySlug(segment);
  const resolved = await resolvePromotion(segment);
  const target = promotionDetailTarget(builderPage, customPage, resolved);

  if (target === "builder") {
    const seo = builderPage.seo ?? {};
    const base = process.env.NEXT_PUBLIC_SITE_URL;
    const canonical = `${base}/promotions/${segment}`;
    const title = seo.metaTitle || builderPage.title;
    const description = seo.metaDescription || "";
    const ogTitle = seo.ogTitle || title;
    const ogDesc = seo.ogDescription || description;
    return {
      title,
      description,
      alternates: { canonical },
      robots: seo.noIndex ? { index: false, follow: false } : undefined,
      openGraph: {
        title: ogTitle,
        description: ogDesc,
        url: canonical,
        type: seo.ogType || "website",
        images: seo.ogImage ? [{ url: seo.ogImage }] : [],
        siteName: "9Expert Training",
        locale: "th_TH",
      },
      twitter: {
        card: seo.twitterCard || "summary_large_image",
        title: ogTitle,
        description: ogDesc,
        images: seo.ogImage ? [seo.ogImage] : [],
      },
    };
  }

  /**
   * The Advanced HTML branch. Same shape as the builder's above, read off the
   * page's own flat SEO fields rather than a nested `seo` object — CustomPage
   * stores them at the top level and has two the builder does not (ogType,
   * twitterCard), which is why this is a branch and not a shared mapper.
   *
   * `canonicalUrl` IS DELIBERATELY IGNORED, exactly as `seo.canonicalUrl` is on
   * the builder branch: a promotion has one home and the route derives it. An
   * author who typed a canonical for the bare slug — back when that was this
   * page's URL — must not be able to point search engines at a URL that now 308s
   * back here.
   */
  if (target === "custom") {
    const base = process.env.NEXT_PUBLIC_SITE_URL;
    const canonical = `${base}/promotions/${segment}`;
    const title = customPage.metaTitle || customPage.title;
    const description = customPage.metaDescription || "";
    const ogTitle = customPage.ogTitle || title;
    const ogDesc = customPage.ogDescription || description;
    return {
      title,
      description,
      alternates: { canonical },
      robots: customPage.noIndex ? { index: false, follow: false } : undefined,
      openGraph: {
        title: ogTitle,
        description: ogDesc,
        url: canonical,
        type: customPage.ogType || "website",
        images: customPage.ogImage ? [{ url: customPage.ogImage }] : [],
        siteName: "9Expert Training",
        locale: "th_TH",
      },
      twitter: {
        card: customPage.twitterCard || "summary_large_image",
        title: ogTitle,
        description: ogDesc,
        images: customPage.ogImage ? [customPage.ogImage] : [],
      },
    };
  }

  if (!resolved) return {};

  const { promotion, config } = resolved;
  const title =
    config?.meta_title?.trim() ||
    `${promotion.title} | โปรโมชัน 9Expert Training`;
  const description =
    config?.meta_description?.trim() ||
    promotion.detail_plain?.slice(0, 160) ||
    promotion.title;
  const ogImage = config?.og_image_url?.trim() || promotion.thumbnail_url || "";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

export default async function PromotionDetailPage({ params }) {
  const { slug } = await params;
  const segment = String(slug);

  /**
   * ── Precedence: builder → custom → MSDB html_content → 404 ────────────────
   * ONE decision, made by `promotionDetailTarget` and NOT re-derived here. It
   * used to be an inlined `shouldRenderPromotionPage` check in this function and
   * another in generateMetadata, with the pure function exported and called by
   * nothing — three sources would have made that three places to keep in step.
   *
   * A promotion-type page that is not publicly visible falls THROUGH to the
   * MSDB resolve and then to 404, matching what its bare-slug render would have
   * done, which the grid relies on: a visible card always implies a live detail.
   *
   * stripDraft on the BUILDER read — getPageBuilderPageBySlugAny is any-status
   * and shared with the preview route, which may see a draft, so the guard
   * belongs at this call site. getCustomPageBySlug is published-only and strips
   * inside the action, so it takes no second strip here.
   */
  const builderPage = stripDraft(await getPageBuilderPageBySlugAny(segment));
  const customPage = await getCustomPageBySlug(segment);
  const resolved = await resolvePromotion(segment);
  const target = promotionDetailTarget(builderPage, customPage, resolved);

  if (target === "builder") {
    // FULL-BLEED (Phase 3): only the back link sits in a contained strip; the
    // PageBuilderView below runs edge-to-edge so authored heroes / full_width
    // sections can break out of the 1200px column. PageBuilderView manages its
    // own per-section widths + theme surface, so it does not assume an outer
    // max-width. The MSDB html_content branch keeps its contained chrome. The
    // MSDB header (title/date/tags) is NOT reused — a builder promotion composes
    // its own headings via sections.
    /**
     * ── ROUND 79: NO BACK LINK ON THE BUILDER BRANCH ────────────────────
     * It used to sit in a contained strip above PageBuilderView. Measured on
     * the live page before removal: an 80px band with 56px of padding-top,
     * transparent, whose ONLY child was the link. Full-bleed sections then
     * begin under it, so once the first section carries a light custom
     * background the strip reads as a detached band of route colour between
     * the navbar and the page.
     *
     * The band goes with the link because it existed only to hold it —
     * measured, not assumed: `onlyChildIsTheLink` was true.
     *
     * TWO ALTERNATIVES WERE WEIGHED AND REJECTED. Moving it into the first
     * section makes every page's first section responsible for something that
     * is not its content, and has no defined position when that section is
     * `custom_html` — the system cannot know where an author's markup has
     * room. Making the band inherit the first section's background reads
     * better but keeps a route-level element depending on a section-level
     * value, which is the same coupling wearing different clothes.
     *
     * WHAT AN AUTHOR LOSES: nothing that is not already there twice. Measured
     * on the same page, three other links to /promotions remain in the site
     * chrome, and the browser has back.
     *
     * THE MSDB BRANCH BELOW KEEPS ITS OWN BACK LINK, deliberately. That one
     * sits inside a contained <article> above a title/date/tags header, not
     * over a full-bleed authored hero, so the defect described here does not
     * arise there. Removing it would be a separate change to a different
     * layout.
     */
    return (
      <div className="bg-[#F8FAFD] dark:bg-[#0D1B2A]">
        <PageBuilderView page={builderPage} />
      </div>
    );
  }

  /**
   * ── The Advanced HTML branch ───────────────────────────────────────────────
   * CONTAINED, not full-bleed, and that is a property of the view rather than a
   * choice made here: `CustomPageView` renders its own `mx-auto max-w-[1200px]`
   * <article> with an H1, so wrapping it in another column would nest two. The
   * builder branch above runs edge-to-edge only because PageBuilderView manages
   * its own per-section widths.
   *
   * NO BACK LINK, matching the builder branch rather than the MSDB one. The
   * route-colour surface is the same, three other links to /promotions remain in
   * the site chrome, and a link this page did not have at its old bare-slug URL
   * should not appear just because the URL moved.
   *
   * The JSON-LD <script> is emitted here for the same reason the catch-all emits
   * it: `buildPageJsonLd` is the page's own document, it is keyed off the page's
   * fields, and CustomPageView deliberately renders neither meta nor JSON-LD.
   */
  if (target === "custom") {
    const jsonLdData = buildPageJsonLd(customPage, process.env.NEXT_PUBLIC_SITE_URL);
    return (
      <div className="bg-[#F8FAFD] dark:bg-[#0D1B2A]">
        {jsonLdData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
          />
        )}
        <CustomPageView page={customPage} />
      </div>
    );
  }

  if (!resolved) notFound();

  const { promotion } = resolved;
  const range = dateRangeLong(promotion.start_date, promotion.end_date);

  return (
    <div className="bg-[#F8FAFD] dark:bg-[#0D1B2A]">
      {/* Hero image */}

      <article className="mx-auto max-w-[1200px] py-10 lg:py-14">
        <Link
          href="/promotions"
          className="mb-6 inline-flex items-center gap-1 text-sm text-[#005CFF] hover:underline dark:text-[#48B0FF]"
        >
          <span aria-hidden="true">←</span> กลับไปหน้าโปรโมชัน
        </Link>

        <header className="mb-6">
          <h1 className="text-3xl font-bold leading-tight text-[#0D1B2A] dark:text-white md:text-4xl">
            {promotion.title}
          </h1>
          {range && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#005CFF]/10 px-3 py-1 text-sm font-medium text-[#005CFF] dark:bg-[#48B0FF]/15 dark:text-[#48B0FF]">
              {range}
            </p>
          )}
          {Array.isArray(promotion.tags) && promotion.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {promotion.tags.map((t, i) => (
                <span
                  key={`${t.label}-${i}`}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: t.color || "#465469" }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </header>

        <hr className="mb-6 border-[var(--surface-border)]" />

        {promotion.html_content ? (
          <div
            className="promotion-html-content text-[#0D1B2A] dark:text-[#F8FAFD]"
            // `html_content` is upstream (MSDB) content genesis never writes —
            // see lib/sanitizeRichHtml.js. Sanitised HERE, at render, because
            // that is the only point genesis controls; docs/audit/
            // unsanitized-html-render-sites.md §1.2 measured this exact field
            // carrying a live <script> and working onmouseover/onerror
            // handlers in 3 of 21 stored rows.
            dangerouslySetInnerHTML={{
              __html: sanitizeRichHtml(promotion.html_content),
            }}
          />
        ) : (
          <p className="text-sm text-[#465469] dark:text-[#C5CEDA]">
            ไม่มีรายละเอียดเพิ่มเติม
          </p>
        )}
      </article>
    </div>
  );
}
