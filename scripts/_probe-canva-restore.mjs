/**
 * ZZTEST-CANVA-01 RESTORE - four flags, at most one write each.
 *
 * A real save went through the deployed admin and put a nested "test" bullet
 * into section 7, and a rich copy onto the extension. This puts both stores
 * back. The constraints below are the ruling, not preferences:
 *
 *   FRESH READ FIRST, NEVER RESTORE BLIND. The capture is from before the
 *   save. Anything else that moved on that row since is NOT ours to revert,
 *   so --diff reads upstream now and reports what a restore would touch.
 *
 *   SCOPED WRITE, NEVER A WHOLE-ROW PUT. MSDB performs an unfiltered
 *   findByIdAndUpdate(id, body) - measured in _probe-msdb-put-semantics.mjs -
 *   so a body carrying ONLY training_topics leaves every other field alone. A
 *   whole-row PUT would silently revert whatever else changed since the
 *   capture, which is the trap this flag structure exists to avoid.
 *
 *   TWO STORES, TWO WRITES. MSDB owns training_topics; genesis owns
 *   trainingTopicsRich. They are separate flags so neither can be a side
 *   effect of the other.
 *
 * ORDER DOES NOT ENDANGER A VISITOR. With the rich copy still present and the
 * plain rows restored, resolveTopicRich sees a mismatch, returns PLAIN and
 * marks stale - so the intermediate window renders plain text, which is the
 * state every consumer already handles.
 *
 * "NO RICH COPY" IS `[]`, NOT $unset. That is the schema default
 * (CourseExtension.js:204) and what buildTopicSavePayload writes when nothing
 * is richer than plain. parseTopicRich([]) -> [] -> TOPIC_SOURCE.PLAIN with
 * stale:false. An $unset would resolve the same way but would leave the
 * document in a shape no code path produces.
 *
 * Usage:
 *   node --env-file=.env.local scripts/_probe-canva-restore.mjs --diff
 *   node --env-file=.env.local scripts/_probe-canva-restore.mjs --restore-topics
 *   node --env-file=.env.local scripts/_probe-canva-restore.mjs --clear-rich
 *   node --env-file=.env.local scripts/_probe-canva-restore.mjs --verify
 */

import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

register(new URL('../test/loader.mjs', import.meta.url));

const BASE = (process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai').replace(/\/$/, '');
const KEY = process.env.AI_API_KEY;
if (!KEY) { console.error('\nX AI_API_KEY is not set.\n'); process.exit(1); }

/** Pinned. Both checked on every read; never arguments. */
const SUBJECT = 'ZZTEST-CANVA-01';
const SUBJECT_ID = '6a7d86e0cdf728240d601257';

const F = {
  diff:    process.argv.includes('--diff'),
  topics:  process.argv.includes('--restore-topics'),
  rich:    process.argv.includes('--clear-rich'),
  verify:  process.argv.includes('--verify'),
};
const on = Object.values(F).filter(Boolean).length;
if (on !== 1) {
  console.error('\nX pass exactly one flag. Two writes can never share an invocation.\n');
  process.exit(1);
}

const DIR = process.env.PROBE_DIR ?? '.';
const SNAP = path.resolve(DIR, 'zztest-canva-01.upstream.json');
if (!existsSync(SNAP)) { console.error(`\nX no capture at ${SNAP}\n`); process.exit(1); }
const snap = JSON.parse(readFileSync(SNAP, 'utf8'));
const WANT = Array.isArray(snap.training_topics) ? snap.training_topics : null;
if (!WANT) { console.error('\nX capture has no training_topics array.\n'); process.exit(1); }

const cp = (s) => [...String(s)].map((c) => {
  const n = c.codePointAt(0);
  return (n < 0x20 || n === 0xa0 || n === 0x200b || (n > 0x2000 && n < 0x2070))
    ? `U+${n.toString(16).toUpperCase().padStart(4, '0')}` : c;
}).join('');

async function readUpstream() {
  const res = await fetch(`${BASE}/public-course`, {
    headers: { 'x-api-key': KEY, accept: 'application/json' }, cache: 'no-store',
  });
  if (!res.ok) { console.error(`X /public-course -> HTTP ${res.status}`); process.exit(1); }
  const rows = (await res.json())?.items ?? [];
  const hit = rows.filter((r) => String(r._id) === SUBJECT_ID);
  if (hit.length !== 1) {
    console.error(`X _id ${SUBJECT_ID} did not resolve to exactly one row (${hit.length}).`);
    process.exit(1);
  }
  if (String(hit[0].course_id ?? '').toUpperCase() !== SUBJECT) {
    console.error(`X _id ${SUBJECT_ID} now answers to "${hit[0].course_id}". REFUSING.`);
    process.exit(1);
  }
  return hit[0];
}

async function readExtension() {
  const { dbConnect } = await import('@/lib/db/connect');
  const { default: CourseExtension } = await import('@/models/CourseExtension');
  await dbConnect();
  return { CourseExtension, doc: await CourseExtension.findOne({ courseId: SUBJECT }).lean() };
}

/** Row-by-row, bullet-by-bullet, codepoint-visible. Returns the difference count. */
function diffTopics(want, have, labelA = 'CAPTURE', labelB = 'LIVE') {
  let n = 0;
  const a = Array.isArray(want) ? want : [];
  const b = Array.isArray(have) ? have : [];
  console.log(`   rows ${labelA}/${labelB} : ${a.length} / ${b.length}`);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i]; const y = b[i];
    if (!x || !y) { console.log(`   [${i}] ROW PRESENT ONLY IN ${x ? labelA : labelB}`); n += 1; continue; }
    if (String(x.title ?? '') !== String(y.title ?? '')) {
      console.log(`   [${i}] TITLE\n        ${labelA} ${cp(x.title ?? '')}\n        ${labelB} ${cp(y.title ?? '')}`);
      n += 1;
    }
    const xb = Array.isArray(x.bullets) ? x.bullets : [];
    const yb = Array.isArray(y.bullets) ? y.bullets : [];
    if (xb.length !== yb.length) { console.log(`   [${i}] BULLET COUNT ${xb.length} -> ${yb.length}`); n += 1; }
    for (let j = 0; j < Math.max(xb.length, yb.length); j += 1) {
      if (String(xb[j] ?? ' absent') !== String(yb[j] ?? ' absent')) {
        console.log(`   [${i}][${j}] BULLET\n        ${labelA} ${cp(xb[j] ?? '(absent)')}\n        ${labelB} ${cp(yb[j] ?? '(absent)')}`);
        n += 1;
      }
    }
  }
  return n;
}

console.log('');

/* ===================== --diff / --verify (READ ONLY) ==================== */
if (F.diff || F.verify) {
  const label = F.diff ? 'BEFORE WRITING' : 'AFTER WRITING';
  const live = await readUpstream();
  const { doc } = await readExtension();

  console.log(`== ZZTEST-CANVA-01 RESTORE - ${label} (read only) ================`);
  console.log('');
  console.log('-- training_topics: capture vs live --------------------------------------');
  const n = diffTopics(WANT, live.training_topics);
  console.log(n === 0
    ? '   IDENTICAL - nothing to restore in MSDB.'
    : `   ${n} difference(s) - this is exactly what a scoped PUT would change.`);
  console.log('');

  console.log('-- trainingTopicsRich on the extension -----------------------------------');
  const present = doc ? Object.prototype.hasOwnProperty.call(doc, 'trainingTopicsRich') : false;
  const val = present ? doc.trainingTopicsRich : null;
  console.log(`   key present : ${present}`);
  console.log(`   value       : ${present ? JSON.stringify(val) : '(absent)'}`);
  console.log(`   target      : [] (schema default; means "no rich copy")`);
  const richClean = present && Array.isArray(val) && val.length === 0;
  console.log(richClean ? '   OK - already the no-rich-copy state.' : '   NEEDS CLEARING.');
  console.log('');

  console.log('-- OTHER FIELDS: what a whole-row PUT would have silently reverted -------');
  let drifted = 0;
  for (const k of [...new Set([...Object.keys(snap), ...Object.keys(live)])]) {
    if (k === 'training_topics') continue;
    const a = JSON.stringify(snap[k] ?? null);
    const b = JSON.stringify(live[k] ?? null);
    if (a !== b) {
      drifted += 1;
      const s = (t) => (t.length > 140 ? `${t.slice(0, 140)}... (${t.length}B)` : t);
      console.log(`   ${k}\n     capture ${s(a)}\n     live    ${s(b)}`);
    }
  }
  console.log(drifted === 0
    ? '   none - but the write stays scoped regardless.'
    : `   ${drifted} field(s) differ. NOT ours to revert; the scoped PUT leaves them alone.`);
  console.log('');

  /* The decision the whole split store rests on, restated on live bytes. */
  const { resolveTopicRich } = await import('@/lib/courses/topicRichState');
  const r = resolveTopicRich({
    rows: (live.training_topics ?? []).filter(Boolean),
    rich: doc?.trainingTopicsRich,
  });
  console.log(`-- what a visitor sees right now: source=${r.source} stale=${r.stale}`);
  console.log('');
  process.exit(0);
}

/* ===================== --restore-topics (ONE WRITE) ===================== */
if (F.topics) {
  const live = await readUpstream();
  console.log('== RESTORE training_topics - ONE SCOPED PUT ==============================');
  console.log('');
  const n = diffTopics(WANT, live.training_topics);
  if (n === 0) {
    console.log('\n   Already identical. NOTHING SENT.');
    process.exit(0);
  }
  const { msdbUpdate } = await import('@/lib/api/msdb-write');
  /* ONLY this key. MSDB merges, so every other field is left in place. */
  const body = { training_topics: WANT };
  console.log(`\n   PUT /public-course/${SUBJECT_ID}`);
  console.log(`   body keys: ${JSON.stringify(Object.keys(body))}`);
  const result = await msdbUpdate('public-course', SUBJECT_ID, body);
  console.log(`   MSDB returned: ok=${result?.ok} item._id=${result?.item?._id ?? '(none)'}`);
  console.log('\n   Written. Run --verify.');
  console.log('');
  process.exit(0);
}

/* ===================== --clear-rich (ONE WRITE) ========================= */
if (F.rich) {
  const { CourseExtension, doc } = await readExtension();
  console.log('== CLEAR trainingTopicsRich - ONE MONGO UPDATE ===========================');
  console.log('');
  if (!doc) { console.error('   X no extension document for this course. NOTHING WRITTEN.'); process.exit(1); }
  const present = Object.prototype.hasOwnProperty.call(doc, 'trainingTopicsRich');
  const val = present ? doc.trainingTopicsRich : null;
  console.log(`   before : ${present ? JSON.stringify(val) : '(absent)'}`);
  if (present && Array.isArray(val) && val.length === 0) {
    console.log('   Already []. NOTHING WRITTEN.');
    process.exit(0);
  }
  /* `[]`, not $unset - the schema default and the shape the save path writes. */
  await CourseExtension.updateOne({ _id: doc._id }, { $set: { trainingTopicsRich: [] } });
  const after = await CourseExtension.findById(doc._id).lean();
  console.log(`   after  : ${JSON.stringify(after.trainingTopicsRich)}`);
  console.log('\n   Cleared. Run --verify.');
  console.log('');
  process.exit(0);
}
