/**
 * READ-ONLY PROBE — VALUE-level census of training_topics.
 *
 * ══ WHY THIS EXISTS, AND WHAT THE PREVIOUS PROBE GOT WRONG ══════════════════
 *
 * scripts/_probe-course-fields.mjs censused the KEY SHAPE of every
 * training_topics subdocument and reported "823 subdocuments, all
 * {bullets,title}, zero empty subdocuments". That measured the wrong thing.
 *
 * A subdocument overwritten and stripped back to Mongoose defaults reads as
 *
 *     { title: '', bullets: [] }
 *
 * — key shape perfectly intact, content gone. A key census counts that as
 * healthy. The public page for copilot-studio-training-course renders numbered
 * accordion rows with blank headings, which is what an empty-VALUE subdocument
 * looks like from the outside.
 *
 * So this probe counts VALUES, and carries a control (bottom of file) that
 * proves the counter can tell the two cases apart — because a counter that
 * cannot is exactly how the first census produced a confident wrong answer.
 *
 * GETs only. Nothing written to MSDB, Mongo or disk.
 *
 * Usage: node --env-file=.env.local scripts/_probe-topics-values.mjs
 */

const BASE = (process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai').replace(/\/$/, '');
const KEY = process.env.AI_API_KEY;
if (!KEY) { console.error('\n✖ AI_API_KEY is not set — nothing was requested.\n'); process.exit(1); }

/**
 * THE COUNTER. One function, used for both the live data and the control, so
 * the control proves something about the code that produced the numbers.
 *
 *   emptyTitle    missing, not a string, or whitespace-only after trim
 *   emptyBullets  not an array, or an array of length 0
 *   both          an entry that carries no information at all
 *   healthy       a title with text AND at least one bullet
 */
function censusTopics(topics) {
  const out = {
    total: 0, emptyTitle: 0, emptyBullets: 0, both: 0, healthy: 0,
    bulletsAllBlank: 0,
  };
  if (!Array.isArray(topics)) return out;
  for (const t of topics) {
    out.total += 1;
    const isObj = t && typeof t === 'object';
    const title = isObj ? t.title : undefined;
    const bullets = isObj ? t.bullets : undefined;

    const titleEmpty = typeof title !== 'string' || title.trim() === '';
    const bulletsEmpty = !Array.isArray(bullets) || bullets.length === 0;
    // A non-empty array whose every entry is blank is ALSO content-free, and is
    // counted separately rather than folded in, so the two are distinguishable.
    const bulletsBlank = Array.isArray(bullets) && bullets.length > 0
      && bullets.every((b) => typeof b !== 'string' || b.trim() === '');

    if (titleEmpty) out.emptyTitle += 1;
    if (bulletsEmpty) out.emptyBullets += 1;
    if (titleEmpty && bulletsEmpty) out.both += 1;
    if (bulletsBlank) out.bulletsAllBlank += 1;
    if (!titleEmpty && !bulletsEmpty) out.healthy += 1;
  }
  return out;
}

async function get(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { 'x-api-key': KEY, accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

console.log('');
console.log('══ training_topics — VALUE-LEVEL CENSUS (read only) ═══════════════════════');
console.log('');

const raw = await get('/public-course');
const rows = raw?.items ?? [];
console.log(`  rows in LIST : ${rows.length}`);
console.log('');

// ── 1. corpus totals ────────────────────────────────────────────────────────
const totals = { total: 0, emptyTitle: 0, emptyBullets: 0, both: 0, healthy: 0, bulletsAllBlank: 0 };
const perCourse = [];
let absentRows = 0;
let emptyArrayRows = 0;

for (const r of rows) {
  const tt = r.training_topics;
  if (tt === undefined || tt === null) { absentRows += 1; continue; }
  if (Array.isArray(tt) && tt.length === 0) emptyArrayRows += 1;
  const c = censusTopics(tt);
  for (const k of Object.keys(totals)) totals[k] += c[k];
  perCourse.push({
    course_id: r.course_id, course_name: r.course_name, _id: String(r._id), ...c,
  });
}

console.log('════ 1. CORPUS TOTALS (all rows) ══════════════════════════════════════════');
console.log('');
console.log(`  total subdocuments                : ${totals.total}`);
console.log(`  title empty / missing / blank     : ${totals.emptyTitle}`);
console.log(`  bullets.length === 0              : ${totals.emptyBullets}`);
console.log(`  BOTH empty (no information)       : ${totals.both}`);
console.log(`  bullets non-empty but all blank   : ${totals.bulletsAllBlank}`);
console.log(`  healthy (title text + >=1 bullet) : ${totals.healthy}`);
console.log('');
console.log(`  rows where training_topics is ABSENT      : ${absentRows}`);
console.log(`  rows where training_topics is [] (len 0)  : ${emptyArrayRows}`);
console.log('');

// ── 2. courses carrying at least one empty-title subdocument ────────────────
console.log('════ 2. COURSES WITH >=1 EMPTY-TITLE SUBDOCUMENT ══════════════════════════');
console.log('');
const affected = perCourse.filter((c) => c.emptyTitle > 0)
  .sort((a, b) => b.emptyTitle - a.emptyTitle);
if (!affected.length) {
  console.log('  none.');
} else {
  console.log(`  ${'course_id'.padEnd(18)} ${'empty/total'.padEnd(12)} ${'_id'.padEnd(26)} name`);
  console.log(`  ${'-'.repeat(18)} ${'-'.repeat(12)} ${'-'.repeat(26)} ${'-'.repeat(34)}`);
  for (const c of affected) {
    console.log(`  ${String(c.course_id).padEnd(18)} ${`${c.emptyTitle}/${c.total}`.padEnd(12)} ${c._id.padEnd(26)} ${String(c.course_name ?? '').slice(0, 40)}`);
  }
}
console.log('');
console.log(`  courses affected: ${affected.length} of ${perCourse.length}`);
console.log('');

// the two the report asks about by name
console.log('  ── the two named in the brief ──');
const findRow = (pred) => perCourse.find(pred);
const copilot = findRow((c) => /copilot/i.test(`${c.course_id} ${c.course_name}`));
const canva = findRow((c) => String(c.course_id).toUpperCase() === 'CANVA-L1');
for (const [label, c] of [['copilot-studio', copilot], ['CANVA-L1', canva]]) {
  if (!c) { console.log(`     ${label.padEnd(16)} NOT FOUND in the list`); continue; }
  const inList = affected.some((a) => a._id === c._id);
  console.log(`     ${label.padEnd(16)} ${c.course_id} — ${c.emptyTitle}/${c.total} empty-title, `
    + `${c.emptyBullets}/${c.total} empty-bullets → ${inList ? 'IN the affected list' : 'NOT affected'}`);
  console.log(`     ${''.padEnd(16)} _id=${c._id}  ${String(c.course_name ?? '').slice(0, 50)}`);
}
console.log('');

// ── 3. the course_training_topics rows ──────────────────────────────────────
console.log('════ 3. ROWS CARRYING course_training_topics (not modified) ═══════════════');
console.log('');
const withAlt = rows.filter((r) => 'course_training_topics' in r);
console.log(`  rows: ${withAlt.length}`);
console.log('');
for (const r of withAlt) {
  const alt = r.course_training_topics;
  const c = censusTopics(r.training_topics);
  let health;
  if (r.training_topics === undefined || r.training_topics === null) health = 'ABSENT';
  else if (c.total === 0) health = 'EMPTY ARRAY';
  else if (c.healthy === 0) health = 'ALL EMPTY-VALUED';
  else if (c.emptyTitle > 0) health = `PARTIAL (${c.emptyTitle}/${c.total} empty-title)`;
  else health = `HEALTHY (${c.healthy}/${c.total})`;
  console.log(`  ${String(r.course_id).padEnd(16)} course_training_topics: ${Array.isArray(alt) ? `array[${alt.length}]` : typeof alt}`);
  if (Array.isArray(alt)) {
    for (const s of alt.slice(0, 2)) console.log(`      · ${String(s).slice(0, 90)}`);
  }
  console.log(`  ${''.padEnd(16)} training_topics       : ${health}`);
  console.log('');
}

// ── 5. THE CONTROL ──────────────────────────────────────────────────────────
console.log('════ 5. CONTROL — can the counter tell the two cases apart? ═══════════════');
console.log('');
const FIXTURE = [
  { title: 'A real heading', bullets: ['one', 'two'] },
  { title: '', bullets: [] },
];
const control = censusTopics(FIXTURE);
console.log(`  fixture: ${JSON.stringify(FIXTURE)}`);
console.log('');
console.log(`  total       : ${control.total}   (expected 2)`);
console.log(`  healthy     : ${control.healthy}   (expected 1)`);
console.log(`  emptyTitle  : ${control.emptyTitle}   (expected 1)`);
console.log(`  emptyBullets: ${control.emptyBullets}   (expected 1)`);
console.log(`  both        : ${control.both}   (expected 1)`);
const passes = control.total === 2 && control.healthy === 1 && control.emptyTitle === 1
  && control.emptyBullets === 1 && control.both === 1;
console.log('');
console.log(passes
  ? '  ✓ CONTROL PASSES — the counter distinguishes a populated subdocument from a\n'
    + '    default-stripped one. The corpus numbers above mean what they say.'
  : '  ✖ CONTROL FAILS — the counter CANNOT distinguish the two cases.\n'
    + '    Disregard every number above; they are not evidence of anything.');
console.log('');

// A second control in the other direction: an all-healthy fixture must report
// zero empties, so a counter that simply always reports 1 is caught too.
const HEALTHY_ONLY = [{ title: 'x', bullets: ['y'] }, { title: 'z', bullets: ['w'] }];
const c2 = censusTopics(HEALTHY_ONLY);
console.log(`  counter-control (all-healthy fixture): emptyTitle=${c2.emptyTitle} both=${c2.both} healthy=${c2.healthy}`);
console.log(c2.emptyTitle === 0 && c2.both === 0 && c2.healthy === 2
  ? '  ✓ reports zero empties on healthy input — it is not simply always saying 1.'
  : '  ✖ reports empties on healthy input — the counter is biased.');
console.log('');
