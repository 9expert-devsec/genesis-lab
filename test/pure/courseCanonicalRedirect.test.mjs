import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirect, permanentRedirect } from 'next/navigation';
import { resolveCourse } from '@/lib/resolveCourse';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';
import {
  courseRedirectTarget,
  courseRedirectFn,
  COURSE_REDIRECTS_ARE_PERMANENT,
  COURSE_REDIRECT_STATUS,
} from '@/lib/courses/courseRedirect';

/**
 * THE OLD URL REDIRECTS TO THE CANONICAL ONE — resolver and decision, together.
 *
 * ══ WHY ONE FILE AND NOT TWO ═══════════════════════════════════════════════
 * The behaviour under test spans two modules: `resolveCourse` decides WHAT a
 * URL resolves to, `courseRedirectTarget` decides whether that resolution
 * renders or redirects. Two separate unit files would each pass while
 * disagreeing about the seam between them — the exact failure round U3 hit,
 * where a control broke the helper and every realistic-looking per-surface
 * fixture stayed green because none of them ran the real path.
 *
 * So `request()` below runs BOTH, in the order the route runs them, and every
 * assertion in this file goes through it.
 *
 * ══ AND IT RAISES THE REDIRECT FOR REAL ════════════════════════════════════
 * The status is not asserted against a constant read out of the source. It is
 * read from the digest that next/navigation's own redirect functions throw —
 * `NEXT_REDIRECT;replace;<path>;<status>;` — which is the same string the
 * framework parses to build the response. What this still cannot see is the
 * response itself; see the round report.
 *
 * ── WHAT THE FAKES MODEL ────────────────────────────────────────────────────
 * `fetchExtensionByAlias` matches the stored alias EXACTLY, because that is
 * what `findOne({urlAlias})` does — no collation, no case folding. Every bit of
 * case-insensitivity in this file therefore has to come from the resolver
 * normalising the incoming segment, which is what makes control (d) able to
 * break it. `fetchCourse` is case-tolerant because the production dep
 * (getCourseByCodeInsensitive) is.
 */

const UPSTREAM = [
  { _id: '1', course_id: 'EXCEL-L1', course_name: 'Excel Level 1' },
  { _id: '2', course_id: 'PLAIN-L1', course_name: 'Plain, no alias' },
  { _id: '3', course_id: 'HIDDEN-L1', course_name: 'Unpublished' },
];

/** GONE-L1 is deliberately absent from UPSTREAM — the orphan case. */
const EXTENSIONS = [
  { courseId: 'EXCEL-L1', urlAlias: '/pretty-excel', isPublished: true },
  { courseId: 'HIDDEN-L1', urlAlias: '/hidden-pretty', isPublished: false },
  { courseId: 'GONE-L1', urlAlias: '/orphan-pretty', isPublished: true },
];

function deps(extensions = EXTENSIONS) {
  return {
    // EXACT match, like the real findOne({urlAlias}).
    fetchExtensionByAlias: async (alias) =>
      extensions.find((e) => e.urlAlias === alias) ?? null,
    // EXACT match too, like the real findOne({formerAliases}) — the stored form
    // is lower-cased on write, so the production query needs no regex either.
    fetchExtensionByFormerAlias: async (alias) =>
      extensions.find((e) => (e.formerAliases ?? []).includes(alias)) ?? null,
    fetchCourse: async (id) => {
      const wanted = String(id ?? '').toLowerCase();
      return UPSTREAM.find((c) => c.course_id.toLowerCase() === wanted) ?? null;
    },
    fetchExtension: async (id) => extensions.find((e) => e.courseId === id) ?? null,
    // Supplied so nothing falls through to the real db-backed dep; see
    // test/fs/injectedDepCoverage for why an unsupplied one is a defect.
    fetchExtensionByFormerCode: async () => null,
  };
}

/**
 * Counts the hops a URL takes before it renders, and refuses to run forever.
 *
 * THE POINT OF COUNTING RATHER THAN FOLLOWING TO THE END: a chained redirect
 * (/a → /b → /c) and a direct one (/a → /c) have the SAME final destination, so
 * an assertion on where a URL ends up cannot tell them apart. Only the count
 * can. Control (b) turns the direct form into the chained one, and it is this
 * function — not the destination assertions — that catches it.
 */
async function follow(path, opts, limit = 5) {
  const chain = [];
  let at = path;
  for (let i = 0; i <= limit; i += 1) {
    const r = await request(at, opts);
    if (r.status !== 307 && r.status !== 308) return { hops: chain.length, chain, final: r };
    chain.push(r.location);
    at = r.location;
  }
  throw new Error(`redirect loop or chain longer than ${limit}: ${[path, ...chain].join(' -> ')}`);
}

/**
 * One request through the route's own sequence: resolve, then decide, then —
 * if there is a target — actually raise it and read the status back off the
 * digest. Returns the shape a caller can assert against.
 */
async function request(path, { extensions, permanent } = {}) {
  const segment = String(path).replace(/^\/+/, '');
  const resolved = await resolveCourse(segment, deps(extensions));
  if (!resolved) return { status: 404 };

  const target = courseRedirectTarget({
    requestedPath: `/${segment}`,
    course: resolved.course,
    extension: resolved.extension,
  });
  if (!target) return { status: 200, mode: resolved.mode };

  const fn = permanent === undefined
    ? courseRedirectFn({ redirect, permanentRedirect })
    : courseRedirectFn({ redirect, permanentRedirect }, permanent);
  try {
    fn(target);
  } catch (e) {
    const parts = String(e?.digest ?? '').split(';');
    return { status: Number(parts[3]), location: parts[2], mode: resolved.mode };
  }
  throw new Error('the redirect function returned instead of throwing');
}

const isRedirect = (r) => r.status === 307 || r.status === 308;

// ── 3. the alias URL renders. THE LOOP TEST. ───────────────────────────────
test('the alias URL renders — it does NOT redirect to itself', async () => {
  // The negative case that catches a loop, and it is first because every other
  // rule in this round can reintroduce one. A redirect here would send the
  // browser to the URL it already asked for, forever.
  const r = await request('/pretty-excel');
  assert.equal(r.status, 200, `the canonical URL redirected to ${r.location}`);
  assert.equal(r.mode, 'alias');
});

// ── 2. a course with no alias keeps rendering at its code URL ──────────────
test('a course with NO alias renders at its code URL, exactly as before', async () => {
  const r = await request('/plain-l1-training-course');
  assert.equal(r.status, 200, `it redirected to ${r.location}`);
  assert.equal(r.mode, 'code');
});

// ── 4. uppercase alias → redirect to the stored lower-cased form ───────────
test('an UPPERCASE alias redirects to the stored lower-cased form', async () => {
  const r = await request('/PRETTY-EXCEL');
  assert.ok(isRedirect(r), `expected a redirect, got ${r.status}`);
  assert.equal(r.location, '/pretty-excel');
});

test('…and a mixed-case alias too, to exactly the same place', async () => {
  const r = await request('/PrEtTy-ExCeL');
  assert.ok(isRedirect(r), `expected a redirect, got ${r.status}`);
  assert.equal(r.location, '/pretty-excel');
});

test('the casing redirect lands somewhere that RENDERS — one hop, not two', async () => {
  // Asserted as a HOP, not as a final destination: the destination is fed back
  // through the same request path and must come back 200 in the `alias` mode.
  const first = await request('/PRETTY-EXCEL');
  assert.ok(isRedirect(first));
  const second = await request(first.location);
  assert.equal(second.status, 200, `the destination redirected again, to ${second.location}`);
  assert.equal(second.mode, 'alias');
});

// ── 5a. uppercase code URL: the existing case-insensitivity is preserved ───
test('an uppercase code FRAGMENT still resolves — the case-insensitive lookup survives', async () => {
  // The pre-existing behaviour this round must not break: path 2 uppercases the
  // fragment and the helper is case-tolerant, so /PLAIN-L1-training-course finds
  // the course. It now redirects to the canonical casing rather than serving two
  // URLs for one page.
  const r = await request('/PLAIN-L1-training-course');
  assert.ok(isRedirect(r), `expected a redirect, got ${r.status}`);
  assert.equal(r.location, '/plain-l1-training-course');
  const second = await request(r.location);
  assert.equal(second.status, 200);
  assert.equal(second.mode, 'code');
});

test('the -training-course SUFFIX is matched case-SENSITIVELY, and still is', async () => {
  /**
   * ── A PRE-EXISTING FACT, MEASURED RATHER THAN ASSUMED ────────────────────
   * `resolveCourse` tests `seg.endsWith('-training-course')` against a
   * lowercase literal, so the case-insensitivity on path 2 covers the CODE
   * FRAGMENT and not the suffix. `/PLAIN-L1-TRAINING-COURSE` therefore never
   * reaches path 2 at all and 404s — and did so long before this round.
   *
   * Recorded here because the round brief described path 2 as resolving
   * "case-INSENSITIVELY", which is true of the fragment and not of the suffix.
   * Extending it is not in this round's scope; pinning it means the next person
   * to widen the suffix match will see this go red and make the choice
   * deliberately.
   */
  assert.equal((await request('/PLAIN-L1-TRAINING-COURSE')).status, 404);
  assert.equal((await request('/plain-l1-TRAINING-COURSE')).status, 404);
  // …while the fragment's own casing is genuinely tolerated.
  assert.notEqual((await request('/PLAIN-L1-training-course')).status, 404);
});

// ── 9. unpublished and orphan courses are untouched by this round ──────────
test('an UNPUBLISHED course still 404s at both URLs', async () => {
  assert.equal((await request('/hidden-pretty')).status, 404);
  assert.equal((await request('/hidden-l1-training-course')).status, 404);
});

test('a course whose id has no upstream match still 404s at both URLs', async () => {
  assert.equal((await request('/orphan-pretty')).status, 404);
  assert.equal((await request('/gone-l1-training-course')).status, 404);
});

// ── 10. THE SWITCH ─────────────────────────────────────────────────────────
test('the switch decides the status, and flipping it changes it', async () => {
  // Flipped HERE, by argument, rather than asserted by reading the constant off
  // the source — a test that reads the source cannot tell you the route honours
  // it. Both runs go through the real next/navigation redirect functions and
  // read the status out of the digest the framework itself throws.
  const temporary = await request('/PRETTY-EXCEL', { permanent: false });
  const permanent = await request('/PRETTY-EXCEL', { permanent: true });

  assert.equal(temporary.status, 307);
  assert.equal(permanent.status, 308);
  // Same destination either way — the switch chooses the status and nothing else.
  assert.equal(temporary.location, permanent.location);
});

test('the switch SHIPS TEMPORARY, and the default follows it', async () => {
  // Two claims, deliberately separate. The first is the shipped value: a
  // wrongly-published permanent redirect is cached in browsers and is
  // effectively unrecallable, so this must not become 308 by accident.
  assert.equal(COURSE_REDIRECTS_ARE_PERMANENT, false,
    'the switch has been flipped to permanent — if that is the cutover, this '
    + 'assertion is the one line to change, and it should be its own commit');
  // The second is that the DEFAULT path actually reads it, rather than the
  // constant sitting there decoratively while the route hardcodes a status.
  const shipped = await request('/PRETTY-EXCEL');
  assert.equal(shipped.status, COURSE_REDIRECT_STATUS.temporary);
});

test('COURSE_REDIRECT_STATUS names the two statuses Next really emits', () => {
  // Pinned against the digest rather than against a number typed twice.
  for (const [kind, fn] of [['temporary', redirect], ['permanent', permanentRedirect]]) {
    try {
      fn('/x');
      assert.fail(`${kind} did not throw`);
    } catch (e) {
      if (!String(e?.digest).startsWith('NEXT_REDIRECT')) throw e;
      assert.equal(Number(String(e.digest).split(';')[3]), COURSE_REDIRECT_STATUS[kind]);
    }
  }
});

// ── 1. U4.1: THE CODE URL REDIRECTS TO THE ALIAS ──────────────────────────
test('a code URL whose course HAS an alias redirects to the canonical path', async () => {
  // The headline of the round. The previous commit asserted the opposite of
  // this, deliberately, to record that the casing rule alone did not move it.
  const r = await request('/excel-l1-training-course');
  assert.ok(isRedirect(r), `expected a redirect, got ${r.status}`);
  assert.equal(r.location, '/pretty-excel');
});

test('…to EXACTLY the canonical path — the same string the canonical tag emits', async () => {
  // Not "a path that looks right". The destination is asserted against
  // courseCanonicalPath's own answer for the same row, so a redirect that
  // disagreed with the page's canonical tag could not pass.
  const course = UPSTREAM.find((c) => c.course_id === 'EXCEL-L1');
  const extension = EXTENSIONS.find((e) => e.courseId === 'EXCEL-L1');
  const r = await request('/excel-l1-training-course');
  assert.equal(r.location, courseCanonicalPath(course, extension));
});

test('the code→alias redirect is ONE HOP — the destination resolves in `alias` mode', async () => {
  // Asserted as a hop, not as a final destination: the destination goes back
  // through the same resolve-then-decide path and must come back 200, in the
  // alias mode. A destination that redirected again would fail here.
  const first = await request('/excel-l1-training-course');
  assert.ok(isRedirect(first));
  const second = await request(first.location);
  assert.equal(second.status, 200, `the destination redirected again, to ${second.location}`);
  assert.equal(second.mode, 'alias');
});

// ── 5b. uppercase code URL, course HAS an alias → resolves, then redirects ─
test('an uppercase code fragment resolves AND THEN redirects to the alias', async () => {
  // Both halves in one request: the case-tolerant lookup still finds EXCEL-L1
  // from /EXCEL-L1-training-course, and the canonical rule then sends it to the
  // alias rather than to the lower-cased code URL. One hop, not two.
  const r = await request('/EXCEL-L1-training-course');
  assert.ok(isRedirect(r), `expected a redirect, got ${r.status}`);
  assert.equal(r.location, '/pretty-excel');
  const second = await request(r.location);
  assert.equal(second.status, 200);
  assert.equal(second.mode, 'alias');
});

// ── 6 / 7. FORMER ALIASES ──────────────────────────────────────────────────
//
// A → B → C, as the write path would leave it: the CURRENT alias is /c and the
// history holds the two it replaced, most recent last.
const RENAMED = [
  {
    courseId: 'EXCEL-L1',
    urlAlias: '/c-current',
    formerAliases: ['/a-oldest', '/b-middle'],
    isPublished: true,
  },
];

test('a FORMER alias resolves, and redirects to the CURRENT canonical path', async () => {
  const r = await request('/b-middle', { extensions: RENAMED });
  assert.ok(isRedirect(r), `expected a redirect, got ${r.status}`);
  assert.equal(r.location, '/c-current');
  assert.equal(r.mode, 'alias-former');
});

test('A and B both land on C — in ONE hop each, counted, not inferred', async () => {
  // THE ASSERTION THAT MATTERS. A chain (/a → /b → /c) reaches the same final
  // destination as a direct redirect, so "it ended at /c" cannot tell the two
  // apart. The hop COUNT can, and it is what control (b) breaks.
  for (const from of ['/a-oldest', '/b-middle']) {
    const walk = await follow(from, { extensions: RENAMED });
    assert.equal(walk.hops, 1,
      `${from} took ${walk.hops} hops: ${[from, ...walk.chain].join(' -> ')}`);
    assert.deepEqual(walk.chain, ['/c-current']);
    assert.equal(walk.final.status, 200);
    assert.equal(walk.final.mode, 'alias', 'the destination is the CURRENT alias');
  }
});

test('the oldest alias does NOT pass through the middle one', async () => {
  // Stated separately and positively: /a-oldest must never appear alongside
  // /b-middle in a chain. This is the shape a linked-list history would produce
  // and the reason the history is a SET of URLs pointing at one destination.
  const walk = await follow('/a-oldest', { extensions: RENAMED });
  assert.ok(!walk.chain.includes('/b-middle'),
    `the oldest alias chained through the middle one: ${walk.chain.join(' -> ')}`);
});

test('an uppercase FORMER alias redirects too, still in one hop', async () => {
  const walk = await follow('/B-MIDDLE', { extensions: RENAMED });
  assert.equal(walk.hops, 1, walk.chain.join(' -> '));
  assert.deepEqual(walk.chain, ['/c-current']);
});

test('the CURRENT alias of a renamed course still renders — no self-redirect', async () => {
  // The loop test again, on the shape that most invites a loop: a course whose
  // row carries a history. The revert cleanup in the write path is what keeps
  // the current alias out of that history; this is the read-side check that the
  // two lookups never both match.
  const r = await request('/c-current', { extensions: RENAMED });
  assert.equal(r.status, 200, `the current alias redirected to ${r.location}`);
  assert.equal(r.mode, 'alias');
});

test('the code URL of a renamed course goes straight to the current alias', async () => {
  const walk = await follow('/excel-l1-training-course', { extensions: RENAMED });
  assert.equal(walk.hops, 1, walk.chain.join(' -> '));
  assert.deepEqual(walk.chain, ['/c-current']);
});

test('a former alias of an UNPUBLISHED course 404s, like its current one', async () => {
  const hidden = [{
    courseId: 'HIDDEN-L1',
    urlAlias: '/hidden-now',
    formerAliases: ['/hidden-before'],
    isPublished: false,
  }];
  assert.equal((await request('/hidden-before', { extensions: hidden })).status, 404);
  assert.equal((await request('/hidden-now', { extensions: hidden })).status, 404);
});

test('the current alias is tried BEFORE the history', async () => {
  // Ordering, asserted rather than assumed. If the history were consulted first,
  // a course that had reverted would resolve through the wrong branch — and the
  // fixture here is deliberately the contradictory row the write path prevents,
  // so this pins which branch wins if one ever reaches the database by hand.
  const contradictory = [{
    courseId: 'EXCEL-L1',
    urlAlias: '/same',
    formerAliases: ['/same'],
    isPublished: true,
  }];
  const r = await request('/same', { extensions: contradictory });
  assert.equal(r.status, 200, 'a self-contradictory row still redirected to itself');
  assert.equal(r.mode, 'alias', 'the history won a lookup the current alias should have');
});
