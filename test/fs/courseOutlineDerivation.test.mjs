import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The outline actions must DELEGATE their path and id derivation, never build one.
 *
 * ══ WHY A SOURCE SCAN AND NOT A UNIT TEST ═══════════════════════════════════
 *
 * src/lib/actions/course-outlines.js is `'use server'` and imports next-side
 * modules, so no test in this suite can import it and call it with a hostile
 * argument (see the header of test/fs/actionsParse.test.mjs). The validation it
 * relies on IS unit-tested — test/pure/courseOutlineShape.test.mjs drives
 * normaliseCourseIdForPath directly, including the traversal and mixed-case
 * cases. What that leaves unproven is the connection: that the action actually
 * ROUTES through it rather than composing a path of its own alongside it.
 *
 * This file closes exactly that gap and nothing more. It is a shape guard, not
 * a behaviour test.
 *
 * ══ WHY IT MATTERS MORE HERE THAN ANYWHERE ELSE ═════════════════════════════
 *
 * The upload is signed with `overwrite: true`. Whoever decides the path decides
 * which Cloudinary asset is destroyed, and the assets next door are the migrated
 * article images and course covers. /admin/media can accept a client filename
 * precisely because it REFUSES to overwrite; this path cannot, so the derivation
 * is the only thing standing between a request body and someone else's file.
 *
 * A future edit that inlines `/files/course-outline/${x}.pdf` "just here" would
 * be invisible to every other test in the repo: the pure tests would still pass
 * because the helper still works, and nothing would notice it had stopped being
 * called.
 *
 * ── READ THROUGH sourceScan ─────────────────────────────────────────────────
 * `.code` strips comments and imports, so the module's own docstring — which
 * quotes both a literal path and the retired shape — cannot satisfy or trip any
 * matcher here, and neither can an import line that merely NAMES a helper the
 * body never calls.
 */

const REL = 'src/lib/actions/course-outlines.js';
const SRC = readSource(REL);

/** Call sites, not mentions: `name(` with the paren attached. */
const calls = (code, name) => new RegExp(`\\b${name}\\s*\\(`).test(code);

test('the scan found real code (asserted before anything is concluded from it)', () => {
  assert.ok(SRC.code.length > 500, `${REL} scanned to ${SRC.code.length} chars — too short to be the module`);
  assert.ok(calls(SRC.code, 'signCourseOutlineUpload') || SRC.code.includes('signCourseOutlineUpload'),
    'the module under test does not contain the export it is named for');
});

test('the actions CALL the shared derivation', () => {
  for (const fn of ['normaliseCourseIdForPath', 'outlineFileName', 'outlinePublicPath', 'legacyPathToPublicId']) {
    assert.ok(calls(SRC.code, fn), `${REL} never calls ${fn}() — the derivation is being bypassed`);
  }
  assert.ok(calls(SRC.code, 'isOutlineLang'), 'lang must be validated through the shared predicate');
  assert.ok(calls(SRC.code, 'refuseUpload'), 'the upload policy must be the shared one, not a local opinion');
});

test('the module builds NO path of its own', () => {
  // A literal files path anywhere in the executable code means a second
  // derivation exists beside the shared one.
  assert.equal(/['"`]\/files\//.test(SRC.code), false,
    `${REL} contains a literal /files/ path — the path must come from outlinePublicPath()`);
  assert.equal(/course-outline\//.test(SRC.code), false,
    `${REL} spells the category segment itself — it belongs to OUTLINE_CATEGORY`);
  assert.equal(/\.pdf['"`]/.test(SRC.code), false,
    `${REL} builds a filename ending .pdf — that belongs to outlineFileName()`);
});

test('the module builds NO public_id of its own', () => {
  // The prefix may be IMPORTED and handed to legacyPathToPublicId, but never
  // concatenated into an id here.
  // Interpolated `${PREFIX}` or concatenated `PREFIX +`. Passing it as an
  // ARGUMENT to legacyPathToPublicId is the sanctioned use and matches neither.
  assert.equal(/\$\{\s*LEGACY_PUBLIC_ID_PREFIX\s*\}|LEGACY_PUBLIC_ID_PREFIX\s*\+/.test(SRC.code), false,
    `${REL} concatenates the Cloudinary prefix — ids come from legacyPathToPublicId()`);
  assert.equal(/9exp-genesis\/legacy/.test(SRC.code), false,
    `${REL} hardcodes the Cloudinary prefix literal`);
});

test('the client-supplied inputs are never used as a path', () => {
  // courseId/lang arrive from the browser. They may reach the DERIVATION; they
  // may not reach a template that becomes a path.
  assert.equal(/`[^`]*\$\{\s*courseId\s*\}[^`]*`/.test(SRC.code), false,
    `${REL} interpolates the raw courseId into a template — it must go through `
    + 'normaliseCourseIdForPath() first');
});

// ── CONTROLS — each proves the matcher above can actually go red ────────────
//
// They run the same predicates over synthetic source rather than editing the
// real file, so a control can never fail merely because its subject is broken.

test('CONTROL: an inlined literal path IS caught', () => {
  const bad = "const publicPath = `/files/course-outline/${courseId}-course-outline-${lang}.pdf`;";
  assert.equal(/['"`]\/files\//.test(bad), true,
    'the literal-path probe does not fire on the exact edit it exists to catch');
  assert.equal(/course-outline\//.test(bad), true);
  assert.equal(/`[^`]*\$\{\s*courseId\s*\}[^`]*`/.test(bad), true,
    'nor does the raw-courseId probe');
});

test('CONTROL: a hand-built public_id IS caught', () => {
  // MEASURED: the first version of this probe was `/LEGACY_PUBLIC_ID_PREFIX\s*\}?\s*[+`]/`
  // and this control caught it — in `${PREFIX}/files/…` the character after the
  // name is `}`, so the probe matched nothing and would have passed a
  // hand-built id straight through. The control found a hole in the guard
  // before the guard ever met the code it protects.
  const interpolated = 'const id = `${LEGACY_PUBLIC_ID_PREFIX}/files/course-outline/x.pdf`;';
  const concatenated = "const id = LEGACY_PUBLIC_ID_PREFIX + '/files/course-outline/x.pdf';";
  const hardcoded = "const id = '9exp-genesis/legacy/files/course-outline/x.pdf';";
  const probe = /\$\{\s*LEGACY_PUBLIC_ID_PREFIX\s*\}|LEGACY_PUBLIC_ID_PREFIX\s*\+/;
  assert.equal(probe.test(interpolated), true, 'interpolated prefix must be caught');
  assert.equal(probe.test(concatenated), true, 'concatenated prefix must be caught');
  assert.equal(/9exp-genesis\/legacy/.test(hardcoded), true, 'hardcoded prefix must be caught');

  // and the SANCTIONED use — passing it as an argument — must NOT trip it
  assert.equal(probe.test("legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX)"), false,
    'the probe must not fire on the correct call, or the real assertion is unpassable');
});

test('CONTROL: a module that never calls the derivation IS caught', () => {
  const bad = 'export async function signCourseOutlineUpload() { return { ok: true }; }';
  for (const fn of ['normaliseCourseIdForPath', 'outlinePublicPath', 'legacyPathToPublicId']) {
    assert.equal(calls(bad, fn), false,
      `the delegation probe would pass a module that never calls ${fn}()`);
  }
});

test('CONTROL: a mere MENTION does not satisfy the delegation probe', () => {
  // The defect this shape of guard usually has: an import line, or a comment,
  // standing in for a call. `.code` strips both, and the probe needs the paren.
  const mention = 'const note = "we use normaliseCourseIdForPath somewhere";';
  assert.equal(calls(mention, 'normaliseCourseIdForPath'), false,
    'a bare substring probe would have accepted this and proved nothing');
});
