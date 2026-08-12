import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCourse } from '@/lib/resolveCourse';
import { findHiddenCourseForSlug } from '@/lib/courses/hiddenCourses';
import { resolveHiddenCourseForAdmin } from '@/lib/courses/adminCoursePreview';

/**
 * PREVIEW MUST SHOW A HIDDEN COURSE TO A LOGGED-IN ADMIN, AND TO NOBODY ELSE.
 *
 * A bypass that leaks is worse than the defect it fixes, so the unauthenticated
 * case is tested from every direction the bypass can be approached: with the
 * query parameter, without it, with a session object that is empty, and with a
 * session read that FAILS. Each must produce the same null the anonymous
 * visitor gets, and null is what the route turns into a 404.
 *
 * ── AND THE SECOND HALF OF THE ORIGINAL DEFECT, FOUND ON THE WAY ────────────
 * `isPublished` was checked on the ALIAS path only. The derived
 * /<code>-training-course URL had no gate at all, so un-publishing a course
 * stopped one of its two public URLs and left the other serving the full page.
 * Both shapes are pinned below, in both directions.
 */

const COURSE = { _id: 'c1', course_id: 'COPILOT-STU', course_name: 'Copilot for Students' };
const HIDDEN_EXT = {
  courseId: 'COPILOT-STU',
  urlAlias: '/copilot-for-students',
  isPublished: false,
};
const SHOWN_EXT = { ...HIDDEN_EXT, isPublished: true };

function resolverDeps(ext) {
  return {
    fetchExtensionByAlias: async (alias) =>
      alias === ext.urlAlias ? ext : null,
    fetchExtension: async (code) => (code === ext.courseId ? ext : null),
    fetchCourse: async (code) =>
      String(code).toUpperCase() === 'COPILOT-STU' ? COURSE : null,
  };
}

// ── resolveCourse: the alias URL ───────────────────────────────────────────

test('alias URL: a hidden course does not resolve', async () => {
  const out = await resolveCourse('copilot-for-students', resolverDeps(HIDDEN_EXT));
  assert.equal(out, null);
});

test('alias URL: includeHidden resolves it, extension and all', async () => {
  const out = await resolveCourse('copilot-for-students', {
    ...resolverDeps(HIDDEN_EXT),
    includeHidden: true,
  });
  assert.equal(out.mode, 'alias');
  assert.equal(out.course.course_id, 'COPILOT-STU');
  assert.equal(out.extension.isPublished, false, 'the caller can see it IS hidden');
});

test('CONTROL: the same alias resolves normally when the course is published', async () => {
  // Without this, "hidden does not resolve" also passes against a resolver
  // that resolves nothing at all.
  const out = await resolveCourse('copilot-for-students', resolverDeps(SHOWN_EXT));
  assert.equal(out.mode, 'alias');
  assert.equal(out.course.course_id, 'COPILOT-STU');
});

// ── resolveCourse: the derived <code>-training-course URL ──────────────────

test('legacy URL: a hidden course does not resolve either — the half that had NO gate', async () => {
  const out = await resolveCourse('copilot-stu-training-course', resolverDeps(HIDDEN_EXT));
  assert.equal(out, null);
});

test('legacy URL: includeHidden resolves it', async () => {
  const out = await resolveCourse('copilot-stu-training-course', {
    ...resolverDeps(HIDDEN_EXT),
    includeHidden: true,
  });
  assert.equal(out.mode, 'code');
  assert.equal(out.course.course_id, 'COPILOT-STU');
});

test('CONTROL: the legacy URL still serves a published course', async () => {
  const out = await resolveCourse('copilot-stu-training-course', resolverDeps(SHOWN_EXT));
  assert.equal(out.mode, 'code');
});

test('a course with NO extension row at all still resolves — it was never hidden', async () => {
  // `=== false`, not `!isPublished`. A course nobody has ever opened the SEO
  // editor for has no extension document, and reading that absence as "hidden"
  // would 404 every such course on its legacy URL.
  const out = await resolveCourse('copilot-stu-training-course', {
    fetchExtensionByAlias: async () => null,
    fetchExtension: async () => null,
    fetchCourse: async () => COURSE,
  });
  assert.equal(out.mode, 'code');
  assert.equal(out.extension, null);
});

// ── findHiddenCourseForSlug: the cheap, non-dynamic probe ──────────────────

test('with nothing hidden the probe issues NO query at all', async () => {
  // The production state as measured: 0 of 78. If this ever costs a query, every
  // custom page and builder page on the catch-all route pays it per render.
  let queries = 0;
  const out = await findHiddenCourseForSlug('anything-at-all', {
    hidden: new Set(),
    findByAlias: async () => { queries += 1; return null; },
  });
  assert.equal(out, null);
  assert.equal(queries, 0);
});

test('the legacy shape is decided from the STRING — still no query', async () => {
  let queries = 0;
  const out = await findHiddenCourseForSlug('copilot-stu-training-course', {
    hidden: new Set(['COPILOT-STU']),
    findByAlias: async () => { queries += 1; return null; },
  });
  assert.equal(out, 'COPILOT-STU');
  assert.equal(queries, 0);
});

test('the alias shape costs ONE lookup, and it is passed a leading slash', async () => {
  const seen = [];
  const out = await findHiddenCourseForSlug('copilot-for-students', {
    hidden: new Set(['COPILOT-STU']),
    findByAlias: async (alias) => {
      seen.push(alias);
      return { courseId: 'COPILOT-STU' };
    },
  });
  assert.equal(out, 'COPILOT-STU');
  assert.deepEqual(seen, ['/copilot-for-students']);
});

test('CONTROL: an alias belonging to no hidden course returns null', () => {
  return findHiddenCourseForSlug('some-published-page', {
    hidden: new Set(['COPILOT-STU']),
    findByAlias: async () => null,
  }).then((out) => assert.equal(out, null));
});

// ── the gate ───────────────────────────────────────────────────────────────

function gate({ hidden = 'COPILOT-STU', session, sessionThrows = false } = {}) {
  const calls = { findHidden: 0, session: 0, resolve: 0 };
  return {
    calls,
    deps: {
      findHidden: async () => { calls.findHidden += 1; return hidden; },
      getSession: async () => {
        calls.session += 1;
        if (sessionThrows) throw new Error('next-auth blew up');
        return session;
      },
      resolve: async (seg, opts) => {
        calls.resolve += 1;
        return { course: COURSE, extension: HIDDEN_EXT, mode: 'alias', opts };
      },
    },
  };
}

test('an ADMIN with ?preview=1 gets the hidden course', async () => {
  const g = gate({ session: { user: { id: 'u1', name: 'Admin' } } });
  const out = await resolveHiddenCourseForAdmin('copilot-for-students', { preview: '1' }, g.deps);
  assert.ok(out, 'resolved');
  assert.equal(out.course.course_id, 'COPILOT-STU');
  assert.deepEqual(out.opts, { includeHidden: true }, 'and it asked for the hidden one');
});

test('NO SESSION + ?preview=1 → null. The parameter alone grants nothing', async () => {
  // The leak test. `?preview=1` is guessable by construction, so this is the
  // case an anonymous visitor can actually construct.
  const g = gate({ session: null });
  const out = await resolveHiddenCourseForAdmin('copilot-for-students', { preview: '1' }, g.deps);
  assert.equal(out, null);
  assert.equal(g.calls.resolve, 0, 'the course was never even resolved');
});

test('a session OBJECT with no user is not a session', async () => {
  // next-auth returns `{}` in some expired-token paths. Truthiness of the
  // session is not the check; `session.user` is.
  const g = gate({ session: {} });
  assert.equal(
    await resolveHiddenCourseForAdmin('copilot-for-students', { preview: '1' }, g.deps),
    null
  );
  assert.equal(g.calls.resolve, 0);
});

test('a session read that THROWS is not a session either', async () => {
  // Refusing to answer is not the same as answering yes. Guessing yes here
  // publishes a page an admin took down.
  const g = gate({ sessionThrows: true });
  assert.equal(
    await resolveHiddenCourseForAdmin('copilot-for-students', { preview: '1' }, g.deps),
    null
  );
  assert.equal(g.calls.resolve, 0);
});

test('an admin WITHOUT the parameter still gets nothing — no accidental bypass', async () => {
  const g = gate({ session: { user: { id: 'u1' } } });
  assert.equal(
    await resolveHiddenCourseForAdmin('copilot-for-students', {}, g.deps),
    null
  );
  assert.equal(g.calls.session, 0, 'and the session was never read — the render stays static');
});

test('near-miss parameter values do NOT open the gate', async () => {
  // A loose truthiness check on `sp.preview` would let ?preview=0 through, and
  // "0" is exactly what a hand-edited URL contains.
  for (const value of ['0', '', 'true', 'yes', '11', ' 1']) {
    const g = gate({ session: { user: { id: 'u1' } } });
    assert.equal(
      await resolveHiddenCourseForAdmin('copilot-for-students', { preview: value }, g.deps),
      null,
      `?preview=${JSON.stringify(value)} must not resolve`
    );
  }
});

test('CONTROL: that loop is not vacuous — "1" in the same harness DOES resolve', async () => {
  const g = gate({ session: { user: { id: 'u1' } } });
  assert.ok(await resolveHiddenCourseForAdmin('copilot-for-students', { preview: '1' }, g.deps));
});

test('a slug that is NOT a hidden course never reads the session', async () => {
  // The ordering that keeps every published course, custom page and builder
  // page from paying for a feature that concerns none of them. If the session
  // read moved above this check, every request to the site's entire public URL
  // space would decode a session to answer a question about a handful of URLs.
  const g = gate({ hidden: null, session: { user: { id: 'u1' } } });
  assert.equal(
    await resolveHiddenCourseForAdmin('some-custom-page', { preview: '1' }, g.deps),
    null
  );
  assert.equal(g.calls.findHidden, 1);
  assert.equal(g.calls.session, 0, 'no cookie read');
  assert.equal(g.calls.resolve, 0);
});

test('a FAILED hidden probe is treated as "nothing to preview", not as an open door', async () => {
  const out = await resolveHiddenCourseForAdmin(
    'copilot-for-students',
    { preview: '1' },
    {
      findHidden: async () => { throw new Error('mongo down'); },
      getSession: async () => ({ user: { id: 'u1' } }),
      resolve: async () => ({ course: COURSE }),
    }
  );
  assert.equal(out, null);
});

test('searchParams may arrive as a PROMISE, as the App Router hands it over', async () => {
  const g = gate({ session: { user: { id: 'u1' } } });
  const out = await resolveHiddenCourseForAdmin(
    'copilot-for-students',
    Promise.resolve({ preview: '1' }),
    g.deps
  );
  assert.ok(out, 'the promise is awaited, not stringified');
});
