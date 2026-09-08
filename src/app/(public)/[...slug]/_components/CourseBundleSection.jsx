import Link from 'next/link';

/**
 * CourseBundleSection — the Genesis BUNDLE pages that contain this course.
 *
 * Rows come from `getBundlePagesForCourse`, already filtered to published,
 * publicly-visible pages and already ordered (`promotionOrder`, then title —
 * the sort the /promotions grid uses for Genesis-owned pages). This component
 * decides nothing about which pages appear; it draws the rows it is handed.
 *
 * ── WHY A SIBLING BLOCK AND NOT ROWS INSIDE CoursePromoSection ───────────
 * The uniform-view-model option was considered and rejected on three counts,
 * and the third is the one that settles it:
 *
 *  1. `PromoRow` builds its href by concatenating an MSDB promotion's own
 *     identifiers (`api_slug || promotion_id`). A bundle's href must come from
 *     `publicPageHref` — a promotion page is diverted off its bare slug and the
 *     helper also refuses a page outside its publish window — so feeding a
 *     bundle through that row would either bypass the one sanctioned link
 *     builder or require the row to stop building links at all.
 *  2. A bundle has no `is_pinned`, and its dates are a PUBLISH WINDOW rather
 *     than a promotion period. Rendering `publishEndDate` under "ระยะเวลา"
 *     would state something the author did not say.
 *  3. THE CAP. `CoursePromoSection` renders `slice(0, 2)` — a content cap sized
 *     for its own block. Merging the two lists under it means a course with two
 *     MSDB promotions would show NO bundles at all, ever, with nothing
 *     indicating that anything had been hidden. Two independent blocks each
 *     keep their own budget, which is the behaviour an author expects when they
 *     put a course in a package.
 *
 * So `CoursePromoSection` is not touched by this round and its MSDB rows are
 * byte-identical. This block renders NOTHING on empty input, so a course with
 * no bundles has exactly the promo area it had before.
 *
 * Server component. No state, no client boundary.
 */
export function CourseBundleSection({ bundles }) {
  if (!Array.isArray(bundles) || bundles.length === 0) return null;

  return (
    <section
      aria-label="แพ็กเกจที่มีหลักสูตรนี้"
      className="rounded-9e-lg border border-dashed border-9e-brand/30 p-4 dark:border-9e-brand/20"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold uppercase tracking-wider text-9e-action">
          แพ็กเกจที่มีหลักสูตรนี้
        </h2>
        <Link
          href="/promotions"
          className="font-en text-xs font-medium text-9e-action hover:underline"
        >
          ดูโปรโมชันทั้งหมด
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {bundles.map((bundle) => (
          <BundleRow key={bundle.href} bundle={bundle} />
        ))}
      </div>
    </section>
  );
}

function BundleRow({ bundle }) {
  return (
    // THE WHOLE ROW IS THE LINK — one anchor, one tap target, the same rule
    // CoursePromoSection's row states at length: a nested anchor is un-nested
    // by the parser, so the live DOM stops matching the JSX while an assertion
    // over the rendered string still sees what was written.
    <Link
      href={bundle.href}
      className="group flex items-center gap-3 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-3 transition-colors duration-9e-micro hover:border-9e-brand/30"
    >
      {bundle.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bundle.cover}
          alt=""
          className="h-[80px] w-[80px] shrink-0 rounded-9e-sm object-cover"
        />
      ) : (
        // 80x80, matching the image it stands in for — a page with no cover must
        // not make its row shorter than the one beside it.
        <div className="h-[80px] w-[80px] shrink-0 rounded-9e-sm bg-9e-ice dark:bg-9e-card" />
      )}

      <div className="min-w-0 flex-1">
        <span className="mb-1 inline-block rounded border border-9e-brand/30 bg-9e-brand/10 px-1.5 py-0.5 font-thai text-[10px] font-bold text-9e-action">
          {bundle.label}
        </span>
        <p className="line-clamp-2 font-thai text-base font-medium leading-snug text-9e-navy dark:text-white">
          {bundle.title}
        </p>
        <span className="mt-1 inline-flex items-center gap-1 font-en text-sm font-semibold text-9e-action transition-colors group-hover:text-9e-brand">
          ดูแพ็กเกจ
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
