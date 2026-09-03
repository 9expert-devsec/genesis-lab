import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readSource, walkSources, ROOT } from '../sourceScan.mjs';
import { NOT_SPECIFIED_LABEL, orNotSpecified } from '@/lib/orNotSpecified';

/**
 * The EXACT literal, quoted — not a substring match. Several existing,
 * unrelated strings in this repo (e.g. "ยังไม่ได้ระบุคอร์ส", "ไม่ได้ระบุรหัสเดิม")
 * CONTAIN "ไม่ได้ระบุ" as a substring without BEING it; a bare
 * `.includes(NOT_SPECIFIED_LABEL)` would treat every one of them as a second
 * definition and reddens on its own before the control fixture is even
 * introduced. Matches the literal wrapped in a matching quote character on
 * both sides, with nothing else inside — i.e. the literal standing alone as
 * its own string, not embedded in a longer sentence.
 */
const EXACT_LITERAL = new RegExp(`(['"\`])${NOT_SPECIFIED_LABEL}\\1`);

/**
 * T1 + T4 (Nutto ticket 5).
 *
 * T1: the literal 'ไม่ได้ระบุ' is defined in exactly ONE file in src/ — every
 * other consumer imports NOT_SPECIFIED_LABEL/orNotSpecified rather than
 * retyping it (R2).
 *
 * T4: the placeholder is render-time only (R3) — it must never be referenced
 * (imported OR used) by a write path: the registration API route, the
 * registration build/server-action step, or the Mongoose model.
 */

// ── T1 ───────────────────────────────────────────────────────────────────

test('the literal ไม่ได้ระบุ is defined in exactly ONE source file in src/', () => {
  // .code (comments AND imports stripped) — but scrubSource PRESERVES string
  // bodies (see sourceScan.mjs's own header, "A NOTE ON STRINGS"), so a file
  // that genuinely HOLDS the literal as a string value still shows it here;
  // only a comment or an import statement mentioning it would be hidden, and
  // neither is what this assertion is trying to find.
  const hits = walkSources('src').filter((f) => EXACT_LITERAL.test(f.code));
  assert.deepEqual(
    hits.map((f) => f.rel),
    ['src/lib/orNotSpecified.js'],
    'the literal is defined somewhere other than exactly src/lib/orNotSpecified.js'
  );
});

test('CONTROL: a second literal elsewhere in src/ reddens the single-source assertion', () => {
  const throwawayRel = 'src/lib/_scratch-throwaway-not-specified-literal.js';
  const throwawayAbs = path.join(ROOT, throwawayRel);
  assert.ok(!existsSync(throwawayAbs), 'the throwaway fixture already exists — a previous run did not clean up');
  writeFileSync(throwawayAbs, `export const SCRATCH = 'ไม่ได้ระบุ';\n`, 'utf8');
  try {
    const hits = walkSources('src').filter((f) => EXACT_LITERAL.test(f.code));
    assert.equal(hits.length, 2, 'the control fixture was not picked up — this control is not meaningful');
    assert.ok(hits.some((f) => f.rel === throwawayRel), 'the control fixture specifically was not found');
  } finally {
    unlinkSync(throwawayAbs);
  }
  assert.ok(!existsSync(throwawayAbs), 'the throwaway fixture was not cleaned up');
});

// ── T4 ───────────────────────────────────────────────────────────────────

const WRITE_PATH_FILES = [
  'src/app/api/registration/public/route.js',
  'src/lib/registration/build-public.js',
  'src/models/RegisterPublic.js',
];

test('the placeholder is not referenced (imported or used) by any write path', () => {
  // withImports, NOT code — a "does not reference X" guard read from `code`
  // (which strips import lines) would pass VACUOUSLY the moment a file
  // imports NOT_SPECIFIED_LABEL/orNotSpecified without calling it: the import
  // line itself would already be invisible to `code`, so this assertion would
  // report "not referenced" even on a file that plainly imports it. Reading
  // `withImports` is what makes an import alone enough to fail this test.
  for (const rel of WRITE_PATH_FILES) {
    const src = readSource(rel);
    assert.equal(src.withImports.includes('NOT_SPECIFIED_LABEL'), false,
      `${rel} references NOT_SPECIFIED_LABEL`);
    assert.equal(src.withImports.includes('orNotSpecified'), false,
      `${rel} references orNotSpecified`);
  }
});

test('CONTROL: referencing the constant in one write-path file reddens the guard above', () => {
  const rel = 'src/models/RegisterPublic.js';
  const abs = path.join(ROOT, rel);
  const original = readSource(rel).raw;
  const mutated = `import { NOT_SPECIFIED_LABEL } from '@/lib/orNotSpecified';\n${original}`;
  writeFileSync(abs, mutated, 'utf8');
  try {
    const src = readSource(rel);
    assert.equal(src.withImports.includes('NOT_SPECIFIED_LABEL'), true,
      'the control fixture was not picked up — this control is not meaningful');
  } finally {
    writeFileSync(abs, original, 'utf8');
  }
  assert.equal(readSource(rel).raw, original, 'the write-path file was not restored byte-identically');
});

// ── Sanity: the fixtures above actually exercise the real module ──────────

test('CONTROL: NOT_SPECIFIED_LABEL and orNotSpecified are the real exports, not stand-ins', () => {
  assert.equal(NOT_SPECIFIED_LABEL, 'ไม่ได้ระบุ');
  assert.equal(orNotSpecified(''), NOT_SPECIFIED_LABEL);
});
