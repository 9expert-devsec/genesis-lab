/**
 * Request forensics — the HTTP evidence a registration arrived with, recorded
 * so a suspicious submission can be traced afterwards.
 *
 * ══ WHY ════════════════════════════════════════════════════════════════════
 *
 * Registrations are arriving from people who were sent SMS "loan" / game
 * top-up lures. Two cases look identical in `ipAddress` + `source: 'web'`:
 *
 *   1. the scammer sends OUR real URL — the browser posts from our own page,
 *      so Origin/Referer are our host and the IP is the victim's;
 *   2. a MIRROR / reverse proxy serves a copy of our site and forwards the
 *      submission to our API — Origin/Referer (if the relay passes them on)
 *      name the mirror, or are missing, and the IP and geo are the relay's
 *      server rather than a Thai mobile network.
 *
 * What tells them apart is recorded here: the Origin and Referer the request
 * carried, the Host it was addressed to, the User-Agent and Accept-Language,
 * the forwarded-for chain, and Vercel's IP geolocation.
 *
 * ── ON VERCEL THE CHAIN IS ONE HOP ────────────────────────────────────────
 * Vercel overwrites `x-forwarded-for` with the connecting IP and does not
 * forward an upstream proxy's chain (docs: "Request headers"). So a relay will
 * NOT show up as a second hop — it shows up as the ONLY hop, with the relay
 * server's IP and Vercel's geo for it. The chain is still stored in full,
 * because off Vercel (local, another host) it is the chain that exposes one.
 *
 * ── SERVER-CAPTURED, NEVER FROM THE BODY ──────────────────────────────────
 * Every value comes from request headers read on the server. Nothing in the
 * request body can set, override or add to it, and no form field — name,
 * email, phone, notes, tax id — is ever copied in. A field the body happens to
 * call `requestMeta` is discarded at every create site (see careerPathPayload,
 * the one create that spreads its payload).
 *
 * ── FLAG, NEVER BLOCK ─────────────────────────────────────────────────────
 * `origin_trusted === false` writes one console.warn (requestMetaFor) and the
 * registration proceeds. What a legitimate submission from an in-app browser
 * (LINE, Facebook) sends is not yet known, and turning away a real customer is
 * worse than recording a fraudulent one. Blocking is a later decision.
 *
 * PURE apart from that warn. No Next, no Mongoose — the headers argument only
 * needs `.get(name)`, so a WHATWG Headers, the object `headers()` returns, and
 * the test stub all work.
 */

import { escapeRegex } from '@/lib/searchTerm';

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Per-field caps. These stop a hand-built request parking a megabyte on a record. */
const MAX = {
  origin: 200,
  referer_host: 200,
  referer_path: 200,
  host: 200,
  user_agent: 300,
  accept_language: 100,
  forwarded_for: 300,
  vercel_ip_country: 100,
  vercel_ip_city: 100,
};

/** Display and storage order. `origin_trusted` is derived, so it comes last. */
export const REQUEST_META_KEYS = [...Object.keys(MAX), 'origin_trusted'];

/**
 * Origins a genuine submission is posted from. `*` matches one host label
 * fragment (letters, digits, hyphens) — or, after `localhost:`, the port.
 *
 *   · the production site, with and without www;
 *   · genesis-lab.9expert.app — this project's preview/staging domain, named
 *     in src/lib/seo/siteUrl.js;
 *   · genesis-lab-*.vercel.app — Vercel's per-deployment and per-branch URLs
 *     for the `genesis-lab` project (.vercel/repo.json). The team suffix is
 *     not recorded anywhere in this repo, so the pattern stops at the project
 *     prefix; it is anchored at the start of the host, so
 *     `evil-genesis-lab-x.vercel.app` does not match;
 *   · http://localhost:* — development only. Absent from a production build,
 *     where a request claiming a localhost origin is not one of ours.
 */
export const TRUSTED_ORIGINS = Object.freeze([
  'https://www.9experttraining.com',
  'https://9experttraining.com',
  'https://genesis-lab.9expert.app',
  'https://genesis-lab-*.vercel.app',
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:*']),
]);

// The repo's one escape helper (test/fs/searchTermEscapeSweep); `\*` is then
// widened back into the wildcard.
const patternFor = (entry) =>
  new RegExp(`^${escapeRegex(entry).replace(/\\\*/g, '[a-z0-9-]+')}$`);

/**
 * True when `origin` (scheme://host[:port], no path) matches an entry of
 * `list`. Exported with the list as a parameter so the production list — no
 * localhost — can be tested from a test process.
 */
export function matchesTrustedOrigin(origin, list = TRUSTED_ORIGINS) {
  if (typeof origin !== 'string' || !origin) return false;
  const value = origin.trim().toLowerCase().replace(/\/+$/, '');
  return list.some((entry) => patternFor(entry.toLowerCase()).test(value));
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

function read(headers, name) {
  try {
    const value = headers?.get?.(name);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function decodeCity(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is still evidence; keep it as it arrived.
    return value;
  }
}

/**
 * The request's forensic fields, from its headers. Never throws; omits every
 * field that is empty; returns `{}` when there is nothing at all.
 */
export function buildRequestMeta(headers) {
  try {
    const meta = {};
    const put = (key, raw) => {
      const value = clean(raw, MAX[key]);
      if (value) meta[key] = value;
    };

    put('origin', read(headers, 'origin'));

    // Referer: HOST and PATH only. The query string can carry anything —
    // tracking ids, a prefilled form, a token — and is never stored.
    let refererOrigin = '';
    const referer = read(headers, 'referer');
    if (referer) {
      try {
        const url = new URL(referer);
        put('referer_host', url.hostname);
        put('referer_path', url.pathname);
        refererOrigin = url.origin;
      } catch {
        // Unparseable: no host, no path. The raw value is not stored.
      }
    }

    put('host', read(headers, 'x-forwarded-host') || read(headers, 'host'));
    put('user_agent', read(headers, 'user-agent'));
    put('accept_language', read(headers, 'accept-language'));
    put('forwarded_for', read(headers, 'x-forwarded-for'));
    put('vercel_ip_country', read(headers, 'x-vercel-ip-country'));
    put('vercel_ip_city', decodeCity(read(headers, 'x-vercel-ip-city')));

    // Judged on the Origin header when present; otherwise on the Referer's
    // origin. With neither, there is nothing to judge and the key is omitted —
    // "unknown" is not "untrusted".
    if (meta.origin) meta.origin_trusted = matchesTrustedOrigin(meta.origin);
    else if (refererOrigin) meta.origin_trusted = matchesTrustedOrigin(refererOrigin);

    return meta;
  } catch {
    return {};
  }
}

/**
 * The create-site helper: build the meta and, when its origin is untrusted,
 * write ONE warn line to the runtime log. The line names the registration
 * kind and the three host-level fields only — no personal data.
 */
export function requestMetaFor(kind, headers) {
  const meta = buildRequestMeta(headers);
  if (meta.origin_trusted === false) {
    console.warn('[registration] untrusted origin', {
      kind,
      origin: meta.origin,
      referer_host: meta.referer_host,
      host: meta.host,
    });
  }
  return meta;
}

/** `{ requestMeta }` to spread into a create payload, or `{}` when empty. */
export function requestMetaField(meta) {
  return meta && typeof meta === 'object' && Object.keys(meta).length ? { requestMeta: meta } : {};
}

// ── Admin display ───────────────────────────────────────────────────────────

export const REQUEST_META_TITLE = 'ข้อมูลคำขอ (สำหรับตรวจสอบ)';
export const REQUEST_META_EMPTY_LABEL = 'ไม่มีข้อมูล (ลงทะเบียนก่อนเริ่มเก็บ)';
export const UNTRUSTED_ORIGIN_LABEL = 'ต้นทางไม่น่าเชื่อถือ';

const LABELS = {
  origin: 'Origin',
  referer_host: 'Referer host',
  referer_path: 'Referer path',
  host: 'Host',
  user_agent: 'User-Agent',
  accept_language: 'Accept-Language',
  forwarded_for: 'X-Forwarded-For',
  vercel_ip_country: 'ประเทศ (Vercel)',
  vercel_ip_city: 'เมือง (Vercel)',
  origin_trusted: 'ต้นทางเชื่อถือได้',
};

/**
 * The one display model the four admin detail views share. null when the
 * record has none (filed before this existed). Every field gets a row; a
 * missing value is '' — never "undefined" / "null" — so the view's empty
 * rendering applies.
 */
export function requestMetaSummary(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (!REQUEST_META_KEYS.some((k) => meta[k] != null && meta[k] !== '')) return null;
  const trusted = meta.origin_trusted;
  return {
    untrusted: trusted === false,
    rows: REQUEST_META_KEYS.map((key) => ({
      label: LABELS[key],
      value:
        key === 'origin_trusted'
          ? trusted === true ? 'ใช่' : trusted === false ? 'ไม่ใช่' : ''
          : typeof meta[key] === 'string' ? meta[key] : '',
    })),
  };
}
