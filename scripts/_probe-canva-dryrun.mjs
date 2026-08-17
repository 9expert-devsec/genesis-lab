/**
 * LOCAL DRY RUN — what WOULD a no-op save of ZZTEST-CANVA-01 produce?
 *
 * Reads the captured snapshot from disk and runs the real seed + save pipeline
 * over it IN PROCESS. No network, no write, no MSDB. Predicts stage 1's result
 * before stage 1 exists, so a surprise upstream is a surprise we already knew
 * about rather than one we discover by having caused it.
 *
 * Usage: PROBE_DIR=... node scripts/_probe-canva-dryrun.mjs
 */

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

register(new URL('../test/loader.mjs', import.meta.url));

const { seedTopicEditorRows } = await import('@/lib/courses/topicEditorSeed');
const { buildTopicSavePayload } = await import('@/lib/courses/topicEditorSave');
const { resolveTopicRich } = await import('@/lib/courses/topicRichState');
const { plainBulletsToHtml, htmlToProjection } = await import('@/lib/courses/topicHtml');

const snap = path.resolve(process.env.PROBE_DIR ?? '.', 'zztest-canva-01.upstream.json');
const course = JSON.parse(readFileSync(snap, 'utf8'));

const J = (v) => JSON.stringify(v);
const codepoints = (s) => [...s].map((c) => {
  const n = c.codePointAt(0);
  return n < 0x20 || n === 0xa0 || n === 0x200b || n > 0x2000 && n < 0x2070
    ? `U+${n.toString(16).toUpperCase().padStart(4, '0')}` : c;
}).join('');

console.log('');
console.log('══ LOCAL DRY RUN — no network, no write ═══════════════════════════════════');
console.log('');

/* ── the extension has no rich copy yet: the PLAIN case, like all 79 ──────── */
const seed = seedTopicEditorRows({ course, extension: null });
console.log(`   seed source   : ${seed.source}`);
console.log(`   seed stale    : ${seed.stale}`);
console.log(`   seed rows     : ${seed.rows.length}`);
seed.rows.forEach((r, i) => console.log(`   [${i}] html=${J(r.html)}`));
console.log('');

const payload = buildTopicSavePayload(seed.rows);
console.log(`   richerThanPlain : ${payload.richerThanPlain}   ← MUST be false for an untouched plain course`);
console.log(`   rich array      : ${J(payload.rich)}`);
console.log(`   plain rows kept : ${payload.plain.length}`);
console.log('');

/* ── THE QUESTION STAGE 1 ASKS: are the bytes byte-identical? ─────────────── */
const before = (course.training_topics ?? []).filter(Boolean)
  .map((t) => ({ title: String(t?.title ?? ''), bullets: Array.isArray(t?.bullets) ? t.bullets.map(String) : [] }));
const after = payload.plain;

console.log('── BYTE COMPARISON: what MSDB holds now vs what a no-op save would send ───');
let drift = 0;
const n = Math.max(before.length, after.length);
for (let i = 0; i < n; i += 1) {
  const b = before[i]; const a = after[i];
  if (!b || !a) { console.log(`   [${i}] ROW COUNT DRIFT  before=${b ? 'row' : '—'} after=${a ? 'row' : '—'}`); drift += 1; continue; }
  if (b.title !== a.title) { console.log(`   [${i}] TITLE DRIFT\n        before ${codepoints(b.title)}\n        after  ${codepoints(a.title)}`); drift += 1; }
  const m = Math.max(b.bullets.length, a.bullets.length);
  for (let j = 0; j < m; j += 1) {
    if (b.bullets[j] !== a.bullets[j]) {
      console.log(`   [${i}][${j}] BULLET DRIFT\n        before ${codepoints(String(b.bullets[j] ?? '(absent)'))}\n        after  ${codepoints(String(a.bullets[j] ?? '(absent)'))}`);
      drift += 1;
    }
  }
}
console.log('');
console.log(drift === 0
  ? '   ✓ ZERO DRIFT — a no-op save would send byte-identical training_topics.'
  : `   ✖ ${drift} DIFFERENCE(S) — a "no-op" save would NOT be a no-op.`);
console.log('');

/* ── the staleness gate, fed the rich copy this save would store ─────────── */
console.log('── STALENESS GATE, on the copy a FORMATTED save would store ───────────────');
const wouldStore = seed.rows.map((r) => r.html);
const resolved = resolveTopicRich({ rows: (course.training_topics ?? []).filter(Boolean), rich: wouldStore });
console.log(`   source=${resolved.source}  stale=${resolved.stale}   ← rich+not-stale means the gate accepts it`);
console.log('');

/* ── site-2 crossing, demonstrated per live bullet ────────────────────────── */
console.log('── SITE 2 CROSSING: htmlToProjection(plainBulletsToHtml(b)) vs raw b ──────');
let crossed = 0;
for (const [i, row] of before.entries()) {
  for (const [j, raw] of row.bullets.entries()) {
    const round = htmlToProjection(plainBulletsToHtml([raw]))[0];
    const same = round === raw;
    if (!same) { crossed += 1; console.log(`   [${i}][${j}] DIFFERS\n        raw   ${codepoints(raw)}\n        round ${codepoints(String(round))}`); }
  }
}
console.log(crossed === 0
  ? '   ✓ every live bullet on THIS course round-trips byte-identical.'
  : `   ✖ ${crossed} bullet(s) do not round-trip.`);
console.log('');
