import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, walkSources, scrubSource } from '../sourceScan.mjs';

/**
 * EVERY NAMED IMPORT RESOLVES TO A REAL EXPORT OF THE MODULE IT NAMES.
 *
 * ── THE INCIDENT THIS WAS ADDED FOR ─────────────────────────────────────────
 * `src/app/admin/courses/_components/CourseForm.jsx` imported
 * `checkAliasAvailable` BY NAME from '@/lib/actions/course-extensions' — a
 * named import of a function that module did not export, because a merge
 * resolution had dropped the definition. ESM does not care at build time here:
 * Next transpiles, the page renders, and the throw arrives only when an admin
 * saves a course carrying a URL alias.
 *
 * ── WHY libImportsResolved DID NOT CATCH IT, AND WHY THIS IS NOT A DUPLICATE ─
 * test/fs/libImportsResolved asks the OPPOSITE question and they are not
 * interchangeable:
 *
 *   · that one asks "is this identifier USED with no binding in scope?" — it
 *     starts from a set of known `src/lib` EXPORT NAMES and looks for call
 *     sites that never imported them. `checkAliasAvailable` was exported by
 *     NOTHING once the merge landed, so it was never in that set, and the guard
 *     could not see it. It was green through the entire outage.
 *
 *   · this one asks "is this IMPORT satisfiable?" — it starts from the import
 *     statement, which is the half that survived. An import naming an export
 *     that does not exist is exactly the shape the other check is blind to.
 *
 * Together they close the class from both ends: a call with no import, and an
 * import with no export.
 *
 * ── SCOPE: EVERY named import under src, not just the one that broke ────────
 * Measured before choosing: 786 files, 2267 named-import statements, 1657
 * resolving to a file inside src, and the sweep takes ~1.7s — the same order as
 * libImportsResolved's own scan. It reports ZERO violations at the time of
 * writing, so shipping it wide costs nothing and guards everything. The
 * specific `course-extensions` case is ALSO named below, so a reintroduction
 * says WHICH incident came back rather than just "something is unresolved".
 */

// ── the machinery ───────────────────────────────────────────────────────────

/**
 * `@/x/y` or `./z` → an absolute path to a file under src, or null.
 *
 * A bare specifier ('react', 'mongoose') returns null and is skipped: those are
 * node_modules and their export surface is not this repo's to police.
 */
function resolveSpecifier(specifier, fromRel) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(ROOT, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(ROOT, path.dirname(fromRel), specifier);
  else return null;

  for (const cand of [
    base, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
    path.join(base, 'index.js'), path.join(base, 'index.jsx'),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

/**
 * Every name an `import { … } from 'x'` statement REQUIRES the target to export.
 *
 * `import { a as b }` binds `b` locally but requires `a` to be exported, so the
 * left-hand side is what is collected. A default import (`import x from`) is
 * deliberately not checked — it is always satisfiable syntactically and a
 * missing default is a different failure.
 */
function namedImports(withImports) {
  const out = [];
  const re = /import\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of withImports.matchAll(re)) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    if (names.length) out.push({ specifier: m[2], names });
  }
  return out;
}

/**
 * Every name a module EXPORTS, parsed from source.
 *
 * ── THE DESTRUCTURED FORM IS HERE BECAUSE OMITTING IT WAS MEASURED ──────────
 * The first run of this sweep reported 17 violations. All 17 were
 * `@/lib/auth/options`, which declares its entire public surface as
 * `export const { handlers, auth, signIn, signOut } = NextAuth({...})` — a real
 * export form the parser could not read.
 *
 * That is the failure mode worth naming: a guard that cannot parse a legal
 * construct does not report "I cannot read this", it reports seventeen innocent
 * files as broken. For a check whose entire value is being trusted, a false
 * positive is more expensive than a false negative — the first time it cries
 * wolf, someone adds an ignore list.
 */
function exportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // `export const { a, b: c, d = 1, ...rest } = …`
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=/gm)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim().replace(/^\.\.\./, '');
      if (!piece) continue;
      const renamed = /:\s*([A-Za-z_$][\w$]*)\s*(?:=|$)/.exec(piece);
      const plain = /^([A-Za-z_$][\w$]*)/.exec(piece);
      const bound = renamed ? renamed[1] : plain?.[1];
      if (bound) names.add(bound);
    }
  }
  // `export const [a, b] = …`
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s*\[([^\]]*)\]\s*=/gm)) {
    for (const part of m[1].split(',')) {
      const plain = /^([A-Za-z_$][\w$]*)/.exec(part.trim().replace(/^\.\.\./, ''));
      if (plain) names.add(plain[1]);
    }
  }
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

/**
 * A module carrying `export * from` re-exports names this parser cannot
 * enumerate without following the chain. Skipped rather than guessed at —
 * reporting an unfollowable re-export as a violation is the false-positive
 * failure described above. Counted, so "we skipped everything" is visible.
 */
const hasStarReexport = (src) => /^export\s*\*\s*from/m.test(src);

/** The whole sweep, as data — so several assertions can read one walk. */
function sweep() {
  const files = walkSources('src');
  const problems = [];
  let statements = 0;
  let resolved = 0;
  let skippedStar = 0;

  for (const f of files) {
    for (const { specifier, names } of namedImports(f.withImports)) {
      statements += 1;
      const target = resolveSpecifier(specifier, f.rel);
      if (!target) continue;
      resolved += 1;
      const src = scrubSource(readFileSync(target, 'utf8'), { stripImports: false });
      if (hasStarReexport(src)) { skippedStar += 1; continue; }
      const exported = exportedNames(src);
      for (const n of names) {
        if (!exported.has(n)) {
          const rel = path.relative(ROOT, target).split(path.sep).join('/');
          problems.push(`${f.rel} imports { ${n} } from '${specifier}' — ${rel} does not export it`);
        }
      }
    }
  }
  return { files, problems, statements, resolved, skippedStar };
}

const SWEEP = sweep();

// ── 1. THE NAMED INCIDENT ───────────────────────────────────────────────────

/**
 * The assertion that would have caught this round's defect at edit time.
 *
 * Named specifically as well as covered by the sweep below, so a
 * reintroduction reports the incident rather than a generic list — the same
 * technique libImportsResolved uses for its two named regressions.
 */
test('every named import of @/lib/actions/course-extensions resolves to an export', () => {
  const TARGET = '@/lib/actions/course-extensions';
  const modulePath = path.join(ROOT, 'src/lib/actions/course-extensions.js');
  const exported = exportedNames(scrubSource(readFileSync(modulePath, 'utf8'), { stripImports: false }));

  const importers = [];
  for (const f of SWEEP.files) {
    for (const { specifier, names } of namedImports(f.withImports)) {
      if (specifier !== TARGET) continue;
      importers.push(f.rel);
      for (const n of names) {
        assert.ok(
          exported.has(n),
          `${f.rel} imports { ${n} } from '${TARGET}', which does not export it — `
          + 'this throws at request time, and it BUILDS'
        );
      }
    }
  }
  assert.ok(importers.length > 0,
    'nothing imports the module by name — this test is guarding an empty set');
});

test('checkAliasAvailable specifically is exported and imported by the create form', () => {
  // The incident, named. The merge 46821fc dropped the definition while leaving
  // BOTH callers standing: CourseForm's named import and saveCourseExtension's
  // bare call. If either half goes missing again this says which.
  const mod = scrubSource(readFileSync(path.join(ROOT, 'src/lib/actions/course-extensions.js'), 'utf8'),
    { stripImports: false });
  assert.ok(exportedNames(mod).has('checkAliasAvailable'),
    'course-extensions no longer exports checkAliasAvailable — the alias check is dead again');

  const form = SWEEP.files.find((f) => f.rel.endsWith('admin/courses/_components/CourseForm.jsx'));
  assert.ok(form, 'CourseForm.jsx not found — did it move?');
  assert.match(
    form.withImports,
    /import\s*\{[\s\S]*?\bcheckAliasAvailable\b[\s\S]*?\}\s*from\s*'@\/lib\/actions\/course-extensions'/,
    'the create arm no longer imports the alias check'
  );
});

/**
 * ── AND IT IS ACTUALLY CALLED, WHICH NOTHING ELSE CHECKED ──────────────────
 *
 * FOUND BY A CONTROL, NOT BY REVIEW. Breaking the restore the other way —
 * leaving `checkAliasAvailable` defined and exported but replacing its call in
 * `saveCourseExtension` with `const clash = null` — reddened NOTHING. The whole
 * suite stayed at 4203 passed, 0 failed.
 *
 * The reason is worth stating because it is not a weak test, it is a blind
 * spot with a precise shape: fs/aliasUniqueness matches `urlAlias: cleanAlias`
 * and `$ne: courseId` against the WHOLE MODULE text and checks they appear
 * before `findOneAndUpdate`. Both strings live inside the function, so they are
 * present and correctly positioned whether or not anything invokes it. Those
 * three tests notice the check being GONE; they cannot notice it being
 * ORPHANED.
 *
 * That is the same failure mode as the defect this file was added for — a
 * definition and its caller drifting apart — just from the other side. The
 * create arm's call is already pinned by fs/courseCreateWriteOrder; this is the
 * save path's half.
 */
test('saveCourseExtension actually CALLS the alias check, not merely defines it', () => {
  const mod = SWEEP.files.find((f) => f.rel === 'src/lib/actions/course-extensions.js');
  assert.ok(mod, 'course-extensions.js not found — did it move?');

  const start = mod.code.indexOf('export async function saveCourseExtension(');
  assert.notEqual(start, -1, 'saveCourseExtension is gone');
  const rest = mod.code.slice(start + 1);
  const next = rest.indexOf('export async function ');
  const body = next === -1 ? rest : rest.slice(0, next);

  assert.match(
    body,
    /await checkAliasAvailable\(cleanAlias, courseId\)/,
    'the save path defines the alias check but never runs it — the last thing '
    + 'between an alias and the write is not wired up'
  );

  // And its result must be USED. A call whose answer is discarded is the same
  // bug with extra steps — the same ruling fs/courseCreateWriteOrder makes
  // about the create arm ("a check whose result is ignored").
  assert.match(body, /if \(clash\) return \{ ok: false, \.\.\.clash \}/,
    'the clash result is computed and then ignored');
});

// ── 2. THE SWEEP ────────────────────────────────────────────────────────────

test('every named import under src resolves to a real export of its target', () => {
  assert.deepEqual(
    SWEEP.problems,
    [],
    'a named import binds something its target does not export — this is a '
    + 'runtime throw, and it BUILDS:\n    ' + SWEEP.problems.join('\n    ')
  );
});

// ── 3. CONTROLS ─────────────────────────────────────────────────────────────

test('CONTROL: the sweep actually walked the repo', () => {
  // Every assertion above is "the problem list is empty". A sweep that walked
  // nothing, or resolved nothing, produces an empty list too — and would sit
  // green forever. These are floors on the WORK DONE, not on the findings.
  assert.ok(SWEEP.files.length > 500, `only ${SWEEP.files.length} files walked`);
  assert.ok(SWEEP.statements > 1500, `only ${SWEEP.statements} named-import statements found`);
  assert.ok(SWEEP.resolved > 1000, `only ${SWEEP.resolved} specifiers resolved into src`);
});

test('CONTROL: the export parser reads every form, including the destructured one', () => {
  const found = exportedNames([
    'export async function alpha() {}',
    'export function* beta() {}',
    'export const gamma = 1;',
    'export class Delta {}',
    'export const { epsilon, zeta: eta, theta = 2, ...iota } = f();',
    'export const [kappa, lambda] = g();',
    'export { mu, nu as xi };',
    'export default thing;',
    'function notExported() {}',
    '// export function commentedOut() {}',
  ].join('\n'));
  assert.deepEqual(
    [...found].sort(),
    ['Delta', 'alpha', 'beta', 'default', 'epsilon', 'eta', 'gamma', 'iota',
     'kappa', 'lambda', 'mu', 'theta', 'xi'].sort()
  );
  assert.ok(!found.has('notExported'), 'a non-exported function was collected');
  assert.ok(!found.has('commentedOut'), 'a commented-out export was collected');
  assert.ok(!found.has('zeta'), '`zeta: eta` must bind eta, not zeta');
});

test('CONTROL: the destructured form is not hypothetical — a real module uses it', () => {
  // The 17 false positives. If @/lib/auth/options ever stops using this form,
  // the parser branch above is still correct but is no longer EXERCISED by the
  // real sweep, and this says so rather than leaving it silently untested.
  const options = readFileSync(path.join(ROOT, 'src/lib/auth/options.js'), 'utf8');
  assert.match(options, /export\s+const\s*\{[^}]*\bauth\b[^}]*\}\s*=/,
    'no module uses the destructured export form — the parser branch is untested by the sweep');
  assert.ok(exportedNames(options).has('auth'), 'the parser cannot read the real destructured export');
});

test('CONTROL: an import of a name the target does not export IS detected', () => {
  // The detector, exercised on synthetic input — so a refactor that turned the
  // sweep into a no-op (comparing a set to itself, an empty problem push) is
  // caught here rather than by nobody.
  const exported = exportedNames('export function realOne() {}');
  const imported = namedImports("import { realOne, ghostOne } from '@/lib/whatever';");
  assert.equal(imported.length, 1, 'the import parser found nothing');
  assert.deepEqual(imported[0].names, ['realOne', 'ghostOne']);
  assert.ok(exported.has('realOne'));
  assert.ok(!exported.has('ghostOne'), 'the detector would not flag the missing name');
});

test('CONTROL: `a as b` requires `a` to be exported, not `b`', () => {
  // The rename direction. Getting this backwards would make every aliased
  // import a false positive — the same class of error as the destructured form.
  const imported = namedImports("import { buildStatCards as buildPublicStatCards } from '@/lib/x';");
  assert.deepEqual(imported[0].names, ['buildStatCards'],
    'the LEFT side is what the target must export');
});
