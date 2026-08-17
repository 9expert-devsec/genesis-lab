import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findRootPathCollisions,
  rootPathFor,
  rootStaticRoutes,
  rootRewriteSources,
  catchAllIsPresent,
  COLLISION,
} from '@/lib/rootPathCollision.mjs';

/**
 * WHAT WOULD BE IN THE WAY AT /<filename>.
 *
 * ══ THE FIXTURE IS OWNED HERE, AND IS SHAPED LIKE THE MEASURED ONE ══════════
 *
 * Not read from `.next/` — a test that needed a build would be a test that does
 * not run. The shapes below are the ones phase 1 M5 measured off a real build:
 *
 *   staticRoutes   { page, regex, routeKeys, namedRegex }
 *   dynamicRoutes  same, with populated routeKeys; `/[...slug]` regex
 *                  `^/(.+?)(?:/)?$`
 *   rewrites       OBJECT { beforeFiles, afterFiles, fallback }
 *   caseSensitive  false
 */

const CATCH_ALL = {
  page: '/[...slug]',
  regex: '^/(.+?)(?:/)?$',
  routeKeys: { nxtPslug: 'nxtPslug' },
  namedRegex: '^/(?<nxtPslug>.+?)(?:/)?$',
};

const MANIFEST = {
  caseSensitive: false,
  staticRoutes: [
    { page: '/', regex: '^/(?:/)?$', routeKeys: {}, namedRegex: '^/(?:/)?$' },
    { page: '/promotions', regex: '^/promotions(?:/)?$', routeKeys: {}, namedRegex: '^/promotions(?:/)?$' },
    { page: '/about-us', regex: '^/about\\-us(?:/)?$', routeKeys: {}, namedRegex: '^/about\\-us(?:/)?$' },
    { page: '/robots.txt', regex: '^/robots\\.txt(?:/)?$', routeKeys: {}, namedRegex: '^/robots\\.txt(?:/)?$' },
    // multi-segment — must never be offered as a root collision
    { page: '/admin/media', regex: '^/admin/media(?:/)?$', routeKeys: {}, namedRegex: '^/admin/media(?:/)?$' },
  ],
  dynamicRoutes: [
    CATCH_ALL,
    { page: '/promotions/[slug]', regex: '^/promotions/([^/]+?)(?:/)?$', routeKeys: { nxtPslug: 'nxtPslug' }, namedRegex: '^/promotions/(?<nxtPslug>[^/]+?)(?:/)?$' },
    { page: '/skill/[slug]', regex: '^/skill/([^/]+?)(?:/)?$', routeKeys: { nxtPslug: 'nxtPslug' }, namedRegex: '^/skill/(?<nxtPslug>[^/]+?)(?:/)?$' },
  ],
  rewrites: {
    beforeFiles: [],
    afterFiles: [
      { source: '/9expert-company-profile.pdf', destination: 'https://blob.example/webroot-documents/9expert-company-profile.pdf' },
      { source: '/how-to-create-chatgpt-account.pdf', destination: 'https://blob.example/webroot-documents/how-to-create-chatgpt-account.pdf' },
      // multi-segment — not a root claim
      { source: '/sites/default/files/:path*', destination: 'https://cdn.example/:path*' },
    ],
    fallback: [],
  },
};

const PUBLIC_ENTRIES = ['assets', 'brand', 'logo', 'mock-article', 'people', 'port'];
const DB_SLUGS = ['old-brochure.pdf', 'company-handbook.pdf'];

const check = (filename, over = {}) => findRootPathCollisions(filename, {
  manifest: MANIFEST, publicEntries: PUBLIC_ENTRIES, dbSlugs: DB_SLUGS, ...over,
});

// ══ THE TRAP ═══════════════════════════════════════════════════════════════

test('A CLEAN FILENAME RETURNS NO COLLISION AT ALL', () => {
  /**
   * The assertion the whole module exists to be able to pass. `/[...slug]` has
   * regex ^/(.+?)(?:/)?$ and matches EVERY path — a checker that regex-tested
   * the 30 dynamic routes would report a collision here, and for every other
   * input, and would be worthless while looking like a check.
   */
  const r = check('brand-new-whitepaper-2026.pdf');
  assert.deepEqual(r.collisions, [], 'a clearly-safe filename reported a collision');
  assert.equal(r.clean, true);
  assert.equal(r.path, '/brand-new-whitepaper-2026.pdf');
});

test('THE CATCH-ALL ALONE NEVER PRODUCES A COLLISION', () => {
  // Same manifest, but nothing else to hit: no public entries, no rewrites, no
  // slugs, and only `/` as a static route. The catch-all is still present and
  // still matches the path — and the result must be empty anyway.
  const r = findRootPathCollisions('anything-at-all.pdf', {
    manifest: {
      ...MANIFEST,
      staticRoutes: [{ page: '/', regex: '^/(?:/)?$', routeKeys: {}, namedRegex: '^/(?:/)?$' }],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
    },
    publicEntries: [],
    dbSlugs: [],
  });
  assert.deepEqual(r.collisions, []);
  assert.equal(r.catchAllPresent, true, 'the catch-all must still be detected as present');
});

test('the catch-all is REPORTED as present, so its absence cannot pass silently', () => {
  assert.equal(catchAllIsPresent(MANIFEST), true);
  assert.equal(catchAllIsPresent({ ...MANIFEST, dynamicRoutes: [] }), false);
  const gone = check('x.pdf', { manifest: { ...MANIFEST, dynamicRoutes: [] } });
  assert.equal(gone.catchAllPresent, false,
    'if /[...slug] were removed, DB slugs would stop being reachable and this '
    + 'checker would under-report without saying so');
});

// ══ ONE FIXTURE PER SURFACE ════════════════════════════════════════════════

test('a filename equal to a STATIC ROUTE collides, and names the route', () => {
  const r = check('promotions');
  assert.equal(r.clean, false);
  assert.deepEqual(r.collisions, [
    { kind: COLLISION.STATIC_ROUTE, what: '/promotions', matchedCaseInsensitively: false },
  ]);
});

test('a filename equal to a PUBLIC/ entry collides, and names the path', () => {
  const r = check('brand');
  assert.deepEqual(r.collisions, [
    { kind: COLLISION.PUBLIC_FILE, what: '/brand', matchedCaseInsensitively: false },
  ]);
});

test('a filename equal to a REWRITE SOURCE collides, and names the source', () => {
  // This is what replacing one of the three published documents looks like.
  const r = check('9expert-company-profile.pdf');
  assert.deepEqual(r.collisions, [
    { kind: COLLISION.REWRITE, what: '/9expert-company-profile.pdf', matchedCaseInsensitively: false },
  ]);
});

test('a filename equal to a DB SLUG ending in .pdf collides, and names it', () => {
  const r = check('old-brochure.pdf');
  assert.deepEqual(r.collisions, [
    { kind: COLLISION.DB_SLUG, what: '/old-brochure.pdf', matchedCaseInsensitively: false },
  ]);
});

test('several surfaces can be in the way at once, and ALL are reported', () => {
  // A caller has to be able to say which path is in the way — plural.
  const r = findRootPathCollisions('brand', {
    manifest: {
      ...MANIFEST,
      staticRoutes: [...MANIFEST.staticRoutes, { page: '/brand', regex: '', routeKeys: {}, namedRegex: '' }],
    },
    publicEntries: PUBLIC_ENTRIES,
    dbSlugs: ['brand'],
  });
  assert.deepEqual(
    r.collisions.map((c) => c.kind).sort(),
    [COLLISION.DB_SLUG, COLLISION.PUBLIC_FILE, COLLISION.STATIC_ROUTE].sort(),
  );
});

// ══ CASE ═══════════════════════════════════════════════════════════════════

test('CASE: the manifest says caseSensitive false, so a casing-only clash IS a collision', () => {
  /**
   * `caseSensitive: false` was READ off a real build in M5, not assumed. To
   * Next, /Promotions and /promotions are the same route — so a checker that
   * compared exactly would clear a filename that cannot actually be served.
   */
  assert.equal(MANIFEST.caseSensitive, false, 'the fixture must mirror the measured value');
  const r = check('PROMOTIONS');
  assert.equal(r.clean, false, 'a casing-only clash was cleared');
  assert.equal(r.collisions[0].kind, COLLISION.STATIC_ROUTE);
  assert.equal(r.collisions[0].what, '/promotions', 'the report must name the EXISTING spelling');
  assert.equal(
    r.collisions[0].matchedCaseInsensitively, true,
    'an operator needs to see that it clashed only on casing — it reads differently',
  );
});

test('CASE: an exact clash is flagged as exact, not as a casing clash', () => {
  assert.equal(check('promotions').collisions[0].matchedCaseInsensitively, false);
});

// ══ SCOPE: only ROOT-level things can be in the way ════════════════════════

test('multi-segment static routes and rewrites are never root collisions', () => {
  assert.deepEqual(rootStaticRoutes(MANIFEST), ['/promotions', '/about-us', '/robots.txt']);
  assert.equal(rootStaticRoutes(MANIFEST).includes('/admin/media'), false);
  assert.deepEqual(rootRewriteSources(MANIFEST), [
    '/9expert-company-profile.pdf', '/how-to-create-chatgpt-account.pdf',
  ]);
  assert.equal(rootRewriteSources(MANIFEST).includes('/sites/default/files/:path*'), false);
});

test('a rewrites ARRAY is accepted as afterFiles, the way Next normalises it', () => {
  // M5: a config returning an array becomes { afterFiles }. Both shapes reach
  // this module depending on where the manifest came from.
  const flat = { ...MANIFEST, rewrites: MANIFEST.rewrites.afterFiles };
  assert.deepEqual(rootRewriteSources(flat), [
    '/9expert-company-profile.pdf', '/how-to-create-chatgpt-account.pdf',
  ]);
});

test('a leading slash on the input is accepted and normalised', () => {
  assert.equal(rootPathFor('a.pdf'), '/a.pdf');
  assert.equal(rootPathFor('/a.pdf'), '/a.pdf');
  assert.equal(rootPathFor('///a.pdf'), '/a.pdf');
  assert.equal(rootPathFor('  a.pdf  '), '/a.pdf');
  assert.deepEqual(check('/promotions').collisions.map((c) => c.what), ['/promotions']);
});

test('an empty filename is not clean, and reports nothing to collide with', () => {
  // `clean: true` must mean "checked and safe", never "nothing was checked".
  for (const empty of ['', '   ', null, undefined, '/']) {
    const r = findRootPathCollisions(empty, { manifest: MANIFEST });
    assert.equal(r.clean, false, `${JSON.stringify(empty)} was reported clean`);
    assert.deepEqual(r.collisions, []);
  }
});

// ══ Controls ═══════════════════════════════════════════════════════════════

test('CONTROL: a missing manifest does not fake a clean result', () => {
  const r = findRootPathCollisions('anything.pdf', { manifest: null });
  assert.equal(r.catchAllPresent, false,
    'with no manifest the catch-all cannot be confirmed, and the caller must see that');
});

test('CONTROL: the surfaces are independent — each fixture hits exactly one', () => {
  /**
   * Without this, one over-broad rule (a substring match, say) could satisfy
   * every per-surface assertion above at once and they would all still pass.
   */
  const cases = [
    ['promotions', COLLISION.STATIC_ROUTE],
    ['brand', COLLISION.PUBLIC_FILE],
    ['9expert-company-profile.pdf', COLLISION.REWRITE],
    ['old-brochure.pdf', COLLISION.DB_SLUG],
  ];
  for (const [name, kind] of cases) {
    const kinds = check(name).collisions.map((c) => c.kind);
    assert.deepEqual(kinds, [kind], `${name} hit ${kinds.join(',')} instead of only ${kind}`);
  }
});

test('CONTROL: the checker can distinguish, and is not simply always-clean', () => {
  // The mirror of the trap test: a module that returned [] unconditionally
  // would pass "a clean filename returns no collision" forever.
  assert.equal(check('brand-new-whitepaper-2026.pdf').clean, true);
  assert.equal(check('promotions').clean, false);
});
