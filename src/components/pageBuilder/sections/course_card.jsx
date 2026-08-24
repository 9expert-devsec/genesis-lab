import { CourseCard } from '@/components/course/CourseCard';

/**
 * course_card — one public course, referenced by `content.courseId` (2C.2a,
 * authored reference). Server-renderable, but it does NOT fetch: the course is
 * resolved ABOVE the renderer (resolveSectionData) and handed in as `data`, so
 * the ONE SectionRenderer serves both the public page and the client canvas
 * (see docs/page-builder-status.md §2C.2).
 *
 * Reuses the site's CourseCard — one presentation for a course, no drift. That
 * is also why course_card does NOT read style.cardStyle: its surface is
 * CourseCard's, so no cardStyle control is offered (the reader-set stays
 * {price_card, stat_card, icon_card}).
 *
 * Fails closed: an unresolved / unknown courseId arrives as null → renders
 * nothing, and the editor warns at the field.
 */
/**
 * Round 50, ADDED beside the statement above rather than folded into it — the
 * standing rule in this repo.
 *
 * ── WHY A PAGE MAY NEED THE PRICE OFF ─────────────────────────────────────
 * `expopo1` puts a `การ์ดคอร์ส` showing ฿12,900 — the real MSDB price — in the
 * same grid as a `การ์ดราคา` reading “ราคาพิเศษ 4,900 บาท จากปกติ 10,900 บาท”.
 * Two prices on one page, with nothing on the page saying which one applies.
 * Turning this card's price off leaves the price card as the only thing
 * speaking about price. It is the ONLY thing the toggle does: no second price
 * field here, no custom price — that is `การ์ดราคา`'s job, and duplicating it
 * would put two authorities on one fact.
 *
 * ── ABSENT MEANS ON, AND `!== false` IS WHY ───────────────────────────────
 * `content.showPrice !== false`, never `content.showPrice` or `?? true`.
 *
 * Every stored course_card predates the field, and it does NOT read back as
 * `true`: the read path is `.lean()`, which does not apply Mongoose defaults,
 * and JSON serialisation drops `undefined` keys — so the key comes back ABSENT
 * (round 39 hit this same trap in the neighbouring article work). A truthiness
 * check would therefore strip the price from EVERY card in production with no
 * migration having run and no author having touched anything. `!== false` is
 * true for absent, true for `true`, and false only for a literal `false` an
 * author deliberately wrote.
 *
 * Nothing else about the card changes, and price-off can never empty it: the
 * name and the ดูรายละเอียด button do not depend on the price, so this never
 * produces the 84-byte nothing-render that an unresolved courseId does. Those
 * two stay distinguishable, which is what §D.2's measurement is for.
 */
export function CourseCardSection({ content, data }) {
  if (!data) return null;
  return (
    <div className="mx-auto max-w-sm">
      <CourseCard course={data} showPrice={content?.showPrice !== false} />
    </div>
  );
}
