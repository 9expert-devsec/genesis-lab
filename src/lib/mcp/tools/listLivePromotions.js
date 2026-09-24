/**
 * Tool 5 — `list_live_promotions`.
 *
 * ── THE SOURCE IS THE DESIGN DECISION ──────────────────────────────────────
 * This reads `buildPromotionsCorpus()` and NEVER MSDB `/promotions`. Round 1
 * measured why: MSDB's feed carries 21 rows with no `is_active` field at all,
 * 12 of them `is_published: false`, and TEN of those twelve still inside their
 * `start_at`–`end_at` window. A liveness rule written against that data would
 * either announce ten deliberately-withdrawn career-path promotions or quietly
 * reimplement a judgement genesis has already made and tested.
 *
 * `buildPromotionsCorpus` returns a computed `is_live` per row, merges three
 * sources, and pins every comparison to one instant. That instant is the whole
 * reason the HTTP endpoint in front of it is `force-dynamic` + `no-store`: a
 * deadline that passes must be gone on the next call, not within an ISR window.
 *
 * ── CALLED DIRECTLY, NOT OVER HTTP ─────────────────────────────────────────
 * The obvious implementation — fetch our own /api/corpus/promotions — would
 * cost a second Vercel function invocation and a second origin round trip per
 * tool call, and would need a second key in the request path. It is the same
 * server; importing the builder collapses it to one invocation and leaves the
 * HTTP endpoint untouched for the chatbot that already uses it.
 *
 * ── `price.normal` IS NULL ON `kind: "page"` ROWS, AND THAT IS NOT A BUG ────
 * Round 1 refuted the assumption that it is null everywhere: an `early_bird`
 * row carries a real number, a `page` row carries null across the whole price
 * object. A page promotion is a landing page covering several offers and has no
 * single normal price to quote. So the price object is omitted entirely rather
 * than emitted as a bag of nulls, and the description tells the model not to
 * invent one.
 */

import { dropEmpty } from '@/lib/mcp/shape';

export const LIST_LIVE_PROMOTIONS_DESCRIPTION =
  'List the 9Expert promotions and special offers that are live right now. Each entry ' +
  'gives its title, the public page URL, the date it stops being valid, and the courses it ' +
  'covers. Every entry returned is currently valid — treat it as live, and never mention ' +
  'a promotion that is not in this list. Entries of ' +
  'kind "early_bird" carry a price block with the normal price, the special price and the ' +
  'discount percentage, in Thai baht. Entries of kind "page" are promotional landing pages ' +
  'covering several offers and deliberately carry NO price at all, because they have no ' +
  'single normal price — present those as a page to visit and never infer or estimate a ' +
  'price for them. Masterclass entries carry no batch dates. This tool has no ' +
  'seat-availability data. If the user asks how many seats remain, say that information ' +
  'is not available here and point them to the masterclass registration page link — the ' +
  'entry\'s url — from the results. Do not describe this as a company policy. Always ' +
  'quote the deadline alongside a discount, and send the person to the entry\'s url to ' +
  'claim it.';

/**
 * @param {object} input
 * @param {'early_bird'|'page'|'all'} [input.kind]
 * @param {object} deps
 * @param {Function} deps.buildPromotionsCorpus () → { generated_at, sources, items }
 */
export async function listLivePromotions(input, deps) {
  const { kind = 'all' } = input ?? {};
  const corpus = (await deps.buildPromotionsCorpus()) ?? {};
  const all = Array.isArray(corpus.items) ? corpus.items : [];

  const live = all.filter((i) => i?.is_live === true).filter((i) => kind === 'all' || i?.kind === kind);

  const promotions = live.map((i) =>
    dropEmpty({
      id: i.id ?? null,
      kind: i.kind ?? null,
      title: i.title ?? null,
      url: i.url ?? null,
      live_until: i.live_until ?? null,
      // Omitted whole when there is no normal price — see the header. A `page`
      // row would otherwise ship `{normal: null, special: null, currency: 'THB',
      // discount_pct: null}`, which reads as a priced offer with missing data.
      price: i.price?.normal == null ? null : i.price,
      courses: Array.isArray(i.courses)
        ? i.courses.map((c) => dropEmpty({ course_code: c?.course_code ?? null, title: c?.title ?? null }))
        : [],
      description: i.description ?? null,
    })
  );

  /**
   * A source that failed is reported rather than swallowed. `buildPromotionsCorpus`
   * already degrades per-source instead of throwing, so without this a Mongo
   * blip would show up as "there are no promotions today" — indistinguishable,
   * to a model, from the truth.
   */
  const degraded = Object.entries(corpus.sources ?? {})
    .filter(([, v]) => v?.ok === false)
    .map(([name]) => name);

  return {
    generated_at: corpus.generated_at ?? null,
    total: promotions.length,
    promotions,
    ...(degraded.length
      ? { warning: `These promotion sources could not be read and may be missing from this list: ${degraded.join(', ')}.` }
      : {}),
  };
}
