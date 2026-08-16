/**
 * NO TOKEN WITHOUT A RECEIPT. The mint decision, as a testable function.
 *
 * ══ THE CONTRACT ════════════════════════════════════════════════════════════
 *
 * `runReplaceFlow` (./replaceFlow.mjs) proves the previous bytes are archived
 * before it authorises. But authorisation and TOKEN ISSUANCE are two different
 * entry points — the flow runs in a server action, the token is minted by
 * /api/admin/webroot-documents/upload — and a client that called the route
 * directly got a token with no archive behind it.
 *
 * This closes that. The archive step issues a SINGLE-USE, SHORT-TTL receipt;
 * the route refuses to mint without one and BURNS it on use. The order is fixed
 * and every step gates the next:
 *
 *   1. read the receipt id out of clientPayload — and nothing else
 *   2. BURN it atomically. The burn is the authorisation, not a lookup.
 *   3. read the filename FROM THE BURNED RECEIPT
 *   4. re-derive the destination through webrootUploadTarget()
 *   5. assert the pathname Blob handed us equals that destination
 *   6. only then mint
 *
 * ── WHY THE BURN COMES BEFORE THE PATHNAME CHECK ────────────────────────────
 *
 * It is the mutual-exclusion primitive, so it must be the first thing that
 * touches the row: two simultaneous callers holding one receipt must resolve to
 * one winner before either of them gets as far as an opinion about pathnames.
 *
 * The consequence is deliberate: a request that burns a receipt and THEN fails
 * the pathname check has spent it. For a replay attempt that is the point — the
 * receipt is gone and cannot be tried against a third filename. For a client
 * bug it costs one re-prepare, which takes a fresh archive. Both are better than
 * a receipt that survives being pointed at the wrong document.
 *
 * ── clientPayload IS CLIENT-CONTROLLED ──────────────────────────────────────
 *
 * It carries the receipt id and NOTHING ELSE that is trusted. In particular it
 * may carry a `filename`, and this flow IGNORES it — the filename comes from
 * the stored receipt. That is not fastidiousness: honouring a client filename
 * alongside a valid receipt is exactly how a receipt for the company profile
 * authorises an overwrite of the catalog.
 *
 * ── WHY INJECTED DEPS ───────────────────────────────────────────────────────
 *
 * The claim that matters is negative — "no token was minted" — and it cannot be
 * shown against a real Blob SDK or a real Mongo. With `burn` and `mint` passed
 * in, a test asserts the mint spy's call count is ZERO, which is the only way to
 * prove a token could not have been issued. Same reasoning as replaceFlow.mjs.
 */

import { webrootUploadTarget, WEBROOT_RECEIPT_TTL_MS } from '../webrootDocuments.mjs';

/** Outcomes, so a caller branches on a value rather than on a message. */
export const MINT = {
  BAD_PAYLOAD: 'bad-payload',
  NO_RECEIPT: 'no-receipt',
  UNKNOWN_RECEIPT: 'unknown-receipt',
  EXPIRED_RECEIPT: 'expired-receipt',
  USED_RECEIPT: 'already-used-receipt',
  LOST_RACE: 'lost-race',
  BAD_FILENAME: 'receipt-filename-invalid',
  PATHNAME_MISMATCH: 'pathname-mismatch',
  MINTED: 'minted',
};

/**
 * The receipt document, built from a verified archive. PURE — the id and the
 * clock are passed in, so a test can assert the expiry arithmetic without one.
 *
 * `now` is milliseconds. The caller supplies `receiptId`; see the model for why
 * it must come from crypto.randomUUID() rather than from anything derivable.
 */
export function buildWebrootReceipt({
  receiptId, target, archivePathname, stamp, previousBytes = 0, issuedBy = '', now,
}) {
  const at = Number(now);
  return {
    receiptId: String(receiptId ?? ''),
    filename: target.filename,
    blobPathname: target.blobPathname,
    archivePathname: String(archivePathname ?? ''),
    stamp: String(stamp ?? ''),
    previousBytes: Number(previousBytes) || 0,
    issuedAt: new Date(at),
    issuedBy: String(issuedBy ?? ''),
    expiresAt: new Date(at + WEBROOT_RECEIPT_TTL_MS),
    usedAt: null,
  };
}

/**
 * The ONE value read out of clientPayload.
 *
 * Returns `{ ok: true, receiptId }` or `{ ok: false, status }`. A malformed
 * payload and a payload with no receipt are distinguished because the refusal
 * log has to tell "the admin page sent the wrong shape" apart from "somebody
 * called this route by hand".
 */
export function readReceiptId(clientPayload) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(clientPayload ?? '{}'));
  } catch {
    return { ok: false, status: MINT.BAD_PAYLOAD };
  }
  const id = parsed && typeof parsed === 'object' ? parsed.receiptId : null;
  if (typeof id !== 'string' || !id.trim()) return { ok: false, status: MINT.NO_RECEIPT };
  return { ok: true, receiptId: id.trim() };
}

/**
 * WHY the burn matched nothing — for the LOG ONLY.
 *
 * This read runs AFTER the decision has already been made and cannot change it.
 * That separation is the whole reason it is safe: the burn is one atomic guarded
 * update and stays the sole authority, while this unguarded read exists purely
 * so a refusal can say which of four different things went wrong. Reversing them
 * — read, decide, then write — is the race R6.5-c forbids.
 */
async function whyBurnMissed(receiptId, now, diagnose) {
  let doc = null;
  try {
    doc = diagnose ? await diagnose(receiptId) : null;
  } catch {
    doc = null;
  }
  if (!doc) {
    return { status: MINT.UNKNOWN_RECEIPT, detail: `no receipt "${receiptId}"` };
  }
  if (doc.usedAt) {
    return {
      status: MINT.USED_RECEIPT,
      detail: `receipt "${receiptId}" was already used at ${new Date(doc.usedAt).toISOString()}`,
    };
  }
  if (Number(new Date(doc.expiresAt)) <= Number(now)) {
    return {
      status: MINT.EXPIRED_RECEIPT,
      detail: `receipt "${receiptId}" expired at ${new Date(doc.expiresAt).toISOString()}`,
    };
  }
  // Unused and unexpired, yet the guarded update matched nothing: another
  // request burned it between the two queries. That is the guard working.
  return {
    status: MINT.LOST_RACE,
    detail: `receipt "${receiptId}" reads valid but was claimed by a concurrent request`,
  };
}

/**
 * Run the mint decision. `deps` are all async:
 *
 *   burn(receiptId, now)   → receipt | null   ATOMIC single-use claim
 *   diagnose(receiptId)    → receipt | null   unguarded read, for the log only
 *   mint({ target, receipt }) → token options ONLY reached on success
 *   log(entry)             → void             REFUSALS ONLY
 *
 * Returns `{ status, minted }`, plus `token` when `minted` is true.
 *
 * ── REFUSALS ARE LOGGED, SUCCESSES ARE NOT ──────────────────────────────────
 * A refused mint is either a bug in the admin page or somebody poking the route,
 * and neither leaves any other trace. A SUCCESSFUL mint already has a record —
 * the prepare wrote an audit row and the completion writes a WebrootDocumentFile
 * — so logging it too would be a second copy of a fact, which is how a log
 * becomes noise nobody reads.
 */
export async function runMintFlow({ pathname, clientPayload, now }, deps) {
  const { burn, diagnose, mint, log } = deps;

  const refuse = async (status, detail) => {
    if (log) await log({ status, detail, pathname: String(pathname ?? '') });
    return { status, minted: false };
  };

  // ── 1. the only trusted field ───────────────────────────────────────────
  const read = readReceiptId(clientPayload);
  if (!read.ok) {
    return refuse(read.status, 'clientPayload carried no usable receiptId');
  }

  // ── 2. BURN. Single-use is enforced here or nowhere. ────────────────────
  const receipt = await burn(read.receiptId, now);
  if (!receipt) {
    const why = await whyBurnMissed(read.receiptId, now, diagnose);
    return refuse(why.status, why.detail);
  }

  // ── 3-4. the filename comes from the RECEIPT, and is re-derived ─────────
  const target = webrootUploadTarget(receipt.filename);
  if (!target.ok) {
    // The model constrains `filename` to the frozen list, so reaching this
    // means the stored row disagrees with the list — a deploy that changed one
    // without the other. Refusing is right; guessing which is authoritative is
    // not.
    return refuse(MINT.BAD_FILENAME, target.reason);
  }

  // ── 5. THE COMPARISON. A valid receipt for A must not overwrite B. ──────
  if (String(pathname) !== target.blobPathname) {
    return refuse(
      MINT.PATHNAME_MISMATCH,
      `pathname "${pathname}" does not match "${target.blobPathname}" authorised by the receipt`,
    );
  }

  // ── 6. only now ────────────────────────────────────────────────────────
  const token = await mint({ target, receipt });
  return { status: MINT.MINTED, minted: true, token, target, receipt };
}
