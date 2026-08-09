import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
import { readSourceForScanning } from '../sourceScan.mjs';

// ONE definition of the reference number, and a guard that keeps it that way.
//
// The expression `String(id).slice(-8).toUpperCase()` was duplicated at
// FOURTEEN sites — §8.7 recorded six, because that grep looked for the name
// `refNo` and missed the eight written inline as `referenceNumber = String(…)`.
// The count being wrong in the doc is exactly why this guard is a scan rather
// than a list: a list would have been wrong in the same way.
//
// WHAT THIS CANNOT SEE: a re-implementation that computes the same string
// differently (`id.substring(id.length - 8)`), or one written in a file type
// this walker skips. It catches the copy-paste, which is what actually happened.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'src');

/** Every .js/.jsx under src/, recursively. */
function sourceFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

/** The copy-pasted expression, in the two spacings it appeared in. */
const INLINE_REFNO = /\.slice\(\s*-8\s*\)\s*\.toUpperCase\(\)/;

test('the source tree contains exactly one definition of the reference number', () => {
  const offenders = sourceFiles()
    .filter((f) => rel(f) !== 'src/lib/refNo.js')
    .filter((f) => INLINE_REFNO.test(readSourceForScanning(f)))
    .map(rel);

  assert.deepEqual(
    offenders, [],
    'these files re-implement the reference number instead of importing refNo ' +
    'from @/lib/refNo. Fourteen copies is how it got here the first time'
  );
});

test('CONTROL: the matcher finds the expression where it legitimately lives', () => {
  // Without this, a regex that matched nothing would make the test above pass
  // over a tree full of copies.
  const canonical = readSourceForScanning(path.join(SRC, 'lib', 'refNo.js'));
  assert.match(canonical, INLINE_REFNO, 'refNo.js itself must contain it');
});

test('CONTROL: the walker actually reaches the files that used to hold copies', () => {
  // A scan that silently visited nothing would also report zero offenders. Pin
  // the walk against files known to exist, including one that carried a copy.
  const files = sourceFiles().map(rel);
  assert.ok(files.length > 100, `only ${files.length} source files found — the walk is wrong`);
  for (const anchor of [
    'src/lib/refNo.js',
    'src/app/admin/registrations/_components/RegistrationsClient.jsx',
    'src/lib/email/template-senders/masterclass.js',
  ]) {
    assert.ok(files.includes(anchor), `${anchor} missing from the walk`);
  }
});

test('CONTROL: a commented-out copy does not count as a live one', () => {
  // readSourceForScanning strips comments. Several action files DISCUSS the
  // expression in their PII docstrings — courses.js, registrations.js and
  // inhouse-registrations.js all quote it — and prose must not be an offender.
  const discussesIt = ['src/lib/actions/courses.js', 'src/lib/actions/registrations.js'];
  for (const relPath of discussesIt) {
    const raw = readSourceForScanning(path.join(ROOT, relPath));
    assert.equal(
      INLINE_REFNO.test(raw), false,
      `${relPath} mentions the expression in prose only; the scrubber must drop it`
    );
  }
});
