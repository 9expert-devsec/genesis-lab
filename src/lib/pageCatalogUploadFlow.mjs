/**
 * NO TOKEN WITHOUT A RECEIPT, AND NO RECORD WITHOUT A MATCHING ONE — the
 * page-catalog upload decisions, pure and testable.
 *
 * The shape is the webroot replacement's (src/lib/webroot/receiptFlow.mjs), and
 * its receipt-id reader and outcome names are REUSED, not copied:
 *
 *   prepare (server action)  issues a single-use, short-TTL receipt naming
 *                            (kind, key) — derived server-side from the page.
 *   token route              BURNS the receipt, re-derives the Blob pathname
 *                            from the RECEIPT, and refuses unless the pathname
 *                            the client asked for is identical. Only then mints.
 *   record (server action)   checks the receipt was burned for THIS page and not
 *                            yet recorded, checks the URL Blob returned is
 *                            exactly this page's file, HEADs it, then writes.
 *
 * What differs from webroot: no archive step. A catalog was already an
 * overwrite-in-place on Cloudinary with no previous edition kept; this keeps
 * those semantics on Blob rather than inventing a history nobody asked for.
 *
 * Alias-free and I/O-free: every dependency that touches Mongo or Blob is
 * injected, so a test can assert the mint spy was never called.
 */

import { MINT, readReceiptId } from './webroot/receiptFlow.mjs';
import {
  PAGE_CATALOG_RECEIPT_TTL_MS,
  pageCatalogBlobPathname,
  pageCatalogFileFor,
  refusePageCatalogBlobUpload,
} from './pageCatalogPaths.mjs';

export { MINT };

/** Extra outcome for a receipt whose (kind, key) cannot name a catalog file. */
export const CATALOG_MINT_BAD_TARGET = 'receipt-target-invalid';

/**
 * The receipt document. PURE — the id and the clock are passed in.
 * `rawId` is the id AS TYPED (what the config row is keyed on); `key` is the
 * normalised form the filename is built from.
 */
export function buildPageCatalogReceipt({ receiptId, kind, key, rawId, issuedBy = '', now }) {
  const at = Number(now);
  const file = pageCatalogFileFor(kind, key);
  return {
    receiptId: String(receiptId ?? ''),
    kind: String(kind ?? ''),
    key: String(key ?? ''),
    rawId: String(rawId ?? ''),
    blobPathname: file ? pageCatalogBlobPathname(file) : '',
    issuedAt: new Date(at),
    issuedBy: String(issuedBy ?? ''),
    expiresAt: new Date(at + PAGE_CATALOG_RECEIPT_TTL_MS),
    usedAt: null,
    recordedAt: null,
  };
}

/**
 * The token route's decision. deps (all async):
 *   burn(receiptId, now)  → receipt | null   ATOMIC single-use claim
 *   diagnose(receiptId)   → receipt | null   unguarded read, for the log only
 *   mint({ file, receipt }) → token options  ONLY reached on success
 *   log(entry)            → void             refusals only
 */
export async function runPageCatalogMintFlow({ pathname, clientPayload, now }, deps) {
  const { burn, diagnose, mint, log } = deps;
  const refuse = async (status, detail) => {
    if (log) await log({ status, detail, pathname: String(pathname ?? '') });
    return { status, minted: false };
  };

  const read = readReceiptId(clientPayload);
  if (!read.ok) return refuse(read.status, 'clientPayload carried no usable receiptId');

  // BURN FIRST — the mutual-exclusion primitive, before any opinion on paths.
  const receipt = await burn(read.receiptId, now);
  if (!receipt) {
    let doc = null;
    try { doc = diagnose ? await diagnose(read.receiptId) : null; } catch { doc = null; }
    if (!doc) return refuse(MINT.UNKNOWN_RECEIPT, `no receipt "${read.receiptId}"`);
    if (doc.usedAt) return refuse(MINT.USED_RECEIPT, `receipt "${read.receiptId}" already used`);
    if (Number(new Date(doc.expiresAt)) <= Number(now)) {
      return refuse(MINT.EXPIRED_RECEIPT, `receipt "${read.receiptId}" expired`);
    }
    return refuse(MINT.LOST_RACE, `receipt "${read.receiptId}" claimed by a concurrent request`);
  }

  // The destination comes from the RECEIPT, re-derived — never from the client.
  const file = pageCatalogFileFor(receipt.kind, receipt.key);
  if (!file) {
    return refuse(CATALOG_MINT_BAD_TARGET, `receipt names (${receipt.kind}, ${receipt.key})`);
  }
  const expected = pageCatalogBlobPathname(file);

  // A valid receipt for page A must not authorise an overwrite of page B.
  if (String(pathname) !== expected) {
    return refuse(MINT.PATHNAME_MISMATCH, `pathname "${pathname}" does not match "${expected}"`);
  }

  const token = await mint({ file, receipt });
  return { status: MINT.MINTED, minted: true, token, file, receipt };
}

/**
 * The record step's check, BEFORE any HEAD or write. `null` when acceptable,
 * else a Thai reason.
 *
 *   · the receipt exists, was BURNED (a token was minted for it — an upload
 *     could have happened) and was NOT already recorded;
 *   · it was issued for THIS (kind, key) — a receipt from another page is
 *     refused even if its upload succeeded;
 *   · the URL is exactly this page's Blob URL and the pathname is its pathname.
 */
export function refusePageCatalogRecord({ receipt, kind, key, url, pathname, blobBase }) {
  if (!receipt) return 'ไม่พบใบอนุญาตอัปโหลด — กรุณาอัปโหลดใหม่';
  if (!receipt.usedAt) return 'ใบอนุญาตอัปโหลดยังไม่ถูกใช้ — ไม่มีไฟล์ให้บันทึก';
  if (receipt.recordedAt) return 'การอัปโหลดนี้ถูกบันทึกไปแล้ว';
  if (String(receipt.kind) !== String(kind) || String(receipt.key) !== String(key)) {
    return 'ใบอนุญาตอัปโหลดนี้เป็นของหน้าอื่น';
  }
  const file = pageCatalogFileFor(kind, key);
  if (!file) return 'ชื่อไฟล์แคตตาล็อกไม่ถูกต้อง';
  return refusePageCatalogBlobUpload({ url, pathname, blobBase, fileName: file });
}

/**
 * What a HEAD of the uploaded Blob object must show before it is recorded.
 * `head` is the @vercel/blob head() result (`size`, `contentType`).
 */
export function refusePageCatalogHead(head) {
  if (!head) return 'ไม่พบไฟล์ที่อัปโหลดใน Blob';
  const type = String(head.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/pdf') return `ไฟล์ที่อัปโหลดไม่ใช่ PDF (${type || 'ไม่ทราบชนิด'})`;
  const size = Number(head.size);
  if (!Number.isFinite(size) || size <= 0) return 'ไฟล์ที่อัปโหลดว่างเปล่า';
  return null;
}
