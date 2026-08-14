import * as React from 'react';

/**
 * Read the stored course order out of the category documents, once per request.
 *
 * ── WHY THIS IS SHAPED LIKE hiddenCourses.js ───────────────────────────────
 * Same constraints, same answers, deliberately — the two are read by the same
 * function on the same call:
 *
 *   · `perRequest` is React.cache when it exists. `listPublicCourses` is called
 *     up to 25 times in one render (syncLandingData loops per programme), and
 *     without the memo each call would pay its own round-trip.
 *   · the database imports are DEFERRED to the first real call, because
 *     `@/lib/db/connect` throws at module load when MONGODB_URI is unset and
 *     this module is reached from most of src/app — a static import would make
 *     the upstream adapter unloadable in every pure and render test.
 *
 * ── THE TWO FAILURE MODES ARE DIFFERENT, AND BOTH RETURN null ──────────────
 * `null` means "do not order" — leave the array exactly as upstream sent it,
 * which is the behaviour that existed before this feature. Nothing reorders.
 *
 *   1. THE READ FAILED. hiddenCourses fails open to "nothing is hidden", which
 *      shows too much. The equivalent here would be "nothing is ordered", and
 *      that is NOT the safe direction: every course would become unlisted and
 *      fall to createdAt DESC, so a momentary database blip would reorder the
 *      entire site. Leaving the upstream order is the smaller lie.
 *
 *   2. NOTHING IS SEEDED YET. If no category document carries a non-empty
 *      `courseOrder`, the feature has not been seeded and ordering is a no-op.
 *      This is the deploy-order hazard defused in code rather than in a note:
 *      ship the surfaces before running the seed and the site keeps rendering
 *      exactly as it does today instead of reordering all at once. The deploy
 *      note still stands — this makes getting it wrong survivable, not correct.
 *
 * A PARTIAL seed is deliberately NOT defended against: if some categories have
 * lists and others do not, the ones without genuinely have no order and their
 * courses are unlisted. That state only arises from a crash mid-seed, and
 * papering over it would hide a half-finished migration.
 */

/** React's per-request memo when it exists; identity otherwise. */
const perRequest = typeof React.cache === 'function' ? React.cache : (fn) => fn;

/**
 * @returns {Promise<null | {
 *   programRank: Map<string, number>,
 *   programCourseOrder: Map<string, string[]>,
 *   programOrderSource: Map<string, '' | 'seeded' | 'arranged'>,
 *   skillCourseOrder: Map<string, string[]>,
 * }>} null when the order must not be applied — see the note above.
 */
export const loadCourseOrder = perRequest(async function loadCourseOrder(deps = {}) {
  const { warn = console.warn } = deps;
  try {
    const connect = deps.connect ?? (await import('@/lib/db/connect')).dbConnect;
    await connect();
    const ProgramOrder = deps.ProgramOrder ?? (await import('@/models/ProgramOrder')).default;
    const SkillOrder = deps.SkillOrder ?? (await import('@/models/SkillOrder')).default;

    const [programs, skills] = await Promise.all([
      // `courseOrderSource` joined the projection for /admin/courses, which must
      // tell "captured from the old system" apart from "somebody arranged this"
      // — the distinction ProgramOrder.courseOrderSource was added to carry, and
      // which its own field note anticipated a screen would need. Projected
      // rather than fetched separately so the ordering read stays one query.
      ProgramOrder.find({}, { programId: 1, order: 1, courseOrder: 1, courseOrderSource: 1, _id: 0 }).lean(),
      SkillOrder.find({}, { skillId: 1, courseOrder: 1, courseOrderSource: 1, _id: 0 }).lean(),
    ]);

    const programRank = new Map();
    const programCourseOrder = new Map();
    const programOrderSource = new Map();
    for (const p of programs ?? []) {
      const id = String(p?.programId ?? '');
      if (!id) continue;
      if (Number.isFinite(p?.order)) programRank.set(id, p.order);
      programCourseOrder.set(id, Array.isArray(p?.courseOrder) ? p.courseOrder : []);
      programOrderSource.set(id, String(p?.courseOrderSource ?? ''));
    }

    const skillCourseOrder = new Map();
    for (const s of skills ?? []) {
      const id = String(s?.skillId ?? '');
      if (!id) continue;
      skillCourseOrder.set(id, Array.isArray(s?.courseOrder) ? s.courseOrder : []);
    }

    const seeded =
      [...programCourseOrder.values()].some((v) => v.length > 0) ||
      [...skillCourseOrder.values()].some((v) => v.length > 0);
    if (!seeded) return null; // failure mode 2 — nothing seeded, order nothing

    return { programRank, programCourseOrder, programOrderSource, skillCourseOrder };
  } catch (err) {
    warn(
      '[courseOrder] could not read the stored order — listings are serving in '
        + `UPSTREAM order, not the arranged one (${err?.message ?? err})`
    );
    return null; // failure mode 1 — leave the array as it came
  }
});
