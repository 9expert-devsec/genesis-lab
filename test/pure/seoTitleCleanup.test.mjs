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

test('rule A: X | 9 → X; a lone 9 with no separator (Windows 9) is kept', () => {
  const r = stripBrandSuffix('Migrate ฐานข้อมูลจาก SQL Server ไปยัง Azure SQL Database | 9');
  assert.equal(r.value, 'Migrate ฐานข้อมูลจาก SQL Server ไปยัง Azure SQL Database');
  assert.equal(r.removed, ' | 9');
  assert.equal(stripBrandSuffix('ติดตั้ง Windows 9').stripped, false);
  assert.equal(stripBrandSuffix('Excel ของ 9Expert').stripped, false);
});

test('rule B: bare trailing separator stripped — X | → X, X | 9Expert | → X', () => {
  const bare = classifySeoTitle({ seoTitle: 'Socket Class ใน .NET Core 2 และ C# 7 |', title: 'อื่น' });
  assert.equal(bare.category, 'brand-suffix');
  assert.equal(bare.proposed, 'Socket Class ใน .NET Core 2 และ C# 7');
  assert.equal(bare.stripped, ' |');
  assert.equal(stripBrandSuffix('Power BI คืออะไร | 9Expert |').value, 'Power BI คืออะไร');
  assert.equal(stripBrandSuffix('Power BI คืออะไร | 9Expert |').removed, ' | 9Expert |');
});

test('a value that is all brand → needs-human, nothing proposed', () => {
  const r = classifySeoTitle({ seoTitle: '| 9Expert │ 9Expert Training', title: 'บทความ' });
  assert.equal(r.category, 'needs-human');
  assert.equal(r.proposed, null);
});

test('rule C: 60-unit strict prefix of the title → cut-prefix, proposed ""', () => {
  const title = 'Gemini 4 Argon is the new frontier model from Google and the next step for AI';
  const r = classifySeoTitle({ seoTitle: title.slice(0, 60), title });
  assert.equal(r.category, 'cut-prefix');
  assert.equal(r.proposed, '');
  assert.equal(r.utf16LengthBefore, 60);
});

test('rule C: the R1 Gemini Thai cut — 60 units, 54 graphemes — is now cut-prefix', () => {
  // Replaces R2's KNOWN GAP test: the 55-grapheme threshold missed this value;
  // the 60-unit signature catches it.
  const title = 'Gemini 4 Argon โมเดลตัวใหม่จาก Google ก้าวถัดไปของปัญญาประดิษฐ์ระดับ Frontier';
  const seoTitle = 'Gemini 4 Argon โมเดลตัวใหม่จาก Google ก้าวถัดไปของปัญญาประดิ';
  assert.equal(seoTitle.length, 60);
  assert.equal(graphemeLength(seoTitle), 54);
  const r = classifySeoTitle({ seoTitle, title });
  assert.equal(r.category, 'cut-prefix');
  assert.equal(r.proposed, '');
  assert.equal(r.lengthBefore, 54);
});

test('rule C: a 50-unit prefix, or a 60-unit value equal to the title, is unchanged', () => {
  const title = 'Microsoft Excel Advanced Formulas and Functions for Business Analysts in 2026';
  assert.equal(classifySeoTitle({ seoTitle: title.slice(0, 50), title }).category, 'ok');
  const sixty = title.slice(0, 60);
  assert.equal(classifySeoTitle({ seoTitle: sixty, title: sixty }).category, 'ok');
});

test('rule C after stripping: 60 stored units → brand-suffix+cut-prefix, proposed ""', () => {
  const title = 'Microsoft Excel Advanced Formulas and Functions for Business Analysts in 2026';
  const seoTitle = `${title.slice(0, 54)} | 9Ex`;
  assert.equal(seoTitle.length, 60);
  const r = classifySeoTitle({ seoTitle, title });
  assert.equal(r.category, 'brand-suffix+cut-prefix');
  assert.equal(r.proposed, '');
  assert.equal(r.stripped, ' | 9Ex');
  // Same cut + brand, but not 60 stored units → only the brand goes.
  const longer = classifySeoTitle({ seoTitle: `${title.slice(0, 58)} | 9Exp`, title });
  assert.equal(longer.category, 'brand-suffix');
  assert.equal(longer.proposed, title.slice(0, 58));
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
