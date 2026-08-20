/**
 * EACH SOURCE KEEPS ITS OWN FILTERS, AND THE URL CARRIES BOTH SETS.
 *
 * ══ THE DEFECT ══════════════════════════════════════════════════════════════
 *
 * One set of filters spanned both sources, so switching Public ↔ In-house
 * carried the values across. The same parameter names different things on each
 * side — the search covers different FIELDS, the course options are different
 * vocabularies, the date is a different field — so carrying a value across
 * carries the WRONG QUESTION across. What the user saw was an empty table with
 * a filter still showing the value that emptied it, which reads as lost data.
 *
 * ══ WHERE THE INACTIVE SOURCE'S VALUES LIVE: THE URL, NAMESPACED ════════════
 *
 * Not browser storage. The filters are already URL-derived on this screen by
 * ruling — see urlFilterNoState — and that ruling buys two things storage
 * cannot: a pasted link restores exactly what the sender saw, and a filter can
 * never disagree with the rows because there is no second copy to go stale.
 * Moving half the filters into sessionStorage would keep the letter of "no
 * useState" while losing the property the rule exists for.
 *
 * ══ THE NAMESPACE IS BY SOURCE IDENTITY, NOT BY WHICH IS ACTIVE ═════════════
 *
 *     public   → the BARE names:  ?q=excel&status=paid&range=today
 *     in-house → prefixed:        ?inhouse.q=acme&inhouse.status=new
 *     source   → unprefixed, and selects which set is on screen
 *
 * So a full URL reads:
 *
 *     /admin/registrations?source=inhouse&q=excel&inhouse.q=acme
 *
 * — public is filtered to "excel", in-house to "acme", and in-house is showing.
 *
 * ── WHY IDENTITY AND NOT ACTIVE/INACTIVE ──────────────────────────────────
 * The obvious alternative is "the active source uses bare names, the inactive
 * one is prefixed". It reads more naturally and it is WORSE, because switching
 * source then has to REWRITE BOTH SETS — move six values out of the bare names
 * and six others in — on every toggle click. Every value is in flight on every
 * switch, and a bug in that rewrite loses a filter silently.
 *
 * Keying on identity makes switching a ONE-PARAMETER CHANGE: set `source`, touch
 * nothing else. No value moves, so no value can be dropped. That is the whole
 * argument, and it is why the asymmetry below is worth its cost.
 *
 * ── WHAT IT COSTS, STATED ─────────────────────────────────────────────────
 *  1. THE NAMES ARE ASYMMETRIC. `q` is public's and `inhouse.q` is in-house's,
 *     which is not guessable from the URL alone — reading `?source=inhouse&q=x`
 *     it looks like `q` should apply, and it does not.
 *  2. A URL CAN CARRY FILTERS FOR A SOURCE THAT IS NOT SHOWING. That is the
 *     feature, but it means the query string is longer than the visible state,
 *     and a user editing it by hand can be surprised.
 *  3. IT IS NOT SYMMETRIC-BY-DESIGN, it is symmetric-by-fallback-avoidance. The
 *     symmetric option — `public.q` AND `inhouse.q`, with bare `q` read as a
 *     legacy alias — was rejected because every existing bookmark then depends
 *     on a fallback rule, and a fallback rule is a second way to spell one thing.
 *
 * ── WHAT IT BUYS ──────────────────────────────────────────────────────────
 * EVERY EXISTING LINK STILL WORKS. `?q=excel&status=paid` is public's filters,
 * which is exactly what it meant before this change, because public keeps the
 * bare names. No bookmark breaks and no redirect is needed.
 *
 * ══ A BARE /admin/registrations ═════════════════════════════════════════════
 * No parameters at all: `source` defaults to public, every bare name is absent
 * so public is unfiltered, every `inhouse.` name is absent so in-house is
 * unfiltered too. BOTH SIDES UNFILTERED, and switching finds nothing left over.
 */

/** The two collections. `source` itself is never namespaced. */
export const SOURCE_VALUES = Object.freeze(['public', 'inhouse']);

/**
 * EVERY PER-SOURCE PARAMETER, BY NAME. The single enumeration.
 *
 * ── ONE RULE, NO EXCEPTIONS, AND `status` IS THE TEMPTING ONE ─────────────
 * "A status means the same thing on both sides" is TRUE for the three shared
 * values and it is still not worth a special case: a user cannot predict which
 * filters survive a toggle and which do not, and a rule with one exception is
 * remembered as no rule at all. Every filter is per-source.
 *
 * It also removes a wart rather than adding one. The toggle used to navigate
 * with `status: 'all'` hard-coded, because the two vocabularies are different
 * subsets and carrying `paid` to in-house produced an empty list — so switching
 * DESTROYED the public status. Now each side keeps its own and nothing is
 * discarded on the way.
 *
 * ── `page` IS HERE, THOUGH IT IS NOT A FILTER ─────────────────────────────
 * Page 3 of public is not page 3 of in-house, and landing on an out-of-range
 * page after a toggle shows an empty table for exactly the reason this whole
 * change exists. Namespacing it costs nothing and removes the toggle's other
 * hard-coded reset.
 *
 * ── `source` IS DELIBERATELY ABSENT ───────────────────────────────────────
 * Same reasoning `SCOPE_PARAMS` gives for excluding it from the query scope: it
 * SELECTS THE COLLECTION rather than filtering within one. A namespaced
 * `inhouse.source` would be nonsense.
 */
export const PER_SOURCE_PARAMS = Object.freeze([
  'status', 'q', 'range', 'from', 'to', 'course', 'page',
]);

/** The value that means "not set", per parameter. Absent from the URL. */
const DEFAULTS = Object.freeze({
  status: 'all', q: '', range: 'all', from: '', to: '', course: '', page: '1',
});

/**
 * The URL key one parameter takes for one source.
 *
 * THE ONE PLACE THE PREFIX IS SPELLED. Both the reader (page.jsx) and the
 * writer (RegistrationsClient's `navigate`) go through here, so the two cannot
 * disagree about what a key is called — which is the failure this screen has
 * shipped repeatedly in other costumes.
 *
 * @param {string} name one of PER_SOURCE_PARAMS
 * @param {string} source 'public' | 'inhouse'
 */
export function filterParamKey(name, source) {
  return source === 'inhouse' ? `inhouse.${name}` : name;
}

/** Is this the value that means "not set"? Such values are absent from the URL. */
export function isDefaultFilterValue(name, value) {
  return String(value ?? '') === DEFAULTS[name];
}

/**
 * One source's filters, read out of a searchParams-shaped object.
 *
 * ── RAW STRINGS, NOT NORMALISED ───────────────────────────────────────────
 * Deliberately. `status`, `range` and `source` are normalised against literal
 * enums BY THE PAGE so the chrome agrees with the rows; `from`, `to` and
 * `course` are normalised by the RESOLVER and the clause builder, because there
 * is no list of valid dates and no list of valid course codes. This function
 * does not get a third opinion on either — it does one job, which is knowing
 * where a source's values are kept.
 *
 * `page` comes back as a string for the same reason: the page already parses it.
 *
 * @param {Record<string, unknown>} sp Next's resolved searchParams, or any
 *        plain object keyed the same way
 * @param {string} source
 * @returns {{status: string, q: string, range: string, from: string, to: string, course: string, page: string}}
 */
export function readSourceFilters(sp, source) {
  const out = {};
  for (const name of PER_SOURCE_PARAMS) {
    const raw = sp?.[filterParamKey(name, source)];
    out[name] = typeof raw === 'string' ? raw : DEFAULTS[name];
  }
  return out;
}
