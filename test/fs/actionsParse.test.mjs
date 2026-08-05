import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { transform } from 'sucrase';

// EVERY server-action module AND every API route handler must parse.
//
// WHY THIS EXISTS, and why it is not audit-log work. While instrumenting
// roles.js the reference call shape shipped with a path written literally
// inside a block comment — the `*` followed by `/` closed the comment early and
// the file stopped parsing. The whole suite stayed green.
//
// The audit-coverage guard has since grown a parse check, but scoped to
// SWEPT_FILES, which was fixing the symptom in one file. The hole is wider:
// NOTHING in this suite imports any `src/lib/actions/*.js` module. They pull in
// mongoose models and next/server, so no pure or render test touches them, and
// the fs-tier guards that do look at them read them as TEXT. A broken module is
// still a string — `body.includes('recordAdminAction(')` does not care whether
// the body is valid JavaScript.
//
// So until this file, a syntax error in any of ~42 server actions was invisible
// to the entire test run and would first surface as a build failure or, worse,
// a 500 in production on the one route that imports it.
//
// Parsing is the cheapest possible floor. It is not a substitute for importing
// the modules — see WHAT THIS CANNOT SEE below — it is the floor under every
// text-based guard in this repo.
//
// ── WIDENED TO API ROUTE HANDLERS ───────────────────────────────────────────
// The original version of this file named the gap and deferred it: "files
// outside src/lib/actions… widening this is a separate decision, because most
// of THOSE are reached by some test already." Route handlers turned out to be
// the part of that sentence which was not true.
//
// src/app/api/**/route.js has EXACTLY the same exposure as the action modules,
// for the same reason: nothing in this suite imports one (they pull in mongoose
// models, next/server and next/headers), and no fs-tier guard reads one. Adding
// the /api/chat proxy made that concrete — two brand-new files, reachable by no
// test at all, where a star-slash inside a doc block would have shipped green
// and first surfaced as a 500 in production.
//
// So the derived list is now BOTH directories. They are kept as two lists with
// their own anchors rather than one merged list, because they fail differently:
// the actions list is flat and its anchors prove the directory is right, while
// the routes list is RECURSIVE and its anchors additionally prove the walker
// descends and handles a dynamic-segment directory name.
//
// WHAT THIS CANNOT SEE:
//   · anything about runtime. A module that parses can still throw on import,
//     reference an undefined symbol, or export nothing.
//   · type or contract errors of any kind.
//   · a route written as route.ts / route.jsx. This repo is JS-only and every
//     one of its handlers is route.js; a TypeScript route would be skipped in
//     silence. Widen ROUTE_BASENAMES deliberately if that ever changes.
//   · lib helpers, components and pages. Most of those ARE reached by some
//     test; the two directories here were the ones reached by none.
//
// The transform is `imports`-only: enough to force a full parse, without the
// JSX transform these files never need. Verified sufficient for all 35 route
// handlers as well as the action modules.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ACTIONS_DIR = path.join(ROOT, 'src', 'lib', 'actions');
const ROUTES_DIR = path.join(ROOT, 'src', 'app', 'api');

/** Filenames Next treats as an API route handler in this repo. */
const ROUTE_BASENAMES = new Set(['route.js']);

/**
 * Every action module, READ FROM THE DIRECTORY rather than listed.
 *
 * A hardcoded list would go stale the first time someone adds a menu, and the
 * staleness would look like a pass.
 */
function actionFiles() {
  return readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();
}

/**
 * Files that must be in the derived list.
 *
 * NOT a `length >= 1` floor. This repo has already named that antipattern: a
 * minimum catches only wholesale disappearance, and a glob pointing at the
 * wrong directory — or at a directory that happens to hold one unrelated .js —
 * satisfies it while checking nothing. These three are load-bearing modules
 * from three different sweep rounds; if the list does not contain them, it is
 * not the list of server actions.
 */
const MUST_CONTAIN = ['roles.js', 'articles.js', 'pageBuilder.js'];

/**
 * Every API route handler under src/app/api, RECURSIVELY, repo-relative.
 *
 * Recursive because route handlers are nested by URL segment, not filed in one
 * folder. A non-recursive readdir here returns ZERO files and every assertion
 * below would pass vacuously — which is what ROUTE_MUST_CONTAIN exists to stop.
 */
function routeFiles(dir = ROUTES_DIR, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, out);
    else if (ROUTE_BASENAMES.has(entry.name)) out.push(full);
  }
  return out.sort();
}

const relFromRoot = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

/**
 * Anchors chosen to exercise the WALKER, not just to name three files.
 *
 *   · health/db          — shallow, and the route least likely to ever move.
 *   · auth/[...nextauth] — a DYNAMIC SEGMENT directory. A walker that skips or
 *                          mangles bracket-named folders loses every catch-all
 *                          route and looks fine doing it.
 *   · registration/public/charge — the deep end; proves recursion does not stop
 *                          at the first or second level.
 *
 * Deliberately NOT anchored on the chat routes this widening was prompted by:
 * an anchor should be a file whose absence means the list is broken, not one
 * whose absence means a feature moved.
 */
const ROUTE_MUST_CONTAIN = [
  'src/app/api/health/db/route.js',
  'src/app/api/auth/[...nextauth]/route.js',
  'src/app/api/registration/public/charge/route.js',
];

test('the action-file list is derived from the directory and holds the known anchors', () => {
  const files = actionFiles();
  for (const anchor of MUST_CONTAIN) {
    assert.ok(
      files.includes(anchor),
      `${anchor} is missing from ${ACTIONS_DIR} — the directory is wrong, the ` +
      'glob matched nothing, or a module that should exist has been deleted. ' +
      'Any of those makes every assertion below vacuous'
    );
  }
});

test('CONTROL: the anchor check would notice a list that is empty or wrong', () => {
  // Without this, MUST_CONTAIN could be satisfied by an `includes` that always
  // returned true. Prove the same predicate rejects a list that lacks them.
  const wrong = ['index.js', 'helpers.js'];
  for (const anchor of MUST_CONTAIN) {
    assert.ok(!wrong.includes(anchor), `${anchor} must not be found in an unrelated list`);
  }
  assert.ok(actionFiles().length > MUST_CONTAIN.length, 'and the real list is larger than its anchors');
});

test('every src/lib/actions module parses', () => {
  const failures = [];
  for (const file of actionFiles()) {
    const abs = path.join(ACTIONS_DIR, file);
    try {
      transform(readFileSync(abs, 'utf8'), { transforms: ['imports'] });
    } catch (err) {
      failures.push(`${file}: ${err?.message ?? err}`);
    }
  }
  assert.deepEqual(
    failures, [],
    'these action modules do not parse — every text-based guard in this suite ' +
    'reads them as strings and would stay green regardless'
  );
});

test('CONTROL: the parse check rejects source that is genuinely broken', () => {
  // Without this, a transform() that swallowed its errors would make the test
  // above pass for anything. Uses the exact defect that motivated the guard: a
  // path containing a star-slash, written inside a block comment.
  assert.throws(
    () => transform('/**\n * see src/lib/*/trigger*Sync.js\n */\nconst x = 1;', { transforms: ['imports'] }),
    'a block comment closed early by a star-slash must fail to parse'
  );
  assert.throws(
    () => transform('export async function x( {', { transforms: ['imports'] }),
    'and so must an unbalanced paren'
  );
  assert.doesNotThrow(
    () => transform("import { after } from 'next/server';\nexport const x = 1;", { transforms: ['imports'] }),
    'while valid module source must pass'
  );
});

test('the route-handler list is derived from the tree and holds the known anchors', () => {
  const files = routeFiles().map(relFromRoot);
  for (const anchor of ROUTE_MUST_CONTAIN) {
    assert.ok(
      files.includes(anchor),
      `${anchor} is missing from the derived route list. The walk root is wrong, ` +
      'the walker stopped descending, or it cannot handle that directory name ' +
      '(a dynamic segment is bracket-named). Any of those makes the parse ' +
      'assertion below vacuous — a list of zero files parses perfectly.'
    );
  }
});

test('CONTROL: the route anchor check would notice a list that is empty or wrong', () => {
  // Mirrors the actions control: without this, ROUTE_MUST_CONTAIN could be
  // satisfied by an `includes` that always returned true, or by a walker whose
  // emptiness nobody noticed. Prove the same predicate rejects a wrong list…
  const wrong = ['src/app/api/route.js', 'src/app/page.jsx'];
  for (const anchor of ROUTE_MUST_CONTAIN) {
    assert.ok(!wrong.includes(anchor), `${anchor} must not be found in an unrelated list`);
  }
  assert.ok(!ROUTE_MUST_CONTAIN.some((a) => [].includes(a)), 'nor in an empty one');
  // …and that the real list is a tree, not one directory's worth of files.
  const files = routeFiles();
  assert.ok(
    files.length > ROUTE_MUST_CONTAIN.length,
    `derived route list holds only ${files.length} files — too few to be the API tree`
  );
  const depths = new Set(files.map((f) => relFromRoot(f).split('/').length));
  assert.ok(
    depths.size > 1,
    'every route sits at the same depth — the walker is not actually recursing'
  );
});

test('every src/app/api route handler parses', () => {
  const failures = [];
  for (const abs of routeFiles()) {
    try {
      transform(readFileSync(abs, 'utf8'), { transforms: ['imports'] });
    } catch (err) {
      failures.push(`${relFromRoot(abs)}: ${err?.message ?? err}`);
    }
  }
  assert.deepEqual(
    failures, [],
    'these route handlers do not parse. NOTHING in this suite imports a route ' +
    'handler, so without this check a syntax error here is invisible until the ' +
    'build — or until the route 500s in production'
  );
});
