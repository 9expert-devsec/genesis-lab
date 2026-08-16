/**
 * DID THE NEW BYTES ACTUALLY BECOME VISIBLE? The poll, as testable functions.
 *
 * ══ WHY THIS IS NOT "WAIT A FEW SECONDS AND SAY DONE" ═══════════════════════
 *
 * A replacement re-puts over a FIXED Blob key that a CDN has already cached
 * under a 30-day max-age. The upload returning 200 means the store accepted the
 * bytes; it says nothing about what a browser fetching the public URL will get.
 * So the only honest confirmation is to fetch that URL and check the CONTENT.
 *
 * ══ CONTENT, NOT LENGTH ═════════════════════════════════════════════════════
 *
 * The comparison is sha256 of the fetched bytes against sha256 of the file the
 * admin picked. NOT byte length. A new edition of a catalog can coincidentally
 * match the old one's length — and a length check would then report success
 * while the CDN was still serving the previous PDF, which is the precise
 * false-green this project keeps meeting. Length is free to compute and free to
 * be wrong.
 *
 * ══ WHAT A TIMEOUT MEANS, AND WHAT IT DOES NOT ══════════════════════════════
 *
 * THE MACHINE RUNNING THIS SEES ONE CDN POP. A hash that has flipped here is
 * proof only that this PoP is serving the new bytes; every other PoP is
 * unobserved. So the wait we measure is a LOWER BOUND on staleness elsewhere and
 * never an upper bound.
 *
 * Which makes the timeout branch a reporting decision, not a failure: running
 * out of budget means NOT VISIBLE FROM HERE YET. The upload already succeeded,
 * the replacement is already recorded, and the remedy is to look again — never
 * to upload again. A second upload during the propagation window is the obvious
 * way for an impatient admin to destroy the archive relationship, because it
 * takes a fresh archive of bytes that are themselves only seconds old.
 */

/**
 * A TRIPWIRE, NOT A CAPACITY CLAIM. Same species as WEBROOT_MAX_BYTES.
 *
 * ── WHAT ANCHORS THE NUMBER ─────────────────────────────────────────────────
 * MEASURED: ~10.8 s for a same-pathname Blob re-put to become visible — from
 * TWO samples, on ONE CDN PoP. That is a thin basis and it is stated as one:
 * two samples establish an order of magnitude, not a distribution, and one PoP
 * establishes nothing at all about the others.
 *
 * 60 s is roughly 5.5x that observation. The headroom is deliberate, because
 * the cost of being too tight is an admin told "not visible yet" on a perfectly
 * normal replacement — and the message costs trust every time it is wrong.
 *
 * It is NOT a claim that propagation completes within 60 s, anywhere. It is the
 * point past which continuing to poll from one machine stops being informative:
 * something is more likely wrong than slow, and the useful next move is to look
 * again later rather than to keep refetching a 42.6 MiB file.
 *
 * If a real replacement is ever observed taking longer, RAISE IT DELIBERATELY
 * and re-anchor this comment to the new observation. Do not treat it as tested.
 */
export const WEBROOT_PROPAGATION_BUDGET_MS = 60_000;

/**
 * When to look again, in milliseconds after the previous attempt.
 *
 * A FIXED SCHEDULE RATHER THAN A FIXED INTERVAL, because each attempt
 * re-downloads the whole object and the largest of the three is 42.6 MiB.
 * Polling every second would move a third of a gigabyte to answer a yes/no
 * question. Backing off keeps the worst case to seven fetches inside the
 * budget while still checking quickly at the start, where the answer usually is.
 *
 * Cumulative: 1, 3, 6, 11, 19, 32, 53 s — the last gap lands before the 60 s
 * budget so the final attempt is a real attempt and not a formality.
 */
export const WEBROOT_POLL_SCHEDULE_MS = Object.freeze([1_000, 2_000, 3_000, 5_000, 8_000, 13_000, 21_000]);

/** Outcomes, so a caller branches on a value rather than on a message. */
export const PROPAGATION = {
  /** The public URL served bytes whose hash equals the uploaded file's. */
  VISIBLE: 'visible',
  /** Budget spent without a match. NOT a failure — see the header. */
  NOT_VISIBLE_YET: 'not-visible-yet',
};

/**
 * Gap before attempt N (1-based). Past the end of the schedule the last value
 * repeats, so a longer budget degrades to a steady slow poll rather than to a
 * burst.
 */
export function pollGapMs(attempt, schedule = WEBROOT_POLL_SCHEDULE_MS) {
  if (!schedule.length) return 0;
  const i = Math.max(1, Math.floor(attempt)) - 1;
  return schedule[Math.min(i, schedule.length - 1)];
}

/**
 * Fetch the bytes a visitor would get RIGHT NOW.
 *
 * `cache: 'no-store'` is the whole point of this function existing rather than
 * being inlined. Without it the browser is entitled to answer from its own
 * cache — which, for these objects, holds a copy under the same 30-day max-age
 * as the CDN. The poll would then compare the new file against a copy the
 * browser already had, report success it never observed, and be MOST likely to
 * do so for the person who just uploaded.
 *
 * `fetchImpl` is injected so a test can read the init object back. A guard that
 * cannot see the option cannot prove it is there.
 */
export async function fetchWebrootBytes(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? 'no response'}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Lowercase hex sha256 of a byte array. */
export async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('WebCrypto subtle is unavailable');
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Poll the public URL until its content hash matches, or the budget is spent.
 *
 * `deps` are all injected so the claim can be proven by CALL COUNT rather than
 * by message:
 *
 *   fetchBytes(url)  → Uint8Array   one attempt
 *   hash(bytes)      → hex string
 *   nowMs()          → number       the clock
 *   wait(ms)         → Promise      the gap
 *
 * Returns `{ status, attempts, elapsedMs, seenSha256 }`. `seenSha256` is what
 * the last successful fetch actually hashed to — null when every fetch threw —
 * and is reported rather than swallowed, because "served something, but not
 * yours" and "served nothing" are different problems.
 */
export async function pollForPropagation(
  { url, expectedSha256, budgetMs = WEBROOT_PROPAGATION_BUDGET_MS, schedule = WEBROOT_POLL_SCHEDULE_MS },
  deps,
) {
  const { fetchBytes, hash, nowMs, wait } = deps;
  const started = nowMs();
  let attempts = 0;
  let seenSha256 = null;

  for (;;) {
    attempts += 1;
    try {
      const bytes = await fetchBytes(url);
      seenSha256 = await hash(bytes);
    } catch {
      // A failed fetch is not evidence the bytes are wrong — it is no evidence
      // at all. Keep the previous observation and let the budget decide.
      seenSha256 = seenSha256 ?? null;
    }

    if (seenSha256 && expectedSha256 && seenSha256 === expectedSha256) {
      return { status: PROPAGATION.VISIBLE, attempts, elapsedMs: nowMs() - started, seenSha256 };
    }
    if (nowMs() - started >= budgetMs) {
      return { status: PROPAGATION.NOT_VISIBLE_YET, attempts, elapsedMs: nowMs() - started, seenSha256 };
    }
    await wait(pollGapMs(attempts, schedule));
  }
}

// ── the UI state machine, kept out of the component so it can be tested ─────

/** Where the replace flow is. One value, so the UI cannot invent a state. */
export const PHASE = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  UPLOADING: 'uploading',
  POLLING: 'polling',
  VISIBLE: 'visible',
  NOT_VISIBLE_YET: 'not-visible-yet',
  REFUSED: 'refused',
};

/** Phases in which work is in flight and a second upload must be impossible. */
const BUSY = new Set([PHASE.PREPARING, PHASE.UPLOADING, PHASE.POLLING]);

/**
 * May the admin start an upload right now?
 *
 * FALSE THROUGHOUT THE PROPAGATION WINDOW. This is the guard against the
 * feature's most likely misuse: the upload succeeds, nothing visibly changes
 * for ~11 s because the CDN is still serving the old copy, and an impatient
 * admin uploads again. The second prepare archives bytes that are seconds old,
 * so the "previous edition" kept for that replacement is not the edition anyone
 * wanted back.
 *
 * TRUE again once the hash flips OR the budget expires — a timeout must not
 * leave the page permanently locked, because the state it reports is "unknown",
 * not "broken".
 */
export function canStartUpload(phase) {
  return !BUSY.has(phase);
}

/**
 * What to offer after a timeout. RE-CHECK, never re-upload.
 *
 * Deliberately a function rather than a comment: the remedy for "I cannot see
 * it from here" is to look again. Offering an upload button as the answer would
 * be inviting the exact double-upload the busy lock exists to prevent, one
 * screen later and with the page's own encouragement.
 */
export function remedyFor(phase) {
  if (phase === PHASE.NOT_VISIBLE_YET) return 'recheck';
  if (phase === PHASE.REFUSED) return 'retry';
  return null;
}
