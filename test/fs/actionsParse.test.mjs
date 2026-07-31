import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { transform } from 'sucrase';

// EVERY server-action module must parse.
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
// WHAT THIS CANNOT SEE:
//   · anything about runtime. A module that parses can still throw on import,
//     reference an undefined symbol, or export nothing.
//   · type or contract errors of any kind.
//   · files outside src/lib/actions. Route handlers, lib helpers and components
//     have the same exposure; widening this is a separate decision, because
//     most of THOSE are reached by some test already.
//
// The transform is `imports`-only: enough to force a full parse, without the
// JSX transform these files never need.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ACTIONS_DIR = path.join(ROOT, 'src', 'lib', 'actions');

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
