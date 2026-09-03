/**
 * Stub for `@/lib/actions/schedules` in the render tier.
 *
 * SchedulesAdminClient imports createSchedule / updateSchedule / deleteSchedule
 * for its modal submit and its row buttons. The real module is `'use server'`
 * and its import chain reaches next-auth → next/headers and mongoose, neither
 * of which resolves outside a Next runtime — the same reasoning as the article,
 * registration, course and banner action stubs already registered in the
 * loader.
 *
 * The admin-grid render tests assert STRUCTURE — the column arithmetic, the
 * lane spans, the `+ รอบ` affordance, the round box's colours and label. None
 * of them submits, so these are never called; they exist so the module graph
 * resolves. Throwing rather than returning a benign value matches every other
 * stub here: a render test that reaches a write should fail loudly, not quietly
 * agree.
 *
 * `getScheduleLocals` is exported for PARITY, not because the client uses it —
 * page.jsx is its only caller. test/fs/stubExportParity asserts set equality
 * against the real module's exports, deliberately, so that a server action
 * deleted upstream cannot leave a fiction behind in here.
 */
export async function createSchedule() {
  throw new Error('stub-schedule-actions: createSchedule must not be called in a render test');
}
export async function updateSchedule() {
  throw new Error('stub-schedule-actions: updateSchedule must not be called in a render test');
}
export async function deleteSchedule() {
  throw new Error('stub-schedule-actions: deleteSchedule must not be called in a render test');
}
export async function getScheduleLocals() {
  throw new Error('stub-schedule-actions: getScheduleLocals must not be called in a render test');
}
/**
 * Throws like the rest, and for the same reason, even though this one is a READ
 * rather than a write.
 *
 * RoundDetailsModal calls it from an effect, and `renderToStaticMarkup` runs no
 * effects — so a render test that reaches this has rendered something no server
 * render can produce, which is exactly the confusion the panel was split out of
 * the modal to avoid. test/render/adminRoundDetails exercises the loaded states
 * by rendering RegistrationSummaryPanel directly with a real summary; nothing
 * needs this to return.
 */
export async function getRoundRegistrationSummary() {
  throw new Error('stub-schedule-actions: getRoundRegistrationSummary must not be called in a render test');
}
