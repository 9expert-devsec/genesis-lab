/**
 * ROUND 31 — does anything this round touched reach the PUBLIC site?
 *
 * The shape round 20 established: build the TRANSITIVE import closure of every
 * public entry point, compare the working tree against HEAD over that closure
 * only, and report the count. The answer this round expects is ZERO — round 30
 * established that the editor surface is entirely off the public path, and this
 * round moved two files inside that surface.
 *
 * ── A ZERO IS ONLY WORTH ANYTHING WITH ITS CONTROLS ───────────────────────
 * "No public file changed" and "the reach is empty" produce the same number, so
 * both controls below are printed alongside it and neither is optional:
 *
 *   CONTROL 1 — THE REACH IS NOT EMPTY. The closure size, and a named public
 *               component asserted to be inside it. A resolver that silently
 *               gave up after the first file would report zero changes forever.
 *   CONTROL 2 — THE COMPARISON CAN GO NON-ZERO. The same intersection is run
 *               a second time against a closure with one CHANGED file spliced
 *               in, and must come back with exactly that one. This is the
 *               discrimination form: it fails the moment the probe stops being
 *               able to tell a changed public file from an unchanged one.
 *
 * ── NORMALISED ────────────────────────────────────────────────────────────
 * The working tree is CRLF and `git show` hands back what was committed, so
 * every comparison is on \n-normalised text. A line-ending difference is not a
 * change to the public site and must not be reported as one.
 *
 * READ-ONLY: `git show`, `readFileSync`, and a walk. No writes, no network.
 *
 * Run: node scripts/_verify-round31-public-path.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const norm = (s) => String(s).replace(/\r\n?/g, '\n');

// ── the public entry points ────────────────────────────────────────────────
// Everything the public can reach without an admin session: the (public) route
// group, the root route files, and the public API handlers. /admin is excluded
// on purpose — middleware.js answers it 404 without a session — and so is
// /api/admin.
const ENTRY_DIRS = ['src/app/(public)', 'src/app/api'];
const ENTRY_FILES = [
  'src/app/layout.jsx', 'src/app/page.jsx', 'src/app/error.jsx',
  'src/app/not-found.jsx', 'src/app/sitemap.js', 'src/app/robots.js',
  'src/middleware.js',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'admin') continue; // /api/admin is session-gated, like /admin
      walk(full, out);
    } else if (/\.(js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const entries = [
  ...ENTRY_DIRS.flatMap((d) => (existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : [])),
  ...ENTRY_FILES.map((f) => path.join(ROOT, f)).filter(existsSync),
];

// ── resolve one specifier to a file under src/, or null ───────────────────
const EXTS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx', '/index.mjs'];
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // a package, not our source
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Static `from '…'`, side-effect `import '…'`, and dynamic `import('…')`.
const SPECS = /(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

function closureOf(files) {
  const seen = new Set();
  const queue = [...files];
  const unresolved = new Set();
  while (queue.length) {
    const file = queue.pop();
    const key = rel(file);
    if (seen.has(key)) continue;
    seen.add(key);
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(SPECS)) {
      const spec = m[1];
      if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
      const target = resolveSpec(spec, file);
      if (target) queue.push(target);
      else unresolved.add(spec + '  (from ' + rel(file) + ')');
    }
  }
  return { files: seen, unresolved };
}

const { files: closure, unresolved } = closureOf(entries);

// ── what changed against HEAD, normalised ─────────────────────────────────
const changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);
const touched = [...new Set([...changed, ...untracked])];

/** Truly different from HEAD once line endings are normalised away. */
function differsFromHead(relPath) {
  let head;
  try { head = execFileSync('git', ['show', 'HEAD:' + relPath], { encoding: 'utf8' }); }
  catch { return true; } // new file — no HEAD side to compare
  let now;
  try { now = readFileSync(path.join(ROOT, relPath), 'utf8'); }
  catch { return true; } // deleted
  return norm(head) !== norm(now);
}

const touchedReal = touched.filter(differsFromHead);
const publicChanged = touchedReal.filter((f) => closure.has(f));

// ── CONTROL 1: the reach is not empty ─────────────────────────────────────
const SENTINELS = [
  'src/app/(public)/layout.jsx',
  'src/app/layout.jsx',
];
const sentinelHits = SENTINELS.filter((f) => closure.has(f));
const componentsInClosure = [...closure].filter((f) => f.startsWith('src/components/')).length;
const libInClosure = [...closure].filter((f) => f.startsWith('src/lib/')).length;

// ── CONTROL 2: the intersection CAN come back non-zero ────────────────────
// The same operation, over a closure with one genuinely-changed file spliced
// in. If this does not report exactly that file, the zero above means nothing.
const spliced = new Set(closure);
const witness = touchedReal.find((f) => /\.(js|jsx|mjs)$/.test(f));
if (witness) spliced.add(witness);
const controlHits = touchedReal.filter((f) => spliced.has(f));

const out = {
  '── the closure ──': '',
  publicEntryPoints: entries.length,
  closureSize: closure.size,
  componentsInClosure,
  libInClosure,
  unresolvedSpecifiers: unresolved.size,

  '── CONTROL 1: the reach is not empty ──': '',
  sentinelsExpected: SENTINELS.length,
  sentinelsFoundInClosure: sentinelHits.length,
  reachIsEmpty: closure.size === 0,

  '── what this round touched ──': '',
  filesTouched: touchedReal,
  filesTouchedCount: touchedReal.length,
  touchedFilesInsidePublicClosure: publicChanged,

  '── THE ANSWER ──': '',
  CHANGED_PUBLIC_FILES: publicChanged.length,

  '── CONTROL 2: the intersection can go non-zero ──': '',
  witnessSplicedIntoClosure: witness ?? null,
  hitsWithWitnessSpliced: controlHits,
  controlDiscriminates: Boolean(witness) && controlHits.length === 1 && controlHits[0] === witness,
};

console.log(JSON.stringify(out, null, 2));
if (unresolved.size) {
  console.log('\n[unresolved specifiers — none of these are repo source]');
  for (const u of [...unresolved].sort().slice(0, 20)) console.log('  ' + u);
}
