import { dbConnect } from '@/lib/db/connect';
import ScheduleLocal from '@/models/ScheduleLocal';
import { getCourseByCode } from '@/lib/api/public-courses';
import { resolvePricePerSeat, computePricing } from '@/lib/pricing';

/**
 * Authoritatively resolve the pricing snapshot for a checkout.
 * - per-seat price = ScheduleLocal.price_override ?? course.course_price
 * - throws if no price is resolvable (course not purchasable online).
 *
 * `courseCode` is the upstream course_id (e.g. "POWER-BI"); `classId`
 * is the MSDB schedule _id used to look up the local override.
 */
export async function resolveCheckoutPricing({ courseCode, classId, seats }) {
  await dbConnect();
  const [course, local] = await Promise.all([
    getCourseByCode(courseCode),
    ScheduleLocal.findOne({ msdb_schedule_id: String(classId) }).lean(),
  ]);
  if (!course) throw new Error('course_not_found');

  const pricePerSeat = resolvePricePerSeat({
    priceOverride: local?.price_override ?? null,
    coursePrice: course.course_price ?? null,
  });
  if (pricePerSeat == null) throw new Error('price_unavailable');

  return computePricing(pricePerSeat, seats);
}
