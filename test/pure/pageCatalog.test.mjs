import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_CATEGORY, CATALOG_DOWNLOAD_LABEL, CATALOG_KINDS,
  catalogPublicPath, catalogTarget, emptyCatalog, hasCatalog, refuseNonPdf,
} from '@/lib/pageCatalog';
import { normaliseKeyForPath } from '@/lib/files/pathKey';
import { normaliseCourseIdForPath } from '@/lib/courses/courseOutline';
import { isValidCategory } from '@/lib/legacyUploadPolicy.mjs';

/**
 * The catalog PDF on a program or skill page — the shape, the path, the
 * predicate. Pure; the action is I/O around catalogTarget and the button is
 * markup around hasCatalog.
 */

// ── The predicate ───────────────────────────────────────────────────────────

test('hasCatalog is true only with a stored, non-blank path', () => {
  assert.equal(hasCatalog({ catalogPdf: { path: '/files/catalog/program-power-bi-catalog.pdf' } }), true);
  assert.equal(hasCatalog({ catalogPdf: { path: 'x.pdf', bytes: 0, uploadedAt: null } }), true);
});

test('hasCatalog is false for absent, null, empty string and whitespace', () => {
  assert.equal(hasCatalog(undefined), false, 'no config');
  assert.equal(hasCatalog(null), false, 'null config');
  assert.equal(hasCatalog({}), false, 'config without the field');
  assert.equal(hasCatalog({ catalogPdf: null }), false, 'null field');
  assert.equal(hasCatalog({ catalogPdf: {} }), false, 'field without a path');
  assert.equal(hasCatalog({ catalogPdf: { path: null } }), false, 'null path');
  assert.equal(hasCatalog({ catalogPdf: { path: '' } }), false, 'empty path');
  assert.equal(hasCatalog({ catalogPdf: { path: '   ' } }), false, 'whitespace path');
  assert.equal(hasCatalog({ catalogPdf: emptyCatalog() }), false, 'the cleared record');
  assert.equal(hasCatalog({ catalogPdf: { path: 42 } }), false, 'a non-string path');
});

// ── The derived target ──────────────────────────────────────────────────────

test('the path is derived from (kind, key): lowercased, under /files/catalog/', () => {
  const t = catalogTarget('program', 'POWER-BI');
  assert.equal(t.ok, true);
  assert.equal(t.key, 'power-bi');
  assert.equal(t.fileName, 'program-power-bi-catalog.pdf');
  assert.equal(t.publicPath, '/files/catalog/program-power-bi-catalog.pdf');
  assert.equal(t.publicId, '9exp-genesis/legacy/files/catalog/program-power-bi-catalog.pdf');
  // The category needs no registration: it is a valid /files/<category> segment
  // and the RAW rewrite serves any such .pdf.
  assert.equal(isValidCategory(CATALOG_CATEGORY), true);
});

test('two different programs derive two different paths — no collision', () => {
  const a = catalogTarget('program', 'POWER-BI');
  const b = catalogTarget('program', 'DEV');
  assert.notEqual(a.publicPath, b.publicPath);
  assert.notEqual(a.publicId, b.publicId);
});

test('a program and a skill with the SAME code derive different paths — the kind is in the name', () => {
  // `DEV` is a real program code and a real skill code.
  const p = catalogTarget('program', 'DEV');
  const s = catalogTarget('skill', 'DEV');
  assert.equal(p.publicPath, '/files/catalog/program-dev-catalog.pdf');
  assert.equal(s.publicPath, '/files/catalog/skill-dev-catalog.pdf');
  assert.notEqual(p.publicId, s.publicId);
});

test('case variants of one key derive ONE path — the collision Cloudinary would fold is unexpressible', () => {
  assert.equal(catalogTarget('skill', 'DeV').publicPath, catalogTarget('skill', 'dev').publicPath);
  assert.equal(catalogPublicPath('skill', 'dev'), '/files/catalog/skill-dev-catalog.pdf');
});

test('an unsafe key is REFUSED, by name — never sanitised into a neighbour\'s path', () => {
  for (const bad of ['MSE L1', 'x/../y', 'ค่าไทย', 'a_b', 'x.y', '', '   ', null, undefined]) {
    const r = catalogTarget('program', bad);
    assert.equal(r.ok, false, `expected ${JSON.stringify(bad)} to be refused`);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0);
  }
  assert.match(catalogTarget('program', 'MSE L1').error, /MSE L1/, 'the refusal names the value');
  assert.match(catalogTarget('program', 'MSE L1').error, /program_id/, 'the refusal names the field');
  assert.match(catalogTarget('skill', 'MSE L1').error, /skill_id/);
});

test('an unknown kind is refused, never defaulted to program', () => {
  for (const bad of ['course', 'career_path', '', null, undefined, 'PROGRAM']) {
    assert.equal(catalogTarget(bad, 'dev').ok, false, `kind ${JSON.stringify(bad)} was accepted`);
  }
  assert.deepEqual([...CATALOG_KINDS], ['program', 'skill']);
});

test('the key rule is the outline\'s, lifted — normaliseCourseIdForPath still answers as it did', () => {
  assert.deepEqual(normaliseCourseIdForPath('POWER-BI'), { ok: true, value: 'power-bi' });
  assert.equal(normaliseCourseIdForPath('').reason, 'course_id ว่าง — กรอกรหัสหลักสูตรก่อนอัปโหลด');
  assert.match(normaliseCourseIdForPath('MSE L1').reason, /^course_id "MSE L1"/);
  assert.deepEqual(normaliseKeyForPath('AI', { label: 'skill_id' }), { ok: true, value: 'ai' });
});

// ── The PDF check ───────────────────────────────────────────────────────────

test('a PDF passes the type check; the check reads the PICKED file, not the derived name', () => {
  assert.equal(refuseNonPdf({ filename: 'Power BI.pdf', contentType: 'application/pdf' }), null);
  assert.equal(refuseNonPdf({ filename: 'catalog.PDF', contentType: 'application/pdf' }), null);
  // A browser that cannot tell the type is not refused on the type.
  assert.equal(refuseNonPdf({ filename: 'catalog.pdf', contentType: '' }), null);
});

test('a non-PDF is refused — by extension, and by a stated non-PDF type on a .pdf name', () => {
  assert.match(refuseNonPdf({ filename: 'catalog.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), /PDF/);
  assert.match(refuseNonPdf({ filename: 'catalog.png', contentType: 'image/png' }), /PDF/);
  assert.match(refuseNonPdf({ filename: 'catalog', contentType: 'application/pdf' }), /PDF/, 'no extension');
  assert.match(refuseNonPdf({ filename: 'renamed.pdf', contentType: 'image/png' }), /image\/png/, 'a renamed image');
  assert.match(refuseNonPdf({ filename: '', contentType: 'application/pdf' }), /ชื่อไฟล์/);
  assert.match(refuseNonPdf({}), /ชื่อไฟล์/);
});

// ── The button's words ──────────────────────────────────────────────────────

test('the label follows the site\'s existing catalog button copy', () => {
  assert.equal(CATALOG_DOWNLOAD_LABEL, 'ดาวน์โหลดแคตตาล็อก');
});
