/**
 * pinOrder normalization — DRY RUN BY DEFAULT (b-005 + b-006).
 *
 * Writes NOTHING unless `--apply` is passed. Without it this script performs a
 * single read and prints a report.
 *
 * ── WHAT IT REPAIRS ─────────────────────────────────────────────────────────
 * Two defects with one root cause — write paths that set a single positioning
 * field without maintaining the block invariant (see the note at the top of
 * src/lib/articlePositioning.js):
 *
 *   b-005  the pinned block holds duplicates and gaps (production:
 *          1,1,2,3,4,5,6,7,9,10). A duplicate is not cosmetic — the cascade
 *          falls through to publishedAt, so the number the admin typed stops
 *          deciding the position.
 *
 *   b-006  an UNPINNED article carries a non-zero pinOrder. `pinOrder` is the
 *          second key of the sort and applies to every document, so that row
 *          sorts below every pinOrder:0 row and lands at the very end of the
 *          list regardless of its publishedAt.
 *
 * ── THE TWO EFFECTS ARE REPORTED SEPARATELY, ON PURPOSE ─────────────────────
 * They have OPPOSITE visibility, and a single merged before/after list would
 * make that impossible to see:
 *
 *   section A (b-005)  renumber the block → NOTHING a reader can see moves
 *   section B (b-006)  zero the stray rows → those rows DO move, a long way
 *
 * A reviewer scanning one combined list would see an article jump ~130
 * positions and read it as a bug. It is the repair. So each section states its
 * own expectation, and the script asserts section A's "nothing moved" claim
 * rather than asking you to eyeball it.
 *
 * The plan itself comes from `planBlockNormalization` in
 * src/lib/articlePositioning.js — the same pure function the test tier
 * exercises — so this script contains no repair logic of its own to drift.
 *
 * Usage:
 *   npm run normalize:positions            # dry run, writes nothing
 *   npm run normalize:positions -- --apply # writes, then re-verifies
 */

import { register } from 'node:module';
import mongoose from 'mongoose';

// `@/` aliases and extensionless imports are invisible to Node; the suite's
// loader resolves both. Same move as scripts/cloudinary-gc-dryrun.mjs.
register(new URL('../test/loader.mjs', import.meta.url));
const { planBlockNormalization, isPositioned } = await import('@/lib/articlePositioning');
const { assignArticleRanks } = await import('@/lib/articleRank');

const APPLY = process.argv.includes('--apply');

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const pad = (s, n) => String(s).padEnd(n);
const short = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/** id → 1-based public position, via the shipped ranker. */
function positions(articles) {
  const m = new Map();
  for (const a of assignArticleRanks(articles)) m.set(String(a._id), a.rank);
  return m;
}

/** Apply a plan in memory, so "after" is computed by the same code that writes. */
function applyInMemory(articles, plan) {
  const byId = new Map(plan.writes.map((w) => [String(w._id), w]));
  return articles.map((a) => {
    const w = byId.get(String(a._id));
    return w ? { ...a, pinOrder: w.pinOrder } : a;
  });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const col = db.collection('articles');

  const docs = await col
    .find({}, { projection: { slug: 1, title: 1, isPinnedOnArticlePage: 1, pinOrder: 1, publishedAt: 1, createdAt: 1, active: 1 } })
    .toArray();
  const articles = docs.map((d) => ({ ...d, _id: String(d._id) }));

  const plan = planBlockNormalization(articles);
  const after = applyInMemory(articles, plan);

  const posBefore = positions(articles);
  const posAfter = positions(after);
  const byId = new Map(articles.map((a) => [a._id, a]));
  const orderBefore = new Map(articles.map((a) => [a._id, a.pinOrder ?? 0]));

  // Split the writes by which defect they repair.
  const blockWrites = plan.writes.filter((w) => isPositioned(byId.get(String(w._id))));
  const strayWrites = plan.writes.filter((w) => !isPositioned(byId.get(String(w._id))));

  console.log('');
  console.log('══ pinOrder normalization ══════════════════════════════════════════════');
  console.log(APPLY ? '   MODE: --apply  (WILL WRITE)' : '   MODE: dry run  (writes nothing)');
  console.log('');
  console.log(`   articles scanned : ${articles.length}`);
  console.log(`   positioned block : ${articles.filter(isPositioned).length}`);
  console.log(`   rows to change   : ${plan.writes.length}  (${blockWrites.length} renumber + ${strayWrites.length} stray)`);
  console.log('');

  // ── SECTION A ────────────────────────────────────────────────────────────
  console.log('── A · BLOCK RENUMBERED TO CONTIGUOUS 1..M (b-005) ─────────────────────');
  console.log('   Expectation: the VISIBLE ORDER DOES NOT CHANGE. Only the numbers');
  console.log('   underneath are replaced, with ones that mean what they say.');
  console.log('');
  if (blockWrites.length === 0) {
    console.log('   nothing to renumber — the block is already contiguous 1..M');
  } else {
    console.log(`   ${pad('slug', 44)} ${pad('pinOrder', 16)} ${pad('position', 16)}`);
    console.log(`   ${'-'.repeat(44)} ${'-'.repeat(16)} ${'-'.repeat(16)}`);
    for (const w of blockWrites.sort((x, y) => x.pinOrder - y.pinOrder)) {
      const a = byId.get(String(w._id));
      const from = orderBefore.get(a._id);
      const pb = posBefore.get(a._id) ?? '—';
      const pa = posAfter.get(a._id) ?? '—';
      console.log(
        `   ${pad(short(a.slug ?? '(no slug)', 43), 44)} ` +
        `${pad(`${from} → ${w.pinOrder}`, 16)} ` +
        `${pad(pb === pa ? `${pb} (unchanged)` : `${pb} → ${pa}  ⚠`, 16)}`
      );
    }
  }

  // The claim, checked rather than eyeballed.
  const blockMoved = articles
    .filter(isPositioned)
    .filter((a) => posBefore.get(a._id) !== posAfter.get(a._id));
  console.log('');
  if (blockMoved.length === 0) {
    console.log('   ✔ VERIFIED: every positioned article keeps the position it had.');
  } else {
    console.log(`   ⚠ ${blockMoved.length} positioned article(s) CHANGED POSITION — this is not expected:`);
    for (const a of blockMoved) {
      console.log(`     ${a.slug}: ${posBefore.get(a._id)} → ${posAfter.get(a._id)}`);
    }
    console.log('     Do NOT run --apply until this is understood.');
  }
  console.log('');

  // ── SECTION B ────────────────────────────────────────────────────────────
  console.log('── B · UNPINNED ROWS WITH A STRAY pinOrder (b-006) ─────────────────────');
  console.log('   Expectation: THESE ROWS MOVE, and that is the repair. Each was exiled');
  console.log('   to the end of the list by a pinOrder that should never have applied');
  console.log('   to it; zeroing it returns the row to where publishedAt puts it.');
  console.log('   A large jump here is CORRECT, not a bug.');
  console.log('');
  if (strayWrites.length === 0) {
    console.log('   none — every unpinned article already holds pinOrder 0');
  } else {
    console.log(`   ${pad('slug', 44)} ${pad('pinOrder', 12)} ${pad('position', 20)} published`);
    console.log(`   ${'-'.repeat(44)} ${'-'.repeat(12)} ${'-'.repeat(20)} ${'-'.repeat(10)}`);
    for (const w of strayWrites) {
      const a = byId.get(String(w._id));
      const pb = posBefore.get(a._id) ?? '—';
      const pa = posAfter.get(a._id) ?? '—';
      const jump = typeof pb === 'number' && typeof pa === 'number' ? ` (${pa - pb > 0 ? '+' : ''}${pa - pb})` : '';
      console.log(
        `   ${pad(short(a.slug ?? '(no slug)', 43), 44)} ` +
        `${pad(`${orderBefore.get(a._id)} → 0`, 12)} ` +
        `${pad(`${pb} → ${pa}${jump}`, 20)} ` +
        `${a.publishedAt ? new Date(a.publishedAt).toISOString().slice(0, 10) : 'null'}`
      );
    }
  }
  console.log('');

  // ── the rest of the list is untouched ────────────────────────────────────
  const collateral = articles
    .filter((a) => !isPositioned(a))
    .filter((a) => !strayWrites.some((w) => String(w._id) === a._id))
    .filter((a) => posBefore.get(a._id) !== posAfter.get(a._id));

  // A row shifting by exactly ONE is the arithmetic of a stray row moving past
  // it — unavoidable and correct. Anything else is not, and is the only thing
  // worth a warning glyph here. Marking the expected case with ⚠ would be a
  // warning that fires on every correct run, i.e. one nobody reads.
  const shiftedByOne = collateral.filter((a) => Math.abs(posAfter.get(a._id) - posBefore.get(a._id)) === 1);
  const shiftedMore = collateral.filter((a) => Math.abs(posAfter.get(a._id) - posBefore.get(a._id)) !== 1);

  console.log('── C · EVERYTHING ELSE ─────────────────────────────────────────────────');
  if (collateral.length === 0) {
    console.log('   ✔ no other article changes position.');
  } else {
    console.log(
      `   ✔ ${shiftedByOne.length} article(s) shift by exactly ONE position. That is the`
    );
    console.log('     arithmetic of the section-B rows moving past them, not a side effect:');
    console.log('     a row vacating position 483 and landing at 401 pushes everything');
    console.log('     between down one slot. Their relative order is unchanged.');
  }
  if (shiftedMore.length > 0) {
    console.log('');
    console.log(`   ⚠ ${shiftedMore.length} article(s) move by MORE than one position — NOT expected:`);
    for (const a of shiftedMore.slice(0, 20)) {
      console.log(`     ${short(a.slug, 50)}: ${posBefore.get(a._id)} → ${posAfter.get(a._id)}`);
    }
    console.log('     Do NOT run --apply until this is understood.');
  }
  console.log('');

  // ── write, or don't ──────────────────────────────────────────────────────
  if (!APPLY) {
    console.log('════════════════════════════════════════════════════════════════════════');
    console.log('   NOTHING WAS WRITTEN. This was a dry run.');
    console.log('');
    console.log('   To apply, run it yourself:');
    console.log('     npm run normalize:positions -- --apply');
    console.log('');
    console.log('   Review section A\'s "VERIFIED" line and section B\'s row list first.');
    console.log('════════════════════════════════════════════════════════════════════════');
    console.log('');
    await mongoose.disconnect();
    return;
  }

  if (plan.writes.length === 0) {
    console.log('   nothing to do — the invariant already holds.');
    await mongoose.disconnect();
    return;
  }

  const ops = plan.writes.map((w) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(String(w._id)) },
      update: { $set: { pinOrder: Number(w.pinOrder) } },
    },
  }));
  const res = await col.bulkWrite(ops);
  console.log(`   wrote ${res?.modifiedCount ?? ops.length} document(s).`);
  console.log('');

  // ── re-read and verify the invariant, fail loud ──────────────────────────
  const recheck = (await col
    .find({}, { projection: { slug: 1, isPinnedOnArticlePage: 1, pinOrder: 1, publishedAt: 1, createdAt: 1, active: 1 } })
    .toArray()).map((d) => ({ ...d, _id: String(d._id) }));

  const failures = [];

  const blockNow = recheck.filter(isPositioned).map((a) => a.pinOrder ?? 0).sort((x, y) => x - y);
  const wanted = blockNow.map((_, i) => i + 1);
  if (JSON.stringify(blockNow) !== JSON.stringify(wanted)) {
    failures.push(`block is not contiguous 1..M — got [${blockNow.join(',')}]`);
  }

  const stillStray = recheck.filter((a) => !isPositioned(a) && (a.pinOrder ?? 0) !== 0);
  if (stillStray.length > 0) {
    failures.push(`${stillStray.length} unpinned row(s) still carry a non-zero pinOrder: ${stillStray.map((a) => a.slug).join(', ')}`);
  }

  // Idempotence is the strongest single check: a correct repair plans nothing
  // on a second pass.
  const residual = planBlockNormalization(recheck);
  if (residual.writes.length > 0) {
    failures.push(`a second normalization would still write ${residual.writes.length} row(s) — the repair did not converge`);
  }

  if (failures.length > 0) {
    console.error('✖ POST-WRITE VERIFICATION FAILED:');
    for (const f of failures) console.error(`   - ${f}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('   ✔ verified: block contiguous 1..M, no unpinned row with a non-zero pinOrder,');
  console.log('     and a second normalization plans nothing.');
  console.log('');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
