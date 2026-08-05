// src/lib/chat/contactLinks.js
//
// ── THIS LINKIFIES CONTACT PATTERNS. IT IS NOT A MARKDOWN OR HTML RENDERER. ──
//
// Read that before adding anything.
//
// It finds three shapes in plain text — an email address, a Thai phone number,
// a bare http(s) URL — and reports where they are. It emits DATA, not markup:
// the caller turns segments into React elements, so every piece of upstream text
// ends up as a React text node, which React escapes. There is no HTML anywhere
// in this path and no dangerouslySetInnerHTML; a guard in test/fs/chatWiring
// asserts that stays true.
//
// If someone wants bold, headings, images or arbitrary markup: DIFFERENT
// decision, different risk profile, and this file is not the precedent. The
// argument "we already turn things into links" is exactly the increment this
// note exists to stop — turning `a@b.com` into a mailto we BUILT is not the same
// act as rendering a string upstream supplied as markup.
//
// ── WHO OWNS EACH href ──────────────────────────────────────────────────────
// The distinction that matters for safety:
//
//   email  we build `mailto:` + the matched text.  href is OURS.
//   phone  we build `tel:` + the matched digits.   href is OURS.
//   url    the href comes from UPSTREAM.           href is THEIRS → allowlisted.
//
// Only the third can carry a scheme we did not choose, so only the third is
// validated. See safeHttpHref, and the note there about which check is actually
// load-bearing.

/** A bare absolute URL. Deliberately scheme-anchored — see safeHttpHref. */
const URL_SRC = 'https?:\\/\\/[^\\s<>"\'`]+';

/** An email address. Requires a dotted domain so `a@b` is not a match. */
const EMAIL_SRC = '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+';

/**
 * A Thai phone number: `+66` followed by 8–9 more digits, or a leading `0`
 * followed by 8–9 more, with optional spaces or dashes between digits.
 *
 * The 9–10 digit total is what keeps this from eating everything numeric.
 * Checked against real strings that appear in these replies: `14,900 ฿` (no
 * leading 0), `GEN-AI-L1` (not numeric), `05-08-2026` (8 digits — one short).
 * A number that is genuinely ambiguous will be missed rather than mangled,
 * which is the right direction: an un-linked phone number is still readable.
 */
const PHONE_SRC = '(?:\\+66[\\s-]?\\d(?:[\\s-]?\\d){7,8}|0\\d(?:[\\s-]?\\d){7,8})';

// URL first: a URL can CONTAIN an @ and digits, and the leftmost-longest
// behaviour of alternation would otherwise split one in half.
const COMBINED = new RegExp(`(${URL_SRC})|(${EMAIL_SRC})|(${PHONE_SRC})`, 'g');

// Trailing punctuation belongs to the sentence, not the URL.
const TRAILING_PUNCT = /[.,;:!?)\]}'"»]+$/;

// NO LOOKBEHIND ANYWHERE IN THIS FILE. It is ES2018 and Safari only shipped it
// in 16.4; this is a public marketing site in Thailand and a regex that throws
// at parse time takes the whole bundle with it. Boundaries are checked by
// looking at the character before the match instead.
const EMAIL_LEFT_BOUNDARY = /[A-Za-z0-9._%+\-@]/;
const DIGIT = /\d/;

/**
 * Validate a URL that came from UPSTREAM.
 *
 * WHICH CHECK IS LOAD-BEARING, stated so nobody mistakes belt for braces: the
 * REGEX is what stops `javascript:` and `data:` — it only matches strings
 * starting `http://` or `https://`, so those never become candidates at all.
 * This allowlist is a second, independent gate on the parsed protocol, and it
 * exists because the regex is a shape check and this is a semantic one. If the
 * pattern is ever widened, this is what keeps the guarantee.
 */
export function safeHttpHref(raw) {
  try {
    const url = new URL(String(raw));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** `tel:` href from matched text — spaces and dashes stripped, `+` kept. */
export function telHref(raw) {
  const digits = String(raw).replace(/[\s-]/g, '');
  return `tel:${digits}`;
}

/**
 * Split `text` into segments the caller can render.
 *
 * Returns `[{ type: 'text'|'email'|'phone'|'url', text, href }]`, where `text`
 * is ALWAYS what the user sees — the original substring, never the normalised
 * href. Adjacent plain text is emitted as-is, so joining every `text` back
 * together reproduces the input exactly. A test asserts that round trip, which
 * is what proves nothing is silently dropped or rewritten.
 */
export function splitContacts(input) {
  const text = String(input ?? '');
  const out = [];
  let last = 0;

  COMBINED.lastIndex = 0;
  let m;
  while ((m = COMBINED.exec(text)) !== null) {
    let [matched] = m;
    let start = m.index;

    // Which alternative fired.
    let type = m[1] ? 'url' : m[2] ? 'email' : 'phone';
    let href = null;

    if (type === 'url') {
      const trimmed = matched.replace(TRAILING_PUNCT, '');
      if (trimmed !== matched) {
        COMBINED.lastIndex = start + trimmed.length; // re-scan the punctuation
        matched = trimmed;
      }
      href = safeHttpHref(matched);
      if (!href) type = 'text';
    } else if (type === 'email') {
      const before = start > 0 ? text[start - 1] : '';
      // An address inside a longer word is not an address.
      if (before && EMAIL_LEFT_BOUNDARY.test(before)) type = 'text';
      else href = `mailto:${matched}`;
    } else {
      const before = start > 0 ? text[start - 1] : '';
      const after = text[start + matched.length] ?? '';
      // Not a fragment of a longer number.
      if (DIGIT.test(before) || DIGIT.test(after)) type = 'text';
      else href = telHref(matched);
    }

    if (type === 'text') {
      // Rejected: leave it in the surrounding prose untouched. Do NOT advance
      // `last` past it — the next flush must still include these characters.
      continue;
    }

    if (start > last) out.push({ type: 'text', text: text.slice(last, start), href: null });
    out.push({ type, text: matched, href });
    last = start + matched.length;
  }

  if (last < text.length) out.push({ type: 'text', text: text.slice(last), href: null });
  return out;
}
