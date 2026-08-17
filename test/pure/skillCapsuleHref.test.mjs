import { test } from 'node:test';
import assert from 'node:assert/strict';

import { skillCapsuleHref } from '@/lib/skillCapsuleHref';
import { skillHref } from '@/lib/utils';

/**
 * The capsule resolver: hit the slug map or return null.
 *
 * Every fixture below is the LIVE shape, measured 2026-08-17 against
 * `SkillPageConfig` (8 rows, all published, all keyed by short code) and the
 * upstream `/skills` list (7 skills). The Development case is not a synthetic
 * edge — it is the one live skill whose displayed text and whose URL do not
 * share a stem.
 */

/** The live map, exactly as getNavMenuData builds it (lower-cased skillId). */
const LIVE_SLUGS = {
  ai: 'ai-all-courses',
  aut: 'automation-all-courses',
  business: 'business-all-courses',
  data: 'data-all-courses',
  des: 'design-all-courses',
  dev: 'programming-all-courses',
  powerplatform: 'power-platform-all-courses',
  rpa: 'rpa-all-courses', // the stale row Round A found; still published
};

/** A `course.skills[]` subdoc, the shape both capsule renderers receive. */
const subdoc = (over = {}) => ({
  _id: '68d4f5b3581cb350290597de',
  skill_id: 'DEV',
  skill_name: 'Development',
  skilliconurl: 'https://res.cloudinary.com/x.svg',
  skillcolor: '#dee6f1',
  ...over,
});

// ── the Development case, both directions ──────────────────────────────────

test('Development resolves by skill_id to the PROGRAMMING url', () => {
  assert.equal(
    skillCapsuleHref({ skill_name: 'Development', skill_id: 'DEV' }, LIVE_SLUGS),
    '/programming-all-courses'
  );
});

test('Development with NO ids returns null, not a development-shaped url', () => {
  const href = skillCapsuleHref({ skill_name: 'Development' }, LIVE_SLUGS);
  assert.equal(href, null);
  // Stated separately from the null: if this ever starts deriving a URL, the
  // assertion above tells you it returned something and this one tells you the
  // something was built out of the displayed text.
  assert.ok(
    href === null || !/development/i.test(href),
    `derived a URL from skill_name: ${href}`
  );
});

test('skill_name is never a lookup key, even when the map contains it', () => {
  /**
   * The sharpest form of the rule. If the resolver ever indexed by the
   * displayed string, THIS map would make it succeed — and succeed with a URL
   * that is wrong for the live data, since `Development` lives at
   * /programming-all-courses.
   */
  const trap = { ...LIVE_SLUGS, development: 'development-all-courses' };
  assert.equal(skillCapsuleHref({ skill_name: 'Development' }, trap), null);
  // With its id present it still takes the id path, not the trap.
  assert.equal(
    skillCapsuleHref({ skill_name: 'Development', skill_id: 'DEV' }, trap),
    '/programming-all-courses'
  );
});

// ── the /skill/ fallback must be unreachable ────────────────────────────────

test('the return value NEVER starts with /skill/', () => {
  /**
   * Round A measured `/skill/programming` → HTTP 404. `skillHref` reaches that
   * branch for any entity carrying a `slug`; this resolver must not.
   */
  const cases = [
    subdoc(),
    { skill_name: 'Development', slug: 'programming' },
    { slug: 'programming' },
    { slug: 'automation', label: 'Automation' },
    { upstreamId: 'nope', slug: 'data' },
    { skill_id: 'UNKNOWN', skill_name: 'Ghost', slug: 'ghost' },
    ...Object.keys(LIVE_SLUGS).map((k) => ({ skill_id: k.toUpperCase(), slug: k })),
  ];
  for (const c of cases) {
    for (const map of [LIVE_SLUGS, {}]) {
      const href = skillCapsuleHref(c, map);
      assert.ok(
        href === null || !href.startsWith('/skill/'),
        `${JSON.stringify(c)} produced the dead fallback ${href}`
      );
    }
  }
});

test('CONTROL: skillHref DOES produce the /skill/ branch these inputs must avoid', () => {
  // Without this, the assertion above could pass because no input can reach
  // that branch at all — a guard over an empty set.
  assert.equal(skillHref({ slug: 'programming' }, LIVE_SLUGS), '/skill/programming');
  assert.equal(skillHref({ skill_name: 'Development' }, {}), '/skill/development');
});

// ── misses ──────────────────────────────────────────────────────────────────

test('a skill absent from the map returns null', () => {
  assert.equal(skillCapsuleHref({ skill_id: 'NOPE' }, LIVE_SLUGS), null);
  assert.equal(skillCapsuleHref(subdoc(), {}), null);
});

test('a missing or malformed map returns null rather than throwing', () => {
  // B2's requirement: an empty/absent map must degrade to the inert <span>,
  // never to a throw and never to a dead link.
  for (const map of [undefined, null, {}, 'nope', 42]) {
    assert.equal(skillCapsuleHref(subdoc(), map), null);
  }
});

test('a missing or malformed skill returns null rather than throwing', () => {
  for (const s of [undefined, null, 'DEV', 42, []]) {
    assert.equal(skillCapsuleHref(s, LIVE_SLUGS), null);
  }
});

test('an inherited object member is not a hit', () => {
  // `{}.constructor` is a function; a naive read would return `/function …`.
  assert.equal(skillCapsuleHref({ skill_id: 'constructor' }, LIVE_SLUGS), null);
  assert.equal(skillCapsuleHref({ skill_id: 'toString' }, LIVE_SLUGS), null);
});

test('a blank slug in the map is a miss, not an href of "/"', () => {
  assert.equal(skillCapsuleHref({ skill_id: 'DEV' }, { dev: '   ' }), null);
  assert.equal(skillCapsuleHref({ skill_id: 'DEV' }, { dev: '' }), null);
  assert.equal(skillCapsuleHref({ skill_id: 'DEV' }, { dev: null }), null);
});

// ── probe order, pinned against skillHref ───────────────────────────────────

test('the probe order is upstreamId → _id → skill_id → upstreamCode', () => {
  const map = { a: 'by-upstreamid', b: 'by-underscore-id', c: 'by-skill-id', d: 'by-upstreamcode' };
  const all = { upstreamId: 'a', _id: 'b', skill_id: 'c', upstreamCode: 'd' };

  assert.equal(skillCapsuleHref(all, map), '/by-upstreamid');
  assert.equal(skillCapsuleHref({ ...all, upstreamId: undefined }, map), '/by-underscore-id');
  assert.equal(skillCapsuleHref({ _id: 'b', skill_id: 'c', upstreamCode: 'd' }, map), '/by-underscore-id');
  assert.equal(skillCapsuleHref({ skill_id: 'c', upstreamCode: 'd' }, map), '/by-skill-id');
  assert.equal(skillCapsuleHref({ upstreamCode: 'd' }, map), '/by-upstreamcode');
});

test('an id that misses falls through to the next probe', () => {
  // Not the same claim as the order test: this is about a PRESENT id whose key
  // is absent from the map. `_id` is exactly this on every live subdoc.
  assert.equal(
    skillCapsuleHref({ _id: '68d4f5b3581cb350290597de', skill_id: 'DEV' }, LIVE_SLUGS),
    '/programming-all-courses'
  );
});

test('ids are matched case-insensitively, like the map keys', () => {
  assert.equal(skillCapsuleHref({ skill_id: 'dev' }, LIVE_SLUGS), '/programming-all-courses');
  assert.equal(skillCapsuleHref({ skill_id: 'DeV' }, LIVE_SLUGS), '/programming-all-courses');
});

test('wherever skillHref resolves through the MAP, both agree exactly', () => {
  /**
   * The coupling. These two must not drift in probe order or in URL shape; the
   * only sanctioned difference is what happens on a MISS. Asserted over every
   * live skill in both shapes a caller can hand over.
   */
  const live = [
    { _id: '68d4f556581cb350290597d1', skill_id: 'AI', skill_name: 'AI' },
    { _id: '68d4f493581cb350290597b5', skill_id: 'AUT', skill_name: 'Automation' },
    { _id: '68d4f506581cb350290597c6', skill_id: 'BUSINESS', skill_name: 'Business' },
    { _id: '68d3c5af2c6a2f1315c0bcdb', skill_id: 'DATA', skill_name: 'Data' },
    { _id: '6a6b2feffb3b926a738f3bcf', skill_id: 'DES', skill_name: 'Design' },
    { _id: '68d4f5b3581cb350290597de', skill_id: 'DEV', skill_name: 'Development' },
    { _id: '68d3c5af2c6a2f1315c0bcdc', skill_id: 'POWERPLATFORM', skill_name: 'Power Platform' },
  ];
  let agreed = 0;
  for (const s of live) {
    const mine = skillCapsuleHref(s, LIVE_SLUGS);
    assert.ok(mine, `${s.skill_name} did not resolve — the live map should cover all 7`);
    assert.equal(mine, skillHref(s, LIVE_SLUGS), `${s.skill_name} disagrees with skillHref`);
    agreed += 1;
  }
  assert.equal(agreed, 7, `compared ${agreed} skills, expected all 7 live ones`);
});

test('all seven live skills resolve, and to distinct catalog URLs', () => {
  const hrefs = ['AI', 'AUT', 'BUSINESS', 'DATA', 'DES', 'DEV', 'POWERPLATFORM']
    .map((code) => skillCapsuleHref({ skill_id: code }, LIVE_SLUGS));
  assert.ok(hrefs.every(Boolean), `unresolved: ${JSON.stringify(hrefs)}`);
  assert.equal(new Set(hrefs).size, 7, 'two skills share a catalog URL');
  assert.ok(hrefs.includes('/programming-all-courses'));
  assert.ok(!hrefs.includes('/development-all-courses'));
});
