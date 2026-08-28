/**
 * READ-ONLY — stage 0 of the ZZTEST-CANVA-01 no-op-save probe.
 *
 * Captures RESTORE MATERIAL before any write exists, and reports whether the
 * subject is actually usable as a probe subject at all.
 *
 * GETs only. One write is never issued from this file — there is no write
 * helper imported, so "read-only" is structural rather than a promise.
 *
 * Usage: node --env-file=.env.local scripts/_probe-canva-topics-capture.mjs
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai').replace(/\/$/, '');
const KEY = process.env.AI_API_KEY;
if (!KEY) { console.error('\n✖ AI_API_KEY is not set — nothing was requested.\n'); process.exit(1); }

/** The ONLY course this probe reads. A constant, never an argument. */
const SUBJECT = 'ZZTEST-CANVA-01';

const OUT_DIR = process.env.PROBE_DIR ?? '.';

const res = await fetch(`${BASE}/public-course`, {
  headers: { 'x-api-key': KEY, accept: 'application/json' }, cache: 'no-store',
});
if (!res.ok) { console.error(`✖ /public-course → HTTP ${res.status}`); process.exit(1); }
const rows = (await res.json())?.items ?? [];

const byCode = rows.filter((r) => String(r.course_id ?? '').toUpperCase() === SUBJECT);
const byFormer = rows.filter((r) =>
  Array.isArray(r.formerCodes)
  && r.formerCodes.some((c) => String(c ?? '').toUpperCase() === SUBJECT));

console.log('');
console.log('══ ZZTEST-CANVA-01 — STAGE 0, READ ONLY ═══════════════════════════════════');
console.log('');
console.log(`   courses upstream        : ${rows.length}`);
console.log(`   matched by course_id    : ${byCode.length}`);
console.log(`   matched by formerCodes  : ${byFormer.length}`);
console.log('');

const found = byCode.length === 1 ? byCode : byFormer.length === 1 ? byFormer : [];
if (found.length !== 1) {
  console.error(`✖ ${SUBJECT} is not resolvable to exactly one upstream row.`);
  console.error('  NOTHING WAS CAPTURED. A probe cannot proceed without a pinned _id.');
  if (byCode.length + byFormer.length === 0) {
    const zz = rows.filter((r) => String(r.course_id ?? '').toUpperCase().startsWith('ZZTEST'));
    console.error(`  ZZTEST* codes present upstream: ${zz.map((r) => r.course_id).join(', ') || '(none)'}`);
  }
  process.exit(1);
}

const course = found[0];
const id = String(course._id ?? '');
console.log(`   RESOLVED  course_id=${course.course_id}  _id=${id}`);
console.log(`   formerCodes             : ${JSON.stringify(course.formerCodes ?? null)}`);
console.log('');

/* ── restore material: the WHOLE row, verbatim, before anything is sent ───── */
const snapPath = path.resolve(OUT_DIR, `${SUBJECT.toLowerCase()}.upstream.json`);
writeFileSync(snapPath, JSON.stringify(course, null, 2), 'utf8');
console.log(`   restore material written: ${snapPath}`);
console.log(`   bytes                   : ${JSON.stringify(course).length}`);
console.log('');

/* ── is it a usable subject? training_topics rows WITH bullets ───────────── */
const topics = Array.isArray(course.training_topics) ? course.training_topics : null;
console.log('── training_topics ────────────────────────────────────────────────────────');
if (topics === null) {
  console.log('   ✖ training_topics is not an array. NOT A USABLE SUBJECT.');
} else {
  const withBullets = topics.filter((t) => Array.isArray(t?.bullets) && t.bullets.length > 0);
  const totalBullets = topics.reduce(
    (n, t) => n + (Array.isArray(t?.bullets) ? t.bullets.length : 0), 0);
  console.log(`   rows                    : ${topics.length}`);
  console.log(`   rows WITH >=1 bullet    : ${withBullets.length}`);
  console.log(`   bullets total           : ${totalBullets}`);
  console.log('');
  topics.forEach((t, i) => {
    const b = Array.isArray(t?.bullets) ? t.bullets : [];
    console.log(`   [${i}] title=${JSON.stringify(String(t?.title ?? ''))}  bullets=${b.length}`);
    b.forEach((v, j) => console.log(`        ${j}: ${JSON.stringify(String(v ?? ''))}`));
  });
  console.log('');
  console.log(withBullets.length > 0
    ? '   ✓ USABLE SUBJECT — there is bullet content a no-op save could destroy.'
    : '   ✖ NO BULLETS. A no-op save here would prove nothing: the field is already empty.');
}
console.log('');
