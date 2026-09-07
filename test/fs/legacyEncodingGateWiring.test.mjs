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
 * ── READING THIS FILE USED TO BE THE FIRST HAZARD. IT IS NOT ANY MORE ───────
 * This paragraph used to warn that the script contained 4 literal NUL bytes,
 * used deliberately as composite-key separators, and that grep and ripgrep
 * therefore classified it as BINARY and returned "binary file matches" with
 * ZERO lines — a silent empty result that reads exactly like "not found" and
 * had produced a wrong conclusion about this file more than once. The control
 * below pinned the count at 4 so the hazard could not quietly change, and said
 * that if they were ever removed, that was a queued change landing early.
 *
 * THAT CHANGE HAS LANDED. The four separators are now written `\x00` — the same
 * character, spelled as an escape — so the file is ordinary UTF-8 text and
 * every text tool can read it. The control is inverted rather than deleted: it
 * now pins that the NULs are GONE, because the hazard coming back is the thing
 * worth catching, and because six other files in this repo turned out to carry
 * the same defect. test/fs/noNulBytes now sweeps every tracked source file for
 * it, so this control is the local, named half of a rule that is enforced
 * globally.
 *
 * readSource() reads bytes through Node and was never fooled either way, which
 * is why the assertions below did not need changing.
 */

const REL = 'scripts/rewrite-legacy-references.mjs';
const src = readSource(REL);

test('CONTROL: the file was really read, and the NUL hazard is gone', () => {
  // Against an empty string every "must contain" below fails loudly, but every
  // "must not contain" would pass in silence. Anchor the input first.
  assert.ok(src.code.length > 5000, `scanned to only ${src.code.length} chars`);
  assert.equal(
    (src.raw.match(/\0/g) || []).length, 0,
    'a literal NUL byte is back in this script. The four composite-key '
    + 'separators are written \\x00 now — the same character, spelled as an '
    + 'escape — because a raw one makes grep, file(1) and git diff treat the '
    + 'whole file as binary, and this suite\'s own scanners can then skip it '
    + 'while still reporting green.',
  );
  // …and the separators are still THERE, as escapes. Asserting only their
  // absence would pass against a script that had stopped composing keys at all.
  assert.ok(
    src.code.includes('\\x00'),
    'the composite-key separators are gone entirely, not merely re-spelled',
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
