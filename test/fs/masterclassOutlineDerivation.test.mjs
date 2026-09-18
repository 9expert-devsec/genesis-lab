// The masterclass outline action never builds a path or a public_id of its own,
// signs overwrite+invalidate, and is the form's ONLY route to course_outline_url.
// Same probes as test/fs/courseOutlineDerivation and careerPathOutlineDerivation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

const ACTION = 'src/lib/actions/masterclass-outlines.js';
const FIELD = 'src/components/admin/MasterclassOutlineUpload.jsx';
const FORM = 'src/app/admin/masterclass/_components/MasterclassCourseFormClient.jsx';
const SRC = readSource(ACTION);
const calls = (code, name) => new RegExp(`\\b${name}\\s*\\(`).test(code);

test('the scan found real code', () => {
  assert.ok(SRC.code.length > 500, `${ACTION} scanned to ${SRC.code.length} chars`);
  assert.ok(SRC.code.includes('signMasterclassOutlineUpload'));
});

test('the action CALLS the shared derivation and the shared policy', () => {
  for (const fn of ['masterclassOutlineSlugKey', 'masterclassOutlineFileName', 'masterclassOutlinePublicPath', 'legacyPathToPublicId', 'isMasterclassOutlineLang', 'refuseUpload']) {
    assert.ok(calls(SRC.code, fn), `${ACTION} never calls ${fn}()`);
  }
  assert.match(SRC.code, /extensionOf\(target\.fileName\) !== 'pdf'/);
});

test('the action builds NO path and NO public_id of its own', () => {
  assert.equal(/['"`]\/files\//.test(SRC.code), false, 'literal /files/ path');
  assert.equal(/masterclass-outline\//.test(SRC.code), false, 'spells the category');
  assert.equal(/\.pdf['"`]/.test(SRC.code), false, 'builds a .pdf filename');
  assert.equal(/\$\{\s*LEGACY_PUBLIC_ID_PREFIX\s*\}|LEGACY_PUBLIC_ID_PREFIX\s*\+|9exp-genesis\/legacy/.test(SRC.code), false, 'hand-built public_id');
  assert.equal(/`[^`]*\$\{\s*slug\s*\}[^`]*`/.test(SRC.code), false, 'raw slug interpolated into a template');
  assert.match(SRC.code, /legacyPathToPublicId\(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX\)/);
});

test('overwrite + invalidate are in the SIGNED set and returned verbatim', () => {
  const signed = SRC.code.match(/const toSign = \{([\s\S]*?)\};/);
  assert.ok(signed);
  assert.match(signed[1], /overwrite:\s*true/);
  assert.match(signed[1], /invalidate:\s*true/);
  assert.match(signed[1], /unique_filename:\s*false/);
  assert.match(SRC.code, /params:\s*\{\s*\.\.\.toSign,\s*signature\s*\}/);
  assert.match(SRC.code, /api_sign_request\(toSign,/);
  assert.match(SRC.code, /\/raw\/upload`/, 'raw resource type — a PDF must not be an image asset');
});

test('guards on masterclass and records the (masterclass, course) pair; no ledger model', () => {
  assert.equal((SRC.code.match(/requireAdmin\('masterclass'\)/g) || []).length, 1);
  assert.match(SRC.code, /menu:\s*'masterclass'/);
  assert.match(SRC.code, /entity:\s*'course'/);
  assert.equal(/from '@\/models\//.test(SRC.withImports), false, 'no ledger collection — the course row is the record (see the header)');
  assert.equal(/dbConnect/.test(SRC.withImports), false);
});

test('the field posts the signed params verbatim, emits only the signed path or empty, and renders no text input', () => {
  const { code, withImports } = readSource(FIELD);
  assert.match(withImports, /from '@\/lib\/actions\/masterclass-outlines'/);
  assert.equal(/['"`]\/files\/[a-z]/.test(code), false, 'the field spells no /files path of its own');
  assert.match(code, /for \(const \[k, v\] of Object\.entries\(signed\.params\)\) body\.append\(k, String\(v\)\)/);
  const emits = (code.match(/onChange\?\.\((.*?)\)/g) || []).sort();
  assert.deepEqual(emits, ["onChange?.('')", 'onChange?.(signed.publicPath)'].sort());
  assert.equal(/type="text"|type="url"|<textarea/.test(code), false, 'display-only — no editable input for the value');
  assert.equal(/api\/admin\/upload/.test(code), false);
});

test('the form mounts the field as the only writer of course_outline_url; the text box and the /api/admin/upload call are gone', () => {
  const { code, withImports } = readSource(FORM);
  assert.match(withImports, /import \{ MasterclassOutlineUpload \} from '@\/components\/admin\/MasterclassOutlineUpload'/);
  const mount = code.match(/<MasterclassOutlineUpload\b([\s\S]*?)\/>/);
  assert.ok(mount, 'not mounted');
  assert.match(mount[1], /slug=\{slug\}/);
  assert.match(mount[1], /value=\{courseOutlineUrl\}/);
  assert.match(mount[1], /onChange=\{setCourseOutlineUrl\}/);
  assert.equal(/api\/admin\/upload/.test(code), false, 'the form itself no longer posts to /api/admin/upload (image fields do so inside their own components)');
  // setCourseOutlineUrl is never CALLED in the form: the field owns it via onChange={setCourseOutlineUrl}.
  const writers = (code.match(/setCourseOutlineUrl\(/g) || []).length;
  assert.equal(writers, 0, `setCourseOutlineUrl is called directly ${writers} time(s) — the field must be the only writer`);
  assert.equal(/onChange=\{\(e\) => setCourseOutlineUrl\(e\.target\.value\)\}/.test(code), false, 'the free-text box is back');
  assert.match(code, /course_outline_url: courseOutlineUrl\.trim\(\)/, 'the save still carries the value');
  assert.equal(/fd\.append\('folder', 'masterclass'\)/.test(code), false, 'the /api/admin/upload call for the outline is gone');
});

test('CONTROL: the probes fire on the shapes this round removed', () => {
  const oldBox = `<input type="text" placeholder="https://..." value={courseOutlineUrl ?? ''} onChange={(e) => setCourseOutlineUrl(e.target.value)} />`;
  assert.equal(/onChange=\{\(e\) => setCourseOutlineUrl\(e\.target\.value\)\}/.test(oldBox), true);
  assert.equal(/['"`]\/files\//.test("const p = `/files/masterclass-outline/${slug}-course-outline-th.pdf`;"), true);
  assert.equal(/`[^`]*\$\{\s*slug\s*\}[^`]*`/.test("`${slug}-course-outline-th.pdf`"), true);
});
