import { test } from 'node:test';
import assert from 'node:assert/strict';
// Next ships path-to-regexp as a CommonJS bundle, so it has no named exports.
import pathToRegexpPkg from 'next/dist/compiled/path-to-regexp/index.js';

const { pathToRegexp, compile } = pathToRegexpPkg;

import nextConfig from '../../next.config.mjs';
import { LEGACY_ROOTS } from '../../src/lib/legacyTransforms.mjs';

// ── WHAT THIS FILE PINS ─────────────────────────────────────────────────────
//
// The resolver-trigger rewrite: the ONE rule that pulls a request off the
// static Cloudinary path and into /legacy-file, where a database lookup can
// find a file whose public_id is NOT its path.
//
// It has to fire for exactly two characters and both of their spellings:
//
//   &  →  `and`    6 files
//   #  →  `sharp`  13 files (the C# course covers + one certificate PDF)
//
// Both substitutions are LOSSY, so the derived Cloudinary URL for these files
// is wrong by construction — measured HTTP 400 for the ampersand set before the
// resolver existed. If this rule stops matching, those requests fall through to
// the image catch-all (which is LAST and matches any path) and 400/404 silently.
//
// ── WHY THE ENCODED SPELLING IS THE ONE THAT MATTERS ────────────────────────
// Next matches rewrites against the RAW pathname. A browser percent-encodes,
// so what actually arrives is `%26` / `%23` and the literal character never
// appears. Measured for `&`: matching only the literal resolved 0 of 6.
//
// For `#` this is not merely likely but FORCED — a literal `#` is the URL
// fragment delimiter, so a client strips it and everything after it before the
// request is sent. `%23` is the only reachable form.
//
// ── WHAT THIS FILE CANNOT PROVE ─────────────────────────────────────────────
// It pins the PATTERN: which paths match, in what order, and what destination
// the match compiles to. It cannot prove Vercel's runtime hands a `%23` path to
// the route handler with the segment decoded back to `#` — that is Next's
// internal rewrite plumbing, not a regex, and it needs a deployed probe. The
// ampersand half of the alternation IS deploy-verified (6/6, both spellings),
// which is why `&` is carried through every case below as a control: it is the
// same rule, already measured working end to end.

/** The rewrite rules the config actually emits. Not a restatement of them. */
const rules = await nextConfig.rewrites();

function matcher(source) {
  const keys = [];
  const re = pathToRegexp(source, keys);
  return (pathname) => {
    const m = re.exec(pathname);
    if (!m) return null;
    return Object.fromEntries(keys.map((k, i) => [k.name, m[i + 1]]));
  };
}

/** Rules that send a request to the resolver. */
const resolverRules = rules.filter((r) => r.destination.startsWith('/legacy-file/'));

/**
 * Route a pathname the way Vercel would — first matching rule wins, over the
 * WHOLE rule list rather than only the resolver ones. That ordering is the
 * point: a resolver rule that sits after the image catch-all for its root can
 * never fire, and testing the resolver rules in isolation would not notice.
 */
function routeOf(pathname) {
  for (const rule of rules) {
    const params = matcher(rule.source)(pathname);
    if (params) return { destination: rule.destination, params };
  }
  return null;
}

/** Per-segment percent-encoding, exactly as a browser would send it. */
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

test('every legacy root has a resolver-trigger rule', () => {
  for (const root of LEGACY_ROOTS) {
    const forRoot = resolverRules.filter((r) => r.destination === `/legacy-file/${root}/:rest`);
    assert.ok(forRoot.length >= 1, `no resolver rule for root ${root}`);
  }
});

test('the resolver rule matches BOTH characters in BOTH spellings', () => {
  // The whole alternation, one case per spelling. `&` is the control: this half
  // is already measured working on production.
  const cases = [
    ['literal &', '/sites/default/files/articles/images/Cover - Accounting & Finance@3x.png'],
    ['encoded %26', '/sites/default/files/articles/images/Cover - Accounting %26 Finance@3x.png'],
    ['literal #', '/sites/default/files/course/cover/Programming in C# with Visual Studio.png'],
    ['encoded %23', '/sites/default/files/course/cover/Programming in C%23 with Visual Studio.png'],
  ];
  for (const [label, pathname] of cases) {
    const hit = routeOf(pathname);
    assert.ok(hit, `${label}: nothing matched ${pathname}`);
    assert.ok(
      hit.destination.startsWith('/legacy-file/'),
      `${label}: matched ${hit.destination} instead of the resolver`,
    );
  }
});

test('all 13 real C# paths route to the resolver once percent-encoded', () => {
  // The reachable form of every affected file. A browser sends these; the
  // literal-# form cannot survive the client.
  const REAL = [
    '/sites/default/files/course/cover/-NET MAUI การพัฒนา Native Cross-platform Apps ด้วย C#.png',
    '/sites/default/files/course/cover/-NET MAUI การพัฒนา Native Cross-platform Apps with C#.webp',
    '/sites/default/files/course/cover/NET MAUI การพัฒนา Native Cross-platform Apps with C#.webp',
    '/sites/default/files/course/cover/Programming in C# with Visual Studio.png',
    '/sites/default/files/course/cover/Programming in C# with Visual Studio.webp',
    '/sites/default/files/course/cover/WEB - Programming C# (Custom).png',
    '/sites/default/files/course/images/-NET MAUI การพัฒนา Native Cross-platform Apps ด้วย C#.png',
    '/sites/default/files/course/images/-NET MAUI การพัฒนา Native Cross-platform Apps with C#.webp',
    '/sites/default/files/course/images/NET MAUI การพัฒนา Native Cross-platform Apps with C#.webp',
    '/sites/default/files/course/images/Programming in C# with Visual Studio.png',
    '/sites/default/files/course/images/Programming in C# with Visual Studio.webp',
    '/sites/default/files/course/images/WEB - Programming C# (Custom).png',
    '/sites/default/files/files/training-course/course-certificate/.Net/Programming-in-C#-with-Visual-Studio-course-certificate.pdf',
  ];
  assert.equal(REAL.length, 13);
  for (const pathname of REAL) {
    const encoded = encodePath(pathname);
    assert.ok(encoded.includes('%23'), `${pathname} must encode its '#'`);
    const hit = routeOf(encoded);
    assert.ok(hit, `nothing matched ${encoded}`);
    assert.ok(
      hit.destination.startsWith('/legacy-file/'),
      `${pathname} matched ${hit.destination} instead of the resolver`,
    );
  }
});

test('the CERTIFICATE PDF reaches the resolver and not the raw rule', () => {
  // Ordering, on the one case where it is genuinely contested: this path ends
  // `.pdf`, so the extension-keyed RAW rule would claim it — and the raw rule
  // points at Cloudinary with the un-substituted path, which is a 400. The
  // resolver rule is listed first for exactly this reason.
  const pathname = encodePath(
    '/sites/default/files/files/training-course/course-certificate/.Net/Programming-in-C#-with-Visual-Studio-course-certificate.pdf',
  );
  const hit = routeOf(pathname);
  assert.ok(hit.destination.startsWith('/legacy-file/'), `matched ${hit.destination}`);
  assert.ok(!/raw\/upload/.test(hit.destination), 'must not fall through to the raw rule');
});

test('the resolver rule precedes the raw, svg and image rules for its root', () => {
  // If it does not, it can never fire — the image catch-all matches any path.
  for (const root of LEGACY_ROOTS) {
    const resolverIdx = rules.findIndex((r) => r.destination === `/legacy-file/${root}/:rest`);
    const catchAllIdx = rules.findIndex((r) => r.source === `/${root}/:rest*`);
    assert.ok(resolverIdx >= 0, `no resolver rule for ${root}`);
    assert.ok(catchAllIdx >= 0, `no image catch-all for ${root}`);
    assert.ok(
      resolverIdx < catchAllIdx,
      `${root}: resolver at ${resolverIdx} must precede the image catch-all at ${catchAllIdx}`,
    );
  }
});

test('the matched destination compiles to a /legacy-file path carrying the rest', () => {
  // The capture has to survive into the destination — a rule that matches and
  // then loses the filename is just a 404 with extra steps.
  const source = '/sites/default/files/course/cover/Programming in C# with Visual Studio.png';
  const hit = routeOf(encodePath(source));
  const built = compile(hit.destination, { validate: false })(hit.params);

  assert.ok(built.startsWith('/legacy-file/sites/default/files/'), built);
  // The capture stays ENCODED through the destination — spaces are still %20 —
  // so assert on the decoded form, which is also the form the route handler
  // receives its params in and the form stored as `sourcePath` in Mongo.
  assert.ok(/%23/.test(built), `the '#' must survive into the destination: ${built}`);
  assert.equal(decodeURIComponent(built), `/legacy-file${source}`);
});

test('CONTROL: an ordinary path never reaches the resolver', () => {
  // The resolver is a FALLBACK. 1,610 files must stay on the static path where
  // no function of ours runs; widening this rule is a bandwidth regression.
  const ordinary = [
    '/sites/default/files/articles/images/Cover - Data Analyst@3x.png',
    '/sites/default/files/course/cover/Programming in Csharp with Visual Studio.png',
    '/sites/default/files/articles/cover/thailand-4.0.png',
    '/images/iconpromo/PEAK.svg',
    '/files/document/case-study-excel-project-plan.xlsx',
    '/sites/default/files/files/training-course/python-programming-course-outline_5.pdf',
  ];
  for (const pathname of ordinary) {
    const hit = routeOf(encodePath(pathname));
    assert.ok(hit, `nothing matched ${pathname}`);
    assert.ok(
      !hit.destination.startsWith('/legacy-file/'),
      `${pathname} must stay static, got ${hit.destination}`,
    );
  }
});

test('CONTROL: the alternation is exactly the two reviewed characters', () => {
  // A path carrying an UNREVIEWED invalid character must NOT be swept into the
  // resolver — there is no substituted record for it to find, so it would turn
  // a loud upload-time throw into a quiet 404 at request time.
  for (const ch of ['?', '<', '>']) {
    const pathname = `/sites/default/files/course/cover/name${encodeURIComponent(ch)}thing.png`;
    const hit = routeOf(pathname);
    assert.ok(hit, `nothing matched ${pathname}`);
    assert.ok(
      !hit.destination.startsWith('/legacy-file/'),
      `${ch}: must not route to the resolver, got ${hit.destination}`,
    );
  }
});
