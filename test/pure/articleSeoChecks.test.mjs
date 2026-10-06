import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runSeoChecks,
  normalizeForMatch,
  firstParagraph,
  slugText,
  SEO_CHECK_WEIGHTS,
  DEFAULT_FOCUS_KEYWORD,
} from '@/lib/seo/articleSeoChecks';
import { graphemeLength } from '@/lib/seo/seoLengths';

/**
 * SEO-1: the article form's focus-keyword checklist (lib/seo/articleSeoChecks.js).
 */

const byId = (res) => Object.fromEntries(res.checks.map((c) => [c.id, c]));
const status = (input, id) => byId(runSeoChecks(input))[id]?.status;
const g = (n, ch = 'ก') => ch.repeat(n); // n graphemes, one code unit each
const para = (s) => `<p>${s}</p>`;

test('Thai matching ignores whitespace and case on both sides', () => {
  assert.equal(normalizeForMatch('สูตร  VLOOKUP'), 'สูตรvlookup');
  for (const seoTitle of ['วิธีใช้สูตรvlookup ใน Excel', 'วิธีใช้ สูตร VLookup ใน Excel', 'วิธีใช้สูตร   vlookup']) {
    assert.equal(status({ focusKeyword: 'สูตร VLOOKUP', seoTitle }, 'keyword-in-title'), 'good', seoTitle);
  }
  assert.equal(status({ focusKeyword: 'สูตรvlookup', seoTitle: 'สอน XLOOKUP' }, 'keyword-in-title'), 'bad');
});

test('comma-separated keywords: the first is scored, a warn says use one', () => {
  const res = byId(runSeoChecks({ focusKeyword: 'Power BI, Excel, DAX', seoTitle: 'สอน Power BI เบื้องต้น' }));
  assert.equal(res['keyword-single'].status, 'warn');
  assert.equal(res['keyword-single'].label, 'ใช้คำหลักคำเดียว คำอื่นย้ายไปใส่ในแท็ก');
  assert.equal(res['keyword-in-title'].status, 'good');
  assert.equal(status({ focusKeyword: 'Power BI', seoTitle: 'x' }, 'keyword-single'), undefined);
});

test('default or empty keyword → keyword-set bad, every keyword check na, lengths still run', () => {
  for (const focusKeyword of [DEFAULT_FOCUS_KEYWORD, '  POWER BI, excel, power automate, data, ai, automation, training, course ', '']) {
    const res = byId(runSeoChecks({ focusKeyword, seoTitle: g(45), contentHtml: para(g(700)) }));
    assert.equal(res['keyword-set'].status, 'bad');
    for (const id of ['keyword-in-title', 'keyword-title-start', 'keyword-in-description', 'keyword-in-intro',
      'keyword-in-heading', 'keyword-in-slug', 'keyword-count', 'keyword-unique']) {
      assert.equal(res[id].status, 'na', `${id} for ${JSON.stringify(focusKeyword)}`);
      assert.equal(res[id].hint, 'ตั้งคำหลักก่อนเพื่อตรวจข้อนี้');
    }
    assert.equal(res['title-length'].status, 'good');
    assert.equal(res['content-length'].status, 'warn');
    assert.equal(res['keyword-single'], undefined, 'the default is not "several keywords"');
  }
  assert.equal(byId(runSeoChecks({ focusKeyword: DEFAULT_FOCUS_KEYWORD }))['keyword-set'].label, 'ยังใช้คำหลักค่าเริ่มต้น');
  assert.equal(byId(runSeoChecks({ focusKeyword: '' }))['keyword-set'].label, 'ยังไม่ได้ตั้งคำหลัก');
});

test('title fallback: no SEO Title but keyword in article title → warn naming the article title', () => {
  const c = byId(runSeoChecks({ focusKeyword: 'Power BI', seoTitle: '', title: 'Power BI คืออะไร' }))['keyword-in-title'];
  assert.equal(c.status, 'warn');
  assert.match(c.hint, /ชื่อบทความ/);
  // A non-empty SEO Title without the keyword is bad even if the article title has it.
  assert.equal(status({ focusKeyword: 'Power BI', seoTitle: 'Dashboard', title: 'Power BI คืออะไร' }, 'keyword-in-title'), 'bad');
  // title-start falls back to the title Google will use.
  assert.equal(status({ focusKeyword: 'Power BI', title: 'Power BI คืออะไร ใช้งานอย่างไรในองค์กร' }, 'keyword-title-start'), 'good');
  assert.equal(status({ focusKeyword: 'Power BI', seoTitle: 'คู่มือการสร้างรายงานด้วย Power BI' }, 'keyword-title-start'), 'warn');
  assert.equal(status({ focusKeyword: 'Power BI', seoTitle: 'Excel' }, 'keyword-title-start'), 'na');
});

test('description fallback to the excerpt', () => {
  assert.equal(status({ focusKeyword: 'DAX', seoDescription: 'สอน DAX', excerpt: '' }, 'keyword-in-description'), 'good');
  assert.equal(status({ focusKeyword: 'DAX', seoDescription: '', excerpt: 'บทความนี้สอน DAX' }, 'keyword-in-description'), 'warn');
  assert.equal(status({ focusKeyword: 'DAX', seoDescription: 'อื่น', excerpt: 'สอน DAX' }, 'keyword-in-description'), 'bad');
  assert.equal(status({ seoDescription: '', excerpt: 'มีคำโปรย' }, 'description-length'), 'warn');
  assert.equal(status({ seoDescription: '', excerpt: '' }, 'description-length'), 'bad');
});

test('first paragraph: first <p> with text, else the first 300 graphemes', () => {
  assert.equal(firstParagraph('<p> </p><p>&nbsp;</p><p>สวัสดี <b>DAX</b></p><p>ถัดไป</p>'), 'สวัสดี DAX');
  assert.equal(graphemeLength(firstParagraph(`<div>${g(400)}</div>`)), 300);
  const html = '<p>บทนำไม่มีคำ</p><p>DAX อยู่ย่อหน้าสอง</p>';
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: html }, 'keyword-in-intro'), 'bad');
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: `<p>เริ่มด้วย DAX</p>${html}` }, 'keyword-in-intro'), 'good');
});

test('headings: good / no headings → warn / headings without keyword → bad', () => {
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: '<h2>ฟังก์ชัน <em>DAX</em></h2>' }, 'keyword-in-heading'), 'good');
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: '<p>DAX</p>' }, 'keyword-in-heading'), 'warn');
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: '<h3>อื่น</h3><h4>DAX</h4>' }, 'keyword-in-heading'), 'bad');
});

test('slug: percent-decoded, hyphens as spaces', () => {
  assert.equal(slugText(encodeURIComponent('สูตร-vlookup-excel')), 'สูตร vlookup excel');
  assert.equal(status({ focusKeyword: 'สูตร VLOOKUP', slug: encodeURIComponent('สูตร-vlookup-excel') }, 'keyword-in-slug'), 'good');
  const bad = byId(runSeoChecks({ focusKeyword: 'DAX', slug: 'power-bi' }))['keyword-in-slug'];
  assert.equal(bad.status, 'bad');
  assert.match(bad.hint, /ลิงก์เดิมเสีย/);
});

test('keyword count: 2+ good, 1 warn, 0 bad', () => {
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: para('DAX และ dax') }, 'keyword-count'), 'good');
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: para('DAX') }, 'keyword-count'), 'warn');
  assert.equal(status({ focusKeyword: 'DAX', contentHtml: para('ไม่มี') }, 'keyword-count'), 'bad');
});

test('length bands at their edges (graphemes)', () => {
  const tl = (n) => status({ seoTitle: g(n) }, 'title-length');
  assert.deepEqual([tl(29), tl(30), tl(59), tl(60), tl(61), tl(0)], ['warn', 'good', 'good', 'good', 'warn', 'bad']);
  const dl = (n) => status({ seoDescription: g(n) }, 'description-length');
  assert.deepEqual([dl(79), dl(80), dl(159), dl(160), dl(161)], ['warn', 'good', 'good', 'good', 'warn']);
  const cl = (n) => status({ contentHtml: para(g(n)) }, 'content-length');
  assert.deepEqual([cl(599), cl(600), cl(1499), cl(1500)], ['bad', 'warn', 'warn', 'good']);
  // Thai combining marks count as one character with their base.
  const thai60 = 'ปั'.repeat(60); // 120 code units, 60 graphemes
  assert.equal(thai60.length, 120);
  assert.equal(status({ seoTitle: thai60 }, 'title-length'), 'good');
});

test('keyword-unique: na until checked, good when none, warn listing up to 3 titles', () => {
  assert.equal(status({ focusKeyword: 'DAX' }, 'keyword-unique'), 'na');
  assert.equal(status({ focusKeyword: 'DAX', otherArticles: [] }, 'keyword-unique'), 'good');
  const c = byId(runSeoChecks({ focusKeyword: 'DAX', otherArticles: [
    { _id: '1', title: 'A' }, { _id: '2', title: 'B' }, { _id: '3', title: 'C' }, { _id: '4', title: 'D' },
  ] }))['keyword-unique'];
  assert.equal(c.status, 'warn');
  assert.match(c.hint, /"A", "B", "C"/);
  assert.doesNotMatch(c.hint, /"D"/);
});

test('score: na excluded from the available weight; warn is half', () => {
  // Default keyword: only keyword-set (bad, 10) + the three length checks count.
  const res = runSeoChecks({ focusKeyword: '', seoTitle: g(45), seoDescription: g(100), contentHtml: para(g(1600)) });
  // earned 10+10+8 = 28 of 10+10+10+8 = 38
  assert.equal(res.score, Math.round((28 / 38) * 100));
  // Everything good.
  const html = `<p>DAX ${g(1600)}</p><h2>DAX</h2>`;
  const all = runSeoChecks({ focusKeyword: 'DAX', seoTitle: `DAX ${g(40)}`, seoDescription: `DAX ${g(90)}`, slug: 'dax-intro', contentHtml: html, otherArticles: [] });
  assert.equal(all.score, 100, JSON.stringify(all.checks.filter((c) => c.status !== 'good')));
  // One warn (keyword-unique, weight 4) out of the full 100.
  const total = Object.values(SEO_CHECK_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
  const one = runSeoChecks({ focusKeyword: 'DAX', seoTitle: `DAX ${g(40)}`, seoDescription: `DAX ${g(90)}`, slug: 'dax-intro', contentHtml: html, otherArticles: [{ _id: 'x', title: 'X' }] });
  assert.equal(one.score, 98);
});
