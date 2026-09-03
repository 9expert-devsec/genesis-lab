import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolvePromotion } from "@/lib/resolvePromotion";
import { getPageBuilderPageBySlugAny } from "@/lib/actions/pageBuilder";
import { shouldRenderBuilderPromotion } from "@/lib/pageBuilder/promotionMode";
import { PageBuilderView } from "@/components/pageBuilder/PageBuilderView";
import { stripDraft } from "@/lib/pageBuilder/draftState";
import { sanitizeRichHtml } from "@/lib/sanitizeRichHtml";

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

  // Builder promotion FIRST (Phase 2). Mirrors the catch-all's builder metadata
  // shape, but canonical is FORCED to /promotions/<slug> (auto-derived — the
  // author never types it, and seo.canonicalUrl is deliberately ignored here so a
  // promotion's one home is always /promotions/<slug>).
  // stripDraft on a PUBLIC read — getPageBuilderPageBySlugAny is shared with
  // the preview route, which may see a draft, so the guard belongs here.
  const builderPage = stripDraft(await getPageBuilderPageBySlugAny(segment));
  if (shouldRenderBuilderPromotion(builderPage)) {
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

  const resolved = await resolvePromotion(segment);
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

  // ── Precedence (Phase 2): builder promotion FIRST, then MSDB html_content,
  //    then 404. A visible promotion-type builder page renders its authored
  //    sections; an expired/unpublished one does NOT fall through to MSDB (a
  //    builder slug won't resolve there) — it 404s, matching what its bare-slug
  //    render would have done, which the Phase-3 grid relies on. See
  //    promotionDetailTarget in lib/pageBuilder/promotionMode.js. ──
  // stripDraft on a PUBLIC read — getPageBuilderPageBySlugAny is shared with
  // the preview route, which may see a draft, so the guard belongs here.
  const builderPage = stripDraft(await getPageBuilderPageBySlugAny(segment));
  if (shouldRenderBuilderPromotion(builderPage)) {
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

  const resolved = await resolvePromotion(segment);
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
