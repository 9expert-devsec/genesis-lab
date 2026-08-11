import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE SEAM test/pure/legacyEncodingGate.test.mjs CANNOT REACH.
 *
 * That file proves `encodingGate` returns the right verdict. It cannot prove
 * the script ASKS — and a pure test of a function nobody calls is green
 * forever. scripts/rewrite-legacy-references.mjs opens a real Mongo connection
 * in `main()` and cannot be imported here, so the wiring is checked at the
 * source.
 *
 * ── READING THIS FILE AT ALL IS THE FIRST HAZARD ────────────────────────────
 * scripts/rewrite-legacy-references.mjs contains 4 literal NUL bytes, used
 * deliberately as composite-key separators. grep and ripgrep classify it as
 * BINARY and return "binary file matches" with ZERO lines, which reads exactly
 * like "not found" — that silent empty result has produced a wrong conclusion
 * about this file more than once. readSource() reads bytes through Node and is
 * not fooled, and the control below pins that the NULs are still there so a
 * future reader knows the hazard has not quietly gone away.
 */

const REL = 'scripts/rewrite-legacy-references.mjs';
const src = readSource(REL);

test('CONTROL: the file was really read, NULs and all', () => {
  // Against an empty string every "must contain" below fails loudly, but every
  // "must not contain" would pass in silence. Anchor the input first.
  assert.ok(src.code.length > 5000, `scanned to only ${src.code.length} chars`);
  assert.equal(
    (src.raw.match(/\0/g) || []).length, 4,
    'the 4 deliberate NUL bytes are gone or multiplied. They are composite-key '
    + 'separators, not corruption — and they are why grep lies about this file. '
    + 'If they were removed, that was a queued change landing early.',
  );
});

test('the script imports the gate rather than re-deriving the rule', () => {
  assert.match(
    src.withImports,
    /import\s*\{[^}]*\bencodingGate\b[^}]*\}\s*from\s*'\.\/lib\/legacy-reference-rewrite\.mjs'/,
    'encodingGate must come from the module the pure tests drive, or the two are '
    + 'two copies of one rule with nothing forcing them to agree',
  );
  assert.match(src.withImports, /import\s*\{[^}]*\bENCODING_GATE\b/);
});

test('BOTH phases are wired, and each asks for the verdict it acts on', () => {
  assert.match(
    src.code, /encodingGate\(\{\s*phase:\s*'load'[\s\S]{0,120}?\}\)\s*===\s*ENCODING_GATE\.WARN/,
    'the load-time site must branch on WARN',
  );
  assert.match(
    src.code, /encodingGate\(\{[\s\S]{0,160}?phase:\s*'write'[\s\S]{0,160}?\}\)\s*===\s*ENCODING_GATE\.DIE/,
    'the write-time site must branch on DIE',
  );
});

test('the load-time site WARNS and the write-time site DIES — not the reverse', () => {
  const loadAt = src.code.indexOf("phase: 'load'");
  const writeAt = src.code.indexOf("phase: 'write'");
  assert.ok(loadAt > -1 && writeAt > loadAt, 'both sites exist, load first');

  // The 400 characters after each call site: enough to contain the branch body,
  // short enough not to run into the other one.
  const loadBody = src.code.slice(loadAt, loadAt + 400);
  const writeBody = src.code.slice(writeAt, writeAt + 400);

  assert.match(loadBody, /\bwarn\(/, 'the load site must warn');
  assert.equal(/\bdie\(/.test(loadBody), false,
    'the load site must NOT die — that is the defect being fixed: an unreachable '
    + 'row halting the whole run');
  assert.match(writeBody, /\bdie\(/, 'the write site must die');
});

test('the startup assertion over the whole superseded map is GONE', () => {
  // The precise shape that was halting the run: a bare encodeURI comparison in
  // a loop over supersededBy, dying. If it comes back, the split is undone and
  // the pure tests would not notice — they never see this file.
  const mapLoop = src.code.slice(src.code.indexOf('for (const [from, to] of supersededBy)'));
  const guardBlock = mapLoop.slice(0, 500);
  assert.ok(guardBlock.length > 0, 'the superseded map loop must still exist');
  assert.equal(/\bdie\(/.test(guardBlock), false,
    'the load-time loop over the superseded map must not contain a die()',
  );
});

test('the script still does not encode — the rejected fix is not silently present', () => {
  // §3 explicitly rejected implementing encoding. The header promises the script
  // does not encode, and a promise in a comment is worth what the code says.
  assert.equal(
    /encodeURIComponent\(/.test(src.code), false,
    'encodeURIComponent appeared in this script. Encoding the superseded '
    + 'replacement was explicitly rejected — it is a separate correctness '
    + 'question from where the guarantee belongs',
  );
});
