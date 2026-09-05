/**
 * The dashboard's reads, per scope — the part that must NOT RUN for a caller
 * who lacks the scope.
 *
 * ══ WHY THIS IS NOT IN lib/actions/dashboard.js ═════════════════════════════
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * 1. `'use server'` modules may only export async functions, so an action file
 *    cannot also export the constants and pure helpers a test needs. Same
 *    constraint that put the status vocabulary in lib/registrations/statuses.js.
 *
 * 2. THE MODELS ARE INJECTED, AND THEY MUST NOT BE INJECTABLE FROM A BROWSER.
 *    Round E2 has to assert a READ COUNT — "a system-only admin pays for one
 *    wave, not three" is a claim about how many queries fire, and markup cannot
 *    witness it. The only honest way to count is to hand this function counting
 *    doubles and let the REAL branching run. But `getDashboardMetrics` lives in
 *    a `'use server'` file, which makes it a callable endpoint whose arguments
 *    come from whoever posts to it; a `models` parameter there would be a
 *    client-supplied object reaching a database call. So the seam lives HERE,
 *    in an ordinary module the browser cannot reach, and the action is a thin
 *    authorised wrapper that always passes the real models.
 *
 * ── WHAT THE DOUBLES ACTUALLY EXERCISE ──────────────────────────────────────
 * The scope branching, the filter objects, the wave grouping and the shape of
 * the returned payload — i.e. everything this round changes. They do not
 * exercise Mongo, which is not what is being claimed. The queries themselves are
 * unchanged from what round E1 measured against the live database.
 */

import {
  buildStatusLabels,
  INHOUSE_STATUS_VALUES,
  PUBLIC_STATUS_VALUES,
  effectiveStatus,
} from '@/lib/registrations/statuses';
import {
  BUCKET_TZ,
  bucketFormat,
  bucketForRange,
  dateRange,
  dateRangeAt,
  enumerateBuckets,
  previousWindow,
  windowLabel,
} from '@/lib/dashboard/ranges';
import { readRegistrationQueue, readSystemQueue } from '@/lib/dashboard/actionQueue';

/**
 * The public status labels for the donut, DERIVED.
 *
 * The chart COLOURS are below because they are this chart's business and belong
 * to no other consumer; the LABELS are the shared vocabulary and are not
 * respelled. 'ยืนยันแล้ว' had four copies across the admin and the dashboard was
 * one of them.
 */
const PUBLIC_STATUS_LABEL = buildStatusLabels();

export const DASHBOARD_RANGES = Object.freeze(['today', 'week', 'month', 'all']);

/**
 * `dateRange` lives in lib/dashboard/ranges.js now, with the bucket rule and the
 * previous-period arithmetic it belongs beside. RE-EXPORTED here so no importer
 * moves and so the round-E2 assertion that pins its four arms keeps testing the
 * same function rather than a copy of it.
 */
export { dateRange };

/**
 * ══ ONE AGGREGATION FOR THE WHOLE REGISTRATION HALF ═════════════════════════
 *
 * Round E1 measured a `$facet` computing current totals, the previous period and
 * the per-day-per-status series at 184 ms — the same order as the ONE aggregate
 * the page already ran, and cheaper than the nine `countDocuments` it replaces.
 * So the nine counts and the separate trend aggregate are gone: this is a single
 * round trip that answers everything the registration sections draw.
 *
 * ── THE UNION IS WHAT PUTS IN-HOUSE ON THE CHART ────────────────────────────
 * `$unionWith` rather than a second query per series. Both collections are
 * projected down to `{createdAt, status, source}` FIRST, so the union is over
 * three fields instead of whole registration documents — which matters because
 * these documents carry attendee lists, invoice addresses and payment records
 * that no branch below reads.
 *
 * The in-house collection NAME comes off the model rather than being written
 * here. A literal 'register_inhouse' would be a fourth place that string lives,
 * and the counting doubles in the pure tier would not have to supply it — which
 * would make the test pass while production sent `$unionWith: undefined`.
 *
 * ── WHY THERE IS NO LEADING $match, AND WHAT IT COSTS ───────────────────────
 * The `bounds` branch has to see EVERY document, including ones outside the
 * selected window: it answers "when was the most recent registration", which is
 * exactly the question the empty state asks when the selected window is empty.
 * A leading `$match` on the window would make that branch blind to the data the
 * reader most needs to be told about.
 *
 * The cost is that each branch filters for itself and the union is materialised
 * over the whole corpus. Measured against production today: 41 public + 8
 * in-house = 49 documents, which is noise. This is the line to revisit if the
 * collections reach six figures — at which point `bounds` should become its own
 * cheap indexed read (`createdAt_-1_status_1` already covers a `$max`) rather
 * than the window filter being reinstated.
 */
function registrationPipeline({ inhouseCollection, range, now }) {
  const { from, to } = dateRangeAt(range, now);
  const prev = previousWindow(range, now);
  const bucket = bucketForRange(range);

  /** A window as a `$match` stage list — empty for ทั้งหมด, which is unbounded. */
  const windowMatch = (win) => {
    if (!win || !win.from) return [];
    return [{ $match: { createdAt: { $gte: win.from, $lte: win.to } } }];
  };

  const byStatus = {
    $group: { _id: { source: '$source', status: '$status' }, n: { $sum: 1 } },
  };

  const facet = {
    current: [...windowMatch({ from, to }), byStatus],
    series: [
      ...windowMatch({ from, to }),
      {
        $group: {
          _id: {
            source: '$source',
            key: { $dateToString: { format: bucketFormat(bucket), date: '$createdAt', timezone: BUCKET_TZ } },
          },
          n: { $sum: 1 },
        },
      },
    ],
    // Deliberately unfiltered — see the header.
    bounds: [{ $group: { _id: null, min: { $min: '$createdAt' }, max: { $max: '$createdAt' }, n: { $sum: 1 } } }],
  };

  /**
   * ── THE `previous` BRANCH IS ABSENT AT ทั้งหมด, NOT EMPTY ─────────────────
   * There is no period before everything. Adding a branch that matches nothing
   * would hand the caller a zero, and a zero is a measurement — it would render
   * as "-100%" or "0%", both of which assert something nobody computed. The key
   * is missing instead, and `buildDashboardMetrics` omits the percentage
   * entirely, the same way round E2 omits an unauthorised figure rather than
   * nulling it.
   */
  if (prev) facet.previous = [...windowMatch(prev), byStatus];

  const project = { $project: { _id: 0, createdAt: 1, status: 1, source: { $literal: 'public' } } };

  return [
    project,
    {
      $unionWith: {
        coll: inhouseCollection,
        pipeline: [{ $project: { _id: 0, createdAt: 1, status: 1, source: { $literal: 'inhouse' } } }],
      },
    },
    { $facet: facet },
  ];
}

/**
 * Fold raw `{source, status} → n` rows onto the LIVE vocabulary.
 *
 * `effectiveStatus` is the shared inverse of the widening the old nine counts
 * used: a document still storing the retired `contacted` behaves as `pending`,
 * which is what kept the cards summing to the total across the round-2
 * migration window. Round E1 measured one live in-house document still holding
 * `contacted`, so this is load-bearing today rather than defensive.
 *
 * `total` counts EVERY row for that source, recognised or not — the same claim
 * the bare `countDocuments(dateFilter)` made, so the cards go on summing to it.
 */
function foldByStatus(rows, source, liveValues) {
  const tally = Object.fromEntries(liveValues.map((v) => [v, 0]));
  let total = 0;
  for (const row of rows ?? []) {
    if (row?._id?.source !== source) continue;
    const n = row.n ?? 0;
    total += n;
    const live = effectiveStatus(row._id.status, source);
    if (live in tally) tally[live] += n;
  }
  return { total, ...tally };
}

/** Percentage change, or null when there is nothing honest to divide by. */
function deltaPercent(current, previous) {
  // A previous period of ZERO has no percentage. "+100%" from nothing is not a
  // hundred percent of anything, and "+∞%" is not a number a card can render.
  // The UI shows the two raw figures instead.
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * The registration half: ONE aggregation.
 *
 * Called only when the caller holds `dashboard_registrations`; there is no
 * filtering step anywhere downstream, because nothing was fetched to filter.
 */
async function readRegistrations(models, range, now = new Date()) {
  const { RegisterPublic, RegisterInhouse } = models;
  const inhouseCollection = RegisterInhouse.collection.name;
  const bucket = bucketForRange(range);
  const { from, to } = dateRangeAt(range, now);
  const prev = previousWindow(range, now);

  const [facet] = await RegisterPublic.aggregate(
    registrationPipeline({ inhouseCollection, range, now })
  );

  const current = facet?.current ?? [];
  const bounds = facet?.bounds?.[0] ?? null;

  const publicNow  = foldByStatus(current, 'public', PUBLIC_STATUS_VALUES);
  const inhouseNow = foldByStatus(current, 'inhouse', INHOUSE_STATUS_VALUES);

  // ── the series, both sources, same buckets ────────────────────────────────
  //
  // ทั้งหมด has no `from`, so the axis starts at the OLDEST record rather than
  // at an arbitrary date. With no records at all the axis is empty and the
  // chart's own empty state takes over.
  const axisFrom = from ?? (bounds?.min ? new Date(bounds.min) : null);
  const axisTo = to;
  const keys = enumerateBuckets(axisFrom, axisTo, bucket);

  const seriesMap = { public: new Map(), inhouse: new Map() };
  for (const row of facet?.series ?? []) {
    const src = row?._id?.source;
    if (seriesMap[src]) seriesMap[src].set(row._id.key, row.n ?? 0);
  }
  const trend = keys.map((key) => ({
    key,
    publicCount: seriesMap.public.get(key) ?? 0,
    inhouseCount: seriesMap.inhouse.get(key) ?? 0,
  }));

  const statusDist = [
    { status: 'pending',   label: PUBLIC_STATUS_LABEL.pending,   count: publicNow.pending,   color: '#f59e0b' },
    { status: 'confirmed', label: PUBLIC_STATUS_LABEL.confirmed, count: publicNow.confirmed, color: '#3b82f6' },
    { status: 'paid',      label: PUBLIC_STATUS_LABEL.paid,      count: publicNow.paid,      color: '#10b981' },
    { status: 'cancelled', label: PUBLIC_STATUS_LABEL.cancelled, count: publicNow.cancelled, color: '#94a3b8' },
  ];

  const out = {
    range,
    bucket,
    /**
     * WHAT THE CHART SHOULD SAY IT DREW.
     *
     * The title renders this string, so the words and the query come out of one
     * module (lib/dashboard/ranges.js RANGE_WINDOW_LABEL). The chart used to
     * hard-code "(7 วัน)" while the range control said something else — a title
     * written independently of the query is exactly how that survived.
     */
    windowLabel: windowLabel(range),
    window: {
      from: from ? from.toISOString() : null,
      to: to.toISOString(),
      // The FIRST and LAST bucket actually drawn, so the chart's title can name
      // the window it drew rather than the window it was asked for. For ทั้งหมด
      // those differ: the request has no start and the drawing starts at the
      // oldest record.
      firstKey: keys[0] ?? null,
      lastKey: keys[keys.length - 1] ?? null,
    },
    /**
     * The corpus bounds, INDEPENDENT of the selected window — what the empty
     * state names when the window holds nothing. `latest` is the answer to "then
     * when WAS the last one", which is the only useful thing to say to an admin
     * looking at four zeros.
     */
    corpus: {
      total: bounds?.n ?? 0,
      earliest: bounds?.min ? new Date(bounds.min).toISOString() : null,
      latest: bounds?.max ? new Date(bounds.max).toISOString() : null,
    },
    public: publicNow,
    /**
     * KEYED BY THE STORED VALUE, like the public block above and like the
     * summary strip. The old keys were `new` / `contacted` / `closedWon` — one
     * of them camelCase against a hyphenated filter value, which is exactly the
     * bridge-spelling that once made a card render 0 forever on the list screen.
     */
    inhouse: inhouseNow,
    trend,
    statusDist,
  };

  if (prev) {
    const publicPrev  = foldByStatus(facet?.previous ?? [], 'public', PUBLIC_STATUS_VALUES);
    const inhousePrev = foldByStatus(facet?.previous ?? [], 'inhouse', INHOUSE_STATUS_VALUES);
    out.previous = {
      from: prev.from.toISOString(),
      to: prev.to.toISOString(),
      public: publicPrev,
      inhouse: inhousePrev,
    };
    out.delta = {
      public: Object.fromEntries(
        ['total', ...PUBLIC_STATUS_VALUES].map((k) => [k, deltaPercent(publicNow[k], publicPrev[k])])
      ),
      inhouse: Object.fromEntries(
        ['total', ...INHOUSE_STATUS_VALUES].map((k) => [k, deltaPercent(inhouseNow[k], inhousePrev[k])])
      ),
    };
  }

  return out;
}

/**
 * The registration half: the facet AND the four queue counts, ONE wave.
 *
 * `Promise.all` rather than two awaits — the queue counts do not depend on the
 * facet and there is no reason for an admin to pay two round trips for them.
 * Round E2 measured what happens when independence is left implicit: the five
 * content counts sat behind the nine registration counts for no reason but the
 * order the awaits were written in.
 */
async function readRegistrationHalf(models, range, now) {
  const [metrics, queue] = await Promise.all([
    readRegistrations(models, range, now),
    readRegistrationQueue(models, now),
  ]);
  return { ...metrics, queue };
}

async function readSystem(models, now) {
  const { Banner, Promotion, Article, FeaturedReview, Recruit } = models;
  const [
    activeBanners,
    activePromotions,
    activeArticles,
    activeReviews,
    activeRecruits,
    systemQueue,
  ] = await Promise.all([
    Banner.countDocuments({ active: true }),
    Promotion.countDocuments({ is_active: true }),
    Article.countDocuments({ active: true }),
    FeaturedReview.countDocuments({ active: true }),
    Recruit.countDocuments({ active: true }),
    // (e) joins the SAME wave as the content counts — one more parallel read,
    // not one more round trip. It is in this half because Webhook Logs is a
    // ระบบ page and `dashboard_system` is the permission that opens it.
    readSystemQueue(models, now),
  ]);

  return {
    content: {
      banners: activeBanners,
      promotions: activePromotions,
      articles: activeArticles,
      reviews: activeReviews,
      recruits: activeRecruits,
    },
    systemQueue,
  };
}

/**
 * Build the dashboard payload for exactly the scopes the caller holds.
 *
 * ══ THE ABSENT HALF IS ABSENT FROM THE OBJECT, NOT NULL IN IT ═══════════════
 * `public`, `inhouse`, `trend`, `statusDist` and `range` are present only with
 * `dashboard_registrations`; `content` only with `dashboard_system`. They are
 * OMITTED rather than set to null, and that distinction is the whole point of
 * the round: this object is serialised into the page payload and shipped to the
 * browser, so a figure that is merely hidden in the client is a figure anyone
 * can read out of devtools. A key that does not exist cannot be read.
 *
 * `scopes` IS included, and that is safe: it says which halves the caller may
 * see, which the caller already knows, and the client needs it to decide between
 * "this section is not yours" and "this section is empty".
 *
 * ── THE TWO HALVES RUN IN PARALLEL WITH EACH OTHER ──────────────────────────
 * Round E1 measured three sequential Mongo round trips: 9 counts, then 5 counts,
 * then the aggregate, each `await`ing the last. The 5 content counts never
 * depended on the registration counts — that was just the order the awaits were
 * written in. Splitting by scope made the independence explicit, so they are now
 * launched together. A both-scopes admin therefore pays TWO waves where they used
 * to pay three; a registration-only admin pays two; a system-only admin pays one.
 *
 * @param {object} args
 * @param {{registrations: boolean, system: boolean}} args.scopes
 * @param {'today'|'week'|'month'|'all'} args.range
 * @param {object} args.models  the mongoose models — see the header for why this
 *   is a parameter and why it is not a parameter of the server action.
 * @param {Date} [args.now] injectable clock. Every window and threshold below is
 *   relative to "now", so a test that cannot fix the clock can only assert that
 *   the code computed SOMETHING. Like `models`, this is a parameter HERE and
 *   never on the `'use server'` export — a client-supplied clock would let a
 *   caller shift the window a figure was counted in.
 */
export async function buildDashboardMetrics({ scopes, range, models, now = new Date() }) {
  const [registrations, system] = await Promise.all([
    scopes?.registrations ? readRegistrationHalf(models, range, now) : null,
    scopes?.system ? readSystem(models, now) : null,
  ]);

  return {
    scopes: { registrations: Boolean(scopes?.registrations), system: Boolean(scopes?.system) },
    ...(registrations ?? {}),
    ...(system ?? {}),
  };
}
