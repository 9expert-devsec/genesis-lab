/**
 * PER-FLOW CC / BCC — which env variable each customer mail copies.
 *
 * ══ WHAT THIS REPLACES ═══════════════════════════════════════════════════════
 * `buildCc()` / `buildBcc()` in postmark.js used to read ONE app-wide pair,
 * POSTMARK_{CC,BCC}_EMAILS, on every send — and called
 * `buildCc(undefined)`, so a caller could not even override the CC. Every
 * mail the app sent, whatever the flow, copied the same people. That pair is
 * RETIRED: nothing in src/ reads it any more (test/fs/emailRecipientsWiring
 * holds that), and postmark.js now sends exactly the `cc` / `bcc` it is
 * handed.
 *
 * ── THE ROUTING TABLE ────────────────────────────────────────────────────────
 * The address VALUES live in Vercel. This module only decides which variable
 * a send reads:
 *
 *   flow          kind      CC                                BCC
 *   public        quote     POSTMARK_CC_PUBLIC_EMAILS         POSTMARK_BCC_PUBLIC_EMAILS
 *   public        payment   (same pair — the paid receipt)
 *   inhouse       quote     POSTMARK_CC_INHOUSE_EMAILS        POSTMARK_BCC_INHOUSE_EMAILS
 *   bundle        quote     POSTMARK_CC_BUNDLE_EMAILS         POSTMARK_BCC_BUNDLE_EMAILS
 *   careerpath    quote     POSTMARK_CC_CAREERPATH_EMAILS     POSTMARK_BCC_CAREERPATH_EMAILS
 *   masterclass   quote     POSTMARK_CC_MASTERCLASS_EMAILS    POSTMARK_BCC_MASTERCLASS_EMAILS
 *   masterclass   payment   POSTMARK_CC_MASTERCLASS_EMAILS    POSTMARK_BCC_MASTERCLASS_EMAILS
 *                                                           + POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS
 *
 * The masterclass payment mail is the one place a second BCC list is ADDED on
 * top of the flow's own — the people who need to see money arrive are not the
 * people who need to see every quote. It has no CC of its own.
 *
 * ── THE LIST RULES ───────────────────────────────────────────────────────────
 *   · each variable is a comma-separated list; entries are trimmed, empties
 *     dropped, duplicates removed case-insensitively (first spelling kept);
 *   · an address in CC is removed from BCC — one copy per person, and the
 *     visible header wins;
 *   · empty or unset → that header is `undefined`, so postmark.js omits it.
 *     Never an error: an unconfigured copy is a deployment state.
 *
 * ── UNSET IS LOGGED, ONCE PER SEND, BY NAME ─────────────────────────────────
 * The failure this is built for is a variable missing from Vercel: the mail
 * goes out, the customer is happy, and nobody internal sees it — a silent
 * drop with no symptom. So every variable this resolution consulted and found
 * unset is named at INFO, once per call. `console.info`, not error: an unset
 * list may well be deliberate, and the log line is there to make the choice
 * visible, not to page anyone.
 *
 * ── PURE, WITH `env` INJECTED ────────────────────────────────────────────────
 * `env` defaults to process.env and is a parameter so tests hand in a plain
 * object. The suite runs one process with `isolation: 'none'`; a test that
 * wrote process.env would change what a hundred other files run against.
 */

export const FLOWS = Object.freeze(['public', 'inhouse', 'bundle', 'careerpath', 'masterclass']);
export const KINDS = Object.freeze(['quote', 'payment']);

/** flow → the env-variable stem between `POSTMARK_CC_` / `POSTMARK_BCC_` and `_EMAILS`. */
const STEM = Object.freeze({
  public: 'PUBLIC',
  inhouse: 'INHOUSE',
  bundle: 'BUNDLE',
  careerpath: 'CAREERPATH',
  masterclass: 'MASTERCLASS',
});

/** The one extra BCC list, added on top of the masterclass BCC for its payment mail. */
export const MASTERCLASS_PAYMENT_BCC_VAR = 'POSTMARK_BCC_MASTERCLASS_PAYMENT_EMAILS';

/** The variable names a `(flow, kind)` pair reads, in the order they are read. */
export function recipientVarsFor(flow, kind = 'quote') {
  const stem = STEM[flow];
  if (!stem) throw new Error(`[recipients] unknown flow "${flow}" — expected one of ${FLOWS.join(', ')}`);
  if (!KINDS.includes(kind)) throw new Error(`[recipients] unknown kind "${kind}" — expected one of ${KINDS.join(', ')}`);
  const cc = [`POSTMARK_CC_${stem}_EMAILS`];
  const bcc = [`POSTMARK_BCC_${stem}_EMAILS`];
  if (flow === 'masterclass' && kind === 'payment') bcc.push(MASTERCLASS_PAYMENT_BCC_VAR);
  return { cc, bcc };
}

/**
 * A comma-separated list → trimmed, non-empty, de-duplicated (case-insensitive,
 * first spelling kept) addresses. Non-strings and '' → [].
 */
export function parseAddressList(raw) {
  if (typeof raw !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const part of raw.split(',')) {
    const addr = part.trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

/**
 * `{ cc, bcc }` for one send — each a comma-joined string, or `undefined` when
 * there is nothing to copy. See the header for the rules.
 *
 * @param {'public'|'inhouse'|'bundle'|'careerpath'|'masterclass'} flow
 * @param {{ kind?: 'quote'|'payment', env?: object, log?: Function }} [options]
 */
export function resolveRecipients(flow, { kind = 'quote', env = process.env, log = console.info } = {}) {
  const vars = recipientVarsFor(flow, kind);

  const unset = [];
  const readList = (name) => {
    const raw = env?.[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') unset.push(name);
    return parseAddressList(raw);
  };

  const cc = vars.cc.flatMap(readList);
  const ccKeys = new Set(cc.map((a) => a.toLowerCase()));
  const bccSeen = new Set();
  const bcc = [];
  for (const addr of vars.bcc.flatMap(readList)) {
    const key = addr.toLowerCase();
    if (ccKeys.has(key) || bccSeen.has(key)) continue;
    bccSeen.add(key);
    bcc.push(addr);
  }

  if (unset.length && typeof log === 'function') {
    log(`[recipients] ${flow}/${kind}: no copy — unset: ${unset.join(', ')}`);
  }

  return {
    cc: cc.length ? cc.join(', ') : undefined,
    bcc: bcc.length ? bcc.join(', ') : undefined,
  };
}
