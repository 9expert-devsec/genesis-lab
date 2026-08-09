import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills, findSkillBySlug } from '@/config/site';

// src/config/site.js hardcodes the skill list, and every field in it is a key
// something else joins on: `upstreamCode` reaches the SkillPageConfig slug map
// and the SkillOrder rows, `upstreamId` keys the NavMenuCache snapshot, `slug`
// is the public `?skill=` value on /training-course. A blank or duplicated
// entry does not throw anywhere — it produces a menu row that links to the
// wrong page, or two rows that fight over one sort position.
//
// ══ WHAT THIS SUITE CANNOT DO, STATED PLAINLY ══════════════════════════════
//
// IT CANNOT VERIFY THE CONFIG AGAINST UPSTREAM. No tier in this suite reaches
// the network — `npm test` runs pure/fs/render only, and the live check lives
// in test/smoke.mjs, which is never part of it. So this file can prove the
// list is internally well-formed and self-consistent; it CANNOT prove that
// `upstreamId` 68d4f493581cb350290597b5 is still called "Automation" upstream,
// or that `AUT` is still its `skill_id`.
//
// That means the `Mapping verified against /api/ai/skills on <date>` stamp in
// site.js is A HUMAN CLAIM, not a tested fact, and this file deliberately does
// NOT assert on it. A test that read the date and passed would convert an
// unverified claim into a green check — which is precisely the
// authoritative-and-wrong artifact the stamp exists to date-limit. The rename
// this batch repairs sat undetected for exactly that reason: the previous
// stamp said 2026-04-22 and nothing anywhere could tell you it had gone stale.
//
// The only real check is running the measurement against the live API again.

const REQUIRED = ['upstreamId', 'upstreamCode', 'label', 'slug'];

/** THE CHECKS, as pure functions, so controls can feed them a doctored list. */

function missingFields(list) {
  const problems = [];
  list.forEach((entry, i) => {
    for (const field of REQUIRED) {
      const v = entry?.[field];
      if (typeof v !== 'string' || v.trim() === '') {
        problems.push(`[${i}] ${field} is empty`);
      }
    }
  });
  return problems;
}

function duplicates(list, field) {
  const seen = new Map();
  for (const entry of list) {
    const key = String(entry?.[field] ?? '');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k).sort();
}

/**
 * Every slug the config answers to, canonical and legacy alike, with the
 * number of entries claiming it.
 *
 * The two namespaces share one lookup, so they have to be checked as ONE set.
 * A legacy slug that duplicates another entry's canonical slug is not a
 * duplicate in either list on its own — and it is the collision that actually
 * hurts, because it silently re-points a live URL at a different skill.
 */
function slugClaims(list) {
  const claims = new Map();
  for (const entry of list) {
    for (const s of [entry?.slug, ...(entry?.legacySlugs ?? [])]) {
      const key = String(s ?? '');
      if (!key) continue;
      claims.set(key, (claims.get(key) ?? 0) + 1);
    }
  }
  return claims;
}

function collidingSlugs(list) {
  return [...slugClaims(list)].filter(([, n]) => n > 1).map(([k]) => k).sort();
}

// ── the guard ──────────────────────────────────────────────────────

test('every skill entry has a non-empty upstreamId, upstreamCode, label and slug', () => {
  assert.deepEqual(missingFields(skills), []);
});

test('CONTROL: a blank field is reported', () => {
  // Without this, `missingFields` returning a constant [] would satisfy the
  // test above forever.
  assert.deepEqual(missingFields([{ ...skills[0], label: '' }]), ['[0] label is empty']);
  assert.deepEqual(missingFields([{ ...skills[0], slug: '   ' }]), ['[0] slug is empty']);
  const { upstreamCode, ...noCode } = skills[0];
  assert.deepEqual(missingFields([noCode]), ['[0] upstreamCode is empty']);
});

test('upstreamId, upstreamCode and slug are each unique', () => {
  assert.deepEqual(duplicates(skills, 'upstreamId'), []);
  assert.deepEqual(duplicates(skills, 'upstreamCode'), []);
  assert.deepEqual(duplicates(skills, 'slug'), []);
});

test('CONTROL: appending a duplicate entry reddens every uniqueness check', () => {
  // The control the brief asked for by name: append a real entry a second time
  // and confirm all three keys report it. A duplicate is not theoretical —
  // SkillOrder already carries a ghost `RPA` row alongside the live `AUT` one,
  // and the same shape reaching this array would give one skill two menu rows.
  const doubled = [...skills, skills[skills.length - 1]];
  const dup = skills[skills.length - 1];
  assert.deepEqual(duplicates(doubled, 'upstreamId'), [dup.upstreamId]);
  assert.deepEqual(duplicates(doubled, 'upstreamCode'), [dup.upstreamCode]);
  assert.deepEqual(duplicates(doubled, 'slug'), [dup.slug]);
});

test('CONTROL: a duplicate in ONE key only is reported for that key alone', () => {
  // Pairs with the test above. Three separate calls could all be reading the
  // same field and nothing would show it; this fails if they are.
  const sameSlug = [...skills, { ...skills[0], upstreamId: 'x', upstreamCode: 'X' }];
  assert.deepEqual(duplicates(sameSlug, 'slug'), [skills[0].slug]);
  assert.deepEqual(duplicates(sameSlug, 'upstreamId'), []);
  assert.deepEqual(duplicates(sameSlug, 'upstreamCode'), []);
});

// ── the entries this batch changed ─────────────────────────────────

test('the renamed skill carries the Automation identity, not the RPA one', () => {
  // Pinned by upstreamId — the one key the rename did NOT touch — so this test
  // keeps working if the code or label changes again.
  const automation = skills.find((s) => s.upstreamId === '68d4f493581cb350290597b5');
  assert.ok(automation, 'the skill is still in the config');
  assert.equal(automation.upstreamCode, 'AUT');
  assert.equal(automation.label, 'Automation');
  assert.equal(automation.slug, 'automation');
  // Nothing anywhere should still be spelling it RPA.
  assert.equal(skills.filter((s) => s.upstreamCode === 'RPA').length, 0);
  assert.equal(skills.filter((s) => s.slug === 'rpa').length, 0);
});

test('Design is present with the measured upstream identity', () => {
  const design = skills.find((s) => s.upstreamCode === 'DES');
  assert.ok(design, 'Design has a config entry');
  assert.equal(design.upstreamId, '6a6b2feffb3b926a738f3bcf');
  assert.equal(design.label, 'Design');
  assert.equal(design.slug, 'design');
});

test('the config covers exactly seven skills', () => {
  // An exact count, not a floor. Upstream had 7 on 2026-08-04; a skill added
  // upstream is invisible to this suite (see the header), so the number here
  // is the thing a human bumps when they have re-measured. (test/run.mjs used to
  // be the same contract; it is a FLOOR now, so this one stands alone.)
  assert.equal(skills.length, 7);
});

test('every entry has a Cloudinary icon URL, and no two share one', () => {
  // A shared icon URL is the copy-paste signature of a hand-added entry, and
  // it renders as two menu rows wearing the same picture.
  for (const s of skills) {
    assert.match(s.iconUrl, /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//, s.slug);
  }
  assert.deepEqual(duplicates(skills, 'iconUrl'), []);
});

// ── the slug is a live query value, not decoration ─────────────────

test('findSkillBySlug resolves every configured slug, canonical and legacy', () => {
  // This is the /training-course?skill=<slug> contract. An unresolvable slug
  // returns null, and CourseListClient turns null into "no filter" rather than
  // an error — so a slug that stops resolving shows the whole catalog and says
  // nothing. That is why the renamed slug gets a test at all.
  for (const s of skills) {
    assert.equal(findSkillBySlug(s.slug)?.upstreamId, s.upstreamId, s.slug);
    for (const legacy of s.legacySlugs ?? []) {
      assert.equal(findSkillBySlug(legacy)?.upstreamId, s.upstreamId, legacy);
    }
  }
  assert.equal(findSkillBySlug('no-such-skill'), null);
  assert.equal(findSkillBySlug(''), null);
});

test('CONTROL: an unknown slug still returns null — the filter-off value', () => {
  // Documents the failure mode in executable form: this is the exact
  // expression CourseListClient:82-85 evaluates, and `null` there means
  // "match everything", not "match nothing". That is why a retired slug has to
  // be ACCEPTED rather than left to fall through.
  const skillIdForSlug = (slug) => (slug ? findSkillBySlug(slug) : null)?.upstreamId ?? null;
  assert.equal(skillIdForSlug('automation'), '68d4f493581cb350290597b5');
  assert.equal(skillIdForSlug('no-such-skill'), null);
  assert.equal(skillIdForSlug(''), null);
});

// ── legacy slugs: what we ACCEPT but never OFFER ───────────────────

test('the retired `rpa` slug still resolves to Automation', () => {
  // The regression a bookmark or a pasted link hits. Both spellings must land
  // on the same upstream skill, or COMMIT 2 ships a silent "show everything".
  const viaLegacy = findSkillBySlug('rpa');
  const viaCanonical = findSkillBySlug('automation');
  assert.ok(viaLegacy, '?skill=rpa resolves');
  assert.equal(viaLegacy.upstreamId, '68d4f493581cb350290597b5');
  assert.equal(viaLegacy.upstreamId, viaCanonical.upstreamId);
  assert.equal(viaLegacy.slug, 'automation', 'it resolves to the canonical entry');
});

test('legacySlugs is optional and absent on every entry that was never renamed', () => {
  // A field that quietly appeared everywhere would make "has this been
  // renamed?" unanswerable by reading the file.
  const withLegacy = skills.filter((s) => s.legacySlugs !== undefined);
  assert.deepEqual(withLegacy.map((s) => s.slug), ['automation']);
  assert.deepEqual(withLegacy[0].legacySlugs, ['rpa']);
});

test('CANONICAL WINS: a slug that is both resolves to the live entry', () => {
  // The collision rule, asserted against a doctored list rather than the real
  // config — the real config has no collision, and a test that could only pass
  // because of that would not be testing the rule.
  const ghost = { ...skills[0], slug: 'ghost', legacySlugs: ['data'] };
  const doctored = [ghost, ...skills];
  const canonical = doctored.find((s) => s.slug === 'data');

  // Mirror findSkillBySlug's precedence over the doctored list.
  const lookup = (slug) =>
    doctored.find((s) => s.slug === slug) ??
    doctored.find((s) => s.legacySlugs?.includes(slug)) ??
    null;

  assert.equal(lookup('data').upstreamId, canonical.upstreamId, 'canonical, not the ghost');
  assert.notEqual(lookup('data').upstreamId, ghost.upstreamId);
  // …and the ghost is still reachable by its own canonical slug.
  assert.equal(lookup('ghost').slug, 'ghost');
});

test('no slug is claimed twice — canonical and legacy share ONE namespace', () => {
  assert.deepEqual(collidingSlugs(skills), []);
});

test('CONTROL: a legacy slug colliding with a canonical one reddens', () => {
  // The control named in the brief: put 'data' — another entry's LIVE slug —
  // into some entry's legacySlugs and confirm the guard reports it. Neither
  // the canonical list nor the legacy list contains a duplicate on its own,
  // so this is exactly the collision a per-field uniqueness check misses.
  const doctored = skills.map((s) =>
    s.slug === 'ai' ? { ...s, legacySlugs: ['data'] } : s
  );
  assert.deepEqual(collidingSlugs(doctored), ['data']);
  assert.deepEqual(duplicates(doctored, 'slug'), [], 'the per-field check sees nothing');
});

test('CONTROL: the same legacy slug on two entries reddens', () => {
  const doctored = skills.map((s) =>
    s.slug === 'ai' ? { ...s, legacySlugs: ['rpa'] } : s
  );
  assert.deepEqual(collidingSlugs(doctored), ['rpa']);
});
