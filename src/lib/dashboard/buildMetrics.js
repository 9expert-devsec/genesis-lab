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
  dateRange,
  enumerateBuckets,
  resolveWindow,
} from '@/lib/dashboard/ranges';
import { readRegistrationQueue, readSystemQueue } from '@/lib/dashboard/actionQueue';
import { statusColor } from '@/lib/dashboard/statusColors';

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
/**
 * ══ THE AGE BUCKETS — EDGES IN DAYS, LABELS BESIDE THEM ════════════════════
 *
 * `upTo` is the INCLUSIVE upper edge of the bucket in days of age, and `null`
 * is the open-ended last one. The four rows are the whole rule: the `$switch`
 * that classifies a document, the order the bars are drawn in and the Thai
 * label each one wears all come off this array, so a bucket cannot be drawn
 * with a label describing a different span.
 *
 * The spans are contiguous and exhaustive by construction — each bucket ends
 * where the next begins — so every pending registration lands in exactly one
 * and the four counts sum to the pending total the subtitle states.
 */
export const AGE_BUCKETS = Object.freeze([
  { id: '0-3',   upTo: 3,    label: '0–3 วัน' },
  { id: '4-7',   upTo: 7,    label: '4–7 วัน' },
  { id: '8-14',  upTo: 14,   label: '8–14 วัน' },
  { id: '15+',   upTo: null, label: 'เกิน 14 วัน' },
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function registrationPipeline({ inhouseCollection, window, now }) {
  const { from, to, bucket, previous: prev } = window;

  /** A window as a `$match` stage list — empty for ทั้งหมด, which is unbounded. */
  const windowMatch = (win) => {
    if (!win || !win.from) return [];
    return [{ $match: { createdAt: { $gte: win.from, $lte: win.to } } }];
  };

  const byStatus = {
    $group: { _id: { source: '$source', status: '$status' }, n: { $sum: 1 } },
  };

  /**
   * The bucket edges as absolute Dates: a document created AFTER `after` is at
   * most `upTo` days old. Derived from AGE_BUCKETS so the boundary and the
   * label it is drawn under cannot describe different spans, and from `now` so
   * the clock stays injectable.
   */
  const ageEdges = AGE_BUCKETS
    .filter((b) => b.upTo !== null)
    .map((b) => ({ id: b.id, after: new Date(now.getTime() - b.upTo * DAY_MS) }));

  const facet = {
    current: [...windowMatch({ from, to }), byStatus],
    /**
     * ── GROUPED BY STATUS TOO, SINCE ROUND E4 ────────────────────────────────
     *
     * It was `{source, key}`, which answers the TREND CHART and nothing else.
     * Round E3 specified a per-card sparkline and its commit plan had no commit
     * that rendered one, so the requirement outlived the round — and when E4
     * came to build it, the data was not there: the payload carried a series for
     * "Public ทั้งหมด" and "In-house ทั้งหมด" and for none of the six status
     * cards.
     *
     * Adding `status` to the grouping key is the whole fix. It is the SAME
     * branch of the SAME facet in the SAME pass — no second query, no second
     * bucket rule, and the read count does not move. The trend chart's two
     * series are then a sum over statuses of the same rows, which is what makes
     * "the sparkline and the chart agree" true by construction rather than by
     * two implementations happening to match.
     */
    series: [
      ...windowMatch({ from, to }),
      {
        $group: {
          _id: {
            source: '$source',
            status: '$status',
            key: { $dateToString: { format: bucketFormat(bucket), date: '$createdAt', timezone: BUCKET_TZ } },
          },
          n: { $sum: 1 },
        },
      },
    ],
    /**
     * ══ ROUND E5.1 — THE AGE OF THE WORK THAT IS STILL WAITING ═════════════
     *
     * ONE MORE BRANCH OF THE FACET THAT WAS ALREADY RUNNING. Not a query: the
     * union has already been materialised for the three branches above, and
     * this walks the same rows a fourth time inside the same round trip. The
     * read count does not move — see test/pure/dashboardScopes.
     *
     * ── IT FOLLOWS THE RANGE, LIKE EVERY OTHER REGISTRATION SECTION ────────
     * `windowMatch` again, the same object the cards and the series filter on.
     * A histogram that ignored the range control would be the only section on
     * the page describing a different window from the header above it — which
     * is the exact defect round E3 fixed in the trend chart title.
     *
     * ── THE EDGES ARE DATES COMPUTED FROM THE INJECTED CLOCK, NOT $NOW ────
     * `$NOW` would take the time off the database server, which is precisely
     * the thing this module refuses to let happen anywhere else: every window
     * and threshold here is relative to the `now` parameter so a test can fix
     * it. A pipeline that read its own clock would make the buckets the one
     * figure on the page nobody can pin.
     *
     * ── GROUPED BY STATUS, FOLDED IN JS ───────────────────────────────────
     * It does NOT `$match` on `status: pending`. The live vocabulary is what
     * decides whether a stored value counts as pending — round E1 measured a
     * document still holding the retired `contacted` — and `effectiveStatus`
     * is JS. Matching the raw value here would give a histogram that disagreed
     * with the card sitting above it about how many pending records exist.
     */
    ages: [
      ...windowMatch({ from, to }),
      {
        $group: {
          _id: {
            source: '$source',
            status: '$status',
            bucket: {
              $switch: {
                branches: ageEdges.map(({ id, after }) => ({
                  case: { $gte: ['$createdAt', after] },
                  then: id,
                })),
                default: AGE_BUCKETS[AGE_BUCKETS.length - 1].id,
              },
            },
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
/**
 * Fold the `ages` branch onto the four buckets — PENDING PUBLIC ROWS ONLY.
 *
 * `effectiveStatus` for the same reason `foldByStatus` uses it: a document
 * still storing a retired value has to be counted the way the card above the
 * histogram counts it, or the two would tell different stories about the same
 * rows. The branch deliberately does not filter by status in Mongo — see its
 * note in the pipeline.
 *
 * Every bucket is present in the output whether or not it has rows, including
 * at zero. A bucket that vanished when empty would silently renumber the axis
 * and E5.1 is explicit that a zero bucket must render its label and a plain 0.
 */
function foldByAge(rows) {
  const tally = Object.fromEntries(AGE_BUCKETS.map((b) => [b.id, 0]));
  for (const row of rows ?? []) {
    if (row?._id?.source !== 'public') continue;
    if (effectiveStatus(row._id.status, 'public') !== 'pending') continue;
    const id = row._id.bucket;
    if (id in tally) tally[id] += row.n ?? 0;
  }
  return AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: tally[b.id] }));
}

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
async function readRegistrations(models, range, now = new Date(), custom = null) {
  const { RegisterPublic, RegisterInhouse } = models;
  const inhouseCollection = RegisterInhouse.collection.name;
  // ONE resolver. The $match, the bucket, the axis, the title and the previous
  // period all come from this object, so they cannot describe different windows.
  const window = resolveWindow({ range, custom, now });
  const { from, to, bucket, previous: prev } = window;

  const [facet] = await RegisterPublic.aggregate(
    registrationPipeline({ inhouseCollection, window, now })
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

  /**
   * ══ ONE FOLD, TWO CONSUMERS — THE CHART AND THE SPARKLINES ══════════════════
   *
   * `bucket[source].total` and `bucket[source][status]` are accumulated in the
   * same walk over the same rows, so the trend chart's bar for a bucket is the
   * arithmetic sum of the sparkline values under it. They cannot disagree,
   * because there is nothing for them to disagree BETWEEN.
   *
   * `effectiveStatus` again, for the same reason as the counts: an in-house
   * document still storing the retired `contacted` has to appear in the
   * `pending` sparkline, or the card's number and its little chart would tell
   * different stories about the same rows.
   */
  const seriesMap = { public: new Map(), inhouse: new Map() };
  for (const row of facet?.series ?? []) {
    const src = row?._id?.source;
    if (!seriesMap[src]) continue;
    const key = row._id.key;
    const n = row.n ?? 0;
    const slot = seriesMap[src].get(key) ?? { total: 0 };
    slot.total += n;
    const live = effectiveStatus(row._id.status, src);
    if (live) slot[live] = (slot[live] ?? 0) + n;
    seriesMap[src].set(key, slot);
  }

  const trend = keys.map((key) => ({
    key,
    publicCount: seriesMap.public.get(key)?.total ?? 0,
    inhouseCount: seriesMap.inhouse.get(key)?.total ?? 0,
  }));

  /**
   * The per-card series, ALIGNED TO `keys` BY CONSTRUCTION.
   *
   * Every array is built by mapping the same `keys` the trend chart maps, so
   * "the sparkline uses the same buckets as the chart" is not a rule anyone has
   * to remember — it is the only thing this code can produce. A card with no
   * registrations at all still gets an array of zeros of the right length, which
   * is what lets the UI draw a flat line rather than nothing.
   */
  const seriesFor = (source, statusKeys) => Object.fromEntries(
    ['total', ...statusKeys].map((k) => [
      k,
      keys.map((key) => seriesMap[source].get(key)?.[k] ?? 0),
    ])
  );
  const sparklines = {
    public: seriesFor('public', PUBLIC_STATUS_VALUES),
    inhouse: seriesFor('inhouse', INHOUSE_STATUS_VALUES),
  };

  /**
   * ── THE ORDER IS THE READING ORDER, AND IT IS DECLARED HERE ─────────────
   * รอดำเนินการ, ชำระแล้ว, ส่งใบเสนอราคาแล้ว, ยกเลิก — the order round E5
   * specifies for the proportional bar's segments and its legend. It is a
   * PRESENTATION order (the work an admin cares about first, the dead records
   * last), deliberately not `PUBLIC_STATUS_VALUES`, which is the LIFECYCLE
   * order the transition table and the list screen's filter run on. Deriving
   * one from the other would tie a chart's layout to a state machine.
   *
   * The COLOURS come from lib/dashboard/statusColors.js since round E5 — four
   * surfaces draw them now, not one. The four literals that used to sit on
   * these lines are the same four hexes, moved; see that module's header and
   * the guard in test/fs/publicStatusLabelSources that records the reversal.
   */
  const ageDist = foldByAge(facet?.ages);

  const statusDist = [
    { status: 'pending',   label: PUBLIC_STATUS_LABEL.pending,   count: publicNow.pending,   color: statusColor('pending') },
    { status: 'paid',      label: PUBLIC_STATUS_LABEL.paid,      count: publicNow.paid,      color: statusColor('paid') },
    { status: 'confirmed', label: PUBLIC_STATUS_LABEL.confirmed, count: publicNow.confirmed, color: statusColor('confirmed') },
    { status: 'cancelled', label: PUBLIC_STATUS_LABEL.cancelled, count: publicNow.cancelled, color: statusColor('cancelled') },
  ];

  const out = {
    // The RANGE the payload was built under. A custom window reports itself as
    // such rather than as whichever preset was also in the URL, so the client
    // lights no preset button and the reader is not told two things at once.
    range: window.custom ? 'custom' : range,
    custom: window.custom
      ? { from: from.toISOString(), to: to.toISOString() }
      : undefined,
    bucket,
    /**
     * WHAT THE CHART SHOULD SAY IT DREW.
     *
     * The title renders this string, so the words and the query come out of one
     * module (lib/dashboard/ranges.js RANGE_WINDOW_LABEL). The chart used to
     * hard-code "(7 วัน)" while the range control said something else — a title
     * written independently of the query is exactly how that survived.
     */
    windowLabel: window.label,
    /**
     * WHEN THIS PAYLOAD WAS BUILT — the INJECTED clock, serialised.
     *
     * รายการล่าสุด prints "2 ชั่วโมงที่แล้ว", which is a subtraction against
     * some "now", and there are only two places that "now" can come from. If
     * the client reads its own clock, the server renders one string and the
     * browser hydrates a different one whenever the two straddle a minute
     * boundary — an intermittent hydration mismatch that appears on a
     * fraction of loads and reproduces on none of them. And a test could not
     * fix it: every other figure on this page is relative to the `now`
     * parameter precisely so it can be pinned, and a wall-clock read here
     * would make these the one strings nobody can assert.
     *
     * So the server sends the timestamp it used, and the client subtracts
     * against that. It also makes the relative times honest about what they
     * describe: the age of the data as rendered, not as read.
     */
    generatedAt: now.toISOString(),
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
    /**
     * One array per stat card, every one the same length as `trend`. The cards
     * read theirs by name; nothing has to look up a bucket rule to draw one.
     */
    sparklines,
    statusDist,
    /**
     * The age histogram's four buckets, in drawing order, always all four.
     * `ageTotal` is the pending count they sum to — the subtitle states it, and
     * stating it here rather than re-summing in the client is what stops the
     * heading and the bars disagreeing.
     */
    ageDist,
    ageTotal: ageDist.reduce((n, b) => n + b.count, 0),
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
/** How many rows รายการล่าสุด shows. Six fits the card without scrolling. */
const LATEST_ACTIVITY_LIMIT = 6;

/**
 * ══ THE ONE NEW READ ROUND E5 ADDS, AND WHY IT CANNOT COME OFF THE FACET ═══
 *
 * Everything else this round draws is folded out of the aggregation that was
 * already running. This is the exception, and the reason is the PROJECTION.
 *
 * The facet projects every document down to `{createdAt, status, source}`
 * BEFORE the union, deliberately — see the pipeline header — because these
 * documents carry attendee lists, invoice addresses and payment records that
 * no branch reads. รายการล่าสุด needs the applicant name and the course name,
 * which are exactly two of the fields that projection exists to throw away.
 * Widening it would inflate the union across the WHOLE corpus, for every
 * branch, to give six rows their labels. A separate limited read is cheaper
 * and says what it wants.
 *
 * ── SIX DOCUMENTS, OFF AN INDEX THAT ALREADY EXISTS ───────────────────────
 * `$sort: {createdAt: -1}` then `$limit`, which RegisterPublic covers with
 * `createdAt_-1_status_1`. The `$project` is last so only the four fields the
 * table renders leave the database — a dashboard payload is serialised into
 * the page and shipped to the browser, so a field fetched "just in case" is a
 * field anyone can read out of devtools.
 *
 * ── PUBLIC ONLY, AND NOT WINDOWED ─────────────────────────────────────────
 * Public, because each collection has its own detail route and a row has to
 * link somewhere it will be found; mixing sources would mean a per-row route
 * choice on a six-row card. Unwindowed, because รายการล่าสุด means "the newest",
 * and a "latest" list that empties itself when the reader picks วันนี้ is the
 * same defect as a queue that hides work by being filtered (round E3).
 *
 * ── THE ROWS ARE SHAPE-CHECKED ────────────────────────────────────────────
 * `models` is injected, so this function must not assume what came back — the
 * same reason every read above it is written `facet?.current ?? []`. A row
 * without an `_id` and a `createdAt` is not a row this pipeline produced.
 */
async function readLatestActivity(models) {
  const { RegisterPublic } = models;
  const rows = await RegisterPublic.aggregate([
    { $sort: { createdAt: -1 } },
    { $limit: LATEST_ACTIVITY_LIMIT },
    {
      $project: {
        _id: 1,
        createdAt: 1,
        status: 1,
        courseName: 1,
        firstName: '$coordinator.firstName',
        lastName: '$coordinator.lastName',
      },
    },
  ]);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r._id && r.createdAt)
    .map((r) => ({
      id: String(r._id),
      // Joined here rather than in the client so an absent half cannot render
      // as "undefined undefined" on the page.
      name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
      courseName: r.courseName ?? null,
      // The LIVE status, for the same reason the cards fold through it: a row
      // still holding a retired value must wear the chip the list screen would
      // give it.
      status: effectiveStatus(r.status, 'public') ?? r.status ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
}

async function readRegistrationHalf(models, range, now, custom) {
  // THE SAME WAVE, not a fourth round trip. `readLatestActivity` depends on
  // neither of the other two, so leaving it to a second await would cost an
  // admin a whole latency for no reason — the finding round E2 recorded when
  // the content counts sat behind the registration counts for no reason but
  // the order the awaits were written in.
  const [metrics, queue, latestActivity] = await Promise.all([
    readRegistrations(models, range, now, custom),
    readRegistrationQueue(models, now),
    readLatestActivity(models),
  ]);
  return { ...metrics, queue, latestActivity };
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
export async function buildDashboardMetrics({ scopes, range, models, now = new Date(), custom = null }) {
  const [registrations, system] = await Promise.all([
    /**
     * `custom` is an ALREADY-VALIDATED {from, to} of Dates, or null. It reaches
     * here only through the action, which resolves it from the raw query strings
     * — so nothing below ever sees an untrusted date, and a system-only caller
     * never reaches this branch at all whatever their URL says.
     */
    scopes?.registrations ? readRegistrationHalf(models, range, now, custom) : null,
    scopes?.system ? readSystem(models, now) : null,
  ]);

  return {
    scopes: { registrations: Boolean(scopes?.registrations), system: Boolean(scopes?.system) },
    ...(registrations ?? {}),
    ...(system ?? {}),
  };
}
