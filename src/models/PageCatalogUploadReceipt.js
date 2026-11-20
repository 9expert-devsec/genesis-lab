import mongoose from 'mongoose';

import { CATALOG_KINDS } from '@/lib/pageCatalogPaths.mjs';

/**
 * PageCatalogUploadReceipt — permission to overwrite ONE page catalog on Blob,
 * ONCE, and to record that upload ONCE.
 *
 * The webroot replacement's receipt (models/WebrootUploadReceipt) with the
 * archive fields removed: a catalog is an overwrite in place, as it was on
 * Cloudinary. Same reasons it is a collection and not an in-process Map — the
 * prepare action, the token route and the record action can run in three
 * different lambdas.
 *
 *   prepare  → creates it (usedAt null, recordedAt null)
 *   route    → burns it: usedAt set by one guarded update; the Blob pathname is
 *              re-derived from (kind, key) HERE, never from the client
 *   record   → claims it: recordedAt set by one guarded update, only when the
 *              receipt was burned and names the same page
 *
 * Not a delivery lookup: nothing that serves a file reads this.
 */
const PageCatalogUploadReceiptSchema = new mongoose.Schema(
  {
    /** The bearer value — crypto.randomUUID(), never anything derivable. */
    receiptId: { type: String, required: true, unique: true },
    kind: { type: String, required: true, enum: [...CATALOG_KINDS] },
    /** Normalised key — what the filename is built from. */
    key: { type: String, required: true, trim: true },
    /** The id AS TYPED — what the config row is keyed on. */
    rawId: { type: String, required: true, trim: true },
    /** The pathname this authorises. Re-derived from (kind, key) anyway. */
    blobPathname: { type: String, required: true, trim: true },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: String, default: '' },
    /** Enforced in the burn QUERY, not by a TTL index (same as webroot). */
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    recordedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'page_catalog_upload_receipts' },
);

export default mongoose.models.PageCatalogUploadReceipt
  || mongoose.model('PageCatalogUploadReceipt', PageCatalogUploadReceiptSchema);
