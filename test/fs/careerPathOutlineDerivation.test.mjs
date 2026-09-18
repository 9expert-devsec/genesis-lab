// The career-path outline actions NEVER build a path or a public_id of their own.
//
// src/lib/actions/career-path-outlines.js signs uploads with overwrite:true, so
// whoever names the path names the asset that gets destroyed. The only safe
// author of that name is src/lib/career-paths/careerPathOutline.js, and the
// only safe author of the public_id is legacyPathToPublicId. A copy of either
// rule inside the action would pass every render test and quietly drift.
// Same guard, same probes, as test/fs/courseOutlineDerivation.test.mjs — the
// module is a mirror and so is its guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

const REL = 'src/lib/actions/career-path-outlines.js';
const SRC = readSource(REL);
const calls = (code, name) => new RegExp(`\\b${name}\\s*\\(`).test(code);

test('the scan found real code (asserted before anything is concluded from it)', () => {
  assert.ok(SRC.code.length > 500, `${REL} scanned to ${SRC.code.length} chars — too short to be the module`);
  assert.ok(SRC.code.includes('signCareerPathOutlineUpload'), 'the module under test does not contain the export it is named for');
  assert.ok(SRC.code.includes('recordCareerPathOutlineUpload'));
});

test('the actions CALL the shared derivation', () => {
  for (const fn of ['careerOutlineSlugKey', 'careerOutlineFileName', 'careerOutlinePublicPath', 'legacyPathToPublicId']) {
    assert.ok(calls(SRC.code, fn), `${REL} never calls ${fn}() — the derivation is being bypassed`);
  }
  assert.ok(calls(SRC.code, 'isCareerOutlineLang'), 'lang must be validated through the shared predicate');
  assert.ok(calls(SRC.code, 'refuseUpload'), 'the upload policy must be the shared one, not a local opinion');
  assert.match(SRC.code, /extensionOf\(target\.fileName\) !== 'pdf'/, 'the pdf-only check is on the DERIVED name');
});

test('the module builds NO path of its own', () => {
  assert.equal(/['"`]\/files\//.test(SRC.code), false, `${REL} contains a literal /files/ path — the path must come from careerOutlinePublicPath()`);
  assert.equal(/course-outline\//.test(SRC.code), false, `${REL} spells the category segment itself`);
  assert.equal(/\.pdf['"`]/.test(SRC.code), false, `${REL} builds a filename ending .pdf — that belongs to careerOutlineFileName()`);
  assert.equal(/career-\$\{|'career-'|"career-"/.test(SRC.code), false, `${REL} spells the career- prefix itself`);
});

test('the module builds NO public_id of its own', () => {
  assert.equal(/\$\{\s*LEGACY_PUBLIC_ID_PREFIX\s*\}|LEGACY_PUBLIC_ID_PREFIX\s*\+/.test(SRC.code), false, `${REL} concatenates the Cloudinary prefix`);
  assert.equal(/9exp-genesis\/legacy/.test(SRC.code), false, `${REL} hardcodes the Cloudinary prefix literal`);
  assert.match(SRC.code, /legacyPathToPublicId\(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX\)/, 'raw resource type, canonical prefix');
});

test('the client-supplied inputs are never used as a path', () => {
  assert.equal(/`[^`]*\$\{\s*apiSlug\s*\}[^`]*`/.test(SRC.code), false, `${REL} interpolates the raw apiSlug into a template`);
  assert.equal(/`[^`]*\$\{\s*careerPathId\s*\}[^`]*`/.test(SRC.code), false, `${REL} interpolates careerPathId into a template`);
});

test('overwrite + invalidate are in the SIGNED set and returned to the browser as params', () => {
  const signed = SRC.code.match(/const toSign = \{([\s\S]*?)\};/);
  assert.ok(signed, 'toSign is no longer a literal object — re-anchor this guard');
  assert.match(signed[1], /overwrite:\s*true/);
  assert.match(signed[1], /invalidate:\s*true/);
  assert.match(signed[1], /unique_filename:\s*false/);
  assert.match(SRC.code, /params:\s*\{\s*\.\.\.toSign,\s*signature\s*\}/, 'the browser gets the signed set verbatim plus the signature');
  assert.match(SRC.code, /api_sign_request\(toSign,/, 'and it is toSign itself that is signed');
});

test('both exports guard on career_paths and record the same menu (the coverage guard pairs these)', () => {
  const guards = SRC.code.match(/requireAdmin\('career_paths'\)/g) || [];
  assert.equal(guards.length, 2);
  const menus = SRC.code.match(/menu:\s*'career_paths'/g) || [];
  assert.equal(menus.length, 2);
  const entities = SRC.code.match(/entity:\s*'career_path'/g) || [];
  assert.equal(entities.length, 2, "('career_paths','career_path') is the contract's full pair");
  assert.equal(/requireAdmin\('courses'\)|menu:\s*'courses'/.test(SRC.code), false, 'no course menu leaked in from the mirror');
});

test('the ledger row is keyed on (slugKey, lang) and bumps version', () => {
  assert.match(SRC.code, /findOneAndUpdate\(\s*\{ slugKey: target\.slugKey, lang: target\.lang \}/);
  assert.match(SRC.code, /\$inc: \{ version: 1 \}/);
  assert.match(SRC.code, /upsert: true/);
  assert.match(SRC.withImports, /from '@\/models\/CareerPathOutlineFile'/, 'the NEW model, not CourseOutlineFile');
  assert.equal(/CourseOutlineFile\b/.test(SRC.withImports.replace(/CareerPathOutlineFile/g, '')), false, 'CourseOutlineFile is not touched');
});

test('CONTROL: an inlined literal path IS caught', () => {
  const bad = "const publicPath = `/files/course-outline/career-${apiSlug}-course-outline-${lang}.pdf`;";
  assert.equal(/['"`]\/files\//.test(bad), true);
  assert.equal(/course-outline\//.test(bad), true);
  assert.equal(/career-\$\{|'career-'|"career-"/.test(bad), true);
  assert.equal(/`[^`]*\$\{\s*apiSlug\s*\}[^`]*`/.test(bad), true);
});

test('CONTROL: a hand-built public_id IS caught, the correct call is not', () => {
  const probe = /\$\{\s*LEGACY_PUBLIC_ID_PREFIX\s*\}|LEGACY_PUBLIC_ID_PREFIX\s*\+/;
  assert.equal(probe.test('const id = `${LEGACY_PUBLIC_ID_PREFIX}/files/x.pdf`;'), true);
  assert.equal(probe.test("const id = LEGACY_PUBLIC_ID_PREFIX + '/files/x.pdf';"), true);
  assert.equal(/9exp-genesis\/legacy/.test("const id = '9exp-genesis/legacy/files/x.pdf';"), true);
  assert.equal(probe.test("legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX)"), false);
});

test('CONTROL: a mere MENTION does not satisfy the delegation probe', () => {
  assert.equal(calls('const note = "we use careerOutlineSlugKey somewhere";', 'careerOutlineSlugKey'), false);
});
