/**
 * sortKey backfill — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING unless `--apply` is passed. Without it this script performs a
 * single read and prints a report.
 *
 * ── WHY THIS SCRIPT HAS TO RUN BEFORE ROUND 2 ───────────────────────────────
 * `getArticles` reads with `.lean()`, which does NOT apply Mongoose schema
 * defaults, and its result then goes through `serialize()` — a JSON round-trip
 * that drops undefined keys entirely. So a schema default cannot reach a
 * pre-existing document: every article written before `sortKey` existed reads
 * back with the key ABSENT. Switch the sort cascade over to `sortKey` before
 * every row holds one and the whole collection sorts as if it had no key.
 *
 * That is the entire reason this work is split in two. Round 1 (the field, the
 * planner, the create path, this script) makes the data true. Round 2 changes
 * the cascade, adds the compound index and rewrites the admin list UI.
 *
 * ── THE ACCEPTANCE TEST: NOTHING A READER SEES MOVES ────────────────────────
 * Every article is ordered by its CURRENT effective order and given a spaced
 * descending key, so /articles renders identically before and after. This script
 * does not ask you to take that on trust — it SIMULATES the round-2 cascade over
 * the keys it is about to write and compares the result, row by row, against the
 * order the live cascade produces today. Section B is that comparison. If it
 * does not come back clean, do not run --apply.
 *
 * The ordering is `publishedAt` desc, `createdAt` desc, `_id` — the shipped
 * `compareArticlesByDate` — for ALL articles, PINNED INCLUDED. `sortKey` means
 * "where this sits in the normal ordering", so a pinned article gets the key its
 * date earns and unpinning it later returns it somewhere sensible instead of
 * stranding it at the top forever. The visible order is unaffected either way:
 * for a pinned row the first two cascade keys decide before `sortKey` is ever
 * consulted, which is exactly what section B checks.
 *
 * ── DETERMINISM IS NOT OPTIONAL HERE ────────────────────────────────────────
 * `publishedAt` is full of ties by construction — an import burst writes
 * hundreds of rows within minutes, and every draft shares a null. Without a
 * total comparator two runs of this script could pick different orders, so a
 * re-run would silently renumber the list. `compareArticlesByDate` breaks a full
 * tie on `_id`; section A proves the property on THIS data rather than assuming
 * it, by assigning twice — once over the documents as read, once over a
 * reordered copy — and requiring an identical result.
 *
 * The assignment itself comes from `assignSortKeysFromOrder` in
 * src/lib/articleSortKey.js — the same pure function the test tier exercises —
 * so this script contains no ordering logic of its own to drift.
 *
 * Usage:
 *   npm run backfill:sortkey            # dry run, writes nothing
 *   npm run backfill:sortkey -- --apply # writes, then re-reads and verifies
 */

import { register } from 'node:module';
import mongoose from 'mongoose';

// `@/` aliases and extensionless imports are invisible to Node; the suite's
// loader resolves both. Same move as scripts/normalize-article-positions.mjs.
register(new URL('../test/loader.mjs', import.meta.url));
const { assignSortKeysFromOrder, sortKeyOf, SORT_KEY_GAP } = await import('@/lib/articleSortKey');
const { assignArticleRanks, compareArticlesForPublicOrder } = await import('@/lib/articleRank');

const APPLY = process.argv.includes('--apply');

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const pad = (s, n) => String(s).padEnd(n);
const short = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/**
 * THE SIMULATED ROUND-2 CASCADE.
 *
 * `{ isPinnedOnArticlePage: -1, pinOrder: 1, sortKey: -1 }` — what the sort in
 * src/lib/actions/articles.js becomes once round 2 lands. It lives HERE, in the
 * script, and not in src/, because round 2 owns the real one and a second copy
 * shipped early is a copy that drifts. Its only job is to answer the question
 * this dry run exists to answer: would switching to it move anything?
 */
function compareRound2(a, b) {
  const pa = a?.isPinnedOnArticlePage === true ? 1 : 0;
  const pb = b?.isPinnedOnArticlePage === true ? 1 : 0;
  if (pa !== pb) return pb - pa;

  const oa = Number.isFinite(Number(a?.pinOrder)) ? Number(a.pinOrder) : 0;
  const ob = Number.isFinite(Number(b?.pinOrder)) ? Number(b.pinOrder) : 0;
  if (oa !== ob) return oa - ob;

  const ka = sortKeyOf(a);
  const kb = sortKeyOf(b);
  if (ka === null && kb === null) return 0;
  if (ka === null) return 1;   // a document with no key sinks, as {sortKey:-1} would
  if (kb === null) return -1;
  return kb - ka;
}

const idsBy = (list, cmp) => [...list].sort(cmp).map((a) => a._id);

/** Apply a plan in memory, so "after" is computed by the same values that get written. */
function applyInMemory(articles, plan) {
  const byId = new Map(plan.writes.map((w) => [String(w._id), w]));
  return articles.map((a) => {
    const w = byId.get(String(a._id));
    return w ? { ...a, sortKey: w.sortKey } : a;
  });
}

/** id → 1-based position on /articles, via the shipped ranker (active rows only). */
function publicPositions(articles) {
  const m = new Map();
  for (const a of assignArticleRanks(articles)) if (a.rank != null) m.set(String(a._id), a.rank);
  return m;
}

const PROJECTION = { slug: 1, title: 1, isPinnedOnArticlePage: 1, pinOrder: 1, sortKey: 1, publishedAt: 1, createdAt: 1, active: 1 };

async function readAll(col) {
  const docs = await col.find({}, { projection: PROJECTION }).toArray();
  return docs.map((d) => ({ ...d, _id: String(d._id) }));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const col = db.collection('articles');

  const articles = await readAll(col);
  const byId = new Map(articles.map((a) => [a._id, a]));

  const plan = assignSortKeysFromOrder(articles);
  const after = applyInMemory(articles, plan);
  const keys = plan.writes.map((w) => w.sortKey);
  const alreadyKeyed = articles.filter((a) => sortKeyOf(a) !== null);

  console.log('');
  console.log('══ sortKey backfill ════════════════════════════════════════════════════');
  console.log(APPLY ? '   MODE: --apply  (WILL WRITE)' : '   MODE: dry run  (writes nothing)');
  console.log('');
  console.log(`   articles scanned      : ${articles.length}`);
  console.log(`   already carry a key   : ${alreadyKeyed.length}`);
  console.log(`   rows to write         : ${plan.writes.length}`);
  console.log(`   key range assigned    : ${Math.min(...keys)} … ${Math.max(...keys)}  (GAP ${SORT_KEY_GAP})`);
  console.log(`   distinct keys         : ${new Set(keys).size}${new Set(keys).size === keys.length ? '' : '  ⚠ DUPLICATES'}`);
  console.log(`   positioned block      : ${articles.filter((a) => a.isPinnedOnArticlePage === true).length}`);
  console.log('');

  // ── SECTION A · determinism ──────────────────────────────────────────────
  console.log('── A · THE ASSIGNMENT IS DETERMINISTIC ─────────────────────────────────');
  console.log('   publishedAt is full of ties by construction. Without a total comparator');
  console.log('   a re-run would pick a different order and silently renumber the list, so');
  console.log('   the property is proved on THIS data rather than assumed.');
  console.log('');

  const again = assignSortKeysFromOrder(articles);
  const shuffled = assignSortKeysFromOrder([...articles].reverse());
  const asMap = (p) => JSON.stringify([...new Map(p.writes.map((w) => [w._id, w.sortKey]))].sort());

  const stableSameOrder = asMap(again) === asMap(plan);
  const stableReversed = asMap(shuffled) === asMap(plan);
  console.log(`   re-run, same read order      : ${stableSameOrder ? '✔ identical' : '⚠ DIFFERENT'}`);
  console.log(`   re-run, reversed read order  : ${stableReversed ? '✔ identical' : '⚠ DIFFERENT'}`);

  // REPORTED AT BOTH LEVELS, on purpose. A single "rows in a full tie" number
  // comes back 0 on this collection and reads as "there are no ties here",
  // which is the opposite of the truth: `publishedAt` ties are enormous (an
  // import burst, and a large block sitting at exactly midnight). What resolves
  // them today is `createdAt`, which happens to be distinct on every row —
  // happens to be, because nothing enforces it. Collapsing the two counts would
  // hide which tier is actually doing the work, and so would hide the day
  // `createdAt` stops doing it.
  const tiedOn = (keyFn) => {
    const seen = new Map();
    for (const a of articles) seen.set(keyFn(a), (seen.get(keyFn(a)) ?? 0) + 1);
    return [...seen.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
  };
  const iso = (v) => (v ? new Date(v).toISOString() : 'null');
  const pubTies = tiedOn((a) => iso(a.publishedAt));
  const fullTies = tiedOn((a) => `${iso(a.publishedAt)}|${iso(a.createdAt)}`);
  console.log(`   rows sharing a publishedAt   : ${pubTies}  (resolved by createdAt)`);
  console.log(`   rows in a FULL date tie      : ${fullTies}  (resolved only by _id)`);
  if (!stableSameOrder || !stableReversed) {
    console.log('   ⚠ the comparator is NOT total on this data. Do NOT run --apply.');
  }
  console.log('');

  // ── SECTION B · the acceptance test ──────────────────────────────────────
  console.log('── B · NOTHING A READER SEES MOVES ─────────────────────────────────────');
  console.log('   The round-2 cascade { isPinnedOnArticlePage: -1, pinOrder: 1, sortKey: -1 }');
  console.log('   is simulated over the keys about to be written and compared, row by row,');
  console.log('   against the order the LIVE cascade produces today.');
  console.log('');

  // CONTROL FOR THE INSTRUMENT ITSELF. Section B's whole claim is "the two
  // cascades agree", and the cheapest way for that to be a false green is a
  // simulated cascade that never reads `sortKey` at all — it would then BE the
  // live cascade and agree with itself on every row. Two synthetic articles
  // whose date order and sortKey order deliberately disagree separate the two
  // functions before the real comparison is trusted.
  const probeNew = { _id: 'probe-newer', isPinnedOnArticlePage: false, pinOrder: 0, sortKey: 1000, publishedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', active: true };
  const probeOld = { _id: 'probe-older', isPinnedOnArticlePage: false, pinOrder: 0, sortKey: 2000, publishedAt: '2020-01-01T00:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z', active: true };
  const instrumentLive = compareArticlesForPublicOrder(probeNew, probeOld) < 0;   // date wins → newer first
  const instrumentR2 = compareRound2(probeNew, probeOld) > 0;                     // sortKey wins → newer second
  if (!instrumentLive || !instrumentR2) {
    die(
      'the simulated round-2 cascade does not actually consult sortKey — section B ' +
      'would be comparing the live cascade with itself and passing for free'
    );
  }

  const liveOrder = idsBy(articles, compareArticlesForPublicOrder);
  const round2Order = idsBy(after, compareRound2);
  const moved = liveOrder
    .map((id, i) => ({ id, from: i + 1, to: round2Order.indexOf(id) + 1 }))
    .filter((r) => r.from !== r.to);

  if (moved.length === 0) {
    console.log(`   ✔ VERIFIED: all ${articles.length} articles keep their exact position under the`);
    console.log('     round-2 cascade. The backfill is invisible to every reader.');
  } else {
    console.log(`   ⚠ ${moved.length} article(s) CHANGE POSITION — this is not expected:`);
    for (const r of moved.slice(0, 25)) {
      console.log(`     ${short(byId.get(r.id)?.slug ?? r.id, 50)}: ${r.from} → ${r.to}`);
    }
    console.log('     Do NOT run --apply until this is understood.');
  }

  // The same claim scoped to what /articles actually renders (active rows only).
  const pubBefore = publicPositions(articles);
  const pubAfterOrder = idsBy(after.filter((a) => a.active === true), compareRound2);
  const publicMoved = [...pubBefore.entries()].filter(([id, rank]) => pubAfterOrder.indexOf(id) + 1 !== rank);
  console.log('');
  console.log(`   /articles rows (active only) : ${pubBefore.size}`);
  console.log(`   of those, changing position  : ${publicMoved.length}${publicMoved.length === 0 ? '  ✔' : '  ⚠'}`);

  // NOT THIS SCRIPT'S JOB, BUT NAMED HERE ANYWAY. An UNPINNED row carrying a
  // non-zero pinOrder (b-006) sinks below every pinOrder:0 row and lands at the
  // very end of the list, regardless of its date and regardless of its sortKey —
  // `pinOrder` is the second cascade key both before and after this backfill.
  // Section C would otherwise show such a row at the bottom holding a high key
  // and read as a defect in the assignment. It is not; it is untouched, and it
  // is repaired by `npm run normalize:positions`.
  const stray = articles.filter(
    (a) => a.isPinnedOnArticlePage !== true && Number(a.pinOrder ?? 0) !== 0
  );
  if (stray.length > 0) {
    console.log('');
    console.log(`   NOTE: ${stray.length} unpinned row(s) carry a stray pinOrder (b-006) and are exiled`);
    console.log('   to the end of the list by it. Untouched here — this script does not write');
    console.log('   pinOrder — and unchanged by the backfill. Repair with normalize:positions.');
    for (const a of stray) {
      console.log(`     ${short(a.slug ?? a._id, 50)}  pinOrder=${a.pinOrder}  published=${a.publishedAt ? new Date(a.publishedAt).toISOString().slice(0, 10) : 'null'}`);
    }
  }
  console.log('');

  // ── SECTION C · what the top and bottom of the list will hold ────────────
  console.log('── C · THE KEYS, AT THE EDGES ──────────────────────────────────────────');
  console.log('   Spaced, not contiguous: an insert-at-top is then ONE row rather than a');
  console.log(`   ${articles.length}-row rewrite.`);
  console.log('');
  const ordered = [...after].sort(compareRound2);
  const edge = [...ordered.slice(0, 5), null, ...ordered.slice(-5)];
  console.log(`   ${pad('pos', 5)} ${pad('slug', 46)} ${pad('sortKey', 10)} ${pad('pin', 5)} published`);
  console.log(`   ${'-'.repeat(5)} ${'-'.repeat(46)} ${'-'.repeat(10)} ${'-'.repeat(5)} ${'-'.repeat(10)}`);
  for (const [i, a] of edge.entries()) {
    if (a === null) { console.log(`   ${pad('…', 5)} ${pad('…', 46)}`); continue; }
    const pos = i < 5 ? i + 1 : ordered.length - (edge.length - i) + 1;
    console.log(
      `   ${pad(pos, 5)} ${pad(short(a.slug ?? '(no slug)', 45), 46)} ` +
      `${pad(sortKeyOf(a), 10)} ${pad(a.isPinnedOnArticlePage === true ? 'yes' : '', 5)} ` +
      `${a.publishedAt ? new Date(a.publishedAt).toISOString().slice(0, 10) : 'null'}`
    );
  }
  console.log('');

  // ── write, or don't ──────────────────────────────────────────────────────
  if (!APPLY) {
    console.log('════════════════════════════════════════════════════════════════════════');
    console.log('   NOTHING WAS WRITTEN. This was a dry run.');
    console.log('');
    console.log('   To apply, run it yourself:');
    console.log('     npm run backfill:sortkey -- --apply');
    console.log('');
    console.log('   Read section A\'s two "identical" lines and section B\'s VERIFIED line');
    console.log('   first. Either one failing means the backfill is not safe yet.');
    console.log('════════════════════════════════════════════════════════════════════════');
    console.log('');
    await mongoose.disconnect();
    return;
  }

  if (!stableSameOrder || !stableReversed) {
    die('refusing to write: the assignment is not deterministic on this data (section A)');
  }
  if (moved.length > 0) {
    die(`refusing to write: ${moved.length} article(s) would change position (section B)`);
  }

  const ops = plan.writes.map((w) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(String(w._id)) },
      update: { $set: { sortKey: Number(w.sortKey) } },
    },
  }));
  const res = await col.bulkWrite(ops);
  console.log(`   wrote ${res?.modifiedCount ?? ops.length} document(s).`);
  console.log('');

  // ── re-read and verify, fail loud ────────────────────────────────────────
  const recheck = await readAll(col);
  const failures = [];

  if (recheck.length !== articles.length) {
    failures.push(`the collection changed size mid-run: ${articles.length} → ${recheck.length}`);
  }

  const missing = recheck.filter((a) => sortKeyOf(a) === null);
  if (missing.length > 0) {
    failures.push(
      `${missing.length} of ${recheck.length} document(s) still carry NO sortKey: ` +
      missing.slice(0, 10).map((a) => a.slug).join(', ')
    );
  }

  const storedKeys = recheck.map(sortKeyOf).filter((k) => k !== null);
  if (new Set(storedKeys).size !== storedKeys.length) {
    failures.push('the stored keys contain duplicates — two articles share one position');
  }

  // The order that was WRITTEN must be the order that was COMPUTED.
  const wanted = new Map(plan.writes.map((w) => [String(w._id), w.sortKey]));
  const wrong = recheck.filter((a) => sortKeyOf(a) !== wanted.get(a._id));
  if (wrong.length > 0) {
    failures.push(
      `${wrong.length} document(s) hold a key the plan did not assign: ` +
      wrong.slice(0, 10).map((a) => `${a.slug} (${sortKeyOf(a)} ≠ ${wanted.get(a._id)})`).join(', ')
    );
  }

  // …and the resulting order must still be the order readers already had.
  const storedOrder = idsBy(recheck, compareRound2);
  const stillMoved = liveOrder.filter((id, i) => storedOrder[i] !== id);
  if (stillMoved.length > 0) {
    failures.push(`${stillMoved.length} article(s) sit in a different position than before the write`);
  }

  // Idempotence: a correct backfill plans the same thing on a second pass.
  const residual = assignSortKeysFromOrder(recheck);
  const residualChanges = residual.writes.filter((w) => sortKeyOf(byIdOf(recheck, w._id)) !== w.sortKey);
  if (residualChanges.length > 0) {
    failures.push(`a second backfill would change ${residualChanges.length} row(s) — it did not converge`);
  }

  if (failures.length > 0) {
    console.error('✖ POST-WRITE VERIFICATION FAILED:');
    for (const f of failures) console.error(`   - ${f}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`   ✔ verified: ${recheck.length} of ${recheck.length} documents carry a sortKey, all distinct,`);
  console.log('     every value is the one the plan computed, the resulting order matches the');
  console.log('     order readers already had, and a second backfill would change nothing.');
  console.log('');
  await mongoose.disconnect();
}

function byIdOf(list, id) {
  return list.find((a) => a._id === String(id));
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
