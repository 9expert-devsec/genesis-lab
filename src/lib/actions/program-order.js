'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import ProgramOrder from '@/models/ProgramOrder';
import SkillOrder from '@/models/SkillOrder';
import { requireAdmin } from '@/lib/actions/auth';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';
import { bustUpstream, UPSTREAM_TAGS } from '@/lib/api/bustUpstream';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import { normalizeCourseCode } from '@/lib/courses/courseOrder';

function programIdOf(p) {
  return String(p.program_id ?? p._id ?? '');
}

function skillIdOf(s) {
  return String(s.skill_id ?? s._id ?? '');
}

// ── Programs ────────────────────────────────────────────────────────

/**
 * Sync programs from the upstream API into ProgramOrder. Only sets
 * `order` on first insert — existing rows keep their admin-assigned
 * order. Always refreshes the cached display name + icon.
 */
export async function syncProgramsFromAPI(apiPrograms) {
  await requireAdmin('programs');
  await dbConnect();

  // `programs` is read by /admin/programs through the Data Cache (1h) and was
  // busted by NOTHING — no revalidateTag anywhere, and no
  // revalidatePath('/admin/programs') either, so the `window.location.reload()`
  // this action's caller performs re-read the same cached entry and a program
  // created upstream could not appear for up to an hour. F5 did not help.
  // Measured in docs/admin-staleness-audit.md §7.3b.
  //
  // Note this one is NOT bust-before-read in the syncFaqs sense: this function
  // performs no upstream read at all — `apiPrograms` is handed in by the client
  // from the list the page already rendered. So the bust is here to make the
  // RELOAD fresh. (That the input is the client's own possibly-stale array is a
  // separate pre-existing flaw; it is reported, not changed here.)
  bustUpstream(UPSTREAM_TAGS.PROGRAMS);

  for (const prog of apiPrograms ?? []) {
    const programId = programIdOf(prog);
    if (!programId) continue;
    await ProgramOrder.findOneAndUpdate(
      { programId },
      {
        $setOnInsert: { order: 999 },
        $set: {
          displayName: prog.program_name ?? prog.name ?? '',
          // Upstream uses `programiconurl` (no underscore in `icon`);
          // keep older candidates as defensive fallbacks.
          iconUrl:
            prog.programiconurl ?? prog.program_icon ?? prog.icon_url ?? '',
        },
      },
      { upsert: true }
    );
  }

  // Re-read AFTER the bust and AFTER the upserts, and return both halves the
  // client needs to rebuild its rows. This is what lets the caller drop
  // `window.location.reload()`: the reload existed only to get fresh data into
  // a list whose state is seeded once, and it cost a full page flash plus the
  // admin's scroll position.
  //
  // It also fixes the input flaw noted when the bust was added: `apiPrograms`
  // is the list the CLIENT was holding, so a program created upstream after
  // that page render is invisible to the upsert loop above. The returned data
  // is read fresh, so the new row reaches the screen even though this run did
  // not create an order document for it (the next sync does).
  const [programsResp, orderRows] = await Promise.all([
    listPrograms().catch(() => ({ items: [] })),
    ProgramOrder.find({}).lean(),
  ]);
  return {
    ok: true,
    data: {
      programs: programsResp?.items ?? [],
      orderData: JSON.parse(JSON.stringify(orderRows)),
    },
  };
}

/**
 * Apply the saved order + visibility to a list of API programs.
 * Programs without a stored order fall to the bottom (order=999).
 * Hidden programs are dropped.
 */
export async function getOrderedPrograms(apiPrograms) {
  if (!Array.isArray(apiPrograms) || apiPrograms.length === 0) return [];
  await dbConnect();
  const orders = await ProgramOrder.find({}).lean();
  const orderMap = Object.fromEntries(orders.map((o) => [o.programId, o]));

  return apiPrograms
    .filter((p) => !orderMap[programIdOf(p)]?.isHidden)
    .sort((a, b) => {
      const oa = orderMap[programIdOf(a)]?.order ?? 999;
      const ob = orderMap[programIdOf(b)]?.order ?? 999;
      return oa - ob;
    });
}

/**
 * Persist the full reorder in one call. Receives ordered ids; writes
 * them back as `order = index` so the array index becomes the canonical
 * sort position.
 */
export async function saveProgramOrder(orderedIds) {
  await requireAdmin('programs');
  await dbConnect();

  const ops = (orderedIds ?? []).map((id, index) => ({
    updateOne: {
      filter: { programId: String(id) },
      update: { $set: { order: index } },
      upsert: true,
    },
  }));
  if (ops.length > 0) await ProgramOrder.bulkWrite(ops);

  revalidatePath('/');
  revalidatePath('/training-course');
  triggerLandingSync();
  return { ok: true };
}

/**
 * Persist the COURSE order inside one program, from /admin/courses.
 *
 * ── WHAT A SAVE WRITES, AND WHY IT IS THE WHOLE GROUP ──────────────────────
 * `courseOrder` IS the ordered array of codes — there is no per-course number to
 * patch — so a save replaces the array with the complete membership of that
 * program group, in the order the admin arranged. Two consequences follow BY
 * CONSTRUCTION, and both are correct rather than side effects to be suppressed:
 *
 *   · PREVIOUSLY-UNLISTED COURSES BECOME LISTED. The unlisted tier
 *     (courseOrder.js, rank -1) exists for courses nobody has positioned yet;
 *     once an admin saves a group containing one, it HAS been positioned. The
 *     tier empties for that group and that is what "arranged" means. Note the
 *     direction this locks in: unlisted courses sort FIRST, so an admin who
 *     saves without moving anything freezes a new course at the top — which is
 *     exactly what the screen was showing them, so the save is honest.
 *
 *   · DEAD CODES ARE PRUNED. A stored code matching no live course contributes
 *     nothing to any ranking today (rankOf only ever asks about live courses),
 *     and rebuilding from live membership drops it. Nothing else prunes them, so
 *     this is the only thing that ever will.
 *
 * NEITHER conflicts with lib/courses/courseOrder.js. That module is a pure
 * comparator over whatever list it is given; it has no opinion about how the
 * list came to exist.
 *
 * ── THE CALLER MUST HAND OVER THE COMPLETE GROUP ───────────────────────────
 * This writes what it is given. If a caller passed a FILTERED subset, every
 * course it filtered out would be deleted from the stored order. /admin/courses
 * therefore refuses to enable dragging while a narrowing filter is active — see
 * `canReorderCourseGroups` in lib/courses/courseOrderEditing.js. The refusal
 * below (empty list) is the backstop, not the rule.
 *
 * ── OPERATOR FORM, LIKE EVERY OTHER WRITE IN THIS FILE ─────────────────────
 * `$set` of the two fields, never an enumerated document. CourseExtension's
 * writer takes the other shape and this deliberately does not follow it: an
 * enumerated object here would rewrite `order`, `displayName`, `iconUrl` and
 * `isHidden` from whatever the caller happened to hold, and this caller holds
 * none of them.
 *
 * @param {string} programId the program's CODE (ProgramOrder.programId)
 * @param {string[]} orderedCodes complete group membership, in display order
 */
export async function saveProgramCourseOrder(programId, orderedCodes) {
  await requireAdmin('courses');
  await dbConnect();

  const id = String(programId ?? '').trim();
  if (!id) return { ok: false, error: 'ไม่พบรหัสโปรแกรม' };

  // Normalised and de-duplicated on the way in, matching the key discipline the
  // seed and the rank map already use (normalizeCourseCode → upper, trimmed).
  // A rank lookup that missed on case would silently make a course unlisted.
  const codes = [];
  const seen = new Set();
  for (const raw of orderedCodes ?? []) {
    const code = normalizeCourseCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }

  /**
   * AN EMPTY LIST IS REFUSED, NOT WRITTEN.
   *
   * `$set: { courseOrder: [] }` would make every course in the program unlisted
   * and mark the group 'arranged', so the re-seed — which skips 'arranged' —
   * could never repair it. The states that could produce an empty array are all
   * failures: a group whose rows never loaded, a caller that lost its list, or
   * the loadCourseOrder-null screen state calling in when it must not. A program
   * that genuinely has no courses has no group on screen and no way to save.
   */
  if (codes.length === 0) {
    return { ok: false, error: 'ไม่มีรายการหลักสูตรที่จะบันทึก — ไม่ได้เขียนทับลำดับเดิม' };
  }

  await ProgramOrder.findOneAndUpdate(
    { programId: id },
    {
      $set: {
        courseOrder: codes,
        // 'arranged' is what stops the re-seed overwriting this. Set on every
        // save rather than only the first: a group re-seeded in between must not
        // stay re-seedable after a person has touched it again.
        courseOrderSource: 'arranged',
      },
    },
    { upsert: true }
  );

  // Same set as saveProgramOrder above, plus the screen that did the writing.
  // NOT revalidated, and following their own ISR windows exactly as they do
  // after a saveProgramOrder today: /schedule, /search, /program/[slug],
  // /skill/[slug]. The mega menu is a SNAPSHOT and does not follow at all until
  // a nav sync runs — the screen says so.
  revalidatePath('/');
  revalidatePath('/training-course');
  revalidatePath('/admin/courses');
  triggerLandingSync();
  return { ok: true, count: codes.length };
}

export async function toggleProgramHidden(programId, isHidden) {
  await requireAdmin('programs');
  await dbConnect();
  await ProgramOrder.findOneAndUpdate(
    { programId: String(programId) },
    { $set: { isHidden: Boolean(isHidden) } },
    { upsert: true }
  );
  revalidatePath('/');
  triggerLandingSync();
  return { ok: true };
}

// ── Skills ──────────────────────────────────────────────────────────

export async function syncSkillsFromAPI(apiSkills) {
  await requireAdmin('programs');
  await dbConnect();

  // Same as syncProgramsFromAPI above — SkillOrderClient.jsx:94-95 is the same
  // sync-then-window.location.reload() shape.
  bustUpstream(UPSTREAM_TAGS.SKILLS);

  for (const skill of apiSkills ?? []) {
    const skillId = skillIdOf(skill);
    if (!skillId) continue;
    await SkillOrder.findOneAndUpdate(
      { skillId },
      {
        $setOnInsert: { order: 999 },
        $set: {
          displayName: skill.skill_name ?? skill.name ?? '',
          iconUrl:
            skill.skilliconurl ?? skill.skill_icon ?? skill.icon_url ?? '',
        },
      },
      { upsert: true }
    );
  }

  // Same as syncProgramsFromAPI above — fresh read so the caller can replace
  // its rows without a document reload.
  const [skillsResp, orderRows] = await Promise.all([
    listSkills().catch(() => ({ items: [] })),
    SkillOrder.find({}).lean(),
  ]);
  return {
    ok: true,
    data: {
      skills: skillsResp?.items ?? [],
      orderData: JSON.parse(JSON.stringify(orderRows)),
    },
  };
}

export async function getOrderedSkills(apiSkills) {
  if (!Array.isArray(apiSkills) || apiSkills.length === 0) return [];
  await dbConnect();
  const [orders, programOrders] = await Promise.all([
    SkillOrder.find({}).lean(),
    ProgramOrder.find({}).lean(),
  ]);
  const orderMap = Object.fromEntries(orders.map((o) => [o.skillId, o]));
  const programOrderMap = Object.fromEntries(
    programOrders.map((p) => [p.programId, p])
  );

  return apiSkills
    .filter((s) => !orderMap[skillIdOf(s)]?.isHidden)
    .sort((a, b) => {
      const oa = orderMap[skillIdOf(a)]?.order ?? 999;
      const ob = orderMap[skillIdOf(b)]?.order ?? 999;
      return oa - ob;
    })
    .map((skill) => {
      const stored = orderMap[skillIdOf(skill)];
      const nested = Array.isArray(skill.programs) ? skill.programs : [];
      if (nested.length === 0) return skill;

      // Drop programs that are globally hidden, then sort by either
      // the skill's per-skill programOrder (admin-curated) or the
      // global ProgramOrder.order as a fallback.
      const visible = nested.filter(
        (p) => !programOrderMap[programIdOf(p)]?.isHidden
      );
      const skillProgramOrder = stored?.programOrder ?? [];
      if (skillProgramOrder.length > 0) {
        const indexOf = (p) => {
          const idx = skillProgramOrder.indexOf(programIdOf(p));
          return idx === -1 ? Number.POSITIVE_INFINITY : idx;
        };
        visible.sort((a, b) => indexOf(a) - indexOf(b));
      } else {
        visible.sort((a, b) => {
          const oa = programOrderMap[programIdOf(a)]?.order ?? 999;
          const ob = programOrderMap[programIdOf(b)]?.order ?? 999;
          return oa - ob;
        });
      }
      return { ...skill, programs: visible };
    });
}

export async function saveSkillOrder(orderedIds) {
  await requireAdmin('programs');
  await dbConnect();

  const ops = (orderedIds ?? []).map((id, index) => ({
    updateOne: {
      filter: { skillId: String(id) },
      update: { $set: { order: index } },
      upsert: true,
    },
  }));
  if (ops.length > 0) await SkillOrder.bulkWrite(ops);

  revalidatePath('/');
  revalidatePath('/training-course');
  triggerLandingSync();
  return { ok: true };
}

export async function saveSkillProgramOrder(skillId, orderedProgramIds) {
  await requireAdmin('programs');
  await dbConnect();
  await SkillOrder.findOneAndUpdate(
    { skillId: String(skillId) },
    { $set: { programOrder: (orderedProgramIds ?? []).map(String) } },
    { upsert: true }
  );
  revalidatePath('/');
  triggerLandingSync();
  return { ok: true };
}

export async function toggleSkillHidden(skillId, isHidden) {
  await requireAdmin('programs');
  await dbConnect();
  await SkillOrder.findOneAndUpdate(
    { skillId: String(skillId) },
    { $set: { isHidden: Boolean(isHidden) } },
    { upsert: true }
  );
  revalidatePath('/');
  triggerLandingSync();
  return { ok: true };
}
