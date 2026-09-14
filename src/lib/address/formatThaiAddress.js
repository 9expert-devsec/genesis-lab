/**
 * One Thai address object → one line, WITH the administrative-division prefixes.
 *
 * ── WHY THIS IS ITS OWN FUNCTION ────────────────────────────────────────────
 * The prefix rule is the only thing in this repo that knows ตำบล from แขวง, and
 * it used to live inside `formatBillingAddress`. That made it reachable only by
 * callers willing to describe their data as an *invoice*, which is why the
 * in-house flow — whose addresses are a quotation address and a training VENUE
 * — hand-rolled `[...].filter(Boolean).join(' ')` at four sites instead, and
 * mailed customers `เชียงยืน เมืองอุดรธานี อุดรธานี 41000`: no prefixes, and no
 * way for a reader to tell the sub-district from the district.
 *
 * So the rule is extracted and the wrapper keeps its name. `formatBillingAddress`
 * still owns the invoice SHAPE — the TH/OTHER branch, the international field
 * order, the `country ?? 'TH'` default — and calls this for its Thai half.
 *
 * ── BANGKOK IS A DIFFERENT VOCABULARY, NOT A DIFFERENT FORMAT ───────────────
 * Bangkok's subdivisions are แขวง/เขต; every other province uses ตำบล/อำเภอ,
 * and only the provinces take the จังหวัด prefix — "จังหวัดกรุงเทพมหานคร" is
 * wrong, which is why the Bangkok branch emits the province bare.
 *
 * Detected with `startsWith('กรุงเทพ')` rather than an equality test, because
 * the stored string is sometimes 'กรุงเทพมหานคร' and sometimes 'กรุงเทพฯ'.
 * Carried over verbatim from formatBillingAddress; this function is a MOVE, not
 * a rewrite, and the public flow's output is asserted unchanged.
 *
 * ── A VENUE CALLS THIS DIRECTLY, AND MUST ───────────────────────────────────
 * Not `formatBillingAddress`. Round 3 of this project shipped a bug where the
 * billing address rendered under a สถานที่จัดอบรม heading — a customer being
 * told their course would be held at their accounts department — and the fix
 * was to keep the two concepts apart BY NAME (see `training_venue` in
 * src/lib/email/models/inhouseRegistrationModel.js). Routing a venue through a
 * function called "billing" reintroduces exactly the naming that caused it,
 * even though the string would come out right. The shared thing is the prefix
 * rule, and that is what this function is.
 *
 * ── IDEMPOTENT: A VALUE THAT ALREADY CARRIES ITS PREFIX IS NOT PREFIXED AGAIN ─
 * Measured, not supposed. `src/data/postcode-index.generated.json` carries the
 * prefix on some values and not others: every district ("เขตพญาไท",
 * "อำเภอเมืองอุดรธานี"), 178 of 5,883 sub-districts (Bangkok's "แขวง…" only,
 * never a "ตำบล…"), and no province. Rows written before that dataset landed
 * are bare; rows written after carry whatever the picker gave them. So the
 * stored data holds BOTH shapes, and a formatter that always prepends mailed
 * customers "แขวงแขวงสามเสนใน เขตเขตพญาไท".
 *
 * The rule: strip ANY administrative prefix that is valid for the field, then
 * apply the branch's own. Any, not just the one about to be added — a stored
 * "เขตสะพานสูง" reaching the non-Bangkok branch (the province blank, or typed
 * as something other than กรุงเทพ…) must become "อำเภอสะพานสูง", not
 * "อำเภอเขตสะพานสูง". Sub-district strips แขวง|ตำบล, district strips
 * เขต|อำเภอ, province strips จังหวัด. Only a LEADING prefix is stripped, so a
 * name that merely contains the syllables ("เขตร์" is not a prefix of
 * anything real, but the guard is the anchor, not a word list) is untouched.
 *
 * The prefix logic itself stays: before it existed the in-house flow mailed
 * "เชียงยืน เมืองอุดรธานี อุดรธานี 41000". And the stored rows are NOT
 * backfilled — render-time idempotency already fixes every one of them, and a
 * Mongo write would buy nothing a reader can see. Stripping at derivation
 * time in scripts/derive-postcode-index.mjs is a later, separate change: it
 * breaks that script's derived-vs-source round-trip invariant.
 *
 * Pure: no env, no db, no `new Date()`.
 *
 * @param {{addressLine?: string, subDistrict?: string, district?: string,
 *          province?: string, postalCode?: string}} [address]
 * @returns {string} single-line address, `''` when there is nothing to render
 */
export function formatThaiAddress(address) {
  const raw = address ?? {};
  const a = {
    ...raw,
    subDistrict: stripPrefix(raw.subDistrict, SUB_DISTRICT_PREFIXES),
    district:    stripPrefix(raw.district, DISTRICT_PREFIXES),
    province:    stripPrefix(raw.province, PROVINCE_PREFIXES),
  };
  const province = a.province || '';
  const isBangkok = province.startsWith('กรุงเทพ');

  const parts = isBangkok
    ? [
        a.addressLine,
        a.subDistrict && `แขวง${a.subDistrict}`,
        a.district && `เขต${a.district}`,
        province,
        a.postalCode,
      ]
    : [
        a.addressLine,
        a.subDistrict && `ตำบล${a.subDistrict}`,
        a.district && `อำเภอ${a.district}`,
        province && `จังหวัด${province}`,
        a.postalCode,
      ];

  return parts.filter(Boolean).join(' ');
}

/** Every prefix a field may legitimately arrive with — both vocabularies, not just the branch's own. */
export const SUB_DISTRICT_PREFIXES = Object.freeze(['แขวง', 'ตำบล']);
export const DISTRICT_PREFIXES     = Object.freeze(['เขต', 'อำเภอ']);
export const PROVINCE_PREFIXES     = Object.freeze(['จังหวัด']);

/**
 * The bare name: the value with one LEADING administrative prefix removed, or
 * the value as given when it carries none. Whitespace around the value and
 * between the prefix and the name is dropped, so "แขวง สามเสนใน" and
 * "แขวงสามเสนใน" both yield "สามเสนใน". Non-strings pass through untouched so
 * the `a.x && …` guards above keep their existing falsy behaviour.
 *
 * @param {unknown} value
 * @param {readonly string[]} prefixes
 * @returns {unknown} the bare string, or `value` unchanged when it is not a string
 */
export function stripPrefix(value, prefixes) {
  if (typeof value !== 'string') return value;
  const s = value.trim();
  for (const p of prefixes) {
    if (s.startsWith(p)) return s.slice(p.length).trim();
  }
  return s;
}
