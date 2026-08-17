/**
 * READ-ONLY PROBE — what does MSDB actually return for a public course?
 *
 * Settles two hypotheses that are currently read off code and comments rather
 * than measured:
 *
 *   H1  field-name mismatch in training_topics ({title,bullets} vs
 *       {topic,subtopics})
 *   H2  the LIST response omits course_teaser / course_objectives /
 *       training_topics, so the admin edit form — which has no detail endpoint
 *       and finds its row inside the LIST — seeds them empty
 *
 * GETs only. Nothing is written to MSDB, to Mongo, or to disk. It calls the
 * upstream the same way src/lib/api/client.js does (x-api-key, AI_API_BASE) and
 * the same way readCourseUncached does for the detail read
 * (`/public-course?course=<_id>`, revalidate 0 → cache: 'no-store').
 *
 * Usage: node --env-file=.env.local scripts/_probe-course-fields.mjs
 */

const BASE = (process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai').replace(/\/$/, '');
const KEY = process.env.AI_API_KEY;
if (!KEY) { console.error('\n✖ AI_API_KEY is not set — cannot probe. Nothing was requested.\n'); process.exit(1); }

const TARGET_OID = '692519bbfd2c3d20b79f0e7b';
const TARGET_COURSE_ID = 'POWER-BI';

/** Exactly the fields the report asks about, in the order asked. */
const FIELDS = [
  'course_teaser', 'course_objectives', 'training_topics', 'bullets',
  'course_doc_paths', 'course_outline_th', 'course_outline_en',
];

async function get(path, params, { noStore = false } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { 'x-api-key': KEY, accept: 'application/json' },
    cache: noStore ? 'no-store' : 'default',
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** The envelope variants client.js documents. */
function unwrap(raw) {
  if (Array.isArray(raw)) return raw;
  return raw?.items ?? raw?.data ?? [];
}

const present = (v) => {
  if (v === undefined) return 'ABSENT (key missing)';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]${v.length === 0 ? ' (EMPTY)' : ''}`;
  if (typeof v === 'object') return `object{${Object.keys(v).join(',')}}`;
  const s = String(v);
  return s.length === 0 ? 'STRING EMPTY' : `string(${s.length})`;
};

function table(label, row) {
  console.log(`  ${label}`);
  console.log(`    ${'field'.padEnd(22)} value`);
  console.log(`    ${'-'.repeat(22)} ${'-'.repeat(46)}`);
  for (const f of FIELDS) console.log(`    ${f.padEnd(22)} ${present(row?.[f])}`);
  console.log('');
}

function keysOf(row) {
  return row ? Object.keys(row).sort() : [];
}

console.log('');
console.log('══ MSDB COURSE FIELD PROBE — READ ONLY ════════════════════════════════════');
console.log('');
console.log(`   base   : ${BASE}`);
console.log(`   targets: _id=${TARGET_OID}  and  course_id=${TARGET_COURSE_ID}`);
console.log('');

// ── STEP 2: LIST ────────────────────────────────────────────────────────────
console.log('════ 2. LIST — GET /public-course (no params) ═════════════════════════════');
console.log('');
const listRaw = await get('/public-course');
const listItems = unwrap(listRaw);
console.log(`  envelope keys : ${Object.keys(listRaw ?? {}).join(', ')}`);
console.log(`  rows returned : ${listItems.length}`);
console.log('');

const byOid = listItems.find((r) => String(r._id) === TARGET_OID);
const byCourseId = listItems.find((r) => String(r.course_id).toUpperCase() === TARGET_COURSE_ID);

for (const [label, row] of [[`_id=${TARGET_OID}`, byOid], [`course_id=${TARGET_COURSE_ID}`, byCourseId]]) {
  console.log(`── LIST row: ${label} ${'─'.repeat(30)}`);
  if (!row) { console.log('  NOT FOUND in the list response\n'); continue; }
  console.log(`  course_id=${row.course_id}  name=${String(row.course_name ?? '').slice(0, 60)}`);
  console.log(`  Object.keys() sorted (${keysOf(row).length}): ${keysOf(row).join(', ')}`);
  console.log('');
  table('present/absent:', row);
}

// ── STEP 3: DETAIL ──────────────────────────────────────────────────────────
console.log('════ 3. DETAIL — GET /public-course?course=<_id>, no-store ════════════════');
console.log('');
const detail = {};
for (const [label, oid] of [['byOid', TARGET_OID], ['byCourseId', byCourseId?._id]]) {
  if (!oid) { console.log(`  ${label}: no _id available, skipped\n`); continue; }
  const raw = await get('/public-course', { course: oid }, { noStore: true });
  const items = unwrap(raw);
  const row = items?.[0] ?? null;
  detail[label] = row;
  console.log(`── DETAIL row: course=${oid} (${label}) ${'─'.repeat(20)}`);
  console.log(`  rows returned : ${items.length}`);
  if (!row) { console.log('  NOT FOUND\n'); continue; }
  console.log(`  course_id=${row.course_id}`);
  console.log(`  Object.keys() sorted (${keysOf(row).length}): ${keysOf(row).join(', ')}`);
  console.log('');
  table('present/absent:', row);
}

// ── STEP 4: RAW SHAPES ──────────────────────────────────────────────────────
console.log('════ 4. RAW SHAPES — the actual key names ═════════════════════════════════');
console.log('');
const trunc = (s, n = 2000) => (s.length <= n ? s : `${s.slice(0, n)}\n      …[truncated, ${s.length} chars total]`);

const sources = [
  ['LIST  _id target', byOid],
  ['LIST  POWER-BI', byCourseId],
  ['DETAIL _id target', detail.byOid],
  ['DETAIL POWER-BI', detail.byCourseId],
];

for (const [label, row] of sources) {
  if (!row) continue;
  const tt = row.training_topics;
  if (!Array.isArray(tt) || tt.length === 0) {
    console.log(`  ${label}: training_topics → ${present(tt)}`);
    continue;
  }
  console.log(`── ${label}: training_topics — first 2 rows, RAW ${'─'.repeat(18)}`);
  console.log(`      ${trunc(JSON.stringify(tt.slice(0, 2), null, 1))}`);
  const keyNames = [...new Set(tt.flatMap((t) => (t && typeof t === 'object' ? Object.keys(t) : [typeof t])))];
  console.log(`      EXACT KEY NAMES USED: ${keyNames.length ? keyNames.join(', ') : '(none — empty subdocuments)'}`);
  console.log('');
}

for (const field of ['course_outline_th', 'course_outline_en']) {
  console.log(`── ${field} — full object shape ${'─'.repeat(28)}`);
  for (const [label, row] of sources) {
    if (!row) continue;
    const v = row[field];
    console.log(`   ${label.padEnd(18)} ${present(v)}`);
    if (v && typeof v === 'object') console.log(`      ${trunc(JSON.stringify(v, null, 1))}`);
  }
  console.log('');
}

// ── STEP 5: VERDICT TABLE ───────────────────────────────────────────────────
console.log('════ 5. VERDICT TABLE ═════════════════════════════════════════════════════');
console.log('');
console.log(`  ${'field'.padEnd(22)} ${'in LIST?'.padEnd(22)} ${'in DETAIL?'.padEnd(22)} key names observed`);
console.log(`  ${'-'.repeat(22)} ${'-'.repeat(22)} ${'-'.repeat(22)} ${'-'.repeat(28)}`);
for (const f of FIELDS) {
  const l = byOid?.[f];
  const d = detail.byOid?.[f];
  let keys = '';
  if (f === 'training_topics') {
    const src = Array.isArray(d) && d.length ? d : (Array.isArray(l) && l.length ? l : null);
    keys = src ? [...new Set(src.flatMap((t) => (t && typeof t === 'object' ? Object.keys(t) : [typeof t])))].join(',') : '';
  } else if (f.startsWith('course_outline')) {
    const src = (d && typeof d === 'object') ? d : ((l && typeof l === 'object') ? l : null);
    keys = src ? Object.keys(src).join(',') : '';
  }
  console.log(`  ${f.padEnd(22)} ${present(l).padEnd(22)} ${present(d).padEnd(22)} ${keys || '—'}`);
}
console.log('');
console.log('  (LIST/DETAIL columns above are for the _id target. Nothing was written.)');
console.log('');
