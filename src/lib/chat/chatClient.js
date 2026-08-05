// src/lib/chat/chatClient.js
//
// Talks to /api/chat — same origin, always. The upstream host is the proxy's
// business; see the note at the top of src/app/api/chat/route.js for why the
// browser must never learn it.
//
// ── THE FALLBACK CHAINS ARE DELIBERATE. DO NOT "TIDY" THEM. ─────────────────
// The upstream response shape is not stable: the reply has arrived as
// `response`, `reply`, `message`, `text` and `answer` at different times, quick
// replies as an array of strings, an array of objects, and an object map of
// label→count, and cards under three different parents. Every alternative below
// is one that has actually been seen. Collapsing them to "the current one"
// trades a working chat for a blank bubble the first time the backend changes,
// with nothing in the console to say why.
//
// Ported from review-app, which learned all of this the hard way.

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function unwrap(x) {
  return x?.data ?? x?.result ?? x?.payload ?? x;
}

function pickText(d) {
  return (
    d?.response ??
    d?.reply ??
    d?.message ??
    d?.text ??
    d?.answer ??
    d?.output ??
    d?.assistantText ??
    d?.assistant?.text ??
    ''
  );
}

function normalizeQuickReplies(d) {
  const raw =
    d?.quickReplies ??
    d?.quick_replies ??
    d?.quickReplyChips ??
    d?.chips ??
    d?.suggestions ??
    d?.suggested_questions ??
    d?.categories ??
    d?.ui?.quickReplies ??
    d?.ui?.chips ??
    [];

  // Case 1 — a plain array, of strings or of objects.
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === 'string' ? x : x?.text || x?.label || x?.value || x?.name || ''))
      .map((s) => String(s || '').trim())
      .filter(Boolean);
  }

  // Case 2 — an object map, e.g. { "Microsoft Excel": 5, "Power BI": 3 }.
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .map(([k, v]) => {
        const label = String(k || '').trim();
        if (!label) return null;
        const count =
          typeof v === 'number'
            ? v
            : typeof v === 'string'
              ? Number(v)
              : (v?.count ?? v?.total ?? null);
        return {
          label,
          value: label,
          count: Number.isFinite(count) ? count : null,
        };
      })
      .filter(Boolean);
  }

  return [];
}

function normalizeCourses(d) {
  const raw =
    d?.courses ??
    d?.courseRecommendations ??
    d?.recommendations?.courses ??
    d?.cards?.courses ??
    d?.ui?.courses ??
    [];
  return Array.isArray(raw) ? raw : [];
}

function normalizePromotions(d) {
  const raw =
    d?.promotions ??
    d?.promotionCards ??
    d?.recommendations?.promotions ??
    d?.cards?.promotions ??
    d?.ui?.promotions ??
    [];
  return Array.isArray(raw) ? raw : [];
}

/**
 * The error the panel renders.
 *
 * `code` is carried separately from the message because the panel treats
 * `chat_unavailable` — the service was never configured — as a calm "chat is
 * off" state rather than a fault. Without the code the two are one red box.
 */
export class ChatRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ChatRequestError';
    this.code = code || 'unknown';
  }
}

export async function sendChat({ sessionId, message, history }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message, history: asArray(history) }),
    cache: 'no-store',
  });

  const raw = await res.json().catch(() => ({}));

  if (!res.ok) {
    // The route answers `{ error: <code>, message: <Thai prose> }`. Prefer the
    // prose — review-app read `error` first, which would surface a machine code
    // like "upstream_timeout" to the user as their error message.
    throw new ChatRequestError(
      raw?.message || raw?.error || `Chat request failed (${res.status})`,
      raw?.error,
    );
  }

  const d = unwrap(raw);

  return {
    raw,
    reply: String(pickText(d) || '').trim(),
    quickReplies: normalizeQuickReplies(d),
    courses: normalizeCourses(d),
    promotions: normalizePromotions(d),
  };
}

export async function sendChatFeedback(payload) {
  // Never throws for the caller's benefit — a rating is a courtesy the user does
  // us, and the route already guarantees a 200. This is belt for a network drop.
  try {
    await fetch('/api/chat/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    // swallowed on purpose
  }
}
