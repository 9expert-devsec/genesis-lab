// src/lib/chat/limits.js
//
// The caps on a chat turn, in ONE place.
//
// They were originally literals inside src/app/api/chat/route.js. The browser
// needs the same numbers — to stop a user typing 5,000 characters and only
// finding out after a round trip — and a cap written twice is a cap that will
// be raised once. When the two disagree the failure is silent in the worse
// direction: the client happily sends what the server refuses, and the user
// sees a generic error on a message they were allowed to type.
//
// The SERVER still enforces them. These are not client-side validation with a
// server-side copy; they are one set of numbers with two consumers, and the
// route re-applies them to every request because a request need not come from
// our client at all.

/**
 * The one error code the UI BRANCHES on.
 *
 * The route speaks five: chat_unavailable, upstream_timeout, upstream_failed,
 * rate_limited, message_too_long. Four of them are FAULTS — something that
 * worked a moment ago did not this time — and they differ only in what the user
 * should be told, which the route already supplies as Thai prose. One is not a
 * fault at all: `chat_unavailable` means the service was never configured for
 * this deployment, and there is nothing to retry.
 *
 * So the split the UI makes is one branch, not five. Adding a presentation per
 * code would be five near-identical red banners; collapsing all five into one
 * would lose the only distinction that changes what the user should DO. Kept
 * here rather than in the panel because the STORE also keys off it — a service
 * that does not exist gets no "sorry, temporary problem" apology in the
 * transcript.
 */
export const CHAT_UNAVAILABLE_CODE = 'chat_unavailable';

/** Longest single message we accept. Roughly a long paragraph of Thai. */
export const MAX_MESSAGE_CHARS = 1000;

/** How many prior turns travel with a message as context. */
export const MAX_HISTORY_TURNS = 12;

/** Per-turn cap inside the history. Same ceiling as a fresh message. */
export const MAX_HISTORY_CHARS = MAX_MESSAGE_CHARS;

/** Does this message fit? Used by the composer to disable Send, and by the route to reject. */
export function isMessageWithinCap(text) {
  return String(text ?? '').trim().length <= MAX_MESSAGE_CHARS;
}

/** How far over the cap a draft is; 0 when it fits. Drives the composer's counter. */
export function messageOverflow(text) {
  return Math.max(0, String(text ?? '').trim().length - MAX_MESSAGE_CHARS);
}
