import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../sourceScan.mjs';

/**
 * NO TRACKED SOURCE FILE CONTAINS A NUL BYTE.
 *
 * ══ WHY THIS IS A GUARD AND NOT A LINT PREFERENCE ═══════════════════════════
 * A single 0x00 anywhere in a file makes every standard text tool treat the
 * WHOLE FILE as binary. `file(1)` reports "data". `grep` prints
 * "Binary file … matches" and returns no lines unless you pass `-a`. `git diff`
 * shows "Binary files differ" instead of a diff.
 *
 * That last one is the reason this exists as a test: THIS REPO'S OWN fs-TIER
 * SCANNERS ARE grep-SHAPED. They read a file and match patterns in it. A file
 * that tooling classifies as binary is a file those scanners can silently stop
 * seeing — and a scanner that skips a file reports green, which is worse than
 * no scanner at all, because green is taken as evidence.
 *
 * ── IT REALLY HAPPENED, IN A SECURITY-ADJACENT FILE ─────────────────────────
 * src/lib/redirects/redirectRules.js carried a literal NUL inside a character
 * class where an escape was meant:
 *
 *     if (/[<0x00>-<0x1f>]/.test(value)) return false;   // written as raw bytes
 *
 * The regex BEHAVED correctly — it does match control characters — so nothing
 * failed and nothing looked wrong. But that file decides where a visitor's
 * browser is sent, and `file(1)` called it "data" while grep refused it. It was
 * found by accident, during an audit that happened to run `file` on it.
 *
 * ── WHAT IT DOES NOT CHECK ──────────────────────────────────────────────────
 * Other control characters. 0x1f and friends are equally unintended in source
 * and equally invisible, but they do not trip the binary heuristic and so do
 * not cause the silent-skip failure this is about. Narrow on purpose: the claim
 * is "no tracked source file is invisible to a text scanner", not "no source
 * file contains an odd byte".
 */

/**
 * Every file git actually tracks, as repo-relative paths.
 *
 * `git ls-files`, not a directory walk, and the difference is the point:
 * "tracked" is the property that matters. A walk would sweep node_modules,
 * .next and every build artefact — which DO legitimately contain NUL bytes —
 * and would then need an exclusion list that goes stale. It would also miss
 * nothing useful, because an untracked file is not something this repo ships.
 *
 * `-z` and splitting on NUL because a filename may contain a space; git quotes
 * such paths in its default output and the quoting would have to be undone.
 */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

/**
 * The extensions this guard covers.
 *
 * SOURCE AND CONFIG, not every tracked file. A PNG, a font and an .ico are
 * binary by nature and full of NUL bytes; asserting over them would be
 * asserting something false. The list is what a text scanner in this repo would
 * ever be pointed at.
 */
const SOURCE_EXT = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.json', '.css', '.scss', '.md', '.mdx',
  '.html', '.svg', '.yml', '.yaml', '.txt',
]);

const SOURCES = trackedFiles().filter((rel) => SOURCE_EXT.has(path.extname(rel).toLowerCase()));

test('the scan found the tracked source files — it is not reporting on an empty list', () => {
  // The assertion below is a "does NOT contain" sweep, which passes
  // triumphantly over zero files. If `git ls-files` failed, returned nothing,
  // or the extension filter matched nothing, this says so instead.
  assert.ok(SOURCES.length > 500, `only ${SOURCES.length} tracked source files found`);
  assert.ok(SOURCES.includes('src/lib/redirects/redirectRules.js'),
    'the file this guard was written for is not in the scan');
  assert.ok(SOURCES.some((f) => f.endsWith('.mjs')), 'no test files in the scan');
  assert.ok(SOURCES.some((f) => f.endsWith('.css')), 'no stylesheets in the scan');
});

test('no tracked source file contains a NUL byte', () => {
  const offenders = [];
  for (const rel of SOURCES) {
    // Read as BYTES. Reading the file as utf8 and searching for the character
    // work, but a Buffer scan cannot be confused by an encoding that maps
    // something else onto U+0000 on the way in.
    const buf = readFileSync(path.join(ROOT, rel));
    const at = buf.indexOf(0);
    if (at !== -1) {
      const line = buf.subarray(0, at).toString('utf8').split('\n').length;
      offenders.push(`${rel}:${line}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'a tracked source file contains a NUL byte. Every standard text tool — '
    + 'file(1), grep, git diff — will treat it as binary, and this repo\'s own '
    + 'fs-tier scanners will silently stop seeing it. If you meant a control '
    + 'character in a regex, write the ESCAPE (\\x00), not the byte.',
  );
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the detector fires on a buffer that has one', () => {
  // Without this, a broken scan reports [] forever and the guard is decoration.
  // The fixture is local, so the control stays green while the real assertion
  // would go red.
  // BUILT AT RUNTIME, not written as literal bytes. A fixture containing a raw
  // NUL would make THIS FILE fail the sweep above the moment it is tracked —
  // which is exactly the right behaviour, and not a useful way to ship it.
  const raw = `const x = /[${String.fromCharCode(0)}-${String.fromCharCode(31)}]/;`;
  assert.notEqual(Buffer.from(raw, 'utf8').indexOf(0), -1, 'a raw NUL was not detected');
  assert.equal(Buffer.from('const x = /[\\x00-\\x1f]/;', 'utf8').indexOf(0), -1,
    'the ESCAPED form must not be flagged — that is the fix, not the defect');
});

test('CONTROL: the escaped regex still matches what the raw one did', () => {
  // The fix must be behaviour-preserving. `/[\x00-\x1f]/` and a class written
  // with the literal bytes are the same character class; asserted rather than
  // assumed, because "it looked equivalent" is how an escape gets it wrong.
  const escaped = /[\x00-\x1f]/;
  for (const code of [0x00, 0x01, 0x1f, 0x0a, 0x09]) {
    const ch = String.fromCharCode(code);
    assert.equal(escaped.test(`a${ch}b`), true, `did not match U+${code.toString(16)}`);
  }
  for (const ch of [' ', 'a', '/', '~', String.fromCharCode(0x20)]) {
    assert.equal(escaped.test(ch), false, `matched ${JSON.stringify(ch)}`);
  }
});

test('CONTROL: git ls-files really returns tracked paths, not a directory listing', () => {
  // If it silently fell back to something else, the sweep might cover the wrong
  // population — node_modules, say, which legitimately contains NUL bytes and
  // would make this guard fail for a reason nobody can fix.
  assert.ok(!SOURCES.some((f) => f.startsWith('node_modules/')), 'node_modules is in the scan');
  assert.ok(!SOURCES.some((f) => f.startsWith('.next/')), '.next is in the scan');
  assert.ok(SOURCES.includes('package.json'), 'a known tracked file is missing');
});
