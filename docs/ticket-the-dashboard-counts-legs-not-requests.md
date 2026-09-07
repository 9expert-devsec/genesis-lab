# The dashboard counts legs; /admin/registrations counts requests

**Status:** open, analysed, **not started** — awaiting a decision on the shape below.

A three-course bundle reads **1** on `/admin/registrations` and **3** on the dashboard,
with nothing on either screen saying which is right. That is the exact defect
`65034517` existed to remove. It removed it from the list and never reached the dashboard,
because the commit that would have carried it is the one that broke on a cherry-pick and
was restored to its pre-fold state in `41c174c4`.

The four red tests in `test/fs/registrationsFoldWiring.test.mjs` track this. **They must
stay red until the behaviour is real.**

---

## 1. What shape the pipeline is

`registrationPipeline({ inhouseCollection, window, now })` in
`src/lib/dashboard/buildMetrics.js` returns **three stages**:

```js
[
  { $project: { _id: 0, createdAt: 1, status: 1, source: { $literal: 'public' } } },
  { $unionWith: { coll: inhouseCollection, pipeline: [ { $project: { … 'inhouse' } } ] } },
  { $facet: facet },
]
```

One round trip for the whole registration half. The `$facet` has four branches, plus a
fifth that is **absent rather than empty** at range `all`:

| branch | filtered by window? | groups by | answers |
|---|---|---|---|
| `current` | yes | `{ source, status }` | the six status cards, the donut |
| `previous` | yes (prior period) — **key omitted at `all`** | `{ source, status }` | the delta percentages |
| `series` | yes | `{ source, status, key: $dateToString(...) }` | the trend chart **and** the per-card sparklines |
| `ages` | yes | `{ source, status, bucket: $switch(...) }` | the pending-age histogram |
| `bounds` | **no — deliberately unfiltered** | `null` | `{ min, max, n }` for the empty state |

Every branch ends in `{ $sum: 1 }` over the unioned documents. **`$sum: 1` on a leg is the
whole defect** — five times over, not once.

## 2. Where the public counts and the seven-day trend live

There is no separate trend aggregate any more, and no per-status `countDocuments`. Round
E1 replaced nine counts and a standalone trend query with this single `$facet`, and E4
added `status` to the `series` grouping key so the sparklines and the chart are sums over
the same rows — *"agree by construction rather than by two implementations happening to
match"*.

- **Public counts** → `current` branch → folded in JS by `foldByStatus` (line 293), which
  applies `effectiveStatus` so a document still holding a retired value (`contacted`)
  lands on the live vocabulary. `total` counts every row for that source, recognised or
  not.
- **The trend** → `series` branch, bucketed by `$dateToString` on `$createdAt` in
  `BUCKET_TZ`. Not "seven days" any more — the bucket comes from the selected window via
  `bucketFormat(bucket)`.

So the old action's `sevenDaysAgo` / `trendAgg` code has no counterpart to patch. **The
port is not a transplant of the orphaned block.** That block was written against a
pipeline shape that no longer exists.

## 3. Can `REQUEST_KEY_EXPR` and `requestStatusExpr` be imported as they were?

**Imported: yes, trivially — they are plain data and a pure function, and `buildMetrics.js`
is an ordinary module.** `REQUEST_KEY_EXPR` is a frozen object literal;
`requestStatusExpr(field)` returns a `$switch`. Neither pulls in mongoose or `next/server`,
so nothing about the test tier's stubbing changes.

**Used as they were: no. The module's structure makes it a different job**, for one
concrete reason:

```js
REQUEST_KEY_EXPR = { $ifNull: ['$bundle.requestId', { $toString: '$_id' }] }
```

It needs **`bundle.requestId` and `_id`**. The pipeline's leading `$project` carries
neither — `_id: 0` explicitly drops the id, and `bundle` is never projected. **Both of the
key's inputs are destroyed in stage one**, before any branch runs. In the old action the
`$group` sat directly on the raw collection, where both fields were present; here it
cannot.

Three consequences follow, and together they are the job:

**(a) The projection must carry the key.** Computed at projection time, where the original
document is still in scope:

```js
{ $project: { _id: 0, createdAt: 1, status: 1, source: {$literal:'public'}, reqKey: REQUEST_KEY_EXPR } }
```

For the in-house side the same expression degrades correctly — in-house documents have no
`bundle`, so every one is its own request via the `$toString: '$_id'` arm. It must still
be projected explicitly there; a missing `reqKey` would collapse every in-house row into
one group.

**(b) Every branch needs a two-stage group.** Folding is `$addToSet` then resolve, which
cannot be expressed in one `$group`:

```
current:  … → $group {_id:{source,reqKey}, statuses:{$addToSet:'$status'}}
              → $group {_id:{source, status: requestStatusExpr('$statuses')}, n:{$sum:1}}
series:   … → $group {_id:{source,reqKey}, statuses:{$addToSet:'$status'},
                      createdAt:{$min:'$createdAt'}}        ← dated by its FIRST leg
              → $group {_id:{source, status, key:$dateToString(…)}, n:{$sum:1}}
ages:     … same first stage, then the $switch on the folded createdAt
previous: … same as current
bounds:   min/max unaffected; `n` needs folding to become a request count
```

The `$min` on the trend is not cosmetic — a request's legs are written milliseconds apart
inside one transaction, and taking any leg but the first can push a request submitted at
23:59:59.9 into the following day. The orphaned block had this and it was right.

**(c) Two status-resolution systems now compose, and the order is a decision.**
`requestStatusExpr` resolves a set of leg statuses to one request status in Mongo, using
`TERMINAL_STATUSES` and `REQUEST_STATUS_PRECEDENCE`. `foldByStatus` then applies
`effectiveStatus` in JS to map retired vocabulary onto live. A request whose legs hold the
retired `contacted` resolves in Mongo to `contacted`, then in JS to `pending` — which is
probably correct, but it is **not currently true of anything** and nobody has ruled on it.
`requestStatusExpr`'s precedence array operates on raw stored values; whether it should
see widened values instead is the one genuine design question in this port.

## 4. What it costs

**Read count: unchanged.** Still one `$facet`, one round trip, no new query. The E2
assertion in `test/pure/dashboardScopes.test.mjs` that counts reads per scope stays
satisfied — this is the property most at risk in a change like this and it is not
threatened.

**Query cost: one extra `$group` per branch,** over a union materialised across the whole
corpus. Measured in the module's own header as 41 public + 8 in-house = **49 documents**
today. Noise. The header already names six figures as the line at which `bounds` should
become its own indexed read; this does not move that line.

**Behaviour changes that are the point:** every public figure drops by the number of bundle
legs. Totals, donut, deltas, trend bars, sparklines and the age histogram all move. The
in-house half does not move at all.

**`bounds.n` is a judgement call.** It feeds the empty state — *"the corpus bounds,
independent of the selected window"* (line 470). If it stays a document count, the empty
state's "total" disagrees with every other total on the page. It should probably fold too;
it is unfiltered, so folding it costs a second pass over the whole corpus rather than the
window.

**The four guard tests must be re-pointed, and this is not optional bookkeeping.** They
currently scan `src/lib/actions/dashboard.js` for `REQUEST_KEY_EXPR` and
`requestStatusExpr('$statuses')`. After the port that file is a wrapper that will never
import either — it correctly has no reads at all. Left as they are, the tests stay red
forever against correct code and someone eventually deletes them.

Where they should go instead is the substance of
`ticket-a-source-scan-cannot-tell-live-code-from-dead-code.md`: these three passed against
a module that could not compile, because a source scan matches text and text survives in
dead code. **The fold assertion belongs in the pure tier**, driving
`buildDashboardMetrics` with counting doubles — the seam `buildMetrics.js` exists to
provide, already used that way by `test/pure/dashboardScopes.test.mjs` — asserting that a
three-leg bundle fixture yields a total of 1. That test cannot pass on dead code, because
it runs the code.

## 5. Open question before starting

**(c) above** — whether `requestStatusExpr` should resolve over raw stored values (as it
does on `/admin/registrations`, where the two screens' agreement is the entire point) or
over widened ones. Getting this wrong reintroduces exactly the disagreement between the
two screens that the work exists to remove, in a subtler form that no current test would
catch.
