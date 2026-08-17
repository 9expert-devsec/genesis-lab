/**
 * FINDING LEGACY URLS INSIDE STORED VALUES.
 *
 * Extracted from scripts/audit-legacy-file-urls.mjs so the AUDIT and the
 * REWRITE share one definition. That is not tidiness. The rewrite replaces
 * character ranges that this module reports; if it found a range one byte
 * different from what the audit measured, the rewrite would corrupt article
 * bodies in a way the audit had already declared safe.
 *
 * Everything here is PURE — no database, no network, no filesystem.
 *
 * ── HOW STRINGS ARE SCANNED ─────────────────────────────────────────────────
 * Article bodies are rich text and routinely carry a dozen legacy `<img src>`
 * in one field, so every string is scanned for ALL matches, not the first. Four
 * passes, in this order, later passes skipping character ranges already claimed:
 *
 *   A. whole-value    the entire trimmed string is a legacy URL. This is the
 *                     `coverUrl` case, and it runs FIRST because it is the only
 *                     pass that can safely accept literal spaces — there is no
 *                     surrounding text for the match to run into.
 *   B. quoted attrs   src="…" / href='…' / poster= / content= …  The quotes
 *                     delimit the value exactly, so literal spaces and
 *                     parentheses inside a filename survive intact.
 *   C. css url(…)     background-image and friends, inline in style attributes.
 *   D. bare scan      everything else. This pass CANNOT allow whitespace — it
 *                     has no delimiter and would run off the end of the URL
 *                     into the prose after it — so a literal space in an
 *                     unquoted, non-attribute URL truncates the match. That is
 *                     the trade, and it is why A/B/C exist to catch the cases
 *                     where a delimiter does exist.
 *
 * Bare matches get trailing punctuation trimmed (sentence periods, commas,
 * unbalanced closing brackets, dangling HTML entities). This can in principle
 * clip a filename that genuinely ends in a period. Judged the better error:
 * over-trimming produces a path a human can spot, under-trimming produces a
 * URL that silently 404s on every check.
 */

import { pathOnly } from './legacy-source-manifest.mjs';

/**
 * THE HOSTNAME WRITTEN IN THE DATABASE. FROZEN. NOT CONFIGURABLE.
 *
 * ══ WHY THIS IS A LITERAL AND MUST STAY ONE ═════════════════════════════════
 *
 * This value does not describe where the old box lives. It describes the TEXT
 * stored inside references in Mongo — `https://www.9experttraining.com/…`,
 * written years ago and unchanged by anything that happens to DNS. The old box
 * is being repointed to a holding domain; not one stored string changes when
 * that happens.
 *
 * So making this env-derived would create a way to SILENTLY STOP MATCHING. The
 * failure has no symptom: every scan still runs, every gate still passes, and
 * the report says zero references found. A full-green run that rewrites nothing
 * looks exactly like a job already done.
 *
 * It changes only if the stored DATA changes — i.e. after a migration that
 * rewrites those strings — and then it changes in the same commit as that
 * migration, deliberately, in a diff someone reads.
 *
 * Contrast LEGACY_PROBE_ORIGIN below, which is the opposite kind of value.
 */
export const LEGACY_MATCH_HOST = 'www.9experttraining.com';

/**
 * The apex form. References are stored on BOTH `www.` and the bare apex, so
 * both must match; deriving the apex here keeps one literal rather than two
 * that have to agree.
 */
const LEGACY_MATCH_APEX = LEGACY_MATCH_HOST.replace(/^www\./i, '');

/** Escape a literal for embedding in a regex source string. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The host fragment BOTH matchers are built from — this module's extraction
 * regexes and legacy-reference-rewrite.mjs's host-stripping regex.
 *
 * Exported as a builder rather than as a regex so the two consumers cannot come
 * to depend on each other's flags, and so they cannot drift: before this, the
 * pattern was written out twice, in two files, with nothing forcing agreement.
 * That is the shape of defect this repo has been bitten by repeatedly.
 */
export function legacyHostPattern() {
  return String.raw`(?:www\.)?${escapeRe(LEGACY_MATCH_APEX)}(?::\d+)?`;
}

/**
 * The box being shut down. Apex and www only.
 *
 * Kept as the apex spelling because it is a LABEL — it names what was scanned,
 * in report metadata and console banners, and nothing matches or probes with it.
 */
export const LEGACY_HOST = LEGACY_MATCH_APEX;

/**
 * WHERE A LIVENESS CHECK SENDS ITS REQUESTS. Env-overridable, on purpose.
 *
 * ══ WHY THIS ONE IS CONFIGURABLE AND THE MATCH HOST IS NOT ══════════════════
 *
 * This names a MACHINE. The old Drupal box keeps serving for 1–3 months after
 * its domain is repointed, so "where do I HEAD to ask whether this file is
 * still there" is about to become a different address from the one written in
 * the data. When that happens the repoint is one environment variable:
 *
 *     LEGACY_PROBE_ORIGIN=https://<holding-domain>
 *
 * The default is TODAY'S value, so setting nothing changes nothing.
 *
 * DO NOT collapse this back into LEGACY_MATCH_HOST. They read alike and they
 * are opposites: one follows the hardware, one describes the data. They were
 * one constant until this split, and the whole point is that they diverge.
 */
export const LEGACY_PROBE_ORIGIN = process.env.LEGACY_PROBE_ORIGIN
  || 'https://www.9experttraining.com';

/**
 * Root-relative bare-webroot files are matched only for these extensions.
 * Images are absent ON PURPOSE — a bare `/foo.png` is far more likely to be an
 * app-local asset than a legacy one, and claiming it would rewrite a path that
 * this site serves itself.
 */
export const WEBROOT_DOC_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'txt', 'csv', 'rtf',
];

/** Recursion guard. BSON cannot cycle, but it can nest absurdly. */
export const MAX_DEPTH = 40;

const HOST_RE = legacyHostPattern();

/** Longest first, so `/files/` never gets classified through `/file`. */
const LEGACY_DIRS = String.raw`(?:sites/default/files|download|images|files|file)`;

const WEBROOT_EXT_RE = `(?:${WEBROOT_DOC_EXTENSIONS.join('|')})`;

/**
 * Two character classes per pass. The bare scan must exclude whitespace (it has
 * no delimiter); the delimited passes must allow it (legacy filenames are full
 * of spaces). `NS` is the same class with `/` removed, for the bare-webroot
 * alternative which by definition has no directory segment.
 *
 * Backtick is written \x60 so this file's own string literals stay readable.
 */
const BARE     = String.raw`[^\s"'<>\\\x60]`;
const BARE_NS  = String.raw`[^\s"'<>\\\x60/]`;
const FULL     = String.raw`[^"'<>\\\x60]`;
const FULL_NS  = String.raw`[^"'<>\\\x60/]`;

/**
 * The three shapes a legacy reference can take, built over a given character
 * class so the bare and delimited passes stay literally the same rule.
 */
function alternatives(C, CNS) {
  return [
    // absolute (http/https) and protocol-relative, on the apex or www host
    `(?:https?:)?//${HOST_RE}(?:/${C}*)?`,
    // root-relative, under a known Drupal content root
    `/${LEGACY_DIRS}/${C}*`,
    // root-relative bare webroot document — no directory segment
    `/${CNS}+\\.${WEBROOT_EXT_RE}(?:[?#]${C}*)?`,
  ];
}

/** Pass D. Global, whitespace-terminated. */
const BARE_RE = new RegExp(alternatives(BARE, BARE_NS).join('|'), 'gi');

/** Pass A / B / C. Anchored, whitespace-tolerant. */
const WHOLE_RE = new RegExp(`^(?:${alternatives(FULL, FULL_NS).join('|')})$`, 'i');

/**
 * True when the ENTIRE string is one legacy URL — the `coverUrl` shape.
 *
 * Exported as a predicate rather than as the regex so callers cannot come to
 * depend on its flags or its `lastIndex`.
 */
export function isWholeLegacyUrl(s) {
  return WHOLE_RE.test(String(s).trim());
}

/** Attribute-delimited values. */
const ATTR_RE = /\b(?:src|href|data-src|data-original|data-href|poster|content|srcset|url)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** CSS `url( … )`, quoted or not. */
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi;

/**
 * A first cheap gate. Running four regexes over every string of every document
 * in the database is the expensive part; almost no string contains any of these
 * needles, and `indexOf` is far cheaper than a regex.
 */
// Lowercased because the gate below tests against `s.toLowerCase()`; the
// literal it replaced was already lowercase, so this is the same needle.
const NEEDLES = [LEGACY_MATCH_APEX.toLowerCase(), '/sites/default/files', '/download/', '/files/', '/file/', '/images/'];

export function mightContainLegacy(s) {
  if (s.length < 6) return false;
  const lower = s.toLowerCase();
  for (const n of NEEDLES) if (lower.includes(n)) return true;
  // The bare-webroot document case has no needle of its own — a short string
  // that looks like `/something.pdf` still has to be tried.
  return s.length < 512 && /^\s*\/[^/]+\.[a-z0-9]{2,5}\s*$/i.test(s);
}

/** Strip trailing junk from an undelimited match. See the header for the trade. */
export function trimTrailingPunctuation(u) {
  let s = u;
  for (;;) {
    const before = s;
    s = s.replace(/(?:&quot;|&apos;|&amp;|&#0*3[49];)$/i, '');
    s = s.replace(/[.,;:!?]+$/, '');
    const opens = (str, ch) => (str.split(ch).length - 1);
    if (s.endsWith(')') && opens(s, '(') < opens(s, ')')) s = s.slice(0, -1);
    if (s.endsWith(']') && opens(s, '[') < opens(s, ']')) s = s.slice(0, -1);
    if (s === before) return s;
  }
}

/**
 * All legacy URLs in one string, with the character range each occupied so a
 * later pass does not report the same bytes twice.
 *
 * Returns `[{ url, start, end }]`, sorted by start. The rewrite depends on
 * these ranges being exact and non-overlapping: it splices replacements into
 * the original string by offset and never re-serialises anything around them.
 */
export function extractLegacyUrls(s) {
  if (!mightContainLegacy(s)) return [];

  const hits = [];
  const claimed = [];
  const overlaps = (a, b) => claimed.some(([x, y]) => a < y && b > x);
  const take = (raw, start, end) => {
    if (!raw) return;
    if (overlaps(start, end)) return;
    claimed.push([start, end]);
    hits.push({ url: raw, start, end });
  };

  // ── pass A: the whole value is the URL (coverUrl, image_url, …) ──────────
  const trimmed = s.trim();
  if (WHOLE_RE.test(trimmed)) {
    const start = s.indexOf(trimmed);
    return [{ url: trimmed, start, end: start + trimmed.length }];
  }

  // ── pass B: quoted HTML attributes ───────────────────────────────────────
  ATTR_RE.lastIndex = 0;
  for (let m; (m = ATTR_RE.exec(s)) !== null; ) {
    const value = m[1] ?? m[2];
    if (value === undefined) continue;
    const inner = value.trim();
    if (!inner || !WHOLE_RE.test(inner)) continue;
    // Locate the value inside the whole match so the range is real.
    const valueStart = m.index + m[0].lastIndexOf(value);
    const innerStart = valueStart + value.indexOf(inner);
    take(inner, innerStart, innerStart + inner.length);
  }

  // ── pass C: css url( … ) ─────────────────────────────────────────────────
  CSS_URL_RE.lastIndex = 0;
  for (let m; (m = CSS_URL_RE.exec(s)) !== null; ) {
    const value = m[1] ?? m[2] ?? m[3];
    if (value === undefined) continue;
    const inner = value.trim();
    if (!inner || !WHOLE_RE.test(inner)) continue;
    const valueStart = m.index + m[0].lastIndexOf(value);
    const innerStart = valueStart + value.indexOf(inner);
    take(inner, innerStart, innerStart + inner.length);
  }

  // ── pass D: bare scan ────────────────────────────────────────────────────
  BARE_RE.lastIndex = 0;
  for (let m; (m = BARE_RE.exec(s)) !== null; ) {
    const raw = trimTrailingPunctuation(m[0]);
    if (!raw) continue;
    take(raw, m.index, m.index + raw.length);
    // Zero-length safety: the alternatives can technically match an empty tail.
    if (m[0].length === 0) BARE_RE.lastIndex += 1;
  }

  hits.sort((a, b) => a.start - b.start);
  return hits;
}

/**
 * Reduce a stored form to the path it names on the legacy box. Scheme and host
 * are dropped (every match is on that host by construction); query and fragment
 * are KEPT, because they cannot be reconstructed once thrown away.
 */
export function toPath(raw) {
  let s = raw;
  s = s.replace(/^https?:/i, '');
  if (s.startsWith('//')) {
    s = s.slice(2);
    const slash = s.indexOf('/');
    s = slash === -1 ? '/' : s.slice(slash);
  }
  if (!s.startsWith('/')) s = `/${s}`;
  return s;
}

/**
 * The human-readable form of a stored path. Two layers come off: HTML entity
 * escaping (`&amp;` in a value that was serialised into markup) and percent
 * encoding. Both are derived — the raw stored form is kept separately.
 */
export function decodePath(p) {
  const unentitied = p.replace(/&amp;/gi, '&');
  try {
    return { decoded: decodeURIComponent(unentitied), decodeFailed: false };
  } catch {
    return { decoded: unentitied, decodeFailed: true };
  }
}

export function classifyRoot(decodedPath) {
  const clean = pathOnly(decodedPath);
  const segments = clean.split('/').filter(Boolean);
  if (segments.length === 0) return 'other';                 // bare host, no file
  if (clean.toLowerCase().startsWith('/sites/default/files/')) return 'sites-default-files';
  if (segments.length === 1) return segments[0].includes('.') ? 'webroot-file' : 'other';
  const head = segments[0].toLowerCase();
  if (head === 'download') return 'download';
  if (head === 'file') return 'file';
  if (head === 'files') return 'files';
  if (head === 'images') return 'images';
  return 'other';
}

/** True for a `/sites/default/files/articles/cover/…` path — an ORIGINAL cover. */
export function isArticleCoverPath(decodedPath) {
  return /^\/sites\/default\/files\/articles\/cover\//i.test(pathOnly(decodedPath));
}

/**
 * Visit every string in a BSON document, with its dotted path.
 * `content.blocks.3.html` — array indices are path segments like any other, so
 * the location can be pasted straight into a Mongo query.
 *
 * BSON leaf types (ObjectId, Decimal128, Binary, Date, Buffer) are skipped
 * rather than recursed into: they have internal object shape that is not
 * document structure, and walking it would invent field paths that do not
 * exist.
 */
export function walkStrings(value, dotted, visit, depth, stats) {
  if (typeof value === 'string') { visit(value, dotted); return; }
  if (value === null || typeof value !== 'object') return;
  if (value._bsontype || value instanceof Date || Buffer.isBuffer(value)) return;
  if (depth >= MAX_DEPTH) { stats.depthTruncations += 1; return; }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      walkStrings(value[i], dotted ? `${dotted}.${i}` : String(i), visit, depth + 1, stats);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    walkStrings(value[key], dotted ? `${dotted}.${key}` : key, visit, depth + 1, stats);
  }
}
