/**
 * The reader behind test/fs/injectedDepCoverage.test.mjs.
 *
 * ── THE DEFECT CLASS THIS EXISTS FOR ────────────────────────────────────────
 * A pure-tier harness builds a `deps` object for a function that takes one, and
 * OMITS one of the names. The omitted dep falls through to its production
 * default, and if that default reaches the database the test is no longer pure:
 * it talks to whatever `@/lib/db/connect` resolves to on the machine running it.
 *
 * This is invisible in every direction a suite normally looks:
 *   · the test still PASSES — the store's own try/catch turns the failure into
 *     a benign null, so nothing goes red;
 *   · the cost is wall-clock, not a signal. Round 45 measured
 *     test/pure/listPublicCoursesHidden.test.mjs omitting `loadOrder`: nine
 *     calls each sat on mongoose's 10-second buffering timeout, taking a
 *     12-test file from ~30ms to 10.5 SECONDS and printing nine
 *     `[courseOrder] could not read the stored order` lines that read like
 *     ordinary fixture noise;
 *   · on a machine where the connection is reachable-but-slow, or where
 *     `bufferCommands` is off, or where the loader's `@/lib/db/connect` stub is
 *     not in the resolution path, the same omission HANGS the suite outright.
 *     `process.exit()` used to kill that hang; round 0 removed it — correctly,
 *     it was truncating red output — and its own note flags that a leaked handle
 *     now hangs instead of being killed.
 *
 * ── WHY THIS IS NOT A LIST OF FILE NAMES ────────────────────────────────────
 * Both ends are derived from source, so a new dep, a new harness, or a store
 * that starts reaching Mongo is covered the day it lands and nobody has to
 * remember to come back here:
 *
 *   1. WHICH DEPS ARE DB-BACKED comes from src/. Every `{ a = X, b = Y } = {}`
 *      parameter object is found by brace matching, and a dep counts as
 *      db-backed when its default is a CALLABLE living in a module that
 *      transitively imports `@/lib/db/connect`, a `models/` path or mongoose —
 *      static imports and `await import()` alike, since the stores defer theirs
 *      and a static-only walk would see none of it.
 *      CALLABLE, because `perPage = PAGE_SIZE` inside a db-reaching action
 *      module is a page size, not a database read; flagging it is the noise that
 *      gets a guard switched off. Measured: that exact entry is the only false
 *      positive the loose rule produced across src/.
 *   2. WHICH HARNESSES CLAIM A DEP SET comes from test/pure. Every object
 *      literal is brace-matched and reduced to its top-level keys; a literal
 *      counts as a harness for a dep set when its keys are a NON-EMPTY SUBSET of
 *      that set. Subset, not intersection: `{ calls, deps }` sits in the same
 *      file, names two things that are not deps, and is correctly ignored.
 *
 * ── WHAT IT CANNOT SEE, STATED RATHER THAN IMPLIED ──────────────────────────
 *   · A HARNESS BUILT WITHOUT AN OBJECT LITERAL. `Object.assign({}, base)`, or a
 *     deps object assembled key-by-key, has no literal to read. A literal
 *     carrying a `...spread` is SKIPPED rather than guessed at, and
 *     `skippedSpread` reports how many — a rising number there is this guard
 *     quietly losing coverage, which is why the count is asserted and not just
 *     returned.
 *   · A DEP SUPPLIED AS `undefined`. `{ loadOrder: undefined }` satisfies this
 *     scan and still falls through to the default at runtime.
 *   · A DEFAULT THAT REACHES MONGO WITHOUT AN IMPORT EDGE — through a global, a
 *     registry lookup, or a specifier built at runtime.
 *   · ANY TIER BUT pure/. fs/ and render/ drive the fake models on purpose, so
 *     the same omission there is not a defect and is not scanned.
 *   · THE DEP SET OF AN OVERLOADED NAME. Two functions in different modules
 *     sharing dep names are two sets to this reader and a literal is checked
 *     against each, so it requires the union — stricter, not looser.
 */
import path from 'node:path';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { ROOT, readSource, walkSources, blankStringBodies } from './sourceScan.mjs';

/** Identifiers that are never an injected store, so never a db-backed default. */
const GLOBALS = new Set([
  'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'process', 'globalThis', 'undefined', 'React', 'Promise', 'Set', 'Map',
]);

/** A specifier that IS the database, wherever it is reached from. */
const DB_SPEC = (spec) =>
  spec === 'mongoose' || spec === '@/lib/db/connect' || /(^|\/)models\//.test(spec);

/** `@/x` and `./x` to a repo-relative src path; null for a bare specifier. */
function resolveSpec(spec, fromRel) {
  let base;
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else return null;
  for (const ext of ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']) {
    const full = path.join(ROOT, base + ext);
    if (existsSync(full) && statSync(full).isFile()) return base + ext;
  }
  return base;
}

/** Is `name` bound to something callable in this source? */
export function isCallable(src, name) {
  const n = name.replace(/\$/g, '\\$');
  const decl = new RegExp(
    '(?:^|[^\\w$])(?:async\\s+)?function\\s*\\*?\\s*' + n + '\\s*\\('
    + '|(?:const|let|var)\\s+' + n + '\\s*=\\s*(?:async\\s*)?(?:\\(|function\\b|[A-Za-z_$][\\w$]*\\s*=>)'
  );
  return decl.test(src);
}

/** Index of the `}` matching the `{` at `open`, or -1. */
export function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/** Split an object-literal body on its TOP-LEVEL commas only. */
export function topLevelSplit(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if ('{[('.includes(c)) depth += 1;
    else if ('}])'.includes(c)) depth -= 1;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * Every `{ a = X, … } = {}` parameter object in src/, with the subset of its
 * names whose defaults are db-backed callables.
 *
 * @returns {{ file: string, fn: string, deps: Set<string>, dbBacked: Set<string> }[]}
 */
export function collectDepSets() {
  const files = walkSources('src');
  const byRel = new Map(files.map((f) => [f.rel, f]));

  // ── the import graph, static AND dynamic ────────────────────────────────
  const edges = new Map();
  const bindings = new Map();
  const IMPORT_RE = /import\s+([^'";]*?)\s+from\s*['"]([^'"]+)['"]/g;
  const DYN_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const f of files) {
    const out = new Set();
    const bound = new Map();
    for (const m of f.withImports.matchAll(IMPORT_RE)) {
      const clause = m[1];
      const spec = m[2];
      out.add(spec);
      const named = clause.match(/\{([^}]*)\}/);
      if (named) {
        for (const part of named[1].split(',')) {
          const p = part.trim();
          if (!p) continue;
          const as = p.split(/\s+as\s+/);
          bound.set((as[1] ?? as[0]).trim(), spec);
        }
      }
      const bare = clause.replace(/\{[^}]*\}/g, '').replace(/(^\s*,)|(,\s*$)/g, '').trim();
      for (const part of bare.split(',')) {
        const p = part.trim();
        if (!p) continue;
        if (p.startsWith('*')) {
          const as = p.split(/\s+as\s+/);
          if (as[1]) bound.set(as[1].trim(), spec);
        } else bound.set(p, spec);
      }
    }
    for (const m of f.withImports.matchAll(DYN_RE)) out.add(m[1]);
    edges.set(f.rel, out);
    bindings.set(f.rel, bound);
  }

  const reaching = new Map();
  const reachesDb = (rel, seen) => {
    if (reaching.has(rel)) return reaching.get(rel);
    if (seen.has(rel)) return false;
    seen.add(rel);
    let hit = false;
    for (const spec of edges.get(rel) ?? []) {
      if (DB_SPEC(spec)) { hit = true; break; }
      const target = resolveSpec(spec, rel);
      if (target && byRel.has(target) && reachesDb(target, seen)) { hit = true; break; }
    }
    reaching.set(rel, hit);
    return hit;
  };
  for (const f of files) reachesDb(f.rel, new Set());

  const depSets = [];
  for (const f of files) {
    const code = blankStringBodies(f.code);
    for (let i = 0; i < code.length; i += 1) {
      if (code[i] !== '{') continue;
      const close = matchBrace(code, i);
      if (close < 0) continue;
      if (!/^\s*=\s*\{\s*\}/.test(code.slice(close + 1, close + 12))) continue;
      const body = code.slice(i + 1, close);
      if (!body.includes('=')) continue;

      const deps = new Set();
      const dbBacked = new Set();
      let readable = true;
      for (const raw of topLevelSplit(body)) {
        const entry = raw.trim();
        if (!entry) continue;
        if (entry.startsWith('...')) { readable = false; break; }
        const eq = entry.indexOf('=');
        const name = (eq < 0 ? entry : entry.slice(0, eq)).trim();
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) { readable = false; break; }
        deps.add(name);
        if (eq < 0) continue;
        const ident = entry.slice(eq + 1).trim().match(/^([A-Za-z_$][\w$]*)$/);
        if (!ident || GLOBALS.has(ident[1])) continue;
        const spec = bindings.get(f.rel)?.get(ident[1]);
        if (spec) {
          const target = resolveSpec(spec, f.rel);
          const fromDb = DB_SPEC(spec) || Boolean(target && byRel.has(target) && reaching.get(target));
          const callable = !target || !byRel.has(target) || isCallable(byRel.get(target).code, ident[1]);
          if (fromDb && callable) dbBacked.add(name);
        } else if (reaching.get(f.rel) && isCallable(code, ident[1])) {
          dbBacked.add(name);
        }
      }
      if (!readable || deps.size === 0) continue;

      const before = code.slice(Math.max(0, i - 400), i);
      const named = [...before.matchAll(/(?:function\s+|const\s+)([A-Za-z_$][\w$]*)/g)].pop();
      depSets.push({ file: f.rel, fn: named ? named[1] : '(anonymous)', deps, dbBacked });
      i = close;
    }
  }
  return depSets;
}

/** Every *.test.mjs directly inside a repo-relative dir. */
export function pureTestFiles(relDir = 'test/pure') {
  return readdirSync(path.join(ROOT, relDir))
    .filter((n) => n.endsWith('.test.mjs'))
    .map((n) => `${relDir}/${n}`)
    .sort();
}


/**
 * For each test file, the dep sets it is ON THE HOOK FOR, and which db-backed
 * names it never mentions.
 *
 * ── HOW A FILE IS PUT ON THE HOOK, AND WHY IT IS THE IMPORT AND NOT THE CALL ──
 * A dep set applies to a test file when that file imports the OWNING FUNCTION
 * BY NAME from the module the set was read out of. Both halves matter:
 *
 *   · by name, so listPublicCoursesOrder — which imports only
 *     `listPublicCourses` — is not held to `getCourseByCodeInsensitive`'s deps
 *     merely for sharing a module with it;
 *   · from that module, so a same-named import from somewhere else does not
 *     borrow an unrelated set.
 *
 * ── WHY THIS COUNTS MENTIONS RATHER THAN READING EACH LITERAL ───────────────
 * Attributing an object literal to a call was tried first and does not
 * terminate without a parser: `deps({ loadHidden: … })` — an OVERRIDE onto a
 * complete harness — is textually indistinguishable from a whole deps object,
 * and `loadHidden` is a dep name of two different functions in this repo. Every
 * rule that made the override safe also made a genuine omission safe. Counting
 * MENTIONS gives up per-literal precision and keeps the property that matters:
 * a db-backed dep a file never names anywhere is a dep that file cannot be
 * overriding, and every default it does not override is a live database read.
 *
 * Read from `code` with string bodies blanked, so a dep named only in prose or
 * inside a fixture string does not satisfy the check — that is defect 2 in
 * sourceScan's header, and it is the exact shape this would take.
 */
export function auditPureHarnesses(rels, depSets) {
  const interesting = depSets.filter((d) => d.dbBacked.size > 0);
  const violations = [];
  const onHook = [];

  for (const rel of rels) {
    const src = readSource(rel);
    const bound = new Map();
    for (const m of src.withImports.matchAll(/import\s+([^'";]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
      const named = m[1].match(/\{([^}]*)\}/);
      if (!named) continue;
      for (const part of named[1].split(',')) {
        const p = part.trim();
        if (!p) continue;
        const as = p.split(/\s+as\s+/);
        bound.set((as[1] ?? as[0]).trim(), m[2]);
      }
    }
    if (!bound.size) continue;

    const body = blankStringBodies(src.code);
    for (const set of interesting) {
      const spec = bound.get(set.fn);
      if (!spec) continue;
      const target = resolveSpec(spec, 'src/x.js');
      if (target !== set.file) continue;
      onHook.push({ file: rel, fn: set.fn });
      const missing = [...set.dbBacked].filter(
        (d) => !new RegExp('(?:^|[^\w$.])' + d.replace(/\$/g, '\$') + '(?:[^\w$]|$)').test(body)
      );
      if (missing.length) {
        violations.push({
          file: rel,
          fn: `${set.file} :: ${set.fn}`,
          declared: [...set.deps].sort(),
          dbBacked: [...set.dbBacked].sort(),
          missing: missing.sort(),
        });
      }
    }
  }
  return { violations, onHook };
}
