/**
 * Yoast-style SEO checklist for the article form, driven by the Focus Keyword.
 *
 * Replaces ArticleForm's old `calcSeoScore`, which gave points for field
 * lengths and for `focusKeyword.length > 2` but never looked at WHERE the
 * keyword appears. This one asks the questions an editor can act on: is the
 * keyword in the title, the description, the first paragraph, a heading, the
 * slug — and is it a real keyword at all, or the import-time default that 213
 * articles still carry.
 *
 * ── MATCHING (Thai-safe) ────────────────────────────────────────────────────
 * NFC → lower-case → ALL whitespace removed, on both sides, then a plain
 * substring test. Thai does not separate words with spaces and editors are
 * inconsistent about the space between Thai and Latin (`สูตร VLOOKUP` /
 * `สูตรvlookup` / `สูตร  vlookup`), so whitespace cannot be significant. No
 * stemming. Lengths are graphemes (lib/seo/seoLengths.js).
 *
 * PURE: no React, no DB. The one input that needs the database — which other
 * articles share this keyword — is fetched by a server action and passed in.
 */

import { htmlToText, decodeEntities } from '@/lib/corpus/htmlToText';
import { graphemeLength, SEO_TITLE_GUIDE, SEO_DESCRIPTION_GUIDE } from '@/lib/seo/seoLengths';

/**
 * The value 213 articles were bulk-imported with on 2026-06-12 (09:31–10:47
 * UTC); the import script is not in this repository. A keyword shared by every
 * article ranks none of them, so it counts as "not set".
 */
export const DEFAULT_FOCUS_KEYWORD = 'power bi, excel, power automate, data, ai, automation, training, course';

/** Tunable. Score = earned / available × 100 over the non-`na` checks. */
export const SEO_CHECK_WEIGHTS = Object.freeze({
  'keyword-in-title': 15,
  'keyword-in-description': 10,
  'keyword-in-intro': 10,
  'keyword-set': 10,
  'title-length': 10,
  'description-length': 10,
  'keyword-in-heading': 8,
  'content-length': 8,
  'keyword-count': 7,
  'keyword-title-start': 5,
  'keyword-unique': 4,
  'keyword-in-slug': 3,
  // Advice only — a comma-separated field still has a usable first keyword.
  'keyword-single': 0,
});

const STATUS_VALUE = { good: 1, warn: 0.5, bad: 0 };

export const TITLE_MIN = 30;
export const DESCRIPTION_MIN = 80;
export const CONTENT_GOOD = 1500;
export const CONTENT_MIN = 600;
const INTRO_FALLBACK = 300;

export const NA_HINT = 'ตั้งคำหลักก่อนเพื่อตรวจข้อนี้';

/** The comparison form: NFC, lower-case, every whitespace character removed. */
export function normalizeForMatch(value) {
  return String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/gu, '');
}

/** Does `haystack` contain the (already normalised) keyword? */
function has(haystack, kwNorm) {
  return Boolean(kwNorm) && normalizeForMatch(haystack).includes(kwNorm);
}

/** Non-overlapping occurrences of the (normalised) keyword. */
function countIn(haystack, kwNorm) {
  if (!kwNorm) return 0;
  const h = normalizeForMatch(haystack);
  let n = 0;
  for (let i = h.indexOf(kwNorm); i !== -1; i = h.indexOf(kwNorm, i + kwNorm.length)) n += 1;
  return n;
}

/**
 * Split the field into keywords. The FIRST is the focus keyword; the rest are
 * reported (they belong in tags, not here).
 */
export function parseFocusKeywords(field) {
  return String(field ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

/** True when the field is empty or is the shared import default. */
export function isUnsetKeyword(field, defaultKeyword = DEFAULT_FOCUS_KEYWORD) {
  const f = normalizeForMatch(field);
  return !f || (Boolean(defaultKeyword) && f === normalizeForMatch(defaultKeyword));
}

/** Body plain text: tags stripped, entities decoded, whitespace collapsed. */
export function bodyText(html) {
  return htmlToText(html).replace(/\s+/g, ' ').trim();
}

const stripTags = (s) => decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * The first paragraph: the first `<p>` that has text, else the first 300
 * graphemes of the plain body.
 */
export function firstParagraph(html) {
  for (const m of String(html ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(m[1]);
    if (text) return text;
  }
  const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
  let out = '';
  let n = 0;
  for (const { segment } of seg.segment(bodyText(html))) {
    if (n++ >= INTRO_FALLBACK) break;
    out += segment;
  }
  return out;
}

/** Text of every `<h2>` / `<h3>`. */
export function subheadings(html) {
  return [...String(html ?? '').matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => stripTags(m[2]));
}

/** The slug as text: percent-decoded, hyphens/underscores as spaces. */
export function slugText(slug) {
  let s = String(slug ?? '');
  try { s = decodeURIComponent(s); } catch { /* malformed → raw */ }
  return s.replace(/[-_]+/g, ' ');
}

/** Is the keyword in the first half of `text` (by graphemes, whitespace ignored)? */
function inFirstHalf(text, kwNorm) {
  const t = normalizeForMatch(text);
  const at = t.indexOf(kwNorm);
  if (at === -1) return false;
  return graphemeLength(t.slice(0, at)) < graphemeLength(t) / 2;
}

/**
 * @param {object} input
 * @param {string} input.focusKeyword    the raw field
 * @param {string} input.seoTitle
 * @param {string} input.title            the article title (Google's fallback)
 * @param {string} input.seoDescription
 * @param {string} input.excerpt          the description fallback
 * @param {string} input.slug
 * @param {string} input.contentHtml
 * @param {string} [input.defaultKeyword] defaults to DEFAULT_FOCUS_KEYWORD
 * @param {Array<{title: string, _id: string}>|null} [input.otherArticles]
 *   other articles sharing this keyword (from the server action); null/undefined
 *   when not checked yet for the current keyword
 * @returns {{ score: number, checks: Array<{ id: string, status: 'good'|'warn'|'bad'|'na', label: string, hint: string }> }}
 */
export function runSeoChecks(input = {}) {
  const {
    focusKeyword = '',
    seoTitle = '',
    title = '',
    seoDescription = '',
    excerpt = '',
    slug = '',
    contentHtml = '',
    defaultKeyword = DEFAULT_FOCUS_KEYWORD,
    otherArticles,
  } = input;

  const checks = [];
  const push = (id, status, label, hint = '') => checks.push({ id, status, label, hint });

  // ── keyword-set (+ keyword-single) ────────────────────────────────────────
  const rawField = String(focusKeyword ?? '').trim();
  const isDefault = Boolean(rawField) && isUnsetKeyword(rawField, defaultKeyword);
  const keywords = isDefault ? [] : parseFocusKeywords(rawField);
  const kw = keywords[0] ?? '';
  const kwNorm = normalizeForMatch(kw);
  const keywordOk = Boolean(kwNorm);

  if (!rawField) push('keyword-set', 'bad', 'ยังไม่ได้ตั้งคำหลัก', 'ใส่คำหรือวลีเดียวที่อยากให้บทความนี้ติดอันดับ');
  else if (isDefault || !keywordOk) push('keyword-set', 'bad', 'ยังใช้คำหลักค่าเริ่มต้น', 'แทนที่ด้วยคำหลักของบทความนี้โดยเฉพาะ');
  else push('keyword-set', 'good', `ตั้งคำหลักแล้ว: "${kw}"`);

  if (keywords.length > 1) {
    push('keyword-single', 'warn', 'ใช้คำหลักคำเดียว คำอื่นย้ายไปใส่ในแท็ก', `ระบบตรวจเฉพาะคำแรก "${kw}"`);
  }

  // Keyword-dependent checks are `na` until there is a real keyword.
  const na = (id, label) => push(id, 'na', label, NA_HINT);

  // ── keyword-in-title / keyword-title-start ───────────────────────────────
  const seoT = String(seoTitle ?? '').trim();
  const artT = String(title ?? '').trim();
  let titleForStart = '';
  if (!keywordOk) {
    na('keyword-in-title', 'คำหลักอยู่ใน SEO Title');
  } else if (has(seoT, kwNorm)) {
    push('keyword-in-title', 'good', 'คำหลักอยู่ใน SEO Title');
    titleForStart = seoT;
  } else if (!seoT && has(artT, kwNorm)) {
    push('keyword-in-title', 'warn', 'คำหลักอยู่ในชื่อบทความ (ยังไม่มี SEO Title)',
      'Google จะใช้ชื่อบทความเป็นชื่อในผลค้นหา — ตั้ง SEO Title เพื่อกำหนดเอง');
    titleForStart = artT;
  } else {
    push('keyword-in-title', 'bad', 'ไม่พบคำหลักใน SEO Title',
      seoT ? 'ใส่คำหลักใน SEO Title' : 'ยังไม่มี SEO Title และชื่อบทความก็ไม่มีคำหลัก — Google จะใช้ชื่อบทความ');
  }

  if (!keywordOk) na('keyword-title-start', 'คำหลักอยู่ต้นชื่อ');
  else if (!titleForStart) push('keyword-title-start', 'na', 'คำหลักอยู่ต้นชื่อ', 'ใส่คำหลักในชื่อก่อน');
  else if (inFirstHalf(titleForStart, kwNorm)) push('keyword-title-start', 'good', 'คำหลักอยู่ช่วงต้นของชื่อ');
  else push('keyword-title-start', 'warn', 'คำหลักอยู่ท้ายชื่อ', 'ย้ายคำหลักไปไว้ครึ่งแรกของชื่อ');

  // ── keyword-in-description ───────────────────────────────────────────────
  const seoD = String(seoDescription ?? '').trim();
  const exc = String(excerpt ?? '').trim();
  if (!keywordOk) na('keyword-in-description', 'คำหลักอยู่ใน SEO Description');
  else if (has(seoD, kwNorm)) push('keyword-in-description', 'good', 'คำหลักอยู่ใน SEO Description');
  else if (!seoD && has(exc, kwNorm)) {
    push('keyword-in-description', 'warn', 'คำหลักอยู่ในคำโปรย (ยังไม่มี SEO Description)',
      'Google จะใช้คำโปรยเป็นคำอธิบาย — เขียน SEO Description เพื่อกำหนดเอง');
  } else push('keyword-in-description', 'bad', 'ไม่พบคำหลักใน SEO Description', 'ใส่คำหลักในคำอธิบายอย่างเป็นธรรมชาติ');

  // ── body ─────────────────────────────────────────────────────────────────
  const text = bodyText(contentHtml);
  const intro = firstParagraph(contentHtml);
  const heads = subheadings(contentHtml);

  if (!keywordOk) na('keyword-in-intro', 'คำหลักอยู่ในย่อหน้าแรก');
  else if (has(intro, kwNorm)) push('keyword-in-intro', 'good', 'คำหลักอยู่ในย่อหน้าแรก');
  else push('keyword-in-intro', 'bad', 'ไม่พบคำหลักในย่อหน้าแรก', 'กล่าวถึงคำหลักตั้งแต่ย่อหน้าแรก');

  if (!keywordOk) na('keyword-in-heading', 'คำหลักอยู่ในหัวข้อย่อย');
  else if (heads.length === 0) push('keyword-in-heading', 'warn', 'บทความยังไม่มีหัวข้อย่อย (H2/H3)', 'แบ่งเนื้อหาด้วยหัวข้อ H2/H3 และใส่คำหลักในบางหัวข้อ');
  else if (heads.some((h) => has(h, kwNorm))) push('keyword-in-heading', 'good', 'คำหลักอยู่ในหัวข้อย่อย');
  else push('keyword-in-heading', 'bad', 'หัวข้อย่อยไม่มีคำหลัก', 'ใส่คำหลักในหัวข้อ H2/H3 อย่างน้อยหนึ่งหัวข้อ');

  if (!keywordOk) na('keyword-in-slug', 'คำหลักอยู่ใน slug');
  else if (has(slugText(slug), kwNorm)) push('keyword-in-slug', 'good', 'คำหลักอยู่ใน slug');
  else push('keyword-in-slug', 'bad', 'ไม่พบคำหลักใน slug', 'เปลี่ยน slug ของบทความที่เผยแพร่แล้วจะทำให้ลิงก์เดิมเสีย — แก้เฉพาะฉบับร่าง');

  const occurrences = keywordOk ? countIn(text, kwNorm) : 0;
  if (!keywordOk) na('keyword-count', 'จำนวนครั้งที่คำหลักปรากฏ');
  else if (occurrences >= 2) push('keyword-count', 'good', `คำหลักปรากฏ ${occurrences} ครั้งในเนื้อหา`);
  else if (occurrences === 1) push('keyword-count', 'warn', 'คำหลักปรากฏครั้งเดียวในเนื้อหา', 'ใช้คำหลักอย่างน้อย 2 ครั้งอย่างเป็นธรรมชาติ');
  else push('keyword-count', 'bad', 'ไม่พบคำหลักในเนื้อหา', 'เนื้อหาควรกล่าวถึงคำหลัก');

  // ── lengths (not keyword-dependent) ──────────────────────────────────────
  const tLen = graphemeLength(seoT);
  if (!tLen) push('title-length', 'bad', 'ยังไม่มี SEO Title', 'Google จะใช้ชื่อบทความแทน — ตั้ง SEO Title ยาว 30–60 ตัวอักษร');
  else if (tLen >= TITLE_MIN && tLen <= SEO_TITLE_GUIDE) push('title-length', 'good', `SEO Title ยาว ${tLen} ตัวอักษร`);
  else if (tLen < TITLE_MIN) push('title-length', 'warn', `SEO Title สั้น (${tLen} ตัวอักษร)`, 'ควรยาว 30–60 ตัวอักษร');
  else push('title-length', 'warn', `SEO Title ยาว (${tLen} ตัวอักษร)`, 'เกิน 60 ตัวอักษร Google อาจตัดชื่อในผลค้นหา');

  const dLen = graphemeLength(seoD);
  if (!dLen && !exc) push('description-length', 'bad', 'ยังไม่มี SEO Description และคำโปรย', 'เขียนคำอธิบาย 80–160 ตัวอักษร');
  else if (!dLen) push('description-length', 'warn', 'ยังไม่มี SEO Description', 'Google จะใช้คำโปรยแทน — เขียนคำอธิบาย 80–160 ตัวอักษร');
  else if (dLen >= DESCRIPTION_MIN && dLen <= SEO_DESCRIPTION_GUIDE) push('description-length', 'good', `SEO Description ยาว ${dLen} ตัวอักษร`);
  else if (dLen < DESCRIPTION_MIN) push('description-length', 'warn', `SEO Description สั้น (${dLen} ตัวอักษร)`, 'ควรยาว 80–160 ตัวอักษร');
  else push('description-length', 'warn', `SEO Description ยาว (${dLen} ตัวอักษร)`, 'เกิน 160 ตัวอักษร Google อาจตัดคำอธิบาย');

  const cLen = graphemeLength(text);
  if (cLen >= CONTENT_GOOD) push('content-length', 'good', `เนื้อหายาว ${cLen.toLocaleString('en-US')} ตัวอักษร`);
  else if (cLen >= CONTENT_MIN) push('content-length', 'warn', `เนื้อหาค่อนข้างสั้น (${cLen.toLocaleString('en-US')} ตัวอักษร)`, 'บทความที่ติดอันดับมักยาว 1,500 ตัวอักษรขึ้นไป');
  else push('content-length', 'bad', `เนื้อหาสั้นมาก (${cLen.toLocaleString('en-US')} ตัวอักษร)`, 'เพิ่มเนื้อหาให้ยาวอย่างน้อย 600 ตัวอักษร');

  // ── keyword-unique ───────────────────────────────────────────────────────
  if (!keywordOk) na('keyword-unique', 'ไม่ซ้ำกับบทความอื่น');
  else if (!Array.isArray(otherArticles)) push('keyword-unique', 'na', 'ไม่ซ้ำกับบทความอื่น', 'จะตรวจเมื่อออกจากช่องคำหลัก');
  else if (otherArticles.length === 0) push('keyword-unique', 'good', 'ไม่มีบทความอื่นใช้คำหลักนี้');
  else {
    const names = otherArticles.slice(0, 3).map((a) => `"${a.title}"`).join(', ');
    push('keyword-unique', 'warn', 'มีบทความอื่นใช้คำหลักนี้แล้ว', `${names} — บทความจะแย่งอันดับกันเอง`);
  }

  // ── score ────────────────────────────────────────────────────────────────
  let earned = 0;
  let available = 0;
  for (const c of checks) {
    if (c.status === 'na') continue;
    const w = SEO_CHECK_WEIGHTS[c.id] ?? 0;
    available += w;
    earned += w * STATUS_VALUE[c.status];
  }
  const score = available ? Math.round((earned / available) * 100) : 0;

  return { score, checks };
}

/** Display order: bad, warn, good, na — stable within each group. */
const ORDER = { bad: 0, warn: 1, good: 2, na: 3 };
export function sortChecks(checks) {
  return [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}
