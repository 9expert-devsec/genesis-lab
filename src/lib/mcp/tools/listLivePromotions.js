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
 * ── PLUS THE /promotions GRID'S OTHER CARDS (round 4) ──────────────────────
 * The corpus serves builder pages only — its contract belongs to the chatbot
 * and does not change. But /promotions also lists Advanced HTML pages and the
 * synced MSDB promotions (measured 2026-10-30: `/promotions/yearly-promotion`
 * was on the grid and absent here). So `deps.loadPromotionCards` returns the
 * grid's OWN cards — the same loaders, the same visibility gate, the same slug
 * resolution, through lib/promotions/promotionCards.js `buildPromotionCards`,
 * which the page itself calls — and every card whose URL no corpus item
 * already carries is added as a `page` entry: title, url, live_until,
 * image_url, no price. De-duplicated by URL, so a builder page is never listed
 * twice. This is the grid's judgement of "on", not a second one written here.
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
 *
 * ── BUNDLES (round 4) ──────────────────────────────────────────────────────
 * The corpus has always emitted `kind: "bundle"`; the input enum did not offer
 * it, so `kind=early_bird` silently dropped every bundle and the model was
 * never told what one is. A bundle's courses now carry their `title` (resolved
 * through the public case-insensitive resolver — a hidden or unknown code gets
 * no title, never a guessed one), the `dates` of the first offered round and
 * `offered_schedule_ids`. NO status and NO deadline per round: those are
 * live-only questions the corpus header explains it will not answer from a
 * snapshot, and neither does this.
 *
 * ── THE WARNING NAMES NO SOURCE ────────────────────────────────────────────
 * Round 3 live testing had the model relay internal names to sales staff. A
 * failed source still produces a warning — an outage must not read as "no
 * promotions today" — but the text is generic; which source failed goes to
 * the server log (`deps.warn`, console.warn in production) only.
 */

import { SITE_ORIGIN, dropEmpty } from '@/lib/mcp/shape';

export const LIST_LIVE_PROMOTIONS_DESCRIPTION =
  'List the 9Expert promotions and special offers that are live right now. Each entry ' +
  'gives its kind, title, the public page URL, the date it stops being valid when it has ' +
  'one, a cover image_url when there is one, and the courses it covers. Every entry ' +
  'returned is currently valid — treat it as live, and never mention a promotion that is ' +
  'not in this list. There are three kinds. Entries of kind "early_bird" are a discounted ' +
  'price on one course, with a price block giving the normal price, the special price and ' +
  'the discount percentage, in Thai baht. Entries of kind "bundle" are a package of several ' +
  'courses sold together at one price: price.normal is the list price of the package, ' +
  'price.special is the net price the customer pays, discount_pct is the saving, and each ' +
  'of its courses gives the course code, its title, the dates of the first training round ' +
  'offered and the ids of every round the customer may choose for that course. Entries of ' +
  'kind "page" are promotional landing pages covering several offers and deliberately ' +
  'carry NO price at all, because they have no single normal price — present those as a ' +
  'page to visit and never infer or estimate a price for them. Masterclass early-bird ' +
  'entries carry no batch dates; use list_masterclass_rounds for those. This tool has no ' +
  'seat-availability data. If the user asks how many seats remain, say that information ' +
  'is not available here and point them to the entry\'s url from the results. Do not ' +
  'describe this as a company policy. Always quote the deadline alongside a discount, and ' +
  'send the person to the entry\'s url to claim it.';

export const LIST_LIVE_PROMOTIONS_KINDS = ['early_bird', 'bundle', 'page', 'all'];

/** The only warning text a caller ever sees — see the header. */
export const PROMOTIONS_INCOMPLETE_WARNING =
  'Some promotions could not be loaded right now, so this list may be incomplete.';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayKeys(dates) {
  if (!Array.isArray(dates)) return [];
  return dates.map((d) => String(d ?? '').slice(0, 10)).filter((s) => ISO_DAY.test(s));
}

function isoOrNull(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** code (lower-cased) → public course name, one resolver call per distinct code. */
async function courseTitles(codes, resolve) {
  const unique = [...new Set(codes.map((c) => String(c ?? '').trim()).filter(Boolean))];
  const pairs = await Promise.all(
    unique.map(async (code) => {
      try {
        const course = await resolve(code);
        return [code.toLowerCase(), course?.course_name ?? null];
      } catch {
        return [code.toLowerCase(), null]; // a title is a courtesy; never fail the call over one
      }
    })
  );
  return new Map(pairs);
}

/**
 * @param {object} input
 * @param {'early_bird'|'bundle'|'page'|'all'} [input.kind]
 * @param {object} deps
 * @param {Function} deps.buildPromotionsCorpus         () → { generated_at, sources, items }
 * @param {Function} [deps.getCourseByCodeInsensitive]  (code) → course|null — titles for course codes
 * @param {Function} [deps.loadPromotionCards]          () → the /promotions grid's cards ({ href, title, cover, end, ... })
 * @param {Function} [deps.warn]                        server-side log; defaults to console.warn
 */
export async function listLivePromotions(input, deps) {
  const { kind = 'all' } = input ?? {};
  const warn = deps.warn ?? console.warn;
  const corpus = (await deps.buildPromotionsCorpus()) ?? {};
  const all = Array.isArray(corpus.items) ? corpus.items : [];
  const live = all.filter((i) => i?.is_live === true);

  const failed = Object.entries(corpus.sources ?? {})
    .filter(([, v]) => v?.ok === false)
    .map(([name]) => name);

  let cards = [];
  if (deps.loadPromotionCards) {
    try {
      cards = (await deps.loadPromotionCards()) ?? [];
    } catch (err) {
      failed.push('promotion_cards');
      warn('[mcp] list_live_promotions could not load the /promotions cards', err);
    }
  }

  const missingTitle = live.flatMap((i) => (i.courses ?? []).filter((c) => !c?.title).map((c) => c?.course_code));
  const titles = deps.getCourseByCodeInsensitive && missingTitle.length
    ? await courseTitles(missingTitle, deps.getCourseByCodeInsensitive)
    : new Map();
  const titleOf = (c) => c?.title ?? titles.get(String(c?.course_code ?? '').trim().toLowerCase()) ?? null;

  const promotions = live.map((i) =>
    dropEmpty({
      id: i.id ?? null,
      kind: i.kind ?? null,
      title: i.title ?? null,
      url: i.url ?? null,
      live_until: i.live_until ?? null,
      // Omitted whole when there is no normal price — see the header. A `page`
      // row would otherwise ship `{normal: null, special: null, currency:
      // 'THB', discount_pct: null}`, which reads as a priced offer with
      // missing data.
      price: i.price?.normal == null ? null : i.price,
      courses: Array.isArray(i.courses)
        ? i.courses.map((c) =>
            dropEmpty({
              course_code: c?.course_code ?? null,
              title: titleOf(c),
              // Bundles only: the first offered round's days and every round on offer.
              ...(i.kind === 'bundle'
                ? { dates: dayKeys(c?.dates), offered_schedule_ids: (c?.offered_schedule_ids ?? []).filter(Boolean) }
                : {}),
            })
          )
        : [],
      description: i.description ?? null,
      image_url: i.image_url ?? null,
    })
  );

  // The grid's other cards — Advanced HTML pages and synced promotions — as
  // `page` entries, skipping any URL a corpus item already carries.
  const seen = new Set(promotions.map((p) => p.url).filter(Boolean));
  for (const card of cards) {
    const href = String(card?.href ?? '');
    if (!href.startsWith('/promotions/')) continue;
    const url = `${SITE_ORIGIN}${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    promotions.push(
      dropEmpty({
        id: `page:${href.slice('/promotions/'.length)}`,
        kind: 'page',
        title: card.title || null,
        url,
        live_until: isoOrNull(card.end),
        courses: [],
        image_url: card.cover || null,
      })
    );
  }

  const narrowed = kind === 'all' ? promotions : promotions.filter((p) => p.kind === kind);

  if (failed.length) {
    // Names stay in the server log; the model gets the generic sentence.
    warn('[mcp] list_live_promotions degraded sources', { sources: failed });
  }

  return {
    generated_at: corpus.generated_at ?? null,
    total: narrowed.length,
    promotions: narrowed,
    ...(failed.length ? { warning: PROMOTIONS_INCOMPLETE_WARNING } : {}),
  };
}
