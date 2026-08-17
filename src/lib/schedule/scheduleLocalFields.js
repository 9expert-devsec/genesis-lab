/**
 * The Genesis-only sidecar's write shape — WHICH KEYS A SAVE MAY TOUCH.
 *
 * Dependency-free ON PURPOSE — no `next/*`, no db, no models, no React — the
 * same rule as monthWindow.js and roundDateLabel.js beside it, so the one rule
 * that decides whether a stored value survives a save can be exercised in the
 * `pure` tier without a Mongo connection.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO REMOVE ─────────────────────────────────
 * `upsertLocal` built its `$set` unconditionally:
 *
 *     max_seats:      toNullableNum(formData.get('max_seats')),
 *     price_override: toNullableNum(formData.get('price_override')),
 *     instructor_ids: toStrArr(formData.getAll('instructor_ids')),
 *
 * `FormData.get` returns `null` for a key that was never sent, and
 * `toNullableNum(null)` is `null`; `getAll` returns `[]`, and `toStrArr([])` is
 * `[]`. So a save that did not mention a field WROTE OVER IT ANYWAY — a stored
 * `max_seats: 30` became `null` and a stored instructor roster became empty,
 * with no admin having typed anything. The form's silence was being recorded as
 * an instruction to erase.
 *
 * That was survivable only while every one of those inputs was on screen and
 * every save carried all three. The moment an input is removed — which is what
 * happened to จำนวนที่นั่ง and วิทยากร — the same code turns every ordinary
 * edit into a silent data loss on the five rows that have a seat count and the
 * four that have a roster.
 *
 * ── THE RULE, AND IT IS A PRESENCE RULE, NOT AN EMPTINESS RULE ──────────────
 * A key PRESENT in the form means the form is authoritative for that field —
 * INCLUDING when its value is empty, which is how an admin clears a price back
 * to "use the course's normal price". A key ABSENT means the form has no
 * opinion and the stored value must be left exactly as it is.
 *
 * Emptiness is therefore NOT the test. `has()` is. Reading `''` as "leave
 * alone" would make a field impossible to clear; reading absence as "set null"
 * is the defect above. Only the two together are correct, and they are two
 * different questions about the same key.
 */

/** Trim to a string; `null`/`undefined` become `''`. */
export function toStr(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

/**
 * A list of non-empty strings from a repeated field, a comma string, or an
 * array. Anything else is an empty list.
 */
export function toStrArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.length > 0) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * A positive finite number, or `null`.
 *
 * `null` for zero and for negatives as well as for blanks — a seat cap of 0 and
 * a price of 0 are both "not declared" rather than real values, and the schema
 * stores `null` for that. Unchanged from the copy this replaced.
 */
export function toNullableNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The sidecar keys a schedule form is allowed to write, in schema order.
 *
 * Named rather than inlined because THREE places have to agree about this list:
 * the `$set` builder below, the audit trail's `after` snapshot, and the pure
 * test that proves a removed input sends nothing. A fourth copy is how one of
 * them starts clobbering again.
 */
export const SIDECAR_KEYS = ['max_seats', 'price_override', 'instructor_ids'];

/**
 * The `$set` fragment for a schedule's sidecar — ONLY the keys the form sent.
 *
 * @param {FormData} formData the submitted form
 * @returns {{max_seats?: number|null, price_override?: number|null,
 *   instructor_ids?: string[]}} a partial object. A key is ABSENT — not null,
 *   not `[]` — when the form did not carry it, so a `$set` built from this
 *   cannot touch the stored value.
 *
 * ── WHY IT RETURNS A PARTIAL AND NOT A FULLY-POPULATED OBJECT ───────────────
 * A caller cannot tell "the admin cleared this" from "the form never had this"
 * by looking at a value — both arrive as `null`. It can only be told by whether
 * the KEY is there, so that distinction has to survive into the return value
 * rather than being flattened on the way out. `'max_seats' in result` is the
 * question every consumer actually has, and it is answerable here and nowhere
 * downstream.
 */
export function sidecarSetFields(formData) {
  const out = {};
  if (!formData || typeof formData.has !== 'function') return out;

  if (formData.has('max_seats')) {
    out.max_seats = toNullableNum(formData.get('max_seats'));
  }
  if (formData.has('price_override')) {
    out.price_override = toNullableNum(formData.get('price_override'));
  }
  // `getAll`, not `get`: the roster is a repeated field, and `get` would keep
  // only the first instructor. `has` still answers presence for a repeated key.
  if (formData.has('instructor_ids')) {
    out.instructor_ids = toStrArr(formData.getAll('instructor_ids'));
  }
  return out;
}
