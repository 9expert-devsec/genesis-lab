/**
 * Page meta audit — the approved Meta Title / Description sheet vs. the live
 * data. READ-ONLY.
 *
 * ── WRITES ─────────────────────────────────────────────────────────────────
 * None. There is no --apply and no write path: the database is read with raw
 * collection `find({}).toArray()` only, and the live site with three HTTP GETs. The database
 * is shared with production; keep it that way. The only file written is the
 * CSV report under tmp/ (gitignored).
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────
 * For each sheet row (courses / programs / skills) it resolves the document
 * the page's generateMetadata would read and classifies it:
 *
 *   courses   CourseExtension by courseId, case-insensitively (course_id casing
 *             history: upstream mixes case, genesis URLs lowercase it).
 *             MATCH | URL_MISMATCH (urlAlias ≠ sheet url) | NOT_FOUND
 *   programs  ProgramPageConfig / SkillPageConfig by urlSlug = url without the
 *   skills    leading slash, EXACT — same as `findOne({ urlSlug })` in
 *             src/app/(public)/[...slug]/page.jsx.
 *             MATCH | UNPUBLISHED | NOT_FOUND | MULTIPLE
 *
 * For each found row: metaTitle / metaDescription as SAME | CHANGE | FILL
 * (FILL = currently empty). Then the reverse direction (rows the sheet leaves
 * out), the brand-suffix count in the current stored titles, the live <title>
 * for three sample pages, and sheet hygiene flags.
 *
 * Run: npm run audit:page-meta -- prompts/seo-meta-2026-11-16.json
 *      add --no-live to skip the three live-site GETs.
 */

import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

register(new URL('../test/loader.mjs', import.meta.url));

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith('--'));
const skipLive = args.includes('--no-live');
if (!inputPath) {
  console.error('usage: npm run audit:page-meta -- <sheet.json> [--no-live]');
  process.exit(1);
}

const sheet = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// Raw collections, not the models: a model imported through the test loader
// binds to a different mongoose instance than this script's connection and
// buffers forever. Raw docs carry no schema defaults, which is what the page
// sees too — it tests `isPublished !== false`, so a missing flag is published.
const { skills: siteSkills } = await import('@/config/site');
const mongoose = (await import('mongoose')).default;

// ── helpers ─────────────────────────────────────────────────────────────────
const s = (v) => String(v ?? '');
const normUrl = (v) => {
  const t = s(v).trim().toLowerCase();
  if (!t) return '';
  return t.startsWith('/') ? t : `/${t}`;
};
const slugOf = (url) => s(url).trim().replace(/^\/+/, '');

// The page renders `stored.trim() || fallback`, so compare trimmed values.
function diff(current, next) {
  const c = s(current).trim();
  const n = s(next).trim();
  if (!c) return 'FILL';
  return c === n ? 'SAME' : 'CHANGE';
}

function hygiene(value) {
  const v = s(value);
  const flags = [];
  if (v !== v.replace(/^\s+/, '')) flags.push('leading whitespace');
  if (v !== v.replace(/\s+$/, '')) flags.push('trailing whitespace');
  if (/ {2,}/.test(v)) flags.push('double space');
  if (/[\r\n]/.test(v)) flags.push('newline');
  if (/[^ ]\||\|[^ ]/.test(v)) flags.push('"|" not spaced on both sides');
  if (/[ ​‌‍﻿]/.test(v)) flags.push('nbsp / zero-width char');
  return flags;
}

// ── data ────────────────────────────────────────────────────────────────────
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (.env.local)');
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 15000,
});
const db = mongoose.connection.db;
const [extensions, programCfgs, skillCfgs] = await Promise.all([
  db.collection('course_extensions').find({}).toArray(),
  db.collection('program_page_configs').find({}).toArray(),
  db.collection('skill_page_configs').find({}).toArray(),
]);

const touched = { course: new Set(), program: new Set(), skill: new Set() };
const results = [];

// ── courses ─────────────────────────────────────────────────────────────────
for (const r of sheet.courses ?? []) {
  const id = s(r.courseId).trim();
  const url = normUrl(r.url);
  const hits = extensions.filter((e) => s(e.courseId).trim().toLowerCase() === id.toLowerCase());
  const notes = [];
  let status;
  let doc = null;

  if (hits.length === 0) {
    status = 'NOT_FOUND';
    const byAlias = extensions.find((e) => normUrl(e.urlAlias) === url);
    notes.push(byAlias
      ? `sheet url IS the urlAlias of courseId "${byAlias.courseId}" — sheet likely has the wrong ID`
      : 'no extension holds the sheet url as urlAlias');
    const byFormerAlias = extensions.find((e) => (e.formerAliases ?? []).some((a) => normUrl(a) === url));
    if (byFormerAlias) notes.push(`sheet url is a FORMER alias of "${byFormerAlias.courseId}"`);
    const byFormerCode = extensions.find((e) => (e.formerCodes ?? []).some((c) => s(c).toLowerCase() === id.toLowerCase()));
    if (byFormerCode) notes.push(`courseId is a FORMER code of "${byFormerCode.courseId}"`);
  } else {
    doc = hits[0];
    if (hits.length > 1) notes.push(`${hits.length} extension rows match case-insensitively: ${hits.map((h) => h.courseId).join(', ')}`);
    if (doc.courseId !== id) notes.push(`stored courseId casing is "${doc.courseId}"`);
    if (normUrl(doc.urlAlias) === url) {
      status = 'MATCH';
    } else {
      status = 'URL_MISMATCH';
      notes.push(`urlAlias is "${s(doc.urlAlias) || '(empty)'}"`);
      if ((doc.formerAliases ?? []).some((a) => normUrl(a) === url)) notes.push('sheet url is a FORMER alias of this row');
      if (!s(doc.urlAlias).trim() && url === `/${doc.courseId.toLowerCase()}-training-course`) {
        notes.push('no alias; the sheet url equals the code path the page serves');
      }
      const other = extensions.find((e) => e !== doc && normUrl(e.urlAlias) === url);
      if (other) notes.push(`sheet url is the urlAlias of another row "${other.courseId}"`);
    }
    if (doc.isPublished === false) notes.push('extension isPublished=false');
    for (const h of hits) touched.course.add(String(h._id));
  }

  results.push({ kind: 'course', row: r.row, url: r.url, courseId: id, status, doc, sheetRow: r, notes });
}

// ── programs / skills ───────────────────────────────────────────────────────
const siteSkillSlugs = new Set(siteSkills.map((k) => `${k.slug}-all-courses`));

for (const [kind, rows, cfgs] of [
  ['program', sheet.programs ?? [], programCfgs],
  ['skill', sheet.skills ?? [], skillCfgs],
]) {
  for (const r of rows) {
    const slug = slugOf(r.url);
    const hits = cfgs.filter((c) => s(c.urlSlug) === slug);
    const notes = [];
    let status;
    let doc = null;

    if (hits.length === 0) {
      status = 'NOT_FOUND';
      const ci = cfgs.filter((c) => s(c.urlSlug).toLowerCase() === slug.toLowerCase());
      if (ci.length) notes.push(`case-insensitive hit: "${ci.map((c) => c.urlSlug).join('", "')}"`);
      const other = (kind === 'program' ? skillCfgs : programCfgs).filter((c) => s(c.urlSlug) === slug);
      if (other.length) notes.push(`slug exists in the ${kind === 'program' ? 'SKILL' : 'PROGRAM'} config collection`);
      if (kind === 'skill') {
        notes.push(siteSkillSlugs.has(slug)
          ? 'slug IS one of the 7 site.js skills (+ -all-courses)'
          : 'slug is NOT in site.js skills');
      }
    } else if (hits.length > 1) {
      status = 'MULTIPLE';
      doc = hits[0];
      notes.push(`${hits.length} rows: ${hits.map((h) => `${h._id}(isPublished=${h.isPublished})`).join(', ')}`);
    } else {
      doc = hits[0];
      status = doc.isPublished === false ? 'UNPUBLISHED' : 'MATCH';
    }
    if (kind === 'skill' && hits.length && !siteSkillSlugs.has(slug)) notes.push('slug is NOT in site.js skills');
    for (const h of hits) touched[kind].add(String(h._id));

    results.push({ kind, row: r.row, url: r.url, courseId: '', status, doc, sheetRow: r, notes });
  }
}

for (const x of results) {
  x.titleChange = x.doc ? diff(x.doc.metaTitle, x.sheetRow.metaTitle) : '';
  x.descChange = x.doc ? diff(x.doc.metaDescription, x.sheetRow.metaDescription) : '';
}

// ── report: status counts ───────────────────────────────────────────────────
const KINDS = ['course', 'program', 'skill'];
const STATUSES = ['MATCH', 'URL_MISMATCH', 'NOT_FOUND', 'UNPUBLISHED', 'MULTIPLE'];
const count = (arr, f) => arr.filter(f).length;

console.log('=== Page meta audit (READ-ONLY) ===');
console.log(`sheet: ${inputPath}`);
console.log(`db rows: CourseExtension ${extensions.length}, ProgramPageConfig ${programCfgs.length}, SkillPageConfig ${skillCfgs.length}\n`);

console.log('── 1. status counts ──');
for (const k of KINDS) {
  const rs = results.filter((x) => x.kind === k);
  console.log(`  ${k.padEnd(8)} n=${String(rs.length).padStart(3)}  `
    + STATUSES.map((st) => `${st} ${count(rs, (x) => x.status === st)}`).join('  '));
}

console.log('\n── 2. non-MATCH rows ──');
const nonMatch = results.filter((x) => x.status !== 'MATCH');
if (!nonMatch.length) console.log('  (none)');
for (const x of nonMatch) {
  console.log(`  [${x.kind}] row ${x.row} ${x.status}  url=${x.url}${x.courseId ? `  courseId=${x.courseId}` : ''}`);
  for (const n of x.notes) console.log(`      - ${n}`);
}

console.log('\n── notes on MATCH rows ──');
const matchNotes = results.filter((x) => x.status === 'MATCH' && x.notes.length);
if (!matchNotes.length) console.log('  (none)');
for (const x of matchNotes) console.log(`  [${x.kind}] ${x.url}: ${x.notes.join('; ')}`);

console.log('\n── 3. change counts (rows with a resolved document) ──');
for (const k of KINDS) {
  const rs = results.filter((x) => x.kind === k && x.doc);
  const line = (field) => ['SAME', 'CHANGE', 'FILL'].map((c) => `${c} ${count(rs, (x) => x[field] === c)}`).join('  ');
  console.log(`  ${k.padEnd(8)} n=${String(rs.length).padStart(3)}  title: ${line('titleChange')}   desc: ${line('descChange')}`);
}

// ── report: reverse direction ───────────────────────────────────────────────
console.log('\n── 4. rows the sheet does not touch ──');
for (const [kind, cfgs, key] of [
  ['course', extensions, 'courseId'],
  ['program', programCfgs, 'urlSlug'],
  ['skill', skillCfgs, 'urlSlug'],
]) {
  const left = cfgs.filter((c) => !touched[kind].has(String(c._id)));
  console.log(`  ${kind}: ${left.length} of ${cfgs.length}`);
  for (const c of left) {
    const extra = kind === 'course' ? `  urlAlias=${s(c.urlAlias) || '(empty)'}` : '';
    console.log(`    ${key}=${s(c[key]) || '(null)'}${extra}  isPublished=${c.isPublished}  `
      + `metaTitle=${s(c.metaTitle).trim() ? `YES "${c.metaTitle}"` : 'no'}`);
  }
}

// ── report: brand suffix ────────────────────────────────────────────────────
console.log('\n── 5a. stored metaTitles containing "9expert" (any case) ──');
for (const [kind, cfgs] of [['course', extensions], ['program', programCfgs], ['skill', skillCfgs]]) {
  const withTitle = cfgs.filter((c) => s(c.metaTitle).trim());
  const branded = withTitle.filter((c) => /9expert/i.test(c.metaTitle));
  console.log(`  ${kind.padEnd(8)} ${branded.length} of ${withTitle.length} non-empty (${cfgs.length} rows)`);
  for (const c of branded) console.log(`      ${s(c.courseId || c.urlSlug)}: ${c.metaTitle}`);
}
const sheetAll = [...(sheet.courses ?? []), ...(sheet.programs ?? []), ...(sheet.skills ?? [])];
console.log(`  sheet titles ending in "| 9Expert": ${count(sheetAll, (r) => /\|\s*9Expert\s*$/.test(s(r.metaTitle)))} of ${sheetAll.length}`);

await mongoose.connection.close();

console.log('\n── 5b. live <title> / description ──');
if (skipLive) {
  console.log('  skipped (--no-live)');
} else {
  for (const p of ['/excel-advanced-training-course', '/excel-all-courses', '/data-all-courses']) {
    const u = `https://www.9experttraining.com${p}`;
    try {
      const res = await fetch(u, { headers: { 'user-agent': 'genesis-page-meta-audit' } });
      const html = await res.text();
      const titles = [...html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => m[1]);
      const descs = [...html.matchAll(/<meta\s[^>]*name=["']description["'][^>]*>/gi)].map((m) => {
        const c = m[0].match(/content=(["'])([\s\S]*?)\1/i);
        return c ? c[2] : m[0];
      });
      console.log(`  ${p}  HTTP ${res.status}  (${titles.length} <title>, ${descs.length} description)`);
      for (const t of titles) console.log(`    <title>: ${t}`);
      for (const d of descs) console.log(`    description: ${d}`);
    } catch (err) {
      console.log(`  ${p}  FETCH FAILED: ${err?.message ?? err}`);
    }
  }
}

// ── report: sheet hygiene ───────────────────────────────────────────────────
console.log('\n── 6. sheet hygiene ──');
let nFlags = 0;
for (const [kind, rows] of [['course', sheet.courses ?? []], ['program', sheet.programs ?? []], ['skill', sheet.skills ?? []]]) {
  for (const r of rows) {
    for (const field of ['url', 'courseId', 'metaTitle', 'metaDescription']) {
      if (field === 'courseId' && kind !== 'course') continue;
      const flags = hygiene(r[field]);
      if (!flags.length) continue;
      nFlags++;
      console.log(`  [${kind}] row ${r.row} ${r.url} ${field}: ${flags.join(', ')}`);
      console.log(`      ${JSON.stringify(s(r[field]))}`);
    }
  }
}
if (!nFlags) console.log('  (none)');

// ── CSV ─────────────────────────────────────────────────────────────────────
const csvCell = (v) => `"${s(v).replace(/"/g, '""')}"`;
const header = ['kind', 'url', 'courseId', 'status', 'titleChange', 'descChange',
  'currentTitle', 'sheetTitle', 'currentDesc', 'sheetDesc', 'notes'];
const lines = [header.join(',')];
for (const x of results) {
  lines.push([
    x.kind, x.url, x.courseId, x.status, x.titleChange, x.descChange,
    x.doc?.metaTitle, x.sheetRow.metaTitle, x.doc?.metaDescription, x.sheetRow.metaDescription,
    x.notes.join(' | '),
  ].map(csvCell).join(','));
}
const out = path.resolve('tmp/page-meta-audit.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
// BOM so Excel opens the Thai text as UTF-8.
fs.writeFileSync(out, `﻿${lines.join('\r\n')}\r\n`, 'utf8');
console.log(`\nCSV: ${out} (${results.length} rows)`);
