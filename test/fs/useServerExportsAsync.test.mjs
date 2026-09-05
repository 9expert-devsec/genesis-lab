import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ACTIONS_DIR = 'src/lib/actions';

/**
 * ══ EVERY EXPORT OF A `'use server'` MODULE MUST BE AN ASYNC FUNCTION ═══════
 *
 * Not a style rule. A non-async export is a BUILD ERROR that takes the entire
 * application down:
 *
 *     × Only async functions are allowed to be exported in a "use server" file.
 *       ╭─[src/lib/actions/course-promos.js:230:1]
 *
 * Every route 500s — not only the screens that import the offending module.
 *
 * ══ WHY THIS GUARD EXISTS, AND WHY IT HAD TO BE A SOURCE SCAN ══════════════
 *
 * It shipped. `course-promos.js` carried two `export const` lines from commit
 * ad812993, and they sat there through an entire subsequent round of work in
 * which `npm test` reported 9398 passing, 57 failing, zero drift, at every one
 * of seven commits — while `/`, `/promotions` and every other route returned
 * 500.
 *
 * THE SUITE HAS NO BUNDLER. It loads modules through test/loader.mjs, which
 * resolves `@/` and transpiles JSX with sucrase. Sucrase does not enforce the
 * `'use server'` contract; only the Next/SWC build does. So a green suite says
 * NOTHING about whether the app builds, and no amount of runtime testing in
 * this tier could have caught it — the module imports and executes perfectly.
 *
 * That is why this is a SOURCE SCAN rather than an import test. It reads the
 * text, because the text is where the defect is and the loader will never
 * object to it.
 *
 * ── THE LESSON, RECORDED WHERE IT WILL BE READ AGAIN ─────────────────────
 * A green suite does not mean the app builds. A round that skips
 * `npm run build` should say plainly that build status is UNVERIFIED rather
 * than letting a pass count imply otherwise.
 */

/** Every `.js` directly under src/lib/actions. The directory is flat — asserted below. */
function actionFiles() {
  return readdirSync(path.join(ROOT, ACTIONS_DIR), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => `${ACTIONS_DIR}/${e.name}`)
    .sort();
}

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Does this source begin with a `'use server'` directive?
 *
 * A directive is only a directive at the TOP of the module — anywhere else it
 * is a bare string expression and means nothing. Leading comments and blank
 * lines are allowed before it, which is why this skips them rather than only
 * testing line 1. (Today every such file in the directory does put it on line
 * 1; the scan does not depend on that, and a test below states it.)
 */
function hasUseServer(src) {
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return /^\s*['"]use server['"]\s*;?/.test(withoutComments);
}

/**
 * Top-level exports that are NOT `export async function`.
 *
 * Anchored to column 0 (`^` with `m`), because a nested `export` is not
 * syntactically possible at any other indentation in a module — and matching
 * indented text would report the contents of template literals and comments.
 *
 * Deliberately catches ALL of these, each of which is the same build error:
 *   export const X          export let X            export var X
 *   export class X          export function X       export default …
 *   export { X }            export { X } from '…'   export * from '…'
 *
 * `export async function` is the only permitted form and is excluded first.
 */
function nonAsyncExports(src) {
  const out = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!/^export\b/.test(line)) return;
    if (/^export\s+async\s+function\s/.test(line)) return;
    out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

// ── the sweep ─────────────────────────────────────────────────────────────

test('the actions directory is FLAT — the sweep sees every file in it', () => {
  /**
   * `readdirSync` without recursion would silently skip a subdirectory, and the
   * sweep would report "clean" for files it never opened. Asserted rather than
   * assumed, so adding a subdirectory reddens this instead of quietly narrowing
   * the guard.
   */
  const dirs = readdirSync(path.join(ROOT, ACTIONS_DIR), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  assert.deepEqual(dirs, [], `src/lib/actions has subdirectories the sweep does not descend into: ${dirs.join(', ')}`);
});

test('the sweep actually finds files, and most of them are server actions', () => {
  // A scan over an empty list passes vacuously. This is the floor that stops it.
  const files = actionFiles();
  assert.ok(files.length > 30, `only ${files.length} action files found — has the path moved?`);

  const serverFiles = files.filter((f) => hasUseServer(read(f)));
  assert.ok(
    serverFiles.length > 20,
    `only ${serverFiles.length} of ${files.length} carry 'use server' — the directive probe has stopped working`,
  );
});

test("EVERY export of EVERY 'use server' file under src/lib/actions is an async function", () => {
  const offenders = [];
  for (const file of actionFiles()) {
    const src = read(file);
    if (!hasUseServer(src)) continue;
    for (const bad of nonAsyncExports(src)) {
      offenders.push(`${file}:${bad.line}  ${bad.text}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'non-async exports in a \'use server\' module — this is a BUILD ERROR that 500s every route ' +
      'and the suite cannot otherwise see it:\n    ' + offenders.join('\n    '),
  );
});

// ── controls ──────────────────────────────────────────────────────────────

test('CONTROL: the detector catches every forbidden export form', () => {
  /**
   * The exact shape that shipped is first. The rest are the other spellings of
   * the same build error — a guard that only knew `export const` would pass a
   * file that had been "fixed" into `export { EB_CLAIMED }`, which fails
   * identically.
   */
  const cases = [
    ["export const EB_CLAIMED = 'EB_CLAIMED';", 'the form that actually shipped'],
    ['export let x = 1;', 'let'],
    ['export var x = 1;', 'var'],
    ['export class X {}', 'class'],
    ['export function notAsync() {}', 'a non-async function'],
    ['export default async function () {}', 'a default export'],
    ["export { EB_CLAIMED } from '@/lib/earlyBird/codes';", 'a RE-EXPORT, which fails identically'],
    ["export * from './codes';", 'a star re-export'],
  ];
  for (const [line, label] of cases) {
    const src = `'use server';\n\n${line}\n`;
    assert.equal(nonAsyncExports(src).length, 1, `the detector missed ${label}: ${line}`);
  }
});

test('CONTROL: the detector does NOT fire on the permitted form, or on lookalikes', () => {
  /**
   * A guard that flagged everything would be satisfied by the sweep above being
   * red for the wrong reason — and would be deleted within a week. These are
   * the shapes real action files are full of.
   */
  const allowed = [
    'export async function listThings() {}',
    'const NOT_EXPORTED = 1;',
    'function helper() {}',
    '  export const indentedInsideATemplate = 1;',
    "// export const commentedOut = 'x';",
    'async function privateHelper() {}',
  ];
  const src = `'use server';\n\n${allowed.join('\n')}\n`;
  assert.deepEqual(nonAsyncExports(src), []);
});

test('CONTROL: a planted offender is caught by the SAME sweep the real files run through', () => {
  /**
   * The two controls above exercise the detector on strings. This one proves
   * the SWEEP — directive probe, line walk and all — reports a real offender,
   * because a detector that works on a fixture and a sweep that never reaches
   * it is the failure that let the original defect through.
   */
  const planted = `'use server';\n\nimport x from 'y';\n\nexport const CODE = 'CODE';\n\nexport async function ok() {}\n`;
  assert.equal(hasUseServer(planted), true);
  const found = nonAsyncExports(planted);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 5);
  assert.match(found[0].text, /export const CODE/);
});

test('the directive probe tolerates leading comments, and ignores a non-top-level string', () => {
  assert.equal(hasUseServer("'use server';\n"), true);
  assert.equal(hasUseServer('// a note\n\n"use server";\n'), true);
  assert.equal(hasUseServer('/** a block */\n\'use server\';\n'), true);
  // NOT a directive: it is below real code, so it is a bare expression.
  assert.equal(hasUseServer("import x from 'y';\n'use server';\n"), false);
  assert.equal(hasUseServer("export async function a() {}\n"), false);
});

test('the Early Bird codes live in a module that is NOT a server boundary', () => {
  /**
   * The specific regression. The codes were moved out of `course-promos.js`
   * precisely because that file is a server boundary; a directive appearing in
   * their new home would put them straight back where they started.
   */
  const src = read('src/lib/earlyBird/codes.js');
  assert.equal(hasUseServer(src), false, "the codes module acquired a 'use server' directive");
  assert.equal(/['"]use client['"]/.test(src), false, 'it acquired a use client directive');
  assert.match(src, /export const EB_CLAIMED/);
  assert.match(src, /export const EB_NEEDS_ADOPTION/);
});

test('all three readers import the codes — nobody retypes the literal', () => {
  /**
   * A vocabulary two callers retype is a drift waiting to happen: rename the
   * code on the server and both comparisons keep compiling, keep passing, and
   * silently stop matching — the adoption confirm never appears again and
   * nothing reports it.
   */
  const readers = [
    'src/lib/actions/course-promos.js',
    'src/app/admin/courses/[courseId]/_components/EarlyBirdTab.jsx',
    'src/app/admin/promotions/[id]/early-bird/_components/PromotionEarlyBirdClient.jsx',
  ];
  for (const file of readers) {
    const src = read(file);
    assert.match(src, /from '@\/lib\/earlyBird\/codes'/, `${file} does not import the codes`);
    // …and holds no hand-written copy of either literal outside a comment.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(
      /['"]EB_NEEDS_ADOPTION['"]|['"]EB_CLAIMED['"]/.test(code),
      false,
      `${file} still hand-writes one of the code literals`,
    );
  }
});

test('CONTROL: the literal probe sees a retyped code when there is one', () => {
  const planted = "if (result?.code === 'EB_NEEDS_ADOPTION') { adopt(); }";
  assert.equal(/['"]EB_NEEDS_ADOPTION['"]|['"]EB_CLAIMED['"]/.test(planted), true);
  // …and the comment-stripper does not hide a real one on a code line.
  const withComment = "// mentions 'EB_CLAIMED' in prose\nconst x = 'EB_CLAIMED';";
  const stripped = withComment.replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/['"]EB_CLAIMED['"]/.test(stripped), true);
});
