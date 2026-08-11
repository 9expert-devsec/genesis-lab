/**
 * READ-ONLY PROBE — did MSDB actually KEEP the outline object we sent?
 *
 * Run this AFTER the first real save. Do not run it before: there is nothing to
 * check, and a green result would mean only that nothing was expected.
 *
 * ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 * MSDB silently drops keys it does not keep. That is not a hypothesis — it is
 * what emptied training_topics: Genesis sent `{ topic, subtopics }`, MSDB kept
 * neither, and the write reported success while the subdocuments came back
 * stripped to their defaults. A save that "worked" is not evidence the field
 * persisted; only reading it back is.
 *
 * The failure this catches looks EXACTLY like success from the admin form.
 *
 * Usage:
 *   node --env-file=.env.local scripts/_probe-outline-persisted.mjs POWER-BI
 *   node --env-file=.env.local scripts/_probe-outline-persisted.mjs           (all rows)
 */

const BASE = (process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai').replace(/\/$/, '');
const KEY = process.env.AI_API_KEY;
if (!KEY) { console.error('\n✖ AI_API_KEY is not set — nothing was requested.\n'); process.exit(1); }

const WANT = process.argv[2] ? String(process.argv[2]).toUpperCase() : null;

/** The eight keys MSDB returned on 2026-08-09, for every row. */
const KEYS = ['kind', 'url', 'file_id', 'filename', 'content_type', 'size', 'uploaded_at', 'download_url'];

const res = await fetch(`${BASE}/public-course`, {
  headers: { 'x-api-key': KEY, accept: 'application/json' }, cache: 'no-store',
});
if (!res.ok) { console.error(`✖ /public-course → HTTP ${res.status}`); process.exit(1); }
const rows = (await res.json())?.items ?? [];
const targets = WANT ? rows.filter((r) => String(r.course_id).toUpperCase() === WANT) : rows;

if (WANT && targets.length === 0) {
  console.error(`✖ no course_id "${WANT}" in the list response`);
  process.exit(1);
}

console.log('');
console.log('══ DID MSDB KEEP THE OUTLINE OBJECT? — READ ONLY ══════════════════════════');
console.log('');
console.log(`   rows examined : ${targets.length}${WANT ? ` (filtered to ${WANT})` : ' (all)'}`);
console.log('');

let anyLinked = 0;
let anyMissingKeys = 0;
let anyNonRootRelative = 0;

for (const row of targets) {
  const lines = [];
  for (const lang of ['th', 'en']) {
    const field = `course_outline_${lang}`;
    const v = row[field];

    if (v === undefined) {
      lines.push(`  ${field.padEnd(20)} ✖ KEY ABSENT — MSDB did not keep the field at all`);
      anyMissingKeys += 1;
      continue;
    }
    if (v === null || typeof v !== 'object') {
      lines.push(`  ${field.padEnd(20)} ✖ not an object (${v === null ? 'null' : typeof v})`);
      anyMissingKeys += 1;
      continue;
    }

    const keys = Object.keys(v).sort();
    const missing = KEYS.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !KEYS.includes(k));
    const linked = typeof v.download_url === 'string' && v.download_url.length > 0;
    if (linked) anyLinked += 1;
    if (missing.length) anyMissingKeys += 1;

    // The whole point of storing a root-relative path: it survives the cutover.
    // An absolute URL here means something re-wrote what we sent.
    if (linked && !v.download_url.startsWith('/')) anyNonRootRelative += 1;

    lines.push(
      `  ${field.padEnd(20)} ${linked ? '✓ linked' : '· empty '}  keys ${keys.length}/8`
      + `${missing.length ? `  ✖ MISSING: ${missing.join(',')}` : ''}`
      + `${extra.length ? `  ⚠ EXTRA: ${extra.join(',')}` : ''}`
    );
    if (linked) {
      lines.push(`  ${''.padEnd(20)}   kind=${JSON.stringify(v.kind)}`);
      lines.push(`  ${''.padEnd(20)}   url=${v.url}`);
      lines.push(`  ${''.padEnd(20)}   download_url=${v.download_url}`);
      if (v.url !== v.download_url) {
        lines.push(`  ${''.padEnd(20)}   ⚠ url and download_url DISAGREE — we send them identical`);
      }
      if (!v.download_url.startsWith('/')) {
        lines.push(`  ${''.padEnd(20)}   ✖ NOT root-relative — this will not survive the www cutover`);
      }
    }
  }

  // Only print rows that say something, unless a single course was requested.
  const interesting = WANT || lines.some((l) => /✓ linked|✖|⚠/.test(l));
  if (!interesting) continue;
  console.log(`${row.course_id} — ${String(row.course_name ?? '').slice(0, 50)}`);
  console.log(lines.join('\n'));
  console.log('');
}

console.log('── VERDICT ────────────────────────────────────────────────────────────────');
console.log('');
console.log(`  rows carrying a linked outline : ${anyLinked}`);
console.log(`  rows with a missing/absent key : ${anyMissingKeys}`);
console.log(`  linked but NOT root-relative   : ${anyNonRootRelative}`);
console.log('');
if (anyMissingKeys > 0) {
  console.log('  ✖ MSDB did NOT keep the shape we sent. This is the training_topics failure');
  console.log('    mode: the save reported success and the field did not persist. Do not');
  console.log('    ship more saves until the upstream schema is understood.');
} else if (anyLinked === 0) {
  console.log('  · Nothing is linked yet. If you have just saved an outline, that is the');
  console.log('    answer: the write did not persist. If you have not, this is expected.');
} else {
  console.log('  ✓ The object came back with all eight keys and a root-relative path.');
  console.log('    MSDB kept what we sent.');
}
console.log('');
console.log('  Not checked here: whether the PDF at that path actually resolves. Open the');
console.log('  URL, or use scripts/verify-legacy-delivery.mjs for the delivery half.');
console.log('');
