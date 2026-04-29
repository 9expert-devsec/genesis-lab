'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import ProgramOrder from '@/models/ProgramOrder';
import SkillOrder from '@/models/SkillOrder';
import { auth } from '@/lib/auth/options';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';

async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
}

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
  await requireAdmin();
  await dbConnect();

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
  await requireAdmin();
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

export async function toggleProgramHidden(programId, isHidden) {
  await requireAdmin();
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
  await requireAdmin();
  await dbConnect();

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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
