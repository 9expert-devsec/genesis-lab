import mongoose from 'mongoose';

import { WEBROOT_DOCUMENTS } from '@/lib/webrootDocuments.mjs';

/**
 * WebrootUploadReceipt — permission to overwrite ONE site-root PDF, ONCE.
 *
 * ══ THE HOLE THIS CLOSES ════════════════════════════════════════════════════
 *
 * `runReplaceFlow` enforces ARCHIVE BEFORE OVERWRITE: copy the live object to
 * an archive key, verify the copy, and only then authorise. But the thing that
 * actually authorises an overwrite is the Blob client TOKEN, and that is minted
 * by /api/admin/webroot-documents/upload — a different entry point, which until
 * now took the caller's word for which file they meant. An admin who called the
 * route directly got a token with NO archive behind it, and the whole point of
 * the archive rule is that an overwrite cannot happen without a backup.
 *
 * So the archive step now issues one of these, and the route refuses to mint
 * without one. A receipt IS the proof that the previous bytes are already safe.
 *
 * ══ WHY A COLLECTION AND NOT AN IN-PROCESS MAP ══════════════════════════════
 *
 * On Vercel the server action and the route handler can run in DIFFERENT lambda
 * instances. A module-level Map would be written in one and read in another — it
 * would pass every local test, where both are the same process, and fail only in
 * production. That is the exact false-green shape this repo keeps meeting, so
 * the store is Mongo and there is no in-memory path at all.
 *
 * ══ WHY IT IS NOT A FIELD ON WebrootDocumentFile ════════════════════════════
 *
 * The obvious economy — hang receiptId/expiresAt/usedAt off the replacement
 * record — was considered and rejected on lifetime grounds.
 *
 * A receipt is rubbish five minutes after it is written and a TTL index over it
 * is legitimate janitorial cleanup. WebrootDocumentFile is the ONLY surviving
 * answer to "what was this document yesterday, and where did its bytes go" —
 * the overwrite destroys everything else. Put both in one document and the
 * cleanup mechanism becomes a history shredder, one index away.
 *
 * There is also no row to extend: WebrootDocumentFile is created AFTER the
 * upload lands, by recordWebrootReplacement. A receipt has to exist before it.
 *
 * ── NOT A DELIVERY LOOKUP ───────────────────────────────────────────────────
 * Same rule as WebrootDocumentFile. Nothing that SERVES a file may read this.
 * It is consulted once, by a token issuer, on an admin request.
 */
const WebrootUploadReceiptSchema = new mongoose.Schema(
  {
    /**
     * The bearer value. UNGUESSABLE BY CONSTRUCTION — a v4 UUID from
     * crypto.randomUUID(), never the _id of anything, never the stamp, never a
     * counter. Each of those is either enumerable or derivable from data an
     * admin can already see, and any of them would turn "hold a receipt" into
     * "guess a receipt".
     */
    receiptId: { type: String, required: true, unique: true },

    /**
     * Which of the three this authorises. The ROUTE READS THIS, not the client:
     * clientPayload carries the receipt id and nothing else that is trusted, so
     * a receipt for the company profile cannot be replayed to overwrite the
     * catalog. Constrained to the shared list, not free text.
     */
    filename: { type: String, required: true, trim: true, enum: [...WEBROOT_DOCUMENTS] },

    /** The key this authorises overwriting. Re-derived from `filename` anyway. */
    blobPathname: { type: String, required: true, trim: true },

    /**
     * WHERE THE PREVIOUS BYTES WENT. The reason the receipt exists — holding one
     * means this copy was already made AND verified.
     */
    archivePathname: { type: String, required: true, trim: true },

    /** The stamp shared by the archive key and this row, so the two agree exactly. */
    stamp: { type: String, default: '' },
    /** Size of what was archived, carried for the record that follows. */
    previousBytes: { type: Number, default: 0 },

    issuedAt: { type: Date, default: Date.now },
    /** From the session at prepare time. Never from a request body. */
    issuedBy: { type: String, default: '' },

    /**
     * EXPIRY IS ENFORCED IN THE QUERY, NOT BY THIS FIELD'S EXISTENCE.
     *
     * There is deliberately NO TTL index on this. Two reasons, and the second is
     * the one that decides it:
     *
     *   1. Mongo's TTL monitor runs on roughly a 60-second cycle, so an expired
     *      document stays READABLE for up to a minute past its expiry. A TTL
     *      index cannot be the correctness guard; the `expiresAt: { $gt: now }`
     *      clause in the burn query is.
     *   2. An unused receipt IS the evidence of an orphan — a prepare whose
     *      upload never happened, which left an archive copy behind. Deleting it
     *      on a timer would make that archive untraceable, and
     *      `listWebrootReplacements` reports these on purpose.
     *
     * If a retention rule is ever wanted it should delete USED receipts on a
     * long horizon, which is a job, not an index.
     */
    expiresAt: { type: Date, required: true },

    /**
     * Null until burned. Set by a single guarded findOneAndUpdate that matches
     * on `usedAt: null` — so of two simultaneous callers exactly one can win,
     * and the loser simply fails to match rather than reading a stale null.
     */
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'webroot_upload_receipts' },
);

/** The orphan listing: unused receipts, newest first, optionally per document. */
WebrootUploadReceiptSchema.index({ usedAt: 1, issuedAt: -1 });

export default mongoose.models.WebrootUploadReceipt
  || mongoose.model('WebrootUploadReceipt', WebrootUploadReceiptSchema);
