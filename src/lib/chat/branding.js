// src/lib/chat/branding.js
//
// The AI agent's own mark, in ONE place.
//
// ── WHY A CONSTANT AND NOT FOUR STRING LITERALS ─────────────────────────────
// Four chat surfaces draw it — the launcher's icon well, the panel header's
// avatar plate, the welcome hero, and ChatAvatar on every assistant and typing
// row. As literals that is one path written four times that must agree, and
// swapping it again means finding all four. A test asserts no chat component
// contains the raw path.
//
// ── THIS IS NOT THE SITE LOGO ───────────────────────────────────────────────
// /logo/9exp-stand.png is the 9Expert site mark and is UNCHANGED: it is still
// the favicon and apple-touch icon in src/app/layout.jsx, and still the
// `logo` in the Organization JSON-LD on the home page. Those are claims about
// the ORGANISATION. This one is the agent's face, and the two are deliberately
// different marks now — do not "unify" them.
//
// ── THE FILENAME IS LOWERCASE-HYPHEN ON PURPOSE ─────────────────────────────
// It arrived as `AI-Chatbot.png`. Development is on Windows, where the
// filesystem is case-insensitive, and the build is Linux, where it is not — so
// a case mismatch between this string and the file renders perfectly on a dev
// machine and 404s in production. Nothing in this repo loads images, so no test
// would have caught it at runtime; test/fs/chatWiring asserts the exact
// filename against the real directory listing instead, which IS case-sensitive
// even on Windows because it compares strings rather than resolving a path.

/** Public path of the AI agent's mark. */
export const CHAT_MARK_SRC = '/logo/ai-chatbot.png';

/**
 * Accessible name for the ONE place the mark is not decorative.
 *
 * Everywhere else it sits beside text that already names the speaker (the
 * assistant row's "9Expert AI Agent", the typing row's "กำลังพิมพ์…", the
 * launcher's own aria-label), so those render it with alt="" — announcing the
 * logo a second time is noise. The welcome hero has no such neighbour above it.
 */
export const CHAT_MARK_ALT = '9Expert AI Agent';
