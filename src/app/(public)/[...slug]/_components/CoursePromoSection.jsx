import Link from 'next/link';

/**
 * CoursePromoSection — promotions linked to a course.
 *
 * Layout: horizontal cards stacked vertically — thumbnail left,
 * title + end-date middle, "ดูโปรโมชัน" link right. Max two rows; the
 * rest are reachable via "ดูโปรโมชันทั้งหมด" → `/promotions`.
 *
 * Server component over `{ link, promotion }` rows from
 * `getActiveCoursePromos()`. Sort priority (set in the action):
 *   1. is_pinned === true
 *   2. start_date / createdAt descending
 *
 * Renders nothing on empty input.
 */
export function CoursePromoSection({ coursePromos }) {
  if (!Array.isArray(coursePromos) || coursePromos.length === 0) return null;

  const displayed = coursePromos.slice(0, 2);

  return (
    <section
      aria-label="โปรโมชัน"
      className="rounded-9e-lg border border-dashed border-9e-brand/30 p-4 dark:border-9e-brand/20"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="font-en text-xs font-bold uppercase tracking-wider text-9e-brand">
          โปรโมชัน
        </p>
        <Link
          href="/promotions"
          className="font-en text-xs font-medium text-9e-action hover:underline"
        >
          ดูโปรโมชันทั้งหมด →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {displayed.map(({ link, promotion }) => (
          <PromoRow
            key={link._id ?? promotion.promotion_id}
            promotion={promotion}
          />
        ))}
      </div>
    </section>
  );
}

function PromoRow({ promotion }) {
  const href = `/promotions/${promotion.api_slug || promotion.promotion_id}`;

  const dateLabel = (() => {
    const end = promotion.end_date ? new Date(promotion.end_date) : null;
    if (!end || Number.isNaN(end.getTime())) return null;
    return `ถึง ${end.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;
  })();

  return (
    <div className="flex items-center gap-3 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-3 transition-colors duration-9e-micro hover:border-9e-brand/30">
      {promotion.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={promotion.thumbnail_url}
          alt=""
          className="h-[60px] w-[80px] shrink-0 rounded-9e-sm object-cover"
        />
      ) : (
        <div className="h-[60px] w-[80px] shrink-0 rounded-9e-sm bg-9e-ice dark:bg-9e-card" />
      )}

      <div className="min-w-0 flex-1">
        {promotion.is_pinned && (
          <span className="mb-1 inline-block rounded border border-9e-lime/30 bg-9e-lime/20 px-1.5 py-0.5 font-en text-[10px] font-bold text-9e-navy dark:text-9e-lime">
            Pinned
          </span>
        )}
        <p className="line-clamp-2 font-thai text-sm font-medium leading-snug text-9e-navy dark:text-white">
          {promotion.title}
        </p>
        {dateLabel && (
          <p className="mt-0.5 font-thai text-xs text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
            ระยะเวลา: {dateLabel}
          </p>
        )}
      </div>

      <Link
        href={href}
        className="shrink-0 whitespace-nowrap font-en text-xs font-medium text-9e-action hover:underline"
      >
        ดูโปรโมชัน →
      </Link>
    </div>
  );
}
