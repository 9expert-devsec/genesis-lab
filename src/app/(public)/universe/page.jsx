import { listPrograms } from '@/lib/api/programs';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getNavMenuData } from '@/lib/navmenu/getNavMenuData';
import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { skills as SKILLS_CONFIG } from '@/config/site';
import { toKebab } from '@/lib/slug';
import { UniverseClient } from './_components/UniverseClient';

/**
 * "Universe of 9Expert Training" — an immersive presentation of our
 * six Skills as planets orbiting the 9Expert sun; each skill planet
 * carries the Programs whose cached courses intersect it.
 *
 * Server Component: loads programs + the nav-menu snapshot (same best-effort
 * pattern as PublicHeader), then shapes a lightweight `planets` array that
 * crosses to the client experience. Every fetch degrades to empty so the
 * page always renders — the hero shows regardless and the galaxy section
 * has its own empty state.
 */

export const metadata = {
  title: 'Universe of 9Expert Training | จักรวาลแห่งการเรียนรู้',
  description:
    'สำรวจจักรวาลแห่งการเรียนรู้ของ 9Expert — โปรแกรมและหลักสูตรด้าน Data, AI, Business และ Technology ในรูปแบบดวงดาวที่โคจรรอบดวงอาทิตย์แห่งความรู้',
  alternates: { canonical: '/universe' },
};

/** Max programs listed per skill planet. */
const MAX_PROGRAMS_PER_SKILL = 6;

/** Max masterclass comets in Act 4. */
const MAX_COMETS = 3;

/** Max career-path constellations in Act 5. */
const MAX_CONSTELLATIONS = 4;

/**
 * Canonical company stats — same figures as the about-us page. Do not
 * invent different numbers here; update both places together.
 */
const STATS = [
  { value: 90, suffix: 'K+', label: 'ผู้เรียน' },
  { value: 5, suffix: 'K+', label: 'องค์กร' },
  { value: 4.9, suffix: '', label: 'คะแนนรีวิว', decimals: 1 },
  { value: 700, suffix: 'K+', label: 'ผู้ติดตาม' },
  { value: 73, suffix: '', label: 'หลักสูตร' },
];

/**
 * Shape masterclasses into Act 4 "comets": one card per course that has
 * at least one open/full batch, showing its next upcoming batch (first
 * batch with a future date; falls back to the first batch).
 */
function shapeComets(masterclasses) {
  const comets = [];
  const now = Date.now();
  for (const mc of masterclasses) {
    if (comets.length >= MAX_COMETS) break;
    const batches = Array.isArray(mc.batches) ? mc.batches : [];
    if (batches.length === 0 || !mc.slug) continue;

    const upcoming = batches.find((b) =>
      (Array.isArray(b.dates) ? b.dates : []).some(
        (d) => d?.date && new Date(d.date).getTime() > now
      )
    );
    const batch = upcoming ?? batches[0];

    comets.push({
      slug: mc.slug,
      title_th: mc.title_th ?? '',
      subtitle_th: mc.subtitle_th ?? '',
      href: `/masterclass/${mc.slug}`,
      batchLabel: batch.batch_label || `รุ่นที่ ${batch.batch_no}`,
      dayLabels: (Array.isArray(batch.dates) ? batch.dates : [])
        .map((d) => d?.day_label)
        .filter(Boolean)
        .slice(0, 2),
      isEarlyBird: !!batch.is_early_bird,
      effectivePrice: batch.effective_price ?? null,
      originalPrice: batch.original_price ?? null,
      earlyBirdDeadline: batch.early_bird_deadline ?? null,
      seatsLeft: Math.max((batch.capacity ?? 0) - (batch.registered_count ?? 0), 0),
      isFull: batch.status === 'full',
      gradientFrom: mc.hero_gradient_from ?? '#2486FF',
      gradientTo: mc.hero_gradient_to ?? '#005CFF',
    });
  }
  return comets;
}

/**
 * Shape career paths into Act 5 "constellations": the first 6 unique
 * course names from the flattened curriculum become the stars. Paths
 * with fewer than 3 stars can't draw a meaningful line — skip them.
 */
function shapeConstellations(careerPaths) {
  const out = [];
  for (const path of careerPaths) {
    if (out.length >= MAX_CONSTELLATIONS) break;
    if (!path.api_slug) continue;

    const seen = new Set();
    const stars = [];
    for (const block of Array.isArray(path.curriculum) ? path.curriculum : []) {
      for (const item of Array.isArray(block?.items) ? block.items : []) {
        // Same name resolution as CareerPathRegisterClient's itemName()
        const name = item?.snap?.name ?? item?.externalName ?? '';
        if (!name || seen.has(name)) continue;
        seen.add(name);
        stars.push(name);
        if (stars.length >= 6) break;
      }
      if (stars.length >= 6) break;
    }
    if (stars.length < 3) continue;

    out.push({ title: path.title ?? '', href: `/${path.api_slug}`, stars });
  }
  return out;
}

/**
 * Build the public href for a program — mirrors programHref() in
 * PublicHeaderClient.jsx: a custom admin slug renders at the bare slug,
 * otherwise fall back to the legacy /program/<kebab> path.
 */
function programHref(id, programName, programSlugs) {
  const custom = programSlugs?.[id.toLowerCase()];
  if (custom) return `/${custom}`;
  return `/program/${toKebab(programName)}`;
}

/**
 * Build the public href for a skill — mirrors skillHref() in
 * PublicHeaderClient.jsx: an admin-set custom slug (keyed by lower-cased
 * upstreamId) renders at the bare slug, else the legacy /skill/<slug>.
 */
function skillHref(skill, skillSlugs) {
  const custom = skillSlugs?.[skill.upstreamId?.toLowerCase?.()];
  return custom ? `/${custom}` : `/skill/${skill.slug}`;
}

export default async function UniversePage() {
  const [orderedPrograms, navMenuData, masterclasses, careerPaths] = await Promise.all([
    listPrograms()
      .then((result) => getOrderedPrograms(result.items))
      .catch(() => []),
    getNavMenuData().catch(() => ({
      programs: {},
      skills: {},
      programSlugs: {},
      skillSlugs: {},
    })),
    getPublishedMasterclasses().catch(() => []),
    getActiveCareerPaths().catch(() => []),
  ]);

  // ── Intermediate: shape ALL programs with a cached course entry ────
  // (same public-course-browser philosophy as PublicHeader). Programs
  // are no longer the page payload — they feed the skill→programs
  // derivation below and the per-skill program lists.
  const programCatalog = [];
  for (const p of orderedPrograms) {
    const id = String(p.program_id ?? p._id ?? '');
    const entry = navMenuData.programs?.[id];
    if (!entry || !Array.isArray(entry.items) || entry.items.length === 0) {
      continue; // empty / online-only program — nothing to show
    }
    programCatalog.push({
      name: p.program_name ?? '',
      href: programHref(id, p.program_name, navMenuData.programSlugs),
      courseIds: entry.items.map((c) => String(c.course_id)),
    });
  }

  // ── The planets are the 6 skills (SKILLS_CONFIG order) ─────────────
  // skill→programs derivation, no extra API calls: a program belongs to
  // a skill when its cached course_ids intersect the skill's cached
  // course_ids; ranked by overlap size.
  const planets = [];
  for (const skill of SKILLS_CONFIG) {
    const entry = navMenuData.skills?.[skill.upstreamId];
    const items = Array.isArray(entry?.items) ? entry.items : [];
    if (items.length === 0) continue; // unsynced/empty skill — skip

    const courseSet = new Set(items.map((c) => String(c.course_id)));
    const programs = programCatalog
      .map((program) => ({
        name: program.name,
        href: program.href,
        matchCount: program.courseIds.filter((cid) => courseSet.has(cid)).length,
      }))
      .filter((program) => program.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, MAX_PROGRAMS_PER_SKILL);

    planets.push({
      id: skill.upstreamId,
      name: skill.label,
      slug: skill.slug,
      iconUrl: skill.iconUrl,
      href: skillHref(skill, navMenuData.skillSlugs),
      courseCount: items.length,
      programs,
    });
  }

  // Guarantee plain serializable values across the server→client boundary.
  const safe = JSON.parse(
    JSON.stringify({
      planets,
      comets: shapeComets(masterclasses),
      constellations: shapeConstellations(careerPaths),
      stats: STATS,
    })
  );

  return (
    <UniverseClient
      planets={safe.planets}
      comets={safe.comets}
      constellations={safe.constellations}
      stats={safe.stats}
    />
  );
}
