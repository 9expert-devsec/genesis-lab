import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readSource, walkSources, sourceExists, ROOT } from '../sourceScan.mjs';

/**
 * THE PANEL KEY NEVER REACHES A BROWSER BUNDLE.
 *
 * src/lib/chatPanel/client.js reads CHAT_PANEL_API_KEY and sends it. Two
 * things keep that server-side, and this file asserts both at the source
 * level so the suite reddens before the build does:
 *
 *   1. the module opens with `import 'server-only'` — the build refuses a
 *      Client Component import of it (first use of that package in this repo);
 *   2. NO file carrying the 'use client' directive reaches `@/lib/chatPanel`,
 *      directly OR through a chain of local imports. The transitive half is
 *      the one that matters: `server-only` fires on the direct import, but a
 *      client file importing a helper that imports the client is the same leak
 *      one hop away, and reads as innocent at the call site.
 *
 * And, from the same reasoning as test/fs/chatWiring's NEXT_PUBLIC walk:
 *
 *   3. no NEXT_PUBLIC_ variable name contains CHAT_PANEL. A NEXT_PUBLIC_ copy
 *      would inline the value into every browser bundle at build time.
 *
 * ── READING IMPORTS FROM `withImports`, NOT `code` ──────────────────────────
 * readSource's `code` view STRIPS import statements — a "nothing imports X"
 * guard read from it passes vacuously (defect 5 in sourceScan's header). Both
 * the direct and the transitive check therefore read `withImports`, which
 * keeps them and still drops comments, so a comment naming the module cannot
 * satisfy or trip the matcher.
 *
 * ── WHAT THE WALK RESOLVES, AND WHAT IT DOES NOT ────────────────────────────
 * `@/…` aliases and relative specifiers, with the loader's own extension
 * rules (.js, .jsx, /index). Bare package imports are external and stop the
 * walk. `export … from` re-exports are followed too — a barrel is a chain
 * link. Dynamic `import()` with a literal specifier is followed; a computed
 * one is not, and there are none in src today.
 */

const CLIENT_MODULE = 'src/lib/chatPanel/client.js';
const PANEL_DIR = 'src/lib/chatPanel/';
const SRC_DIR = path.join(ROOT, 'src');

const ALL = walkSources('src');
const byRel = new Map(ALL.map((f) => [f.rel, f]));

/** Every local specifier a file imports or re-exports from, as written. */
function specifiersOf(withImports) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of withImports.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** A specifier → the repo-relative file it names, or null when external/unresolvable. */
function resolveLocal(fromRel, spec, files = byRel) {
  let abs = null;
  if (spec.startsWith('@/')) abs = path.join(SRC_DIR, spec.slice(2));
  else if (spec.startsWith('.')) abs = path.resolve(path.dirname(path.join(ROOT, fromRel)), spec);
  else return null;
  const candidates = [abs, `${abs}.js`, `${abs}.jsx`, path.join(abs, 'index.js'), path.join(abs, 'index.jsx')];
  for (const c of candidates) {
    const rel = path.relative(ROOT, c).split(path.sep).join('/');
    if (files.has(rel)) return rel;
  }
  return null;
}

/** The set of repo-relative files reachable from `rel` through local imports (excluding itself). */
function reachableFrom(rel, files = byRel) {
  const seen = new Set();
  const stack = [rel];
  while (stack.length) {
    const cur = stack.pop();
    const file = files.get(cur);
    if (!file) continue;
    for (const spec of specifiersOf(file.withImports)) {
      const next = resolveLocal(cur, spec, files);
      if (next && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

const isClientFile = (f) => /^\s*['"]use client['"]/.test(f.code);
const CLIENT_FILES = ALL.filter(isClientFile);

// ── the extraction is asserted before anything is concluded from it ─────────

test('bundle guard: the walk found the source tree, the client module, and the client-directive files', () => {
  assert.ok(ALL.length > 500, `walked only ${ALL.length} files — is the walk broken?`);
  assert.ok(sourceExists(CLIENT_MODULE), `${CLIENT_MODULE} is missing`);
  assert.ok(byRel.has(CLIENT_MODULE));
  assert.ok(CLIENT_FILES.length > 50, `only ${CLIENT_FILES.length} 'use client' files — matcher broken?`);
  assert.ok(CLIENT_FILES.some((f) => f.rel === 'src/components/chat/ChatPanel.jsx'), 'a known client file was not classified as one');
});

test('CONTROL: the import extractor sees every import form the walk relies on', () => {
  const sample = [
    "import a from '@/lib/one';",
    "import { b } from './two';",
    "import * as c from '../three.js';",
    "import '@/lib/four';",
    "export { d } from '@/lib/five';",
    "export * from './six';",
    "const seven = await import('@/lib/seven');",
    "import type from 'external-pkg';",
  ].join('\n');
  assert.deepEqual(
    specifiersOf(sample),
    ['@/lib/one', './two', '../three.js', '@/lib/four', '@/lib/five', './six', '@/lib/seven', 'external-pkg'],
  );
});

test('CONTROL: the local resolver follows the loader\'s rules (alias, relative, extension, index) and stops at packages', () => {
  assert.equal(resolveLocal('src/app/admin/chat/page.jsx', '@/lib/chatPanel/client'), CLIENT_MODULE);
  assert.equal(resolveLocal('src/lib/chatPanel/client.js', './range'), 'src/lib/chatPanel/range.js');
  assert.equal(resolveLocal('src/lib/chatPanel/client.js', '@/lib/chatPanel/range.js'), 'src/lib/chatPanel/range.js');
  assert.equal(resolveLocal('src/lib/chatPanel/client.js', 'server-only'), null, 'a bare package is external');
  assert.equal(resolveLocal('src/lib/chatPanel/client.js', '@/lib/does-not-exist'), null);
});

// ── 1. the marker import ─────────────────────────────────────────────────────

test('bundle guard: the panel client opens with `import \'server-only\'`', () => {
  const { withImports } = readSource(CLIENT_MODULE);
  const firstStatement = withImports.trimStart().split('\n')[0];
  assert.match(firstStatement, /^import ['"]server-only['"];?$/, 'the marker must be the FIRST statement, before anything that could run');
  assert.ok(sourceExists('node_modules/server-only/package.json'), 'the `server-only` package is not installed');
  const pkg = JSON.parse(readSource('package.json').raw);
  assert.ok(pkg.dependencies?.['server-only'], 'server-only must be a declared dependency, not a transitive accident');
});

// ── 2. no client file reaches the module, directly or transitively ──────────

test('bundle guard: no \'use client\' file imports @/lib/chatPanel directly', () => {
  const offenders = CLIENT_FILES
    .filter((f) => specifiersOf(f.withImports).some((s) => s.startsWith('@/lib/chatPanel') || resolveLocal(f.rel, s)?.startsWith(PANEL_DIR)))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [], 'a client component imports the panel module — the key would be in the browser bundle');
});

test('bundle guard: no \'use client\' file reaches @/lib/chatPanel through a chain of local imports', () => {
  const offenders = [];
  for (const f of CLIENT_FILES) {
    const reach = reachableFrom(f.rel);
    const hit = [...reach].find((r) => r.startsWith(PANEL_DIR));
    if (hit) offenders.push(`${f.rel} → … → ${hit}`);
  }
  assert.deepEqual(offenders, [], 'a client component reaches the panel module transitively');
});

test('CONTROL: the transitive walk CAN go red — a fabricated client file importing a helper that imports the client', () => {
  const fake = new Map(byRel);
  const helperRel = 'src/lib/fakeHelper.js';
  const clientRel = 'src/components/FakeClient.jsx';
  fake.set(helperRel, { rel: helperRel, code: '', withImports: "import { getPanelSummary } from '@/lib/chatPanel/client';\nexport const x = getPanelSummary;" });
  fake.set(clientRel, { rel: clientRel, code: "'use client';", withImports: "'use client';\nimport { x } from '@/lib/fakeHelper';" });
  // The walker reads the map it is handed, so the real one is never touched.
  const reach = reachableFrom(clientRel, fake);
  assert.ok(reach.has(helperRel), 'the walk did not take the first hop');
  assert.ok(reach.has(CLIENT_MODULE), 'the walk did not take the second hop — the transitive guard is vacuous');
  assert.equal(byRel.has(clientRel), false, 'the control must not leak into the real map');
});

// ── 3. no NEXT_PUBLIC_ spelling ──────────────────────────────────────────────

test('bundle guard: no NEXT_PUBLIC_ variable name contains CHAT_PANEL', () => {
  const offenders = [];
  for (const f of ALL) {
    if (/NEXT_PUBLIC_[A-Z_]*CHAT_PANEL/.test(f.withImports)) offenders.push(f.rel);
  }
  for (const rel of ['.env.example', 'next.config.mjs']) {
    if (sourceExists(rel) && /NEXT_PUBLIC_[A-Z_]*CHAT_PANEL/.test(readSource(rel).raw)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'a NEXT_PUBLIC_ copy would inline the panel host or key into the browser bundle');
});

test('CONTROL: the NEXT_PUBLIC_ matcher fires on the spelling it forbids', () => {
  assert.equal(/NEXT_PUBLIC_[A-Z_]*CHAT_PANEL/.test('process.env.NEXT_PUBLIC_CHAT_PANEL_API_URL'), true);
  assert.equal(/NEXT_PUBLIC_[A-Z_]*CHAT_PANEL/.test('process.env.CHAT_PANEL_API_URL'), false);
});
