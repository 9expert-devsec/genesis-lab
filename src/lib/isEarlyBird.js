/**
 * True when `scheduleId` matches an active, non-expired EarlyBirdConfig.
 *
 * `earlyBird` is the full EarlyBirdConfig doc (as returned by
 * `getEarlyBirdByCourse`), not the map produced by
 * `getAllActiveEarlyBirdMap` — list pages should use the map's lookup
 * directly instead of calling this helper.
 *
 * Safe to call with null/undefined inputs.
 */
export function isEarlyBirdSchedule(scheduleId, earlyBird) {
  if (!earlyBird?.is_active || !earlyBird?.schedule_id) return false;
  if (earlyBird.deadline && new Date(earlyBird.deadline) < new Date()) {
    return false;
  }
  return String(scheduleId) === String(earlyBird.schedule_id);
}