// src/lib/chat/transcriptStore.js
//
// The transcript, persisted across a page reload.
//
// ── sessionStorage, NOT localStorage ────────────────────────────────────────
// It dies with the tab. That is the right default for a conversation: someone
// on a shared machine who closes the tab has closed the conversation, and a
// chat transcript sitting in localStorage until it is explicitly cleared is a
// surprise nobody agreed to. The trade is that a deliberately reopened tab
// starts fresh, which is the correct side to err on.
//
// ── KEYED BY SESSION ID, AND THAT IS LOad-BEARING ───────────────────────────
// The key is the id the upstream service knows the conversation by, so the
// stored transcript and the remote context cannot disagree about which
// conversation they belong to. It is also what makes clearing work
// structurally: rotating the id points the reader at a key that has never been
// written, so the panel comes back empty by construction.
//
// But the OLD key does not remove itself. Rotating first and dropping second —
// or not dropping at all — leaves the cleared conversation sitting in
// sessionStorage, readable in devtools, after the user pressed a button
// labelled "ล้างแชท". That is not a leak of consequence; it is a promise we
// made and did not keep. dropTranscript exists to be called BEFORE the
// rotation, while the old id is still known, and a test pins the order.

const KEY_PREFIX = 'chat_transcript_';

/**
 * How many turns are persisted.
 *
 * A message carries its course and promotion card payloads, so a long
 * conversation is not small. sessionStorage quotas are per-origin and shared
 * with everything else on the page, so the tail is dropped rather than risking
 * a QuotaExceededError that would take the whole write with it. 40 turns is far
 * past any real conversation and still bounded.
 */
const MAX_PERSISTED_MESSAGES = 40;

function defaultStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage ?? null;
  } catch {
    // Safari in private mode throws on ACCESS, not just on read/write.
    return null;
  }
}

export function transcriptKey(sessionId) {
  return `${KEY_PREFIX}${sessionId}`;
}

/** The stored transcript for `sessionId`, or [] when there is nothing usable. */
export function readTranscript(sessionId, storage = defaultStorage()) {
  if (!sessionId) return [];
  try {
    const raw = storage?.getItem(transcriptKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Anything that is not an array is treated as absent rather than thrown:
    // a corrupt entry must cost the user their history, not the whole panel.
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist the transcript. An EMPTY transcript removes the key rather than
 * storing `[]`, so a cleared conversation leaves nothing behind at all.
 */
export function writeTranscript(sessionId, messages, storage = defaultStorage()) {
  if (!sessionId) return;
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      storage?.removeItem(transcriptKey(sessionId));
      return;
    }
    storage?.setItem(
      transcriptKey(sessionId),
      JSON.stringify(messages.slice(-MAX_PERSISTED_MESSAGES)),
    );
  } catch {
    // Quota exceeded, or storage disabled. The conversation still works for the
    // life of the page; it simply does not survive a reload.
  }
}

/** Forget the transcript for `sessionId`. Call BEFORE rotating the id. */
export function dropTranscript(sessionId, storage = defaultStorage()) {
  if (!sessionId) return;
  try {
    storage?.removeItem(transcriptKey(sessionId));
  } catch {
    // nothing to do — see writeTranscript
  }
}

export const TRANSCRIPT_KEY_PREFIX = KEY_PREFIX;
export const TRANSCRIPT_MAX_MESSAGES = MAX_PERSISTED_MESSAGES;
