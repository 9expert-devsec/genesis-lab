import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
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
// ── SUCRASE ALONE WAS NOT A PARSE, AND THAT SHIPPED A BROKEN BUILD ──────────
//
// This file used to be `transform(src, {transforms:['imports']})` and nothing
// else. That is not enough, and the gap is not theoretical: a cherry-pick left
// `src/lib/actions/dashboard.js` with a parameter `from` redeclared as a `const`
// in the same function. Vercel rejected it —
//
//     Module parse failed: Identifier 'from' has already been declared (111:12)
//
// — and this guard, whose entire reason for existing is that a syntax error in
// an action module must never be invisible, was GREEN on that file. Measured:
//
//     SUCRASE on the broken dashboard.js                      PARSED OK
//     SUCRASE on `function f(from='',to=''){const {from,to}=g()}`  PARSED OK
//
// Sucrase is syntax-directed and does no scope analysis. A REDECLARATION is a
// scope error, not a syntax error, so it is invisible to it — as is anything
// else V8 rejects after parsing but before running.
//
// So the check is now sucrase FOR MODULE SYNTAX and V8 FOR THE ACTUAL PARSE:
// `transform` rewrites the import/export forms `vm.Script` will not accept, and
// `new vm.Script` then hands the result to the same parser Node and the build
// use. It costs one extra construction per file, needs NO flag and spawns
// nothing, and it catches both this defect and the star-slash that motivated the
// original file.
//
// WHAT THIS CANNOT SEE — and the first entry is the one that matters:
//   · A FREE IDENTIFIER. The same broken module referenced SEVEN symbols it
//     neither imported nor defined (DEFAULT_RANGE, dashboardScopes, dateRange,
//     buildDashboardMetrics, …). Those are RUNTIME ReferenceErrors — they fire
//     when the function is called, not when the file is parsed — and a parser is
//     CORRECT to accept them. Catching them needs the module imported and its
//     export invoked, which for a `'use server'` module is a much larger
//     question than this file. The gap is named, not closed.
//   · anything else about runtime. A module that parses can still throw on
//     import or export nothing.
//   · type or contract errors of any kind.
//   · WHETHER THE CODE IS REACHABLE. A parser sees dead code and live code
//     alike; that limit belongs to every text-based guard in this suite and is
//     written up in
//     docs/ticket-a-source-scan-cannot-tell-live-code-from-dead-code.md.
//   · a route written as route.ts / route.jsx. This repo is JS-only and every
//     one of its handlers is route.js; a TypeScript route would be skipped in
//     silence. Widen ROUTE_BASENAMES deliberately if that ever changes.
//   · lib helpers, components and pages. Most of those ARE reached by some
//     test; the two directories here were the ones reached by none.
//
// And the standing lesson this file is one half of: A GREEN SUITE DOES NOT MEAN
// THE APP BUILDS. Even upgraded, this catches parse errors only. `npm run build`
// is the instrument for the rest.

/**
 * Parse one module the way Node would, throwing on anything V8 rejects.
 *
 * Two stages, and both are load-bearing: sucrase rewrites `import`/`export`
 * (which `vm.Script` cannot accept) without the JSX transform these files never
 * need, and `vm.Script` is the real parse — full scope analysis, no execution.
 * Nothing is run, so mongoose and next/server are never loaded and the reason
 * no test imports these modules does not apply here.
 */
function parseModule(source) {
  new vm.Script(transform(source, { transforms: ['imports'] }).code);
}

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
      parseModule(readFileSync(abs, 'utf8'));
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
  // Without this, a checker that swallowed its errors would make the test above
  // pass for anything. The first case is the exact defect that motivated the
  // original file: a path containing a star-slash, inside a block comment.
  assert.throws(
    () => parseModule('/**\n * see src/lib/*/trigger*Sync.js\n */\nconst x = 1;'),
    'a block comment closed early by a star-slash must fail to parse'
  );
  assert.throws(
    () => parseModule('export async function x( {'),
    'and so must an unbalanced paren'
  );
  assert.doesNotThrow(
    () => parseModule("import { after } from 'next/server';\nexport const x = 1;"),
    'while valid module source must pass'
  );
});

test('CONTROL: the check catches a REDECLARATION, which sucrase alone does not', () => {
  /**
   * The control for the upgrade, and it asserts BOTH halves — that the new
   * checker rejects the defect, and that the old one accepted it. Without the
   * second half, "V8 is stronger here" is an unproven claim and someone could
   * revert `parseModule` to a bare `transform` with every test still green.
   *
   * The subject is the real defect, reduced: `getDashboardMetrics(range, from,
   * to)` with `const { from, to }` in its body. It reached production as
   * `Module parse failed: Identifier 'from' has already been declared (111:12)`.
   */
  const redeclared = "export async function f(range, from = '', to = '') {\n"
    + '  const { from, to } = g(range);\n'
    + '  return from + to;\n}';

  assert.throws(
    () => parseModule(redeclared),
    /already been declared/,
    'a parameter redeclared as a const in the same scope must fail to parse'
  );
  assert.doesNotThrow(
    () => transform(redeclared, { transforms: ['imports'] }),
    'sucrase alone rejects this after all — the upgrade would be unnecessary, '
    + 'and the reasoning in this file’s header is wrong'
  );
});

test('CONTROL: a free identifier still PASSES — the gap is named, not closed', () => {
  /**
   * Not an oversight being locked in: a parser is CORRECT to accept a reference
   * to an undeclared symbol, because it is a runtime error. Pinning it here
   * means the header's "WHAT THIS CANNOT SEE" is checked rather than merely
   * asserted, and the day someone closes that gap this test fails and tells them
   * to update the header instead of leaving it stale.
   */
  assert.doesNotThrow(
    () => parseModule('export const a = UNDEFINED_THING;'),
    'a free identifier now throws — the header must stop claiming it cannot be seen'
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
      parseModule(readFileSync(abs, 'utf8'));
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
