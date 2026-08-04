/**
 * ONE predicate for "this field must be filled in English".
 *
 * Used by the 'Other country' branch of BOTH quotation/invoice schemas
 * (src/lib/schemas/register-inhouse.js and src/lib/schemas/register-public.js).
 * A foreign quotation is typeset by a person who cannot read Thai, so a Thai
 * company name or street in that branch reaches the customer as boxes.
 *
 * ── EXCLUSION, NOT AN ALLOWLIST — THIS IS THE WHOLE POINT ───────────────────
 * The tempting implementation is `/^[A-Za-z0-9 ]+$/`. It is WRONG, and wrong in
 * the direction that silently blocks legitimate customers:
 *
 *     Côte d'Ivoire   — accented Latin, a real country
 *     A/S             — the Danish company suffix
 *     #12-04          — a Singapore unit number
 *     São Paulo, Ñuñoa, Zürich, O'Brien & Sons
 *
 * Every one of those is rejected by an allowlist and accepted here. So the rule
 * is stated as the thing we actually object to: a codepoint in the Thai block,
 * U+0E00–U+0E7F. Everything else — Latin, accents, punctuation, digits, CJK —
 * passes. A control test pins that an allowlist implementation reddens the
 * accepted cases, so this cannot quietly regress into one.
 *
 * PURE: no env, no db, no network.
 */

/** The Unicode Thai block. Nothing else is inspected. */
const THAI_BLOCK = /[฀-๿]/;

export const ENGLISH_ONLY_MESSAGE = 'กรุณากรอกเป็นภาษาอังกฤษ';

/**
 * Does `value` contain at least one Thai character, ANYWHERE in it?
 *
 * Mid-value matters: 'ACME (ไทย) Co., Ltd.' is the realistic failure, not a
 * wholly-Thai string, so this is a search and not an anchored match.
 *
 * Non-strings and empty are `false` — "no Thai here". Emptiness is a
 * required-field question and is answered by `.min(1)` on the field itself; if
 * this returned true for '' every optional field in the branch would be
 * unfillable.
 */
export function containsThai(value) {
  if (typeof value !== 'string' || value === '') return false;
  return THAI_BLOCK.test(value);
}

/**
 * Attach the rule to a zod string schema. Takes the schema as an argument
 * rather than importing zod, so this module stays a predicate module.
 *
 * @template T
 * @param {T} schema any zod schema with `.refine`
 * @returns {T}
 */
export function englishOnly(schema) {
  return schema.refine((v) => !containsThai(v), { message: ENGLISH_ONLY_MESSAGE });
}
