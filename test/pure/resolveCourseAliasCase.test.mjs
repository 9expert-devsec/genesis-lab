import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCourse } from '@/lib/resolveCourse';

/**
 * The alias path must survive an UPSTREAM RENAME.
 *
 * `CourseExtension.courseId` is a copy of the upstream `course_id`, frozen the
 * day an admin last saved that row. Upstream can rename afterwards and nothing
 * propagates it, so the stored key goes STALE — not lowercased, not malformed,
 * just out of date by a casing.
 *
 * The live failure: extension 69f87551aac437056dfc02cf holds `Power-Apps` with
 * alias /power-apps-for-business-training-course, written 2026-05-04. Upstream
 * became `POWER-APPS`. Path 1's exact lookup missed, so it fell through to path
 * 2, which uppercased the ALIAS to POWER-APPS-FOR-BUSINESS — not a course — and
 * the page 404'd, while /POWER-APPS-training-course served fine off path 2.
 *
 * ── THE FAKES MODEL UPSTREAM EXACTLY ────────────────────────────────────────
 * `fetchCourse` here is case-INSENSITIVE because that is what the production
 * dep (getCourseByCodeInsensitive) is; its own exact-vs-tolerant behaviour is
 * tested in courseIdCaseFallback. What this file pins is which lookup
 * resolveCourse REACHES FOR — behaviour an fs guard on the call text cannot
 * see, which is precisely how the bug sat green.
 */

const UPSTREAM = [
  { _id: '1', course_id: 'POWER-APPS', course_name: 'Power Apps for Business' },
  { _id: '2', course_id: 'COPILOT-STU', course_name: 'Copilot for Students' },
];

/** The stale row from the repro, verbatim. */
const STALE_EXTENSION = {
  _id: '69f87551aac437056dfc02cf',
  courseId: 'Power-Apps', // upstream is now POWER-APPS
  urlAlias: '/power-apps-for-business-training-course',
  isPublished: true,
};

function harness({ extensions = [STALE_EXTENSION] } = {}) {
  const calls = { alias: [], course: [], extension: [] };
  const deps = {
    fetchExtensionByAlias: async (alias) => {
      calls.alias.push(alias);
      return extensions.find((e) => e.urlAlias === alias) ?? null;
    },
    // Case-tolerant, exactly like the production dep.
    fetchCourse: async (id) => {
      calls.course.push(id);
      const wanted = String(id ?? '').toLowerCase();
      return UPSTREAM.find((c) => c.course_id.toLowerCase() === wanted) ?? null;
    },
    fetchExtension: async (id) => {
      calls.extension.push(id);
      return extensions.find((e) => e.courseId === id) ?? null;
    },
    // Nothing here is mid-rename, so this finds nothing — as the real lookup
    // would. Supplied so it cannot fall through to the real
    // getCourseExtensionByFormerCode, which reads Mongo; see
    // test/fs/injectedDepCoverage.test.mjs for why an unsupplied db-backed dep
    // is a defect while the branch that reaches it is still unexercised.
    fetchExtensionByFormerCode: async () => null,
  };
  return { calls, deps };
}

// ── A4: the fix ─────────────────────────────────────────────────────────────

test('an alias whose stored courseId differs from upstream ONLY in case resolves', async () => {
  const { deps } = harness();
  const resolved = await resolveCourse(
    'power-apps-for-business-training-course',
    deps
  );

  assert.ok(resolved, 'the aliased course 404s — this is the reported bug');
  assert.equal(resolved.mode, 'alias', 'it must resolve on path 1, not fall through to path 2');
  assert.equal(resolved.course.course_id, 'POWER-APPS', 'the UPSTREAM casing is returned');
  assert.equal(resolved.extension._id, '69f87551aac437056dfc02cf');
});

test('the alias path looks up the STORED id, and upstream tolerates the casing', async () => {
  // Pins where the tolerance lives: resolveCourse passes the stale key through
  // untouched and the lookup absorbs the difference. If this ever starts
  // normalising the id itself, that is a second place to keep in step.
  const { calls, deps } = harness();
  await resolveCourse('power-apps-for-business-training-course', deps);
  assert.deepEqual(calls.course, ['Power-Apps'], 'the stored key is what gets looked up');
});

test('the fall-through that produced the 404 no longer happens', async () => {
  // Path 2 would uppercase the ALIAS (not the course id) to
  // POWER-APPS-FOR-BUSINESS. Resolving on path 1 means that never runs.
  const { calls, deps } = harness();
  const resolved = await resolveCourse('power-apps-for-business-training-course', deps);
  assert.equal(resolved.mode, 'alias');
  assert.ok(
    !calls.course.includes('POWER-APPS-FOR-BUSINESS'),
    'path 2 ran — the alias was uppercased into a course id that does not exist'
  );
});

// ── The bug, reproduced on demand ───────────────────────────────────────────

test('CONTROL: with an EXACT-match lookup, the reported 404 comes straight back', async () => {
  /**
   * This is the redden proof, and it is permanent rather than a one-off run
   * against an old checkout.
   *
   * Reverting the fix in the working tree also reddens tests that have nothing
   * to do with the bug, because the pre-change `resolveCourse` took no `deps`
   * and ignored the fakes entirely — every injected test fails for that reason
   * alone, path 2 included. That measures the signature change, not the defect.
   *
   * So the defect is isolated here instead: the ONLY difference from the
   * harness above is a case-SENSITIVE `fetchCourse`, modelling the
   * `getCourseByCode` that path 1 used to call. Everything else is identical.
   */
  const exactOnly = {
    fetchExtensionByAlias: async (alias) =>
      [STALE_EXTENSION].find((e) => e.urlAlias === alias) ?? null,
    fetchCourse: async (id) => UPSTREAM.find((c) => c.course_id === id) ?? null, // verbatim
    fetchExtension: async () => null,
    fetchExtensionByFormerCode: async () => null,
  };

  assert.equal(
    await resolveCourse('power-apps-for-business-training-course', exactOnly),
    null,
    'the exact lookup no longer reproduces the bug — this control has gone stale'
  );

  // …while the sibling URL kept working, which is exactly what was observed:
  // path 2 uppercases POWER-APPS and that matches upstream verbatim.
  const sibling = await resolveCourse('power-apps-training-course', exactOnly);
  assert.equal(sibling?.mode, 'code');
  assert.equal(sibling?.course.course_id, 'POWER-APPS');
});

// ── A4: the control ─────────────────────────────────────────────────────────

test('CONTROL: an alias pointing at a course that does not exist AT ALL is still null', async () => {
  // The fix must not become "resolve to something, anything". A genuinely dead
  // pointer has to keep 404ing, or a typo'd courseId silently lands visitors on
  // a different course's page.
  const { deps } = harness({
    extensions: [
      {
        _id: 'dead',
        courseId: 'NO-SUCH-COURSE',
        urlAlias: '/ghost-training-course',
        isPublished: true,
      },
    ],
  });
  assert.equal(await resolveCourse('ghost-training-course', deps), null);
});

test('CONTROL: the case tolerance is exact-except-case, not fuzzy', async () => {
  // POWER-APP (no S) must not reach POWER-APPS.
  const { deps } = harness({
    extensions: [
      { _id: 'near', courseId: 'POWER-APP', urlAlias: '/near-miss', isPublished: true },
    ],
  });
  assert.equal(await resolveCourse('near-miss', deps), null);
});

// ── A3: the publish gate is untouched ───────────────────────────────────────

test('an unpublished extension still does not resolve on the alias path', async () => {
  const { deps } = harness({
    extensions: [{ ...STALE_EXTENSION, isPublished: false }],
  });
  // Falls through to path 2, which uppercases the alias to a non-course → null.
  assert.equal(
    await resolveCourse('power-apps-for-business-training-course', deps),
    null,
    'the isPublished gate was widened'
  );
});

test('an extension with isPublished ABSENT still resolves (the !== false gate)', async () => {
  // `isPublished !== false`, not `=== true`: rows predating the field have it
  // undefined and must keep working.
  const { isPublished, ...noFlag } = STALE_EXTENSION;
  const { deps } = harness({ extensions: [noFlag] });
  const resolved = await resolveCourse('power-apps-for-business-training-course', deps);
  assert.ok(resolved, 'a row with no isPublished field stopped resolving');
  assert.equal(resolved.mode, 'alias');
});

// ── path 2 is unchanged ─────────────────────────────────────────────────────

test('path 2 still resolves a legacy suffix URL, with mode code', async () => {
  const { deps } = harness({ extensions: [] });
  const resolved = await resolveCourse('copilot-stu-training-course', deps);
  assert.equal(resolved.mode, 'code');
  assert.equal(resolved.course.course_id, 'COPILOT-STU');
});

test('path 2 still recovers a mixed-case upstream id from a lowercased URL', async () => {
  // The original reason the tolerant helper exists: the URL is built from
  // course_id.toLowerCase() and uppercased back, so POWER-APPS round-trips but
  // a mixed-case upstream id would not without tolerance.
  const { deps } = harness({ extensions: [] });
  const resolved = await resolveCourse('power-apps-training-course', deps);
  assert.equal(resolved.mode, 'code');
  assert.equal(resolved.course.course_id, 'POWER-APPS');
});
