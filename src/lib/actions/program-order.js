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
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';

/**
 * ── EVERY WRITE IN THIS FILE IS A BUTTON PRESS ─────────────────────────────
 *
 * Checked before instrumenting rather than assumed: the eight mutating exports
 * below are called from exactly two admin client components —
 * /admin/programs (ProgramOrderClient, SkillOrderClient) and /admin/courses
 * (CoursesAdminClient). NO cron route imports this module; the six under
 * src/app/api/cron reach syncCareerPaths, syncFaqs, syncInstructors,
 * syncLandingData, syncNavMenuData and syncPromotions, none of which is here.
 *
 * That is why every row below carries the session's actor and none invents a
 * system one. Where a function CAN be reached by both a person and a job, this
 * repo's answer is to write the row at the human call site instead of inside
 * the shared function — /api/admin/navmenu/sync does exactly that, and says so:
 * a row written inside syncNavMenuData would record the 3-hourly cron as an
 * admin action eight times a day and drown the presses the trail exists for.
 * Nothing in this file needs that treatment, and if a cron ever calls one of
 * these, the row has to move to the caller rather than gain a fake actor.
 *
 * ── SIZES, MEASURED AGAINST THE 2 KB PER-FIELD CAP ─────────────────────────
 * `MAX_PAYLOAD_CHARS` is 2000 (lib/audit/recordAdminAction). Every ordered list
 * written here fits it today, measured 2026-08-15 against production:
 *
 *   saveProgramCourseOrder  largest group SQL, 16 codes →  236 chars
 *   saveProgramOrder        all 27 programme ids        →  220 chars
 *   saveSkillProgramOrder   largest BUSINESS, 12 ids    →  109 chars
 *   saveSkillOrder          all 8 skill ids             →   79 chars
 *
 * So `ordered_ids` records the real list rather than a count — the 79-course
 * figure is the WHOLE CATALOGUE, not one group, and no programme holds more
 * than 16. The count still goes in `meta` alongside: if a catalogue ever grows
 * past the cap, `capPayload` replaces `after` with a truncation marker, and
 * `meta.count` is what survives to say how big the list was.
 */

/**
 * The recordId for the two COLLECTION-WIDE actions.
 *
 * `saveProgramOrder` and `syncProgramsFromAPI` rewrite the whole set rather
 * than one row, so there is no per-record id to file them under. A stable
 * singleton key gives the set its own history series — the shape
 * /admin/cache already uses for `navmenu_v1` and `homepage_v1`.
 */
const PROGRAM_ORDER_RECORD = 'program_order_all';
const SKILL_ORDER_RECORD = 'skill_order_all';

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
  const session = await requireAdmin('programs');
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

  /**
   * COUNTS IN META, not the list. `count_only` NULLS before/after by policy, so
   * the numbers are the whole record of what happened — the same `{synced,
   * errors}` shape /api/admin/navmenu/sync uses. `synced` is what the upsert
   * loop was handed; `errors` is 0 because the loop above awaits each upsert
   * and a failure would have thrown out of this function before reaching here.
   * The detail is not lost by accident: a sync's outcome IS a count.
   */
  recordAdminActionAfter({
    menu:        'programs',
    action:      'sync',
    entity:      'program_sync',
    recordId:    PROGRAM_ORDER_RECORD,
    recordLabel: 'ลำดับโปรแกรมทั้งหมด (program_orders)',
    meta:        { synced: (apiPrograms ?? []).length, errors: 0, rows: orderRows.length },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

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
  const session = await requireAdmin('programs');
  await dbConnect();

  const ops = (orderedIds ?? []).map((id, index) => ({
    updateOne: {
      filter: { programId: String(id) },
      update: { $set: { order: index } },
      upsert: true,
    },
  }));
  if (ops.length > 0) await ProgramOrder.bulkWrite(ops);

  // `ordered_ids` keeps the LIST — the set is the event. `meta.count` rides
  // alongside so that if the catalogue ever outgrows the 2 KB cap and `after`
  // becomes a truncation marker, the size of the change still survives.
  recordAdminActionAfter({
    menu:        'programs',
    action:      'reorder',
    entity:      'program_order',
    recordId:    PROGRAM_ORDER_RECORD,
    recordLabel: 'ลำดับโปรแกรมทั้งหมด',
    after:       { orderedIds: (orderedIds ?? []).map(String) },
    meta:        { count: (orderedIds ?? []).length },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

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
  const session = await requireAdmin('courses');
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

  /**
   * THE ROW THIS WHOLE ROUND WAS FOR — "who reordered this group".
   *
   * `recordId` is the PROGRAMME code, not a course: the record that changed is
   * the ProgramOrder document for that group. Note what that means on a menu
   * already documented as dual-key — `courses` filed rows under an MSDB `_id`
   * (the course) and a `course_id` CODE (its extension), and this is a THIRD
   * key space. The documented read `{menu:'courses', recordId:{$in:[msdbId,
   * courseId]}}` will not surface these, which is correct rather than
   * unfortunate: the event is about the group, not about any one course in it.
   * Findable from what exists now by the programme code, which a rename of a
   * COURSE does not touch.
   *
   * The list is recorded, not a count — largest real group is 16 codes at 236
   * chars against a 2000 cap. `meta.count` is the survivor if that ever flips.
   */
  recordAdminActionAfter({
    menu:        'courses',
    action:      'reorder',
    entity:      'course_order',
    recordId:    id,
    recordLabel: `ลำดับหลักสูตรในโปรแกรม ${id}`,
    after:       { orderedIds: codes },
    meta:        { count: codes.length },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

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
  const session = await requireAdmin('programs');
  await dbConnect();
  const id = String(programId);
  await ProgramOrder.findOneAndUpdate(
    { programId: id },
    { $set: { isHidden: Boolean(isHidden) } },
    { upsert: true }
  );

  /**
   * A one-field change, so the `full` policy earns its keep: `after` carries
   * the boolean itself rather than a count. NO `before` — the caller passes the
   * value it is toggling FROM, and a `before` reconstructed from an argument is
   * a claim about the caller, not about the row that was there.
   */
  recordAdminActionAfter({
    menu:        'programs',
    action:      'toggle',
    entity:      'program',
    recordId:    id,
    recordLabel: `โปรแกรม ${id}`,
    after:       { isHidden: Boolean(isHidden) },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  revalidatePath('/');
  triggerLandingSync();
  return { ok: true };
}

// ── Skills ──────────────────────────────────────────────────────────

export async function syncSkillsFromAPI(apiSkills) {
  const session = await requireAdmin('programs');
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

  // Counts, for the reason given on syncProgramsFromAPI: `count_only` nulls
  // before/after by policy, and a sync's outcome IS a count.
  recordAdminActionAfter({
    menu:        'programs',
    action:      'sync',
    entity:      'skill_sync',
    recordId:    SKILL_ORDER_RECORD,
    recordLabel: 'ลำดับ Skill ทั้งหมด (skill_orders)',
    meta:        { synced: (apiSkills ?? []).length, errors: 0, rows: orderRows.length },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

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
  const session = await requireAdmin('programs');
  await dbConnect();

  const ops = (orderedIds ?? []).map((id, index) => ({
    updateOne: {
      filter: { skillId: String(id) },
      update: { $set: { order: index } },
      upsert: true,
    },
  }));
  if (ops.length > 0) await SkillOrder.bulkWrite(ops);

  recordAdminActionAfter({
    menu:        'programs',
    action:      'reorder',
    entity:      'skill_order',
    recordId:    SKILL_ORDER_RECORD,
    recordLabel: 'ลำดับ Skill ทั้งหมด',
    after:       { orderedIds: (orderedIds ?? []).map(String) },
    meta:        { count: (orderedIds ?? []).length },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  revalidatePath('/');
  revalidatePath('/training-course');
  triggerLandingSync();
  return { ok: true };
}

export async function saveSkillProgramOrder(skillId, orderedProgramIds) {
  const session = await requireAdmin('programs');
  await dbConnect();
  const id = String(skillId);
  const ordered = (orderedProgramIds ?? []).map(String);
  await SkillOrder.findOneAndUpdate(
    { skillId: id },
    { $set: { programOrder: ordered } },
    { upsert: true }
  );

  // Its OWN entity, not `skill_order`: this is the order of PROGRAMMES inside
  // one skill, keyed by that skill. Sharing the pair would file two different
  // questions onto one record id and interleave their histories.
  recordAdminActionAfter({
    menu:        'programs',
    action:      'reorder',
    entity:      'skill_program_order',
    recordId:    id,
    recordLabel: `ลำดับโปรแกรมใน Skill ${id}`,
    after:       { orderedIds: ordered },
    meta:        { count: ordered.length },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  revalidatePath('/');
  triggerLandingSync();
  return { ok: true };
}

export async function toggleSkillHidden(skillId, isHidden) {
  const session = await requireAdmin('programs');
  await dbConnect();
  const id = String(skillId);
  await SkillOrder.findOneAndUpdate(
    { skillId: id },
    { $set: { isHidden: Boolean(isHidden) } },
    { upsert: true }
  );

  // Same shape as toggleProgramHidden, and no `before` for the same reason.
  recordAdminActionAfter({
    menu:        'programs',
    action:      'toggle',
    entity:      'skill',
    recordId:    id,
    recordLabel: `Skill ${id}`,
    after:       { isHidden: Boolean(isHidden) },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  revalidatePath('/');
  triggerLandingSync();
  return { ok: true };
}
