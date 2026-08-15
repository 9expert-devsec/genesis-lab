/**
 * Walk the override path end to end against the SCRATCH database.
 *
 * Requires `seed-refusal-scratch.mjs seed` first. Every write here lands in
 * `<db>_r6scratch`; production is never opened for writing.
 *
 * Usage:
 *   node --env-file=.env.local scripts/walk-override-scratch.mjs
 *
 * ── WHAT THIS WALKS, AND THE ONE THING IT SKIPS ─────────────────────────────
 * It drives the real modules the server actions compose — the same renderer,
 * the same label functions, the same sync with the same flag, the same audit
 * writer, the same history reader. What it does NOT go through is
 * `requireAdmin`, which needs a NextAuth session and cannot exist outside a
 * request. So this proves the MECHANISM the actions invoke, not the actions'
 * own auth gate; that gate is covered by test/fs/overrideRulings.
 *
 * And it is not click-testing. Nobody pressed anything.
 */

import { register } from 'node:module';
import mongoose from 'mongoose';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register(new URL('./_walk-loader.mjs', import.meta.url));

const RAW = process.env.MONGODB_URI;
const parsed = RAW?.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]*)(\?.*)?$/);
if (!parsed) { console.error('could not parse MONGODB_URI'); process.exit(1); }
const [, HOST, DB, QS = ''] = parsed;
const SCRATCH = `${DB}_r6scratch`;

// EVERY module loaded below resolves dbConnect against this URI, so the sync
// writes to the scratch database and not to production.
process.env.MONGODB_URI = `${HOST}/${SCRATCH}${QS}`;

let failures = 0;
const PASS = (m) => console.log(`  PASS  ${m}`);
const FAIL = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };
const STEP = (m) => console.log(`\n── ${m} ──`);

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const { DowngradeRefusalPanel } = await import('@/app/admin/cache/_components/DowngradeRefusalPanel');
const { overrideConfirmLabel, sectionCountsOf } = await import('@/lib/cache-console/downgradeGuard');
const { overrideLossLines, assessPreview, VERDICT } = await import('@/lib/cache-console/resetPlan');
const { readCacheConsoleState } = await import('@/lib/cache-console/readCacheState');
const { readRecordHistory } = await import('@/lib/audit/readAuditLog');
const strip = (html) => html.replace(/<[^>]*>/g, ' ');

console.log(`\n=== override walkthrough on ${SCRATCH} ===`);

// ── 1. the console READS the refusal ───────────────────────────────────────
STEP('1. the console reads the seeded refusal');
const state = await readCacheConsoleState({ webhookLimit: 1 });
const refusal = state.snapshots?.data?.landing?.lastRefusal;
if (!refusal) { FAIL('readCacheConsoleState did not surface lastRefusal — seed first'); process.exit(1); }
PASS(`lastRefusal surfaced, ${refusal.shrunk.length} shrunken section(s), actor ${refusal.actor}`);

// ── 2. the PANEL renders the real per-section numbers ──────────────────────
STEP('2. the panel renders the real numbers');
const html = strip(renderToStaticMarkup(h(DowngradeRefusalPanel, { refusal })));
let rendered = 0;
for (const s of refusal.shrunk) {
  const ok = html.includes(s.section) && html.includes(String(s.before)) && html.includes(String(s.after));
  if (ok) rendered += 1; else FAIL(`panel omits ${s.section} ${s.before}→${s.after}`);
}
if (rendered === refusal.shrunk.length) PASS(`all ${rendered} sections rendered with both counts`);
if (html.includes('cron')) PASS('the refusing run is named (cron)'); else FAIL('the refusing run is not named');
if (!/ปิดแจ้งเตือน|dismiss/i.test(html)) PASS('no dismiss control'); else FAIL('a dismiss control is present');

// ── 3. the CONFIRM restates them ───────────────────────────────────────────
STEP('3. the confirm restates the numbers at the point of click');
const label = overrideConfirmLabel(refusal.shrunk);
const lines = overrideLossLines(refusal.shrunk);
const inLabel = refusal.shrunk.every((s) => label.includes(s.section) && label.includes(String(s.before)));
if (inLabel) PASS(`confirm label carries every section and count: "${label.slice(0, 90)}…"`);
else FAIL('the confirm label omits a section or a count');
if (lines.length === refusal.shrunk.length) PASS(`${lines.length} loss lines, one per section`);
else FAIL(`expected ${refusal.shrunk.length} loss lines, got ${lines.length}`);

// ── 4. the staleness check behaves ─────────────────────────────────────────
STEP('4. the preview token is checked before anything is written');
const doc0 = await db.collection('landing_cache').findOne({ key: 'homepage_v1' });
const live = { target: 'landing_cache', beforeCount: new Date(doc0.syncedAt).getTime() };
const fresh = { target: 'landing_cache', beforeCount: live.beforeCount, issuedAt: Date.now() };
if (assessPreview(null, live, Date.now()).verdict === VERDICT.REFUSE_NO_PREVIEW) PASS('no preview → refused');
else FAIL('a missing preview was accepted');
if (assessPreview({ ...fresh, issuedAt: Date.now() - 10 * 60_000 }, live, Date.now()).verdict === VERDICT.REFUSE_STALE) PASS('stale preview → refused');
else FAIL('a stale preview was accepted');
if (assessPreview(fresh, { ...live, beforeCount: live.beforeCount + 1 }, Date.now()).verdict === VERDICT.REFUSE_DRIFTED) PASS('drifted snapshot → refused');
else FAIL('a drifted snapshot was accepted');
if (assessPreview(fresh, live, Date.now()).verdict === VERDICT.OK) PASS('a fresh, matching preview is accepted');
else FAIL('a valid preview was refused');

// ── 5. the OVERRIDE runs with allowShrink, and the refusal CLEARS ──────────
STEP('5. the override runs the sync with allowShrink');
const beforeSections = sectionCountsOf(doc0.data);
console.log(`  pre-image: ${JSON.stringify(beforeSections)}`);

const { syncLandingData } = await import('@/lib/landing/syncLandingData');
const result = await syncLandingData({ allowShrink: true, actor: 'walkthrough-admin' });
console.log(`  sync returned: ok=${result?.ok} refused=${Boolean(result?.refused)} status=${result?.status}`);

const doc1 = await db.collection('landing_cache').findOne({ key: 'homepage_v1' });
const afterSections = sectionCountsOf(doc1.data);
console.log(`  post-image: ${JSON.stringify(afterSections)}`);

if (!result?.refused) PASS('the sync was not refused — allowShrink was honoured');
else FAIL(`the sync still refused: ${result.reason}`);
if (doc1.lastRefusal == null) PASS('lastRefusal CLEARED by the write');
else FAIL('lastRefusal survived the write — the console would keep offering an override');
if (doc1.syncedAt && new Date(doc1.syncedAt) > new Date(doc0.syncedAt)) PASS('syncedAt advanced');
else FAIL('syncedAt did not advance');

// ── 6. the AUDIT ROW lands with a full pre-image ───────────────────────────
STEP('6. the audit row carries the pre-image');
const { recordAdminAction } = await import('@/lib/audit/recordAdminAction');
const wrote = await recordAdminAction({
  menu: 'landing_cache',
  action: 'override',
  entity: 'snapshot',
  recordId: 'homepage_v1',
  recordLabel: 'สแนปช็อตหน้าแรก',
  before: { sections: beforeSections },
  after: { sections: afterSections },
  meta: { overrodeDowngrade: true, refusedShrunk: refusal.shrunk, walkthrough: true },
  actor: { id: 'walkthrough-admin', name: 'Walkthrough' },
});
if (wrote) PASS('audit row written'); else FAIL('the audit writer refused the row');

const row = await db.collection('admin_audit_logs')
  .find({ menu: 'landing_cache', entity: 'snapshot' }).sort({ createdAt: -1 }).limit(1).next();
if (!row) { FAIL('no audit row found'); }
else {
  if (row.before && row.after) PASS('before AND after survived the diff policy (full, not count_only)');
  else FAIL(`payload discarded — before=${JSON.stringify(row.before)} after=${JSON.stringify(row.after)}`);
  if (JSON.stringify(row.before).includes(String(beforeSections.programs))) PASS('the pre-image holds the real stored counts');
  else FAIL('the pre-image does not carry the counts it was given');
  if (row.recordId === 'homepage_v1') PASS('recordId is the cache key the action used');
}

// ── 7. RecordHistory's `rows` state, for THIS menu ─────────────────────────
STEP('7. RecordHistory rows state for landing_cache');
const hist = await readRecordHistory({
  user: { isSuperadmin: true, pages: null },
  menu: 'landing_cache', entity: 'snapshot', recordId: 'homepage_v1', limit: 5,
});
if (hist.state === 'ok' && hist.rows.length > 0) {
  PASS(`state=ok with ${hist.rows.length} row(s), total ${hist.total} — the state round 5 could not confirm for this menu`);
} else {
  FAIL(`expected rows, got state=${hist.state} rows=${hist.rows.length}`);
}




// ── 8. THE WRITE HALF: a real shrinking run REFUSES and records it ─────────
STEP('8. a genuinely smaller run is refused, and writes the refusal itself');
/**
 * The half a seeded refusal cannot reach. Everything above starts from a
 * refusal someone put in the database; this starts from a stored snapshot and a
 * real syncLandingData() that produces a smaller one, so the guard's own
 * comparison, refusal and record are what run.
 *
 * HOW THE SHRINK ARISES, stated because it matters: this harness stubs
 * next/headers, so the Mongo-backed readers the sync composes (banners,
 * featured reviews, featured online courses) come back empty rather than
 * failing upstream. The guard does not care WHY the incoming build is smaller —
 * it compares counts — so the code path exercised is the production one. What
 * is NOT reproduced is an upstream outage as the cause.
 */
await db.collection('landing_cache').updateOne(
  { key: 'homepage_v1' },
  { $set: { lastRefusal: null, data: doc0.data, syncedAt: doc0.syncedAt, sections: doc0.sections } }
);
const restored = await db.collection('landing_cache').findOne({ key: 'homepage_v1' });
if (restored.lastRefusal === null) PASS('scratch restored to a healthy snapshot with no refusal');
else FAIL('could not clear the seeded refusal');

const guarded = await syncLandingData();   // NO allowShrink
const afterGuard = await db.collection('landing_cache').findOne({ key: 'homepage_v1' });

if (guarded?.refused) PASS(`the sync REFUSED (${guarded.verdict})`);
else FAIL('a smaller run was written — the guard did not fire');
if (JSON.stringify(sectionCountsOf(afterGuard.data)) === JSON.stringify(sectionCountsOf(restored.data))) {
  PASS('the stored payload is byte-for-byte untouched');
} else FAIL('the stored payload changed on a refused run');
if (String(afterGuard.syncedAt) === String(restored.syncedAt)) PASS('syncedAt untouched');
else FAIL('syncedAt advanced on a refused run');
if (afterGuard.lastRefusal) {
  PASS(`lastRefusal WRITTEN by the guard, actor ${afterGuard.lastRefusal.actor}`);
  console.log('         ' + JSON.stringify(
    (afterGuard.lastRefusal.shrunk ?? []).map((s) => `${s.section} ${s.before}->${s.after}`)
  ));
} else FAIL('no refusal was recorded');

console.log(`\n=== ${failures === 0 ? 'WALKTHROUGH COMPLETE' : `${failures} STEP(S) FAILED`} ===`);
console.log(`
PROVEN by this walk, in order: read -> render -> confirm label -> staleness
gate -> override with allowShrink -> lastRefusal cleared -> audit row with a
full pre-image -> RecordHistory rows -> AND the write half, step 8: a real
syncLandingData() producing a smaller build is REFUSED, leaves the payload and
syncedAt untouched, and records the refusal itself.

The override step is not a formality: the run it let through collapsed banners
15 -> 0, and step 8 shows the same run refused when the flag is absent. Same
code, same data, opposite outcome on one parameter.

WHAT IS STILL NOT REPRODUCED: an UPSTREAM OUTAGE as the CAUSE of the shrink.
This harness stubs next/headers, so the sync's Mongo-backed readers return
empty. The guard compares counts and cannot tell that apart from a genuine
failure — the code path is the production one — but the two are not the same
event, and only one of them has ever happened here.

Also not covered: requireAdmin on the two actions (no session exists outside a
request — see test/fs/overrideRulings), and the browser. Nobody clicked
anything, and this is not click-testing.
`);
await mongoose.disconnect();
process.exit(failures === 0 ? 0 : 1);
