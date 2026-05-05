/**
 * Resolve a public /program/[slug] or /skill/[slug] URL to its upstream
 * record. Resolution order:
 *
 *   1. ProgramPageConfig.urlSlug / SkillPageConfig.urlSlug — admin-set
 *      pretty URL.
 *   2. program_id / skill_id (case-insensitive) — short upstream code,
 *      e.g. /program/dev or /skill/ai.
 *   3. kebab-case of program_name / skill_name as a last fallback so
 *      links like /program/microsoft-excel work without explicit config.
 */

import { dbConnect } from '@/lib/db/connect';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import { toKebab } from '@/lib/slug';

export { toKebab };

function programIdOf(p) {
  return String(p?.program_id ?? p?._id ?? '');
}

function skillIdOf(s) {
  return String(s?.skill_id ?? s?._id ?? '');
}

export async function resolveProgramBySlug(slug, programs) {
  if (!slug) return null;
  await dbConnect();

  const bySlug = await ProgramPageConfig.findOne({ urlSlug: slug }).lean();
  if (bySlug) {
    const match = (programs ?? []).find(
      (p) => programIdOf(p).toLowerCase() === String(bySlug.programId).toLowerCase()
    );
    if (match) {
      return { program: match, config: JSON.parse(JSON.stringify(bySlug)) };
    }
  }

  const lower = slug.toLowerCase();
  const fallback = (programs ?? []).find((p) => {
    if (programIdOf(p).toLowerCase() === lower) return true;
    if (toKebab(p?.program_name) === lower) return true;
    return false;
  });
  if (!fallback) return null;

  const config = await ProgramPageConfig.findOne({
    programId: programIdOf(fallback),
  }).lean();
  return {
    program: fallback,
    config: config ? JSON.parse(JSON.stringify(config)) : null,
  };
}

export async function resolveSkillBySlug(slug, skills) {
  if (!slug) return null;
  await dbConnect();

  const bySlug = await SkillPageConfig.findOne({ urlSlug: slug }).lean();
  if (bySlug) {
    const match = (skills ?? []).find(
      (s) => skillIdOf(s).toLowerCase() === String(bySlug.skillId).toLowerCase()
    );
    if (match) {
      return { skill: match, config: JSON.parse(JSON.stringify(bySlug)) };
    }
  }

  const lower = slug.toLowerCase();
  const fallback = (skills ?? []).find((s) => {
    if (skillIdOf(s).toLowerCase() === lower) return true;
    if (toKebab(s?.skill_name) === lower) return true;
    return false;
  });
  if (!fallback) return null;

  const config = await SkillPageConfig.findOne({
    skillId: skillIdOf(fallback),
  }).lean();
  return {
    skill: fallback,
    config: config ? JSON.parse(JSON.stringify(config)) : null,
  };
}
