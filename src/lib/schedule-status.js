/**
 * Resolve the effective status of a schedule, considering any
 * admin-set override and scheduled future changes.
 *
 * Precedence (high to low):
 *   1. Scheduled change that has elapsed (override.scheduledChangeTo)
 *   2. Current manual override (override.status)
 *   3. Upstream-reported status
 *
 * Read-time computation (no cron). Called from the course detail page
 * and the registration server action.
 */

import { dbConnect } from '@/lib/db/connect';
import ScheduleStatus from '@/models/ScheduleStatus';

export async function resolveScheduleStatus(scheduleId, upstreamStatus) {
  if (!scheduleId) return upstreamStatus;
  await dbConnect();

  const override = await ScheduleStatus.findOne({ scheduleId }).lean();
  if (!override) return upstreamStatus;

  if (
    override.scheduledChangeAt &&
    override.scheduledChangeTo &&
    override.scheduledChangeAt <= new Date()
  ) {
    return override.scheduledChangeTo;
  }

  return override.status;
}

/**
 * Batch version — resolves many schedules in one DB roundtrip.
 * Returns each item with a potentially-updated `status` field plus a
 * `_statusOverridden` flag so callers can style differently.
 */
export async function resolveScheduleStatusBatch(items) {
  if (!items?.length) return items;
  await dbConnect();

  const ids = items.map((i) => i._id).filter(Boolean);
  const overrides = await ScheduleStatus.find({
    scheduleId: { $in: ids },
  }).lean();
  const overrideMap = new Map(overrides.map((o) => [o.scheduleId, o]));
  const now = new Date();

  return items.map((item) => {
    const override = overrideMap.get(item._id);
    if (!override) return item;

    let effectiveStatus = override.status;
    if (
      override.scheduledChangeAt &&
      override.scheduledChangeTo &&
      override.scheduledChangeAt <= now
    ) {
      effectiveStatus = override.scheduledChangeTo;
    }

    return { ...item, status: effectiveStatus, _statusOverridden: true };
  });
}
