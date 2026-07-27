import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Tailwind's JIT only emits classes it can SEE. A class literal in a file that no
// `content` glob matches compiles to NOTHING — and does so silently: no build
// error, no failing unit test, no runtime warning. The code is correct, the
// config is wrong, and only the generated CSS shows it.
//
// That is exactly how every schedule-status badge lost its colour. The five
// duplicated status maps were centralised into src/lib/scheduleStatus.js, which
// moved #39b980 / #d4a017 / #ffc94a / #ff4b55 out of scanned components and into
// a file covered by no glob (`content` listed src/app, src/components, and
// src/lib/pageBuilder only). The `dot`+`text` treatment fell back to the
// inherited colour and the `solid` chip rendered `text-white` on no background —
// invisible on a white card, in production, with a fully green suite.
//
// So this tier cannot check the CSS, but it CAN check the precondition: every
// file holding arbitrary-value class literals must be reachable by some glob.
//
// ── WHAT THIS GUARD DOES NOT SEE ────────────────────────────────────────────
// It detects the BRACKET form only — `bg-[#39b980]`, `dark:text-[#ffc94a]`,
// `bg-[#ff4b55]/10`. A file holding nothing but STANDARD utilities
// (`bg-slate-400`, `text-slate-500 dark:text-slate-300`) in an unscanned
// directory breaks in exactly the same way, silently, and this test stays green.
//
// That is not hypothetical, and the example is in the incident file itself:
// NEUTRAL_STATUS in src/lib/scheduleStatus.js — the grey fallback every surface
// renders for an unrecognised status — is entirely standard utilities. Had the
// module contained ONLY that map, all four badge shapes would still have lost
// their styling and nothing here would have said a word.
//
// Detecting standard utilities is NOT attempted, deliberately. Any string can
// look like a class name: `text-center` in prose, `border-b` in a comment,
// `flex-1` in a data fixture, a slug like `bg-white-paper`. Tailwind resolves
// that ambiguity by scanning candidates and keeping only what matches a real
// utility — reimplementing that here means reimplementing Tailwind's extractor
// and its full utility surface, and anything less is a false-positive generator
// that gets muted within a week. A muted guard is worse than a narrow one.
//
// THE MITIGATION IS THE BREADTH OF THE GLOB, NOT THE DETECTOR. `content` covers
// whole directories (src/app, src/components, src/lib) rather than named files,
// so the common case is protected regardless of which utility form is used. This
// test is the backstop for the one thing a broad glob can still miss: a NEW
// top-level directory under src/ that nobody added to `content`. Read it as
// "arbitrary values are provably covered", not as "class coverage is complete."

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Arbitrary-value colour utilities: `bg-[#39b980]`, `text-[#d4a017]`,
// `border-[#ff4b55]`, with optional variants (`dark:`, `hover:`, `md:`) and an
// optional opacity suffix (`/10`). Deliberately matches ANY utility prefix
// rather than an allowlist of text/bg/border — an allowlist is the same
// per-name-exception mistake the glob itself made.
const ARBITRARY_LITERAL = /(?:[\w-]+:)*[\w-]+-\[#[0-9a-fA-F]{3,8}\](?:\/\d{1,3})?/g;

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);
const SCANNED_EXT = new Set(['.js', '.jsx', '.ts', '.tsx']);
const isTestFile = (p) => /\.test\.|\.spec\.|__tests__/.test(p);

/**
 * Minimal glob → RegExp for the three constructs Tailwind's content array uses:
 * `**\/` (zero or more path segments), `*` (within one segment), `{a,b}` (set).
 *
 * Hand-written rather than pulled from minimatch/picomatch/micromatch: those are
 * present in node_modules but are TRANSITIVE deps of next/tailwind, declared
 * nowhere in package.json. Building a guard on a package nobody chose is the
 * same defect as the one being guarded — see the note in test/loader.mjs about
 * sucrase, which is a declared devDependency precisely because the harnesses
 * that "just worked" on a transitive copy were found to be a problem. If the
 * content array ever grows a construct beyond these three, this throws rather
 * than quietly mis-matching.
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);

function globToRegExp(glob) {
  const g = glob.replace(/^\.\//, ''); // content globs are repo-root relative
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*' && g[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2; }
      else if (g[i + 1] === '*') { out += '.*'; i += 1; }
      else out += '[^/]*';
    } else if (c === '{') {
      const end = g.indexOf('}', i);
      if (end === -1) throw new Error(`[content-coverage] unclosed brace in glob: ${glob}`);
      out += `(?:${g.slice(i + 1, end).split(',').map(escapeRe).join('|')})`;
      i = end;
    } else if (c === '?' || c === '[' || c === ']' || c === '!' || c === '(' || c === ')') {
      // extglob / char-class syntax we deliberately do not implement
      throw new Error(
        `[content-coverage] glob "${glob}" uses syntax this matcher does not ` +
        `implement ("${c}"). Extend globToRegExp deliberately — do not let the ` +
        `guard silently under-match.`
      );
    } else out += escapeRe(c);
  }
  return new RegExp(`^${out}$`);
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

// Read the config's own content array — never a transcribed copy of it, or this
// guard would go stale the moment someone edits the real one.
const { content } = require_config();
function require_config() {
  // tailwind.config.js is CommonJS; read + evaluate it in a tiny module shim
  // rather than importing (an ESM `import` of a CJS file under the test loader
  // would need interop we do not otherwise depend on).
  const src = readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', src)(module, module.exports, (id) => {
    // plugins are irrelevant here; stub them so the config evaluates
    if (id.startsWith('@tailwindcss/')) return () => {};
    throw new Error(`[content-coverage] unexpected require("${id}") in tailwind.config.js`);
  });
  return module.exports;
}

const GLOBS = content.map((g) => ({ glob: g, re: globToRegExp(g) }));

test('every src file holding arbitrary-value Tailwind literals is covered by a content glob', () => {
  const offenders = [];

  for (const abs of walk(path.join(ROOT, 'src'))) {
    if (!SCANNED_EXT.has(path.extname(abs))) continue;
    if (isTestFile(abs)) continue;

    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const literals = [...new Set(readFileSync(abs, 'utf8').match(ARBITRARY_LITERAL) ?? [])];
    if (literals.length === 0) continue;

    if (!GLOBS.some(({ re }) => re.test(rel))) offenders.push({ rel, literals });
  }

  assert.deepEqual(
    offenders.map((o) => o.rel),
    [],
    offenders.length === 0
      ? ''
      : `These files hold arbitrary-value Tailwind classes but match NO \`content\` glob in ` +
        `tailwind.config.js, so the JIT never emits them and they render as no style at all ` +
        `(a background simply does not paint; text falls back to the inherited colour):\n\n` +
        offenders
          .map((o) => `  ${o.rel}\n      ${o.literals.slice(0, 8).join('  ')}` +
            (o.literals.length > 8 ? `  … +${o.literals.length - 8} more` : ''))
          .join('\n') +
        `\n\nTHE FIX IS THE GLOB, NOT THE FILE. Widen \`content\` in tailwind.config.js to ` +
        `cover the directory. Do NOT move the classes into a component, inline them as ` +
        `styles, or safelist the individual strings — each of those trades one silent ` +
        `breakage for another, and a per-folder allowlist is what caused this in the first ` +
        `place.\n\nCurrent globs: ${GLOBS.map((g) => g.glob).join(', ')}`,
  );
});

// CONTROL — the walker and the matcher must both be live. If `content` were
// empty, or the walker found nothing, the test above would pass vacuously: zero
// offenders out of zero files scanned looks identical to a clean repo.
test('CONTROL: the guard is actually scanning files and matching globs', () => {
  const files = walk(path.join(ROOT, 'src')).filter((f) => SCANNED_EXT.has(path.extname(f)));
  assert.ok(files.length > 100, `walker found only ${files.length} src files — it is not walking`);

  const withLiterals = files.filter(
    (f) => !isTestFile(f) && ARBITRARY_LITERAL.test(readFileSync(f, 'utf8'))
  );
  assert.ok(
    withLiterals.length > 0,
    'no file in src has an arbitrary-value literal — the detector regex is dead',
  );

  assert.ok(GLOBS.length > 0, 'content array is empty — nothing could ever be covered');

  // the matcher must be capable of BOTH answers, or "covered" is meaningless
  const known = GLOBS.find((g) => g.glob.includes('src/lib'));
  assert.ok(known, 'expected a src/lib content glob');
  assert.equal(known.re.test('src/lib/scheduleStatus.js'), true, 'matcher accepts a real lib path');
  assert.equal(known.re.test('src/lib/scheduleStatus.md'), false, 'matcher respects the extension set');
  assert.equal(known.re.test('scripts/whatever.js'), false, 'matcher rejects an out-of-tree path');
});
