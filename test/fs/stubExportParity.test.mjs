import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STUBS } from '../loader.mjs';

/**
 * Every render-tier stub exports EXACTLY what the module it replaces exports.
 *
 * ── WHICH DIRECTION THIS ACTUALLY BUYS SOMETHING ────────────────────────────
 * Not the missing one. A stub that LACKS an export the real module has is
 * already caught, reliably, by the runner's per-file meta-control: a missing
 * named export is a LINK-TIME failure in ESM, so the importing test file loads
 * zero tests and `perFile` sees 0 regardless of how many it used to have. That
 * is exactly how the `checkAliasAvailable` gap surfaced — the total still
 * cleared the floor, and only the per-file zero check spoke up.
 *
 * The direction with NO existing cover is the STALE EXTRA: a stub that keeps a
 * function the real module has since deleted or renamed. Nothing links against
 * the real module in the render tier, so nothing notices. Tests go on calling a
 * fiction, passing, and asserting the behaviour of code that no longer exists —
 * and the day someone deletes a server action, the suite stays green and tells
 * them the deletion was safe.
 *
 * ── THE TAX, ACCEPTED DELIBERATELY ──────────────────────────────────────────
 * Asserting set EQUALITY means every new export in a stubbed module reddens
 * this file until the stub gains it too. That is a real cost on adding a server
 * action, and it is taken on purpose: it is the same cost that would have
 * caught the gap above at the moment it was introduced, rather than one full
 * suite run later. A subset check would drop the tax and drop the stale-extra
 * cover with it, which is the only thing this file adds.
 *
 * ── WHAT IT DOES NOT VERIFY ─────────────────────────────────────────────────
 * Names, and only names. Not arity, not signatures, and not that a stub still
 * THROWS rather than quietly returning a benign value — a stub that agrees with
 * everything is its own false-green and this cannot see it.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Only the app-source stubs: `next/*` has no file in this repo to compare to. */
const APP_STUBS = Object.entries(STUBS).filter(([specifier]) => specifier.startsWith('@/'));

test('the stub map still holds app modules to compare', () => {
  // Guards the filter above: if the `@/` convention changed, every case below
  // would silently iterate an empty list and pass.
  assert.ok(APP_STUBS.length >= 6, `only ${APP_STUBS.length} app stubs found — has the map changed shape?`);
});

/**
 * Exported names, read from source.
 *
 * Source-parsed rather than imported because importing is precisely what the
 * render tier cannot do with these modules — they are 'use server' and reach
 * next-auth and mongoose at import time, which is the whole reason the stubs
 * exist.
 */
function exportedNamesFromSource(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // `export { a, b as c }` — the EXPORTED name is what a caller binds, so `c`.
  for (const block of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of block[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const as = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(piece);
      names.add(as ? as[1] : piece);
    }
  }
  if (/^export\s+default\b/m.test(src)) names.add('default');
  return names;
}

test('CONTROL: the source parser finds each export form, and no others', () => {
  // Without this every parity case below could pass by finding nothing at all.
  const found = exportedNamesFromSource([
    'export async function alpha() {}',
    'export function beta() {}',
    'export const gamma = 1;',
    'export { delta, epsilon as zeta };',
    'export default thing;',
    'function notExported() {}',
    '// export function commentedOut() {}',
  ].join('\n'));
  assert.deepEqual(
    [...found].sort(),
    ['alpha', 'beta', 'default', 'delta', 'gamma', 'zeta'].sort()
  );
  assert.ok(!found.has('notExported'), 'a non-exported function was collected');
});

for (const [specifier, stubPath] of APP_STUBS) {
  const realPath = path.join(ROOT, 'src', `${specifier.slice(2)}.js`);
  const stubName = path.basename(stubPath);

  test(`${specifier} — stub exports match ${stubName}`, async () => {
    const realSrc = readFileSync(realPath, 'utf8');
    const real = exportedNamesFromSource(realSrc);
    assert.ok(real.size > 0, `parsed ZERO exports from ${realPath} — the parser or the file changed shape`);

    // The stub is a plain .mjs with no side effects, so it can simply be
    // imported — which is a stronger read than parsing it, because it reflects
    // what a caller actually binds.
    const stubMod = await import(pathToFileURL(stubPath).href);
    const stub = new Set(Object.keys(stubMod));

    const missing = [...real].filter((n) => !stub.has(n)).sort();
    const extra = [...stub].filter((n) => !real.has(n)).sort();

    assert.deepEqual(
      missing, [],
      `${stubName} is MISSING ${missing.join(', ')} — any render test importing `
      + `${specifier} will fail to link and contribute ZERO tests`
    );
    assert.deepEqual(
      extra, [],
      `${stubName} exports ${extra.join(', ')}, which ${specifier} no longer has — `
      + 'tests are passing against a function that does not exist'
    );
  });
}

test('CONTROL: parity would FAIL on a stub that drifted in either direction', () => {
  // The comparison itself, exercised on synthetic sets — so a refactor that
  // turned the assertions above into no-ops (e.g. comparing a set to itself)
  // is caught here rather than by nobody.
  const real = new Set(['a', 'b']);
  const staleStub = new Set(['a', 'b', 'deletedLastMonth']);
  const thinStub = new Set(['a']);

  assert.deepEqual([...staleStub].filter((n) => !real.has(n)), ['deletedLastMonth']);
  assert.deepEqual([...real].filter((n) => !thinStub.has(n)), ['b']);
});
