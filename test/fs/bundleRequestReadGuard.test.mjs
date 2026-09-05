import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const ACTIONS = 'src/lib/actions/pageBuilder.js';

/**
 * THE PUBLIC READ THE BUNDLE FORM IS ALLOWED TO MAKE, AND THE ONE IT IS NOT.
 *
 * `src/lib/actions/pageBuilder.js` carries `'use server'`, so EVERY export of
 * it is a POST endpoint reachable by anything that can speak the action
 * protocol. Two of them read a page by id and they are not interchangeable:
 *
 *   getPageBuilderPageById            findById(id).lean() — no status filter,
 *                                     no projection. Returns the WHOLE
 *                                     document, unpublished `draft` included.
 *   getPublishedPageBuilderPageById   status: "published" + .select("-draft").
 *
 * The first one's exposure is filed as its own ticket and is deliberately not
 * fixed here. What this file pins is that the bundle path never reaches for it,
 * because the failure mode is silent: the form would work perfectly, and would
 * be serving draft content to the public on a page nobody has published.
 */

test('the published-by-id read filters on status AND projects the draft away', () => {
  const code = read(ACTIONS);
  const start = code.indexOf('export async function getPublishedPageBuilderPageById');
  assert.notEqual(start, -1, 'the published-only by-id read is gone');
  const body = code.slice(start, start + 900);

  assert.match(body, /status:\s*"published"/, 'the status filter is gone — any status would be readable');
  assert.match(body, /\.select\("-draft"\)/, 'the -draft projection is gone — draft content would leave the database');
});

test('CONTROL: the same two probes FAIL against the unguarded twin', () => {
  /**
   * Without this, the assertions above could be satisfied by a probe that
   * matches anything. `getPageBuilderPageById` is the real function next door
   * that carries NEITHER guard, so running the identical probes over it must
   * come back empty — which is also the statement of what is wrong with it.
   */
  const code = read(ACTIONS);
  const start = code.indexOf('export async function getPageBuilderPageById');
  assert.notEqual(start, -1);
  const body = code.slice(start, code.indexOf('\n}', start));

  assert.equal(/status:\s*"published"/.test(body), false);
  assert.equal(/\.select\("-draft"\)/.test(body), false);
  assert.equal(/requireAdmin/.test(body), false, 'it gained a guard — update the ticket rather than this test');
});

test('every export of the actions file is async — a non-async one is a build error no test can see', () => {
  /**
   * `'use server'` requires it, and the failure is invisible to this suite: the
   * module imports and runs fine under node, and only `next build` rejects it.
   * Asserted here because this round adds an export to the file.
   */
  const code = read(ACTIONS);
  assert.match(code.slice(0, 40), /^"use server";/, 'the directive moved — this guard is aimed at the wrong file');

  const exports = [...code.matchAll(/^export\s+(async\s+)?function\s+(\w+)/gm)];
  assert.ok(exports.length > 20, `only ${exports.length} exports found — the matcher has stopped seeing them`);

  const nonAsync = exports.filter((m) => !m[1]).map((m) => m[2]);
  assert.deepEqual(nonAsync, [], `non-async exports in a 'use server' module: ${nonAsync.join(', ')}`);
});

test('CONTROL: the export matcher can see a non-async export', () => {
  const sample = 'export async function a() {}\nexport function b() {}\n';
  const found = [...sample.matchAll(/^export\s+(async\s+)?function\s+(\w+)/gm)];
  assert.deepEqual(found.filter((m) => !m[1]).map((m) => m[2]), ['b']);
});

test('the bundle request guard reaches for NO unguarded page read', () => {
  const guard = read('src/lib/registration/bundleRequest.js');
  // It is pure and takes the page as an argument: it must not import the
  // actions module at all, or it would drag `next/cache` and a db connection
  // into the pure tier and acquire the ability to read a page for itself.
  assert.equal(
    /from\s+'@\/lib\/actions\/pageBuilder'/.test(guard),
    false,
    'the pure guard now imports the actions module',
  );
  assert.equal(/getPageBuilderPageById/.test(guard), false);
});

test('CONTROL: the probe would see that import if it were there', () => {
  const planted = "import { getPageBuilderPageById } from '@/lib/actions/pageBuilder';\n";
  assert.equal(/from\s+'@\/lib\/actions\/pageBuilder'/.test(planted), true);
  assert.equal(/getPageBuilderPageById/.test(planted), true);
});

test('the shared refusal strings have exactly one definition each', () => {
  /**
   * The renderer and the form must show the SAME sentence for a closed bundle.
   * The string moved out of promotion_bundle.jsx for that reason, so a literal
   * copy reappearing anywhere is the drift this move exists to prevent.
   */
  const home = read('src/lib/pageBuilder/bundleRegistration.js');
  assert.match(home, /BUNDLE_CLOSED_MESSAGE\s*=\s*'โปรโมชันนี้ปิดรับสมัครแล้ว'/);

  const renderer = read('src/components/pageBuilder/sections/promotion_bundle.jsx');
  assert.match(renderer, /BUNDLE_CLOSED_MESSAGE/, 'the renderer no longer reads the shared string');
  assert.equal(
    renderer.includes("'โปรโมชันนี้ปิดรับสมัครแล้ว'"),
    false,
    'the renderer kept a literal copy of the closed message',
  );
});

test('CONTROL: the literal probe does match the one place the string is defined', () => {
  // Otherwise "the renderer has no copy" would be satisfied by a probe that
  // matches nothing anywhere.
  const home = read('src/lib/pageBuilder/bundleRegistration.js');
  assert.equal(home.includes("'โปรโมชันนี้ปิดรับสมัครแล้ว'"), true);
});
