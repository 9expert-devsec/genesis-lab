/**
 * Apply the approved SEO Meta Title / Description sheet to CourseExtension,
 * ProgramPageConfig and SkillPageConfig. DRY-RUN BY DEFAULT.
 *
 * ── THE DATABASE IS SHARED WITH PRODUCTION ─────────────────────────────────
 * Without --apply this reads (find) and writes only tmp/page-meta-plan.csv.
 * With --apply it writes `metaTitle`, `metaDescription` and `updatedAt` — those
 * three keys, nothing else — on every WRITE row, after a verified backup.
 * Undo: scripts/restore-page-meta.mjs <backup.json>.
 *
 * ── STEPS ──────────────────────────────────────────────────────────────────
 *  1. RESOLVE each sheet row with scripts/lib/page-meta-resolve (the same
 *     classification audit-page-meta reports), plus the two overrides below.
 *     A row that does not land on exactly one document is SKIPPED, never
 *     guessed. Two sheet rows landing on one document: both SKIPPED.
 *  2. NORMALISE titles: a `|9Expert` / `X| 9Expert` / `X |9Expert` ending
 *     becomes ` | 9Expert`. Nothing else in any value is touched. If more rows
 *     than the two expected are rewritten, the script lists them and stops.
 *  3. LENGTHS by the sheet's own rule: real width = characters minus the Thai
 *     marks U+0E31, U+0E34–U+0E3A, U+0E47–U+0E4E. Title ≤ 60, description
 *     120–160. Out of range: SKIPPED.
 *  4. PLAN per document: stored vs new for both fields. Both equal → NOOP.
 *  5. --apply only: backup (fsync + read back) → updateOne per document →
 *     re-read and verify every written document.
 *
 * No audit log and no course version history entries (decision 5 of R2): the
 * record of this change is the backup file plus the restore script.
 *
 * Pages read these fields through ISR, so a write shows on the live page after
 * the route's revalidate window (or an on-demand revalidate).
 *
 * Run: npm run apply:page-meta -- prompts/seo-meta-2026-11-16.json [--apply]
 */

import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

register(new URL('../test/loader.mjs', import.meta.url));

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
if (!inputPath) {
  console.error('usage: npm run apply:page-meta -- <sheet.json> [--apply]');
  process.exit(1);
}
const sheet = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const { skills: siteSkills } = await import('@/config/site');
const mongoose = (await import('mongoose')).default;
const { s, normUrl, csvCell, COLLECTIONS, resolveSheetRows, loadPageMetaCollections } =
  await import('./lib/page-meta-resolve.mjs');

// ── overrides (SEO-META R2 decisions 3 and 4) ───────────────────────────────
/**
 * PROGRAM_SLUG_OVERRIDES — the sheet still uses `/365-copilot-all-courses`;
 * the live site 308s it to `/microsoft-copilot-all-courses`, and that stored
 * row is the one the sheet's copy is for.
 *
 * COURSE_ID_OVER_URL — the sheet's url for these two courses is a FORMER alias
 * of the courseId's own row (the course was renamed since the sheet was cut),
 * so the courseId row is the right target. Accepted only while that is still
 * true; their urlAlias is NOT touched.
 */
const OVERRIDES = {
  PROGRAM_SLUG_OVERRIDES: { '/365-copilot-all-courses': 'microsoft-copilot-all-courses' },
  COURSE_ID_OVER_URL: ['MSE-L5', 'DEV-VS-05'],
};

// ── rules ───────────────────────────────────────────────────────────────────
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;
const EXPECTED_NORMALISED = 2;
const THAI_MARKS = /[ัิ-ฺ็-๎]/gu;
const realWidth = (v) => [...s(v).replace(THAI_MARKS, '')].length;

/** ` | 9Expert` ending with a space missing on either side of the `|`. */
function normaliseTitle(t) {
  const m = s(t).match(/(\s*)\|(\s*)9Expert$/);
  if (!m || (m[1] && m[2])) return t;
  return s(t).slice(0, m.index).replace(/\s+$/, '') + ' | 9Expert';
}

// ── read ────────────────────────────────────────────────────────────────────
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (.env.local)');
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 3,
});
const db = mongoose.connection.db;
const data = await loadPageMetaCollections(db);
const siteSkillSlugs = new Set(siteSkills.map((k) => `${k.slug}-all-courses`));
const { results } = resolveSheetRows(sheet, { ...data, siteSkillSlugs }, {
  programSlugOverrides: OVERRIDES.PROGRAM_SLUG_OVERRIDES,
});

console.log(`=== apply-page-meta — ${APPLY ? 'APPLY (writes to the shared DB)' : 'DRY RUN (no writes)'} ===`);
console.log(`sheet: ${inputPath}`);
console.log('overrides:');
for (const [from, to] of Object.entries(OVERRIDES.PROGRAM_SLUG_OVERRIDES)) console.log(`  program ${from} → urlSlug "${to}"`);
for (const id of OVERRIDES.COURSE_ID_OVER_URL) console.log(`  course ${id}: target the courseId row even though the sheet url is not its urlAlias`);

// ── 1. resolve → target ─────────────────────────────────────────────────────
const plan = [];
for (const x of results) {
  const p = {
    kind: x.kind,
    row: x.row,
    url: x.url,
    key: x.kind === 'course' ? x.courseId : s(x.override ?? x.url).replace(/^\/+/, ''),
    doc: null,
    skip: null,
    notes: [...x.notes],
    sheetTitle: s(x.sheetRow.metaTitle),
    newTitle: s(x.sheetRow.metaTitle),
    newDesc: s(x.sheetRow.metaDescription),
  };
  if (x.status === 'MATCH' || x.status === 'UNPUBLISHED') {
    p.doc = x.doc;
    if (x.status === 'UNPUBLISHED') p.notes.push('page is unpublished');
  } else if (
    x.kind === 'course'
    && x.status === 'URL_MISMATCH'
    && OVERRIDES.COURSE_ID_OVER_URL.includes(x.courseId)
    && (x.doc.formerAliases ?? []).some((a) => normUrl(a) === normUrl(x.url))
  ) {
    p.doc = x.doc;
    p.notes.push('OVERRIDE: courseId row; sheet url is its former alias');
  } else {
    p.skip = `${x.status}${x.notes.length ? ` (${x.notes.join('; ')})` : ''}`;
  }
  plan.push(p);
}

// Two sheet rows on one document would be a silent last-write-wins.
const byDoc = new Map();
for (const p of plan.filter((q) => q.doc)) {
  const k = `${p.kind}:${p.doc._id}`;
  byDoc.set(k, [...(byDoc.get(k) ?? []), p]);
}
for (const group of byDoc.values()) {
  if (group.length < 2) continue;
  for (const p of group) {
    p.skip = `DUPLICATE_TARGET (rows ${group.map((g) => g.row).join(', ')} resolve to one ${p.kind} document)`;
  }
}

// ── 2. normalise ────────────────────────────────────────────────────────────
const normalised = [];
for (const p of plan) {
  const t = normaliseTitle(p.newTitle);
  if (t !== p.newTitle) {
    normalised.push({ p, before: p.newTitle, after: t });
    p.newTitle = t;
  }
}
console.log(`\n── normalised titles: ${normalised.length} (expected ${EXPECTED_NORMALISED}) ──`);
for (const { p, before, after } of normalised) {
  console.log(`  [${p.kind}] row ${p.row} ${p.url}\n      ${JSON.stringify(before)}\n   →  ${JSON.stringify(after)}`);
}
if (normalised.length > EXPECTED_NORMALISED) {
  console.error(`\nSTOP: ${normalised.length} titles were normalised, expected ${EXPECTED_NORMALISED}. Nothing planned or written.`);
  await mongoose.disconnect();
  process.exit(2);
}

// ── 3. lengths ──────────────────────────────────────────────────────────────
for (const p of plan) {
  if (p.skip) continue;
  const tw = realWidth(p.newTitle);
  const dw = realWidth(p.newDesc);
  const bad = [];
  if (tw > TITLE_MAX) bad.push(`title width ${tw} > ${TITLE_MAX}`);
  if (dw < DESC_MIN || dw > DESC_MAX) bad.push(`description width ${dw} not in ${DESC_MIN}–${DESC_MAX}`);
  if (bad.length) p.skip = `LENGTH (${bad.join('; ')})`;
}

// ── 4. plan ─────────────────────────────────────────────────────────────────
for (const p of plan) {
  if (p.skip) { p.action = 'SKIPPED'; continue; }
  p.beforeTitle = s(p.doc.metaTitle);
  p.beforeDesc = s(p.doc.metaDescription);
  p.titleSame = p.beforeTitle === p.newTitle;
  p.descSame = p.beforeDesc === p.newDesc;
  p.action = p.titleSame && p.descSame ? 'NOOP' : 'WRITE';
}

const KINDS = ['course', 'program', 'skill'];
console.log('\n── plan counts ──');
for (const k of KINDS) {
  const rs = plan.filter((p) => p.kind === k);
  const c = (a) => rs.filter((p) => p.action === a).length;
  console.log(`  ${k.padEnd(8)} n=${String(rs.length).padStart(3)}  WRITE ${c('WRITE')}  NOOP ${c('NOOP')}  SKIPPED ${c('SKIPPED')}`);
}
console.log('\n── SKIPPED ──');
const skipped = plan.filter((p) => p.action === 'SKIPPED');
if (!skipped.length) console.log('  (none)');
for (const p of skipped) console.log(`  [${p.kind}] row ${p.row} ${p.url}  ${p.skip}`);
console.log('\n── overrides as applied ──');
for (const p of plan.filter((q) => q.notes.some((n) => n.startsWith('OVERRIDE')))) {
  console.log(`  [${p.kind}] row ${p.row} ${p.url} → ${p.kind === 'course' ? `courseId ${p.doc?.courseId}` : `urlSlug ${p.doc?.urlSlug}`} (_id ${p.doc?._id})  ${p.action}`);
}

// ── CSV ─────────────────────────────────────────────────────────────────────
const lines = [['kind', 'key', 'url', 'field', 'before', 'after', 'action'].join(',')];
for (const p of plan) {
  for (const [field, before, after, same] of [
    ['metaTitle', p.beforeTitle, p.newTitle, p.titleSame],
    ['metaDescription', p.beforeDesc, p.newDesc, p.descSame],
  ]) {
    let action = p.action;
    if (p.action === 'SKIPPED') action = `SKIPPED: ${p.skip}`;
    else if (p.action === 'WRITE' && same) action = 'WRITE (field unchanged)';
    lines.push([p.kind, p.key, p.url, field, before ?? '', after, action].map(csvCell).join(','));
  }
}
const planPath = path.resolve('tmp/page-meta-plan.csv');
fs.mkdirSync(path.dirname(planPath), { recursive: true });
fs.writeFileSync(planPath, `﻿${lines.join('\r\n')}\r\n`, 'utf8');
console.log(`\nplan CSV: ${planPath} (${lines.length - 1} lines)`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing written to the database. Pass --apply to write.');
  await mongoose.disconnect();
  process.exit(0);
}

// ── 5. apply ────────────────────────────────────────────────────────────────
const writes = plan.filter((p) => p.action === 'WRITE');

// 5a. backup — fsync'd and read back before any write.
const backup = {
  createdAt: new Date().toISOString(),
  sheet: inputPath,
  rows: writes.map((p) => ({
    _id: String(p.doc._id),
    collection: COLLECTIONS[p.kind],
    kind: p.kind,
    key: p.key,
    url: p.url,
    before: { metaTitle: p.doc.metaTitle ?? '', metaDescription: p.doc.metaDescription ?? '' },
    // What this run writes. restore-page-meta only restores a document whose
    // current values still equal these, so a later admin edit is not clobbered.
    after: { metaTitle: p.newTitle, metaDescription: p.newDesc },
  })),
};
const backupPath = path.resolve(`tmp/page-meta-backup-${backup.createdAt.replace(/[:.]/g, '-')}.json`);
const text = JSON.stringify(backup, null, 2);
const fd = fs.openSync(backupPath, 'wx');
fs.writeSync(fd, text, null, 'utf8');
fs.fsyncSync(fd);
fs.closeSync(fd);
const readBack = fs.readFileSync(backupPath, 'utf8');
if (readBack !== text || JSON.parse(readBack).rows.length !== writes.length) {
  console.error(`STOP: backup ${backupPath} did not read back intact. Nothing written.`);
  await mongoose.disconnect();
  process.exit(3);
}
console.log(`\nbackup: ${backupPath} (${writes.length} documents, read back OK)`);

// 5b. writes
let matched = 0;
for (const p of writes) {
  const res = await db.collection(COLLECTIONS[p.kind]).updateOne(
    { _id: p.doc._id },
    { $set: { metaTitle: p.newTitle, metaDescription: p.newDesc, updatedAt: new Date() } },
  );
  if (res.matchedCount === 1) matched += 1;
  else console.log(`  NOT MATCHED: [${p.kind}] ${p.key} _id ${p.doc._id}`);
}
console.log(`updateOne matched: ${matched} of ${writes.length}`);

// 5c. verify
let pass = 0;
let fail = 0;
for (const p of writes) {
  const d = await db.collection(COLLECTIONS[p.kind]).findOne({ _id: p.doc._id });
  if (d && d.metaTitle === p.newTitle && d.metaDescription === p.newDesc) pass += 1;
  else {
    fail += 1;
    console.log(`  VERIFY FAIL: [${p.kind}] ${p.key} _id ${p.doc._id}`);
  }
}
console.log(`verify: pass ${pass}  fail ${fail}`);
console.log(`undo:   npm run restore:page-meta -- ${path.relative(process.cwd(), backupPath)} [--apply]`);

await mongoose.disconnect();
process.exit(fail ? 1 : 0);
