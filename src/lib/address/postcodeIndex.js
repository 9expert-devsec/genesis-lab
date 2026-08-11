/**
 * The ONE reader of the postcode dataset.
 *
 * Imports the DERIVED index (src/data/postcode-index.generated.json), never the
 * nested source. The nested file is the user-maintained input to
 * scripts/derive-postcode-index.mjs and is not shipped to the browser; importing
 * it here would put 352 KB in the bundle and re-do at run time the work the
 * build already did. Nothing fetches either file over the network.
 *
 * ── WHY AN OPTION CARRIES ITS OWN DISTRICT AND PROVINCE ─────────────────────
 * This is the whole point of the shape, and the bug it exists to kill.
 *
 * The old lookup answered a postcode with THREE parallel lists — subDistrictList,
 * districtList, provinceList — and the caller took `districtList[0]` and
 * `provinceList[0]`. That is correct only when a postcode has exactly one
 * district, and 168 of the 966 postcodes have more than one (11 have more than
 * one PROVINCE). On 10110 it filled เขตคลองเตย while offering แขวงพระโขนงเหนือ,
 * which is in เขตวัฒนา — an address that does not exist, submitted with
 * confidence.
 *
 * So there are no parallel lists here. `lookupPostcode` returns ONE array of
 * options, and each option is a complete, self-consistent triple:
 *
 *     { subDistrict, district, province }
 *
 * A caller that spreads the chosen option into its address state gets all three
 * right by construction. Getting it wrong now requires deliberately picking the
 * fields apart, rather than merely forgetting a step.
 */

import INDEX from '@/data/postcode-index.generated.json';

/** A Thai postcode is five digits. */
const POSTCODE_DIGITS = 5;

/**
 * Normalise whatever the input field holds into five digits, or null.
 * The field already strips non-digits; this does not trust that.
 */
function normalisePostcode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === POSTCODE_DIGITS ? digits : null;
}

/**
 * Every subdistrict served by a postcode, each with the district and province
 * that ACTUALLY contain it.
 *
 * @param {string} raw the postcode field value
 * @returns {Array<{ subDistrict: string, district: string, province: string }>}
 *          empty when the postcode is incomplete or absent from the dataset —
 *          the two are told apart by `isKnownPostcode`, not by this returning
 *          null, so callers cannot accidentally treat "no options" as an error.
 */
export function lookupPostcode(raw) {
  const code = normalisePostcode(raw);
  if (!code) return [];
  const rows = INDEX.byPostcode[code];
  if (!rows) return [];
  return rows.map(([subDistrict, districtIdx, provinceIdx]) => ({
    subDistrict,
    district: INDEX.districts[districtIdx],
    province: INDEX.provinces[provinceIdx],
  }));
}

/**
 * Is this postcode in the dataset at all?
 *
 * Kept separate from `lookupPostcode` returning empty because the two questions
 * had DIFFERENT answers under the old dataset and the telemetry split on it: 24
 * of thai-data's 978 records existed as keys carrying nulls, so "present" and
 * "has options" could disagree. In THIS dataset they cannot — every key holds at
 * least one subdistrict — which is why `miss_route` collapses to a single value.
 * See the note in ThaiAddressFields.
 */
export function isKnownPostcode(raw) {
  const code = normalisePostcode(raw);
  return code !== null && Object.prototype.hasOwnProperty.call(INDEX.byPostcode, code);
}

/**
 * The district/province a postcode implies WITHOUT a subdistrict choice, or null
 * when it implies none.
 *
 * Returns a value only when every option agrees — one district and one province
 * across the whole postcode. When they disagree this returns null, and the
 * caller must leave the fields blank until the customer picks a subdistrict.
 *
 * That is the deliberate ruling: on a multi-district postcode there is no
 * "probably right" answer to fill in. Filling the first district would be right
 * for some customers and silently wrong for others, and wrong-but-filled is
 * worse than blank — a blank field asks to be completed, a wrongly-filled one
 * does not.
 */
export function unambiguousLocation(raw) {
  const options = lookupPostcode(raw);
  if (options.length === 0) return null;
  const first = options[0];
  const agrees = options.every(
    (o) => o.district === first.district && o.province === first.province
  );
  return agrees ? { district: first.district, province: first.province } : null;
}

/** Dataset totals, for tests and for anyone sizing a change. */
export const POSTCODE_INDEX_STATS = {
  postcodes: Object.keys(INDEX.byPostcode).length,
  provinces: INDEX.provinces.length,
  districtNames: INDEX.districts.length,
};
