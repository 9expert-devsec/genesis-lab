import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySeoTitle,
  stripBrandSuffix,
  graphemeLength,
  looksCutMidWord,
} from '@/lib/articles/seoTitleCleanup';

/**
 * Classifier for the SITE-13 / R2 seoTitle cleanup (scripts/cleanup-seo-titles.mjs).
 */

test('X │ 9Expert │ 9Expert Training → X (stripped repeatedly)', () => {
  assert.equal(stripBrandSuffix('สอน Excel │ 9Expert │ 9Expert Training').value, 'สอน Excel');
  const r = classifySeoTitle({ seoTitle: 'สอน Excel │ 9Expert │ 9Expert Training', title: 'สอน Excel' });
  assert.equal(r.category, 'brand-suffix');
  assert.equal(r.proposed, 'สอน Excel');
});

test('truncated brand: X │ 9Expe → X, X | 9E → X', () => {
  assert.equal(stripBrandSuffix('Power BI คืออะไร │ 9Expe').value, 'Power BI คืออะไร');
  assert.equal(stripBrandSuffix('Power BI คืออะไร | 9E').value, 'Power BI คืออะไร');
});

test('X | 9Expert Training → X; other separators and truncated Training', () => {
  assert.equal(stripBrandSuffix('Macro คืออะไร | 9Expert Training').value, 'Macro คืออะไร');
  assert.equal(stripBrandSuffix('Macro คืออะไร ｜ 9expert train').value, 'Macro คืออะไร');
  assert.equal(stripBrandSuffix('Macro คืออะไร - 9Expert').value, 'Macro คืออะไร');
  assert.equal(stripBrandSuffix('Macro คืออะไร — 9EXPERT TRAINING').value, 'Macro คืออะไร');
  assert.equal(stripBrandSuffix('Macro คืออะไร: 9Expert').value, 'Macro คืออะไร');
});

test('a single "9" is not a brand prefix, and a brand without a separator is kept', () => {
  assert.equal(stripBrandSuffix('Excel | 9').stripped, false);
  assert.equal(stripBrandSuffix('Excel ของ 9Expert').stripped, false);
});

test('a value that is all brand → needs-human, nothing proposed', () => {
  const r = classifySeoTitle({ seoTitle: '| 9Expert │ 9Expert Training', title: 'บทความ' });
  assert.equal(r.category, 'needs-human');
  assert.equal(r.proposed, null);
});

test('≥55-grapheme strict prefix of the title → cut-prefix, proposed ""', () => {
  const title = 'Gemini 4 Argon is the new frontier model from Google and the next step for AI';
  const seoTitle = title.slice(0, 60);
  assert.ok(graphemeLength(seoTitle) >= 55);
  const r = classifySeoTitle({ seoTitle, title });
  assert.equal(r.category, 'cut-prefix');
  assert.equal(r.proposed, '');
});

test('KNOWN GAP: a Thai cut at 60 UTF-16 units can be < 55 graphemes and stays ok', () => {
  // The pre-R1 form sliced at 60 code units; Thai vowels/tone marks make that
  // 54 graphemes here, below the 55-grapheme threshold the work order set.
  const title = 'Gemini 4 Argon โมเดลตัวใหม่จาก Google ก้าวถัดไปของปัญญาประดิษฐ์ระดับ Frontier';
  const seoTitle = 'Gemini 4 Argon โมเดลตัวใหม่จาก Google ก้าวถัดไปของปัญญาประดิ';
  assert.equal(seoTitle.length, 60);
  assert.equal(graphemeLength(seoTitle), 54);
  assert.equal(classifySeoTitle({ seoTitle, title }).category, 'ok');
});

test('brand stripped, then a ≥55 strict prefix → brand-suffix+cut-prefix, proposed ""', () => {
  const title = 'Microsoft Excel Advanced Formulas and Functions for Business Analysts in 2026';
  const cut = title.slice(0, 58);
  const r = classifySeoTitle({ seoTitle: `${cut} | 9Exp`, title });
  assert.equal(r.category, 'brand-suffix+cut-prefix');
  assert.equal(r.proposed, '');
});

test('a short prefix of the title is not a cut — ok', () => {
  const r = classifySeoTitle({ seoTitle: 'สูตร Excel', title: 'สูตร Excel ที่ใช้บ่อยในการทำงาน' });
  assert.equal(r.category, 'ok');
  assert.equal(r.proposed, null);
});

test('a normal short title → ok; empty → empty', () => {
  assert.equal(classifySeoTitle({ seoTitle: 'VLOOKUP คืออะไร', title: 'VLOOKUP คืออะไร ใช้อย่างไร' }).category, 'ok');
  assert.equal(classifySeoTitle({ seoTitle: '   ', title: 'x' }).category, 'empty');
  assert.equal(classifySeoTitle({ title: 'x' }).proposed, null);
});

test('Thai combining marks counted as graphemes, not UTF-16 units', () => {
  const s = 'ปัญญาประดิษฐ์'; // 13 code units: ป ั ญ ญ า ป ร ะ ด ิ ษ ฐ ์
  assert.equal(s.length, 13);
  // ปั|ญ|ญ|า|ป|ร|ะ|ดิ|ษ|ฐ์ — the vowel ั / ิ and the mark ์ attach to their consonant.
  assert.equal(graphemeLength(s), 10);
});

test('mid-word heuristic: Latin cut flagged, complete word not, clean ending not', () => {
  const title = 'Reporting Services for SQL Server administrators';
  assert.equal(looksCutMidWord('Reporting Serv', title, ''), true);
  assert.equal(looksCutMidWord('Reporting Services', title, ''), false);
  assert.equal(looksCutMidWord('Reporting Services?', 'other', ''), false);
});
