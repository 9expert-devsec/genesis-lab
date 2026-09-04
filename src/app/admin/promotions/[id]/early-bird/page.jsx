import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import { getEarlyBirdsForPromotion } from '@/lib/actions/course-promos';
import { listPublicCourses } from '@/lib/api/public-courses';
import { PromotionEarlyBirdClient } from './_components/PromotionEarlyBirdClient';

/**
 * /admin/promotions/<id>/early-bird — manage a promotion's Early Bird set.
 *
 * ── WHY A SIBLING ROUTE AND NOT A TAB ON /config ────────────────────────────
 * /config is documented as frozen legacy (see lib/actions/promotions.js) and is
 * to be retired once the builder renderer supersedes it. Hanging a live feature
 * off a screen scheduled for deletion buys a migration later; a sibling route
 * costs the same today and is free to outlive it.
 *
 * RBAC needs no registry entry: lib/rbac/pages.js matches /admin/promotions by
 * prefix, and promotions_banner is the only longer match, so this resolves to
 * the `promotions` key on its own.
 *
 * ── WHAT THIS SCREEN IS NOT ─────────────────────────────────────────────────
 * Not a second authority over EarlyBirdConfig. It is a second VIEW of rows the
 * course tab also edits; every write goes through the same `writeEarlyBird` and
 * gets the same refusal. One course still has at most one Early Bird, and
 * `schedule_id` is still a single round.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  await dbConnect();
  const promotion = await Promotion.findOne({ promotion_id: id }).lean();
  if (!promotion) return { title: 'ไม่พบโปรโมชั่น' };
  return { title: `Early Bird: ${promotion.title}`, robots: { index: false, follow: false } };
}

export default async function PromotionEarlyBirdPage({ params }) {
  await requirePage('promotions');

  const { id } = await params;
  await dbConnect();

  const promotionRaw = await Promotion.findOne({ promotion_id: id }).lean();
  if (!promotionRaw) notFound();
  const promotion = JSON.parse(JSON.stringify(promotionRaw));

  /**
   * The course list is the same origin every other admin picker uses, hidden
   * courses included — an admin editing an existing Early Bird for a course
   * that has since been hidden must still see its NAME rather than a bare code.
   *
   * Both `_id` and `course_id` are carried down: EarlyBirdConfig is keyed by
   * the CODE, while /schedules takes the MSDB ObjectId (the opposite convention
   * — see lib/api/schedules.js). The round picker needs the second, so the row
   * cannot resolve one from the other on its own.
   */
  const [rows, coursesResult] = await Promise.all([
    getEarlyBirdsForPromotion(id).catch(() => []),
    listPublicCourses({ includeHidden: true }).catch(() => ({ items: [] })),
  ]);

  const courses = (coursesResult.items ?? []).map((c) => ({
    _id: c._id ? String(c._id) : '',
    course_id: c.course_id ?? '',
    name: c.course_name_th || c.course_name || c.course_id || '',
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/admin/promotions"
          className="text-sm text-9e-action hover:underline dark:text-9e-air"
        >
          ← กลับไปยังรายการโปรโมชั่น
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-9e-navy dark:text-white">
          Early Bird ของโปรโมชันนี้
        </h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {promotion.title}
        </p>
      </div>

      <PromotionEarlyBirdClient
        promotionId={promotion.promotion_id}
        promotionTitle={promotion.title}
        initialRows={rows}
        courses={courses}
        relatedCourseIds={promotion.related_course_ids ?? []}
      />
    </div>
  );
}
