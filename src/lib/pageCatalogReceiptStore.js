import { dbConnect } from '@/lib/db/connect';
import PageCatalogUploadReceipt from '@/models/PageCatalogUploadReceipt';

/**
 * The ONLY module that queries page_catalog_upload_receipts.
 *
 * `.js`, not `.mjs`, for the reason webroot/receiptStore.js gives: the
 * audit-coverage walk only follows `.js`/`.jsx` imports, and the prepare
 * action WRITES through this file.
 *
 * Both state changes — burn and record-claim — are ONE guarded
 * findOneAndUpdate each, conditions in the filter, so two simultaneous callers
 * holding one receipt resolve to exactly one winner.
 */

export async function issuePageCatalogReceipt(doc) {
  await dbConnect();
  await PageCatalogUploadReceipt.create(doc);
  return { receiptId: doc.receiptId, expiresAt: doc.expiresAt };
}

/** BURN: unused and unexpired, in the filter. The token route calls this. */
export async function burnPageCatalogReceipt(receiptId, now) {
  await dbConnect();
  const at = new Date(Number(now));
  return PageCatalogUploadReceipt.findOneAndUpdate(
    { receiptId: String(receiptId ?? ''), usedAt: null, expiresAt: { $gt: at } },
    { $set: { usedAt: at } },
    { new: true },
  ).lean();
}

/** Unguarded read — for the refusal log and the record step's pre-check only. */
export async function readPageCatalogReceipt(receiptId) {
  await dbConnect();
  return PageCatalogUploadReceipt.findOne({ receiptId: String(receiptId ?? '') }).lean();
}

/**
 * CLAIM FOR RECORDING: burned, not yet recorded, same page — in the filter.
 * Returns the receipt, or null when another call already recorded it.
 */
export async function claimPageCatalogReceiptForRecord(receiptId, { kind, key }, now) {
  await dbConnect();
  return PageCatalogUploadReceipt.findOneAndUpdate(
    {
      receiptId: String(receiptId ?? ''),
      kind: String(kind ?? ''),
      key: String(key ?? ''),
      usedAt: { $ne: null },
      recordedAt: null,
    },
    { $set: { recordedAt: new Date(Number(now)) } },
    { new: true },
  ).lean();
}
