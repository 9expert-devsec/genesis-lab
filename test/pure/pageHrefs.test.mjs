import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipHref, courseHref, programHref, skillHref } from '@/lib/utils';

/**
 * programHref / skillHref — the consolidated URL builders, and the chip
 * linkability rule that decides whether a chip may become a link at all.
 *
 * These replaced three near-identical copies (public header mega-menu, home
 * ProgramSelector, and a third route since removed) that had drifted apart in
 * two ways: which id fields they looked up, and what they fell back to. The
 * drift was invisible because each site is handed a DIFFERENT object shape, so
 * no site exercised another site's path. That is what the shape-specific cases
 * below pin down. TWO call sites remain; the shape matrix below is unchanged by
 * the removal — it covers SHAPES, not sites, and both surviving sites pass the
 * config-entry and API-item shapes.
 */

// The three real shapes, as measured against live data.
const CONFIG_SKILL = {                       // config/site.js entry
  slug: 'programming', upstreamId: '68d4f5b3581cb350290597de',
  upstreamCode: 'DEV', label: 'Development',
};
const API_SKILL = {                          // /skills item (and course.skills)
  _id: '68d4f5b3581cb350290597de', skill_id: 'DEV', skill_name: 'Development',
};
const PROGRAM = { _id: '650000000000000000000001', program_id: 'PBI', program_name: 'Power BI' };

// SkillPageConfig.skillId holds the CODE, so the map is keyed by codes.
const SKILL_SLUGS = { dev: 'programming-all-courses', ai: 'ai-all-courses' };
const PROGRAM_SLUGS = { pbi: 'power-bi-all-courses' };

test('a custom slug renders at the bare path, no /program prefix', () => {
  assert.equal(programHref(PROGRAM, PROGRAM_SLUGS), '/power-bi-all-courses');
});

test('a program without a custom slug falls back to the legacy path', () => {
  assert.equal(programHref(PROGRAM, {}), '/program/power-bi');
});

test('program lookup prefers program_id over _id', () => {
  const both = { program_id: 'PBI', _id: 'XYZ', program_name: 'Power BI' };
  assert.equal(
    programHref(both, { pbi: 'by-code', xyz: 'by-objectid' }),
    '/by-code'
  );
});

/**
 * THE SHAPE MATRIX. Every caller shape must reach the same custom slug. The
 * bug this replaced: callers keying skills by `upstreamId` (an ObjectId) —
 * the header among them — while the config map is keyed by the CODE, so they
 * never matched and emitted a legacy URL that redirected — or, for
 * Development, 404'd.
 */
test('every caller shape resolves a skill to the same custom slug', () => {
  assert.equal(skillHref(CONFIG_SKILL, SKILL_SLUGS), '/programming-all-courses');
  assert.equal(skillHref(API_SKILL, SKILL_SLUGS), '/programming-all-courses');
  assert.equal(
    skillHref({ skill_id: 'DEV', skill_name: 'Development' }, SKILL_SLUGS),
    '/programming-all-courses'
  );
});

test('upstreamCode is consulted — without it the config shape misses entirely', () => {
  // CONFIG_SKILL's only key that appears in the map is upstreamCode.
  const codeOnly = { upstreamId: '68d4f5b3581cb350290597de', upstreamCode: 'DEV', slug: 'programming' };
  assert.equal(skillHref(codeOnly, SKILL_SLUGS), '/programming-all-courses');
  // Drop the code and it falls back to the legacy path — this is exactly the
  // pre-fix behaviour, kept here so the reason for the key is legible.
  const { upstreamCode, ...withoutCode } = codeOnly;
  assert.equal(skillHref(withoutCode, SKILL_SLUGS), '/skill/programming');
});

test('the skill fallback prefers an explicit slug over the kebab-cased name', () => {
  // "Development" is configured as "programming"; deriving from the name
  // would produce /skill/development, a different (and unresolvable) URL.
  assert.equal(skillHref({ slug: 'programming', skill_name: 'Development' }, {}), '/skill/programming');
  assert.equal(skillHref({ skill_name: 'Power Platform' }, {}), '/skill/power-platform');
  assert.equal(skillHref({ label: 'Power Platform' }, {}), '/skill/power-platform');
});

test('key precedence is first-match-wins in a fixed order', () => {
  const all = { upstreamId: 'A', _id: 'B', skill_id: 'C', upstreamCode: 'D' };
  assert.equal(skillHref(all, { a: 'w', b: 'x', c: 'y', d: 'z' }), '/w');
  assert.equal(skillHref({ _id: 'B', skill_id: 'C', upstreamCode: 'D' }, { b: 'x', c: 'y', d: 'z' }), '/x');
  assert.equal(skillHref({ skill_id: 'C', upstreamCode: 'D' }, { c: 'y', d: 'z' }), '/y');
  assert.equal(skillHref({ upstreamCode: 'D' }, { d: 'z' }), '/z');
});

test('missing input degrades to the catalogue rather than a broken URL', () => {
  assert.equal(programHref(null), '/training-course');
  assert.equal(skillHref(null), '/training-course');
  assert.equal(courseHref(null), '/training-course');
});

/**
 * CHIP LINKABILITY — the three-state rule.
 *
 * Both /program/[slug] and /skill/[slug] (and the catch-all serving the
 * pretty URLs) call notFound() when `config.isPublished === false`, so a
 * chip must only become a link when its destination resolves AND is
 * published. The middle state is the one a future edit is most likely to
 * get wrong: a MISSING config is not "unpublished". notFound() fires only
 * on an explicit `false`, and resolvePageSlug's kebab fallback still finds
 * the record — so treating absent-as-unpublished would silently unlink
 * every chip for entities the admin never opened.
 */
const LINKABILITY = {
  programSlugs: PROGRAM_SLUGS,
  skillSlugs: SKILL_SLUGS,
  programBlocked: new Set(['blockedprog']),
  skillBlocked: new Set(['blockedskill']),
};

test('linkability: an unpublished skill yields NO href', () => {
  const blocked = { skill_id: 'BLOCKEDSKILL', skill_name: 'Blocked' };
  assert.equal(chipHref(blocked, 'skill', LINKABILITY, skillHref), null);
});

test('linkability: an unpublished program yields NO href', () => {
  const blocked = { program_id: 'BLOCKEDPROG', program_name: 'Blocked' };
  assert.equal(chipHref(blocked, 'program', LINKABILITY, programHref), null);
});

test('linkability CONTROL: the same entities DO link once unblocked', () => {
  // Without this the blocked cases could pass by never linking anything.
  const open = { ...LINKABILITY, programBlocked: new Set(), skillBlocked: new Set() };
  assert.equal(
    chipHref({ skill_id: 'BLOCKEDSKILL', skill_name: 'Blocked' }, 'skill', open, skillHref),
    '/skill/blocked'
  );
  assert.equal(
    chipHref({ program_id: 'BLOCKEDPROG', program_name: 'Blocked' }, 'program', open, programHref),
    '/program/blocked'
  );
});

test('linkability: a MISSING config still links — absent is not unpublished', () => {
  assert.equal(
    chipHref({ skill_id: 'NOCONFIG', skill_name: 'No Config' }, 'skill', LINKABILITY, skillHref),
    '/skill/no-config'
  );
  assert.equal(
    chipHref({ program_id: 'NOCONFIG', program_name: 'No Config' }, 'program', LINKABILITY, programHref),
    '/program/no-config'
  );
});

test('linkability: blocking is checked across EVERY id the entity carries', () => {
  // A blocked entity must stay blocked whichever id the config was keyed by.
  const byObjectId = { ...LINKABILITY, skillBlocked: new Set(['68d4f5b3581cb350290597de']) };
  assert.equal(chipHref(API_SKILL, 'skill', byObjectId, skillHref), null);
  assert.equal(chipHref(CONFIG_SKILL, 'skill', byObjectId, skillHref), null);
});

test('linkability: a nullish entity is never linkable', () => {
  assert.equal(chipHref(null, 'skill', LINKABILITY, skillHref), null);
  assert.equal(chipHref(undefined, 'program', LINKABILITY, programHref), null);
});

/**
 * ── NO EMITTED URL MAY REDIRECT ────────────────────────────────────
 *
 * The rule: if an entity has a published page config with a urlSlug, the
 * emitted href must BE that canonical slug. Emitting the legacy
 * /skill/<slug> or /program/<kebab> path instead is not merely untidy —
 * resolvePageSlug redirects it (a wasted hop), or fails to resolve it at
 * all and 404s. `/skill/programming` did exactly that: SKILLS_CONFIG
 * configures Development as "programming", but nothing resolves that
 * string, so the header mega-menu carried a dead link.
 *
 * This models resolveProgramBySlug / resolveSkillBySlug's redirect rule as
 * a pure fixed-point check, so it runs with no DB: emit a URL, resolve it,
 * and require the result to equal the input.
 *
 * It runs against the REAL config/site.js entries — the exact shape the
 * header and the home ProgramSelector pass — with a slug map mirroring the live
 * SkillPageConfig rows (keyed by code, verified: 0 of 6 keys are
 * ObjectId-shaped). Reverting the `upstreamCode` key makes every skill
 * here fail.
 */
const LIVE_SKILL_SLUGS = {
  ai: 'ai-all-courses',
  business: 'business-all-courses',
  data: 'data-all-courses',
  dev: 'programming-all-courses',
  powerplatform: 'power-platform-all-courses',
  rpa: 'rpa-all-courses',
};

/** The canonical URL for an entity that has a configured urlSlug. */
function canonicalFor(entity, slugMap, keys) {
  for (const k of keys) {
    const v = entity?.[k];
    if (!v) continue;
    const slug = slugMap[String(v).toLowerCase()];
    if (slug) return `/${slug}`;
  }
  return null;
}

test('every skill shape emits its CANONICAL url, never one that redirects', async (t) => {
  const { skills: SKILLS_CONFIG } = await import('@/config/site');
  assert.ok(SKILLS_CONFIG.length >= 6, 'expected the real skills config');

  const offenders = [];
  for (const s of SKILLS_CONFIG) {
    const emitted = skillHref(s, LIVE_SKILL_SLUGS);
    const canonical = canonicalFor(s, LIVE_SKILL_SLUGS, ['upstreamId', '_id', 'skill_id', 'upstreamCode']);
    if (canonical && emitted !== canonical) offenders.push(`${s.label}: emitted ${emitted}, canonical ${canonical}`);
  }
  assert.deepEqual(offenders, [], `these skills emit a redirecting URL:\n  ${offenders.join('\n  ')}`);
});

test('the same holds for the /skills API shape', () => {
  const apiShape = [
    { _id: '68d4f556581cb350290597d1', skill_id: 'AI', skill_name: 'AI' },
    { _id: '68d4f5b3581cb350290597de', skill_id: 'DEV', skill_name: 'Development' },
    { _id: '68d3c5af2c6a2f1315c0bcdc', skill_id: 'POWERPLATFORM', skill_name: 'Power Platform' },
  ];
  for (const s of apiShape) {
    const canonical = canonicalFor(s, LIVE_SKILL_SLUGS, ['upstreamId', '_id', 'skill_id', 'upstreamCode']);
    assert.equal(skillHref(s, LIVE_SKILL_SLUGS), canonical, s.skill_name);
  }
});

test('programs emit their canonical url too', () => {
  const slugs = { pbi: 'power-bi-all-courses', dev: 'dot-net-all-courses' };
  const progs = [
    { program_id: 'PBI', _id: '650000000000000000000001', program_name: 'Power BI' },
    { program_id: 'DEV', _id: '650000000000000000000002', program_name: '.NET' },
  ];
  for (const p of progs) {
    const canonical = canonicalFor(p, slugs, ['program_id', '_id']);
    assert.equal(programHref(p, slugs), canonical, p.program_name);
  }
});

test('CONTROL: an entity with NO configured slug legitimately emits the legacy path', () => {
  // The fixed-point rule must not be satisfiable by emitting nothing, and
  // the legacy path is still correct when there is no canonical URL to use.
  assert.equal(skillHref({ skill_id: 'UNCONFIGURED', skill_name: 'Unconfigured' }, LIVE_SKILL_SLUGS),
    '/skill/unconfigured');
  assert.equal(canonicalFor({ skill_id: 'UNCONFIGURED' }, LIVE_SKILL_SLUGS, ['skill_id']), null);
});
