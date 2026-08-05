// src/lib/chat/session.js
//
// The conversation's identity, as far as the upstream service is concerned.
//
// ── THE KEY WAS RENAMED ─────────────────────────────────────────────────────
// review-app stored this under `reviewapp_chat_session_id`. That name is a
// different product's, and this site shares an origin with nothing of the kind,
// so it would have been a permanent piece of unexplained litter in every
// visitor's localStorage.
//
// ── ROTATION IS A BUG FIX, NOT A REFINEMENT ─────────────────────────────────
// review-app's reset() kept the same id: `{...initialState, sessionId:
// state.sessionId}`. Pressing "ล้างแชท" therefore cleared the UI while the
// upstream service still held the whole prior conversation, so the very next
// answer could refer to what the user had just watched disappear. That is worse
// than not offering the button — the user asked for a fresh start and got a
// blank screen attached to the old context.
//
// So clearing the chat MINTS A NEW ID. `rotateSessionId` is the only way to do
// that, and it persists immediately: a rotation that lived only in React state
// would be undone by the next reload, which reads storage.

const STORAGE_KEY = 'genesis_chat_session_id';

/**
 * Storage that never throws.
 *
 * Safari in private mode, and any browser with site data blocked, throw on
 * `localStorage` ACCESS rather than returning null — so the guard has to wrap
 * the property read itself, not just the get/set.
 */
function defaultStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function newSessionId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function read(storage) {
  try {
    return storage?.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function write(storage, id) {
  try {
    storage?.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable. The id still works for this page's lifetime; the
    // conversation simply does not survive a reload, which is the correct
    // degradation — better than refusing to chat.
  }
}

/** The current conversation's id, creating and persisting one on first use. */
export function getOrCreateSessionId(storage = defaultStorage()) {
  const existing = read(storage);
  if (existing) return existing;
  const id = newSessionId();
  write(storage, id);
  return id;
}

/**
 * Abandon the current conversation and start a new one.
 *
 * Returns the NEW id. Callers must use the return value rather than re-reading,
 * so that a storage failure still yields a usable fresh id for this page.
 */
export function rotateSessionId(storage = defaultStorage()) {
  const id = newSessionId();
  write(storage, id);
  return id;
}

/** Exported for tests and for anyone auditing what this site puts in storage. */
export const CHAT_SESSION_STORAGE_KEY = STORAGE_KEY;
