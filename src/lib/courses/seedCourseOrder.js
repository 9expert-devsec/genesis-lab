import { normalizeCourseCode } from '@/lib/courses/courseOrder';

/**
 * Capture the order the site renders TODAY into the per-category lists.
 *
 * ── WHAT IS BEING CAPTURED, STATED HONESTLY ────────────────────────────────
 * The catalogue arrives from MSDB already ascending by its `sort_order`, and
 * every surface renders that array as it came. So "the order rendered today" is
 * exactly the incoming array order restricted to each category — that is the
 * whole of the seed, and it is why nothing moves on the day this deploys.
 *
 * For programmes that order is a real editorial arrangement: `sort_order` is
 * hand-numbered per programme and forms a dense 0..n-1 run in 24 of 25 of them.
 * For SKILLS it is an accident — eleven courses share the value 0 inside
 * BUSINESS, and their relative order is decided by an upstream secondary key
 * that is documented nowhere. Seeding it anyway is deliberate (R4): it makes
 * the accident visible and editable instead of leaving it unowned, and
 * `courseOrderSource: 'seeded'` is what stops it being mistaken for a decision.
 *
 * ── WHY THE PLANNER IS PURE ────────────────────────────────────────────────
 * R4's claim — "nothing moves" — is checkable rather than hopeful, but only if
 * the plan can be produced without writing anything. This takes the catalogue
 * and the existing category documents and returns what WOULD be written; the
 * script decides whether to write it, and the proof runs against the plan.
 */

/**
 * The codes for one category, in the order given, normalised and de-duplicated.
 *
 * `courses` must arrive in RENDERED order — the caller passes the catalogue
 * array untouched, because that array's sequence IS the thing being captured.
 * Sorting it here would capture something else and quietly defeat the point.
 */
export function seedListFor(courses) {
  const out = [];
  const seen = new Set();
  for (const course of courses ?? []) {
    const code = normalizeCourseCode(course?.course_id);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * A category is seeded unless a person has arranged it.
 *
 * Only 'arranged' blocks. An empty marker and 'seeded' are both re-seedable:
 * re-running over a previous seed is a no-op that reproduces the same list, and
 * refusing would make the script un-runnable after a partial failure.
 */
export function shouldSeed(doc) {
  return String(doc?.courseOrderSource ?? '') !== 'arranged';
}

/**
 * @param {object} input
 * @param {Array<object>} input.courses catalogue, IN RENDERED ORDER
 * @param {Array<{programId: string, courseOrderSource?: string}>} input.programDocs
 * @param {Array<{skillId: string, courseOrderSource?: string}>} input.skillDocs
 * @returns {{programs: Array, skills: Array, skipped: Array}}
 */
export function planCourseOrderSeed({ courses = [], programDocs = [], skillDocs = [] } = {}) {
  const byProgram = new Map();
  const bySkill = new Map();

  for (const course of courses) {
    const pid = String(course?.program?.program_id ?? '');
    if (pid) {
      if (!byProgram.has(pid)) byProgram.set(pid, []);
      byProgram.get(pid).push(course);
    }
    for (const skill of course?.skills ?? []) {
      const sid = String(skill?.skill_id ?? skill ?? '');
      if (!sid) continue;
      if (!bySkill.has(sid)) bySkill.set(sid, []);
      bySkill.get(sid).push(course);
    }
  }

  const skipped = [];
  const build = (grouped, docs, idKey, kind) => {
    const byId = new Map(docs.map((d) => [String(d?.[idKey] ?? ''), d]));
    const out = [];
    for (const [id, list] of grouped) {
      const doc = byId.get(id);
      if (doc && !shouldSeed(doc)) {
        skipped.push({ kind, id, reason: 'arranged' });
        continue;
      }
      out.push({ [idKey]: id, courseOrder: seedListFor(list), count: list.length });
    }
    return out;
  };

  return {
    programs: build(byProgram, programDocs, 'programId', 'program'),
    skills: build(bySkill, skillDocs, 'skillId', 'skill'),
    skipped,
  };
}
