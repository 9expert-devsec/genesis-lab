import { dbConnect } from '@/lib/db/connect';
import WebrootUploadReceipt from '@/models/WebrootUploadReceipt';

/**
 * The ONLY module that queries webroot_upload_receipts.
 *
 * ══ WHY THE QUERIES LIVE TOGETHER AND AWAY FROM THE DECISION ════════════════
 *
 * The decision — burn, re-derive, compare, mint — is pure and lives in
 * ./receiptFlow.mjs where a test can drive it with fakes. What CANNOT be tested
 * with fakes is the query shape itself: a fake store can implement "atomic" any
 * way it likes and will happily agree with a read-then-write Mongo call. So the
 * queries are collected here, in one small file, where a source-level guard can
 * read them and where there is exactly one place to get the guard clause wrong.
 *
 * ── .js, NOT .mjs, ON PURPOSE ───────────────────────────────────────────────
 * test/fs/auditCoverage.test.mjs walks named imports out of the action modules
 * to classify which exports mutate, and its resolver only follows `.js`/`.jsx`.
 * A `.mjs` helper here would be invisible to that walk, so
 * `prepareWebrootReplacement` would keep reading as non-mutating while writing
 * to Mongo — a silent hole in the audit-coverage guard rather than a style
 * choice. It is `.js` so the walk sees the write.
 */

/** Write the receipt a verified archive has earned. */
export async function issueWebrootReceipt(doc) {
  await dbConnect();
  await WebrootUploadReceipt.create(doc);
  return { receiptId: doc.receiptId, expiresAt: doc.expiresAt };
}

/**
 * BURN IT. Single-use and expiry, both enforced INSIDE one query.
 *
 * ══ WHY THE GUARD IS IN THE FILTER AND NOT IN JAVASCRIPT ════════════════════
 *
 * The tempting version reads the receipt, checks `usedAt` and `expiresAt` in
 * code, then writes `usedAt`. Two simultaneous requests holding one receipt both
 * read a null `usedAt` before either writes, both pass, and BOTH get a token off
 * ONE archive — the second overwrite destroys the first upload with no backup.
 * That is the exact failure the archive rule exists to prevent, reintroduced one
 * layer up.
 *
 * With the conditions in the filter, the match and the set are one operation in
 * the server. The loser matches nothing and gets `null`, which the caller
 * already treats as a refusal. There is no window to lose.
 *
 * ══ EXPIRY IS CHECKED HERE, NOT BY A TTL INDEX ══════════════════════════════
 *
 * Mongo's TTL monitor runs on roughly a 60-second cycle, so a document is still
 * readable for up to a minute after `expiresAt` passes. `expiresAt: { $gt: now }`
 * is therefore the correctness guard; see the model for why there is no TTL
 * index at all (an unused receipt is the evidence of an orphaned archive).
 */
export async function burnWebrootReceipt(receiptId, now) {
  await dbConnect();
  const at = new Date(Number(now));
  return WebrootUploadReceipt.findOneAndUpdate(
    { receiptId: String(receiptId ?? ''), usedAt: null, expiresAt: { $gt: at } },
    { $set: { usedAt: at } },
    { new: true },
  ).lean();
}

/**
 * An unguarded read, for the REFUSAL LOG ONLY.
 *
 * It runs after `burnWebrootReceipt` has already returned null, so it cannot
 * influence any decision — it exists so a refusal can say "expired" rather than
 * "no". Never call it before the burn; that is the read-then-write race above.
 */
export async function readWebrootReceipt(receiptId) {
  await dbConnect();
  return WebrootUploadReceipt.findOne({ receiptId: String(receiptId ?? '') }).lean();
}

/**
 * Receipts that were issued and never burned — PREPARED BUT NEVER COMPLETED.
 *
 * These are orphans: the archive copy was made and verified, and then the upload
 * never happened. Archives are not pruned, so an extra copy is harmless, but it
 * must not be SILENT — otherwise the store accumulates keys nobody can account
 * for and the first person to write a retention rule has to guess.
 *
 * `receiptId` is excluded from the projection deliberately. An unused,
 * unexpired receipt is a live credential, and a listing that prints one hands it
 * to every surface that renders the listing.
 */
export async function listPreparedWebrootReceipts({ filename, limit = 200 } = {}) {
  await dbConnect();
  const query = { usedAt: null };
  if (filename) query.filename = filename;
  return WebrootUploadReceipt
    .find(query, { receiptId: 0 })
    .sort({ issuedAt: -1 })
    .limit(limit)
    .lean();
}
