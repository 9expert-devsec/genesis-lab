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

/**
 * Which program/skill chips may become links, and where they point.
 *
 * The trap this closes: linking a chip unconditionally produces links into
 * 404s. Both /program/[slug] and /skill/[slug] — and the catch-all that
 * serves the pretty URLs — call notFound() when `config.isPublished ===
 * false`, so a chip must only become a link when its destination actually
 * resolves AND is published.
 *
 * Three states per entity, and the middle one is easy to get wrong:
 *   - config exists, isPublished === false  -> NOT linkable
 *   - config exists, published              -> linkable (custom slug if set)
 *   - NO config at all                      -> linkable via the legacy path.
 *     `notFound()` fires only on an explicit `false`; a missing config is
 *     not "unpublished", and resolvePageSlug's kebab fallback still finds
 *     the record. Treating no-config as unpublished would silently kill
 *     every chip for entities the admin never opened.
 *
 * One indexed read per collection, resolved once per page render — not per
 * chip, and never from the client.
 *
 * @returns {{
 *   programSlugs: Record<string,string>, skillSlugs: Record<string,string>,
 *   programBlocked: Set<string>, skillBlocked: Set<string>,
 * }} slug maps keyed like the ones getNavMenuData builds (lower-cased id),
 *    plus the lower-cased ids whose page is explicitly unpublished.
 */
export async function getPageLinkability() {
  const empty = {
    programSlugs: {}, skillSlugs: {},
    programBlocked: new Set(), skillBlocked: new Set(),
  };
  try {
    await dbConnect();
    const [programConfigs, skillConfigs] = await Promise.all([
      ProgramPageConfig.find({}).select('programId urlSlug isPublished').lean(),
      SkillPageConfig.find({}).select('skillId urlSlug isPublished').lean(),
    ]);

    const build = (rows, idField) => {
      const slugs = {};
      const blocked = new Set();
      for (const row of rows) {
        const key = String(row?.[idField] ?? '').toLowerCase();
        if (!key) continue;
        if (row.isPublished === false) { blocked.add(key); continue; }
        const slug = row.urlSlug?.trim();
        if (slug) slugs[key] = slug;
      }
      return { slugs, blocked };
    };

    const p = build(programConfigs, 'programId');
    const s = build(skillConfigs, 'skillId');
    return {
      programSlugs: p.slugs, skillSlugs: s.slugs,
      programBlocked: p.blocked, skillBlocked: s.blocked,
    };
  } catch {
    // Fail closed on the LINK, not on the page: no maps means every chip
    // renders as the plain <span> it is today.
    return empty;
  }
}
