/**
 * ONE validator and ONE formatter for a Thai phone number, ported from the
 * legacy PHP implementation's rules (the customer's own rules, not a
 * reinterpretation). Used by BOTH registration flows — Public and In-house —
 * at every field that collects a phone number, client and server alike.
 *
 * PURE: no env, no db, no network, no React, no DOM. The DOM wiring
 * (beforeinput filtering, paste sanitisation, blur formatting) lives in
 * phoneInputProps.js, which imports this module rather than duplicating any
 * of its logic — this repo has been burned twice by a stored machine value
 * rendered raw to a customer (a "2026-09" month key, a "COPILOT-STU" course
 * code), so there is exactly one place that decides what a phone number looks
 * like on screen.
 *
 * ── STEP 1: NORMALISE THE RAW STRING, BEFORE ANYTHING ELSE ──────────────────
 * The "+" is checked on the RAW string — never after stripping non-digits.
 * Stripping first would make "+66 81 234 5678" indistinguishable from a
 * domestic number that happens to start with the digit 6, which is exactly
 * the ambiguity this ordering exists to avoid.
 *
 *   - first non-space character is "+":
 *       "+66" → drop the "66", prepend "0", fall through to the domestic
 *         rules below.            (+66 81 234 5678 → 0812345678)
 *       any other country code → accept as "+" followed by 8-15 digits.
 *         We cannot validate foreign structure and do not try.
 *   - no leading "+" → domestic rules apply to the string UNCHANGED.
 *
 * ── STEP 2: DOMESTIC RULES, AFTER STRIPPING NON-DIGITS ──────────────────────
 *   - 06 / 08 / 09 → exactly 10 digits, no extension.
 *   - 01 / 02 / 03 / 04 / 05 / 07 → exactly 9 digits, plus an OPTIONAL
 *     extension of 1-5 digits (9-14 digits total). The extension is never
 *     parsed out of a separator word for VALIDATION — total digit count is
 *     the whole rule — so "022194304 ต่อ 10155" and a bare 14-digit run
 *     validate identically. The separator only matters for FORMATTING, where
 *     the first 9 digits are always the base number and anything after that
 *     is always the extension, which is well-defined regardless of whether
 *     the customer typed a separator at all.
 *   - anything else → invalid.
 */

/**
 * The character-level allowlist for the client's `beforeinput` filter (see
 * phoneInputProps.js). Digits, the leading "+", common separators, and the
 * INDIVIDUAL characters that spell the extension markers ต่อ / ext / x / #.
 *
 * NOT A WORD-LEVEL CHECK. `beforeinput` fires per inserted character, so this
 * cannot refuse "was that character part of a real 'ต่อ'?" — it can only ask
 * "is this character ever legitimate here?". That admits typing nonsense like
 * "extxอ", which is a real, accepted limitation of a beforeinput filter (see
 * this module's own docstring on why the SERVER, re-running isValidThaiPhone,
 * is the actual gate). What it correctly refuses is any Thai letter outside
 * ต/่/อ and any Latin letter outside e/x/t, which is the whole point: a
 * customer cannot type "เบอร์นี้ไม่มี" or "call me" into this field.
 */
const ALLOWED_PHONE_CHAR = /^[0-9+\-() extตอ่#]$/i;

export function isAllowedPhoneChar(ch) {
  return typeof ch === 'string' && ch.length === 1 && ALLOWED_PHONE_CHAR.test(ch);
}

/** Every disallowed character removed, order preserved. For paste sanitising. */
export function sanitizePhoneText(text) {
  return [...String(text ?? '')].filter(isAllowedPhoneChar).join('');
}

const MOBILE_PREFIXES = new Set(['06', '08', '09']);
const LANDLINE_PREFIXES = new Set(['01', '02', '03', '04', '05', '07']);

/** Step 2, applied to an already-digits-only string. Internal. */
function classifyDomesticDigits(digits) {
  if (!/^\d+$/.test(digits)) return { kind: 'invalid' };
  const prefix = digits.slice(0, 2);
  if (MOBILE_PREFIXES.has(prefix)) {
    if (digits.length === 10) return { kind: 'domestic', base: digits, extension: '' };
    return { kind: 'invalid' };
  }
  if (LANDLINE_PREFIXES.has(prefix)) {
    if (digits.length >= 9 && digits.length <= 14) {
      return { kind: 'domestic', base: digits.slice(0, 9), extension: digits.slice(9) };
    }
    return { kind: 'invalid' };
  }
  return { kind: 'invalid' };
}

/**
 * Steps 1+2, on a raw string. Internal — isValidThaiPhone and formatThaiPhone
 * are both derived from this so the two can never disagree about what counts.
 *
 * @returns {{kind:'domestic', base:string, extension:string}
 *          |{kind:'foreign', digits:string}
 *          |{kind:'invalid'}}
 */
function classify(raw) {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return { kind: 'invalid' };

  if (trimmed[0] === '+') {
    const digitsAfterPlus = trimmed.slice(1).replace(/\D/g, '');
    if (digitsAfterPlus.startsWith('66')) {
      return classifyDomesticDigits(`0${digitsAfterPlus.slice(2)}`);
    }
    if (digitsAfterPlus.length >= 8 && digitsAfterPlus.length <= 15) {
      return { kind: 'foreign', digits: digitsAfterPlus };
    }
    return { kind: 'invalid' };
  }

  return classifyDomesticDigits(trimmed.replace(/\D/g, ''));
}

/** The single predicate every schema attaches via `.refine()`. */
export function isValidThaiPhone(raw) {
  return classify(raw).kind !== 'invalid';
}

/**
 * The single formatter every surface calls — schemas (on write, via
 * `.transform()`), and the client (on blur). Domestic numbers become
 * "0XX-XXX-XXXX" (mobile) or "0X-XXX-XXXX" (landline), with " ต่อ <ext>"
 * appended when an extension is present. A valid foreign number is returned
 * trimmed but otherwise UNCHANGED — its internal structure is unknown, so
 * nothing is regrouped. An invalid value returns `null`: the caller must
 * leave the field exactly as the user typed it and let the validator's error
 * speak, never silently drop or rewrite digits it could not make sense of.
 *
 * IDEMPOTENT: formatting an already-formatted value reproduces it, because
 * digit-stripping ignores the dashes/spaces it already added. This is what
 * lets the server re-validate (and re-format) a value the client already
 * formatted without the two ever disagreeing.
 */
export function formatThaiPhone(raw) {
  const c = classify(raw);
  if (c.kind === 'invalid') return null;
  if (c.kind === 'foreign') return String(raw ?? '').trim();

  const { base, extension } = c;
  const core =
    base.length === 10
      ? `${base.slice(0, 3)}-${base.slice(3, 6)}-${base.slice(6, 10)}`
      : `${base.slice(0, 2)}-${base.slice(2, 5)}-${base.slice(5, 9)}`;
  return extension ? `${core} ต่อ ${extension}` : core;
}

/**
 * Attach the rule to a zod string schema: reject invalid input with `message`,
 * and store the FORMATTED string rather than whatever the customer typed —
 * the storage decision for this ticket. Takes the schema as an argument
 * rather than importing zod, matching englishOnly.js's shape, so this module
 * stays a plain predicate/formatter module.
 *
 * @template T
 * @param {T} schema any zod string schema with `.refine`/`.transform`
 * @param {string} message
 * @returns {T}
 */
export function thaiPhone(schema, message) {
  return schema
    .refine(isValidThaiPhone, message)
    .transform((v) => formatThaiPhone(v) ?? v);
}
