# `GET /api/corpus/promotions` — the read-only promotions corpus

Round C2. Built to [promotions-corpus-phase-a.md](./promotions-corpus-phase-a.md) §6, amended by
the decisions in §1 below. Files:

| file | role |
|---|---|
| `src/app/api/corpus/promotions/route.js` | auth, `no-store`, `force-dynamic`; nothing else |
| `src/lib/corpus/promotionsAuth.js` | the fail-closed key check (pure) |
| `src/lib/corpus/promotions.js` | the three source mappers, the sort, the default Mongo readers, `buildPromotionsCorpus` |
| `test/pure/promotionsCorpus.test.mjs` | fixtures modelled on the measured rows; every read injected |

## 1. Decisions that amend the phase-A contract

1. **`custom_page` is not served.** The one row (`yearly-promotion`) is already in the bot from
   MSDB and carries no price; serving it again would be a duplicate.
2. **`price.normal` is not joined this round.** It is `null` wherever the source does not store
   it (builder early-bird pages, `early_bird_configs`). The MSDB join is a later round. No
   `normalPrice` field was added to any model or write-through.
3. **`seats` is not served.** `registered_count` has two maintenance schemes and is not
   trustworthy; the field is *absent* from masterclass items, not `null`.
4. **`url` host is `https://www.9experttraining.com`** for every item, masterclass included
   (`/masterclass/<course slug>`), never the `masterclass.` subdomain the banner links to.
5. **A row whose owning page does not resolve gets `url: null`.** There is no fallback to a
   legacy `promotion_id` slug, and the `promotion_id` never appears in the response.
6. **Auth is a new `CORPUS_API_KEY`**, never the MSDB `AI_API_KEY`.

## 2. Auth — fail closed

```
x-api-key: <CORPUS_API_KEY>
```

| condition | status | body |
|---|---|---|
| `CORPUS_API_KEY` unset or blank on the deployment | **503** | `{ error: "corpus_unavailable", message }` |
| header missing, empty, or not equal to the key | **401** | empty |
| equal | 200 | the corpus |

The unset case **refuses**. `/api/cron/promotions-sync` skips its check when `CRON_SECRET` is
unset; that fail-open pattern is deliberately not copied — a forgotten variable on a preview
deployment must not publish the price sheet. The compare hashes both sides (SHA-256) before
`timingSafeEqual`, so neither the key's bytes nor its length are observable through timing. The
key is never logged and never echoed.

## 3. Freshness

`export const dynamic = 'force-dynamic'`, `Cache-Control: no-store`, no ISR, no module-level
memo. One `now` is captured per request, threaded into every liveness predicate (including
`resolveBatchPrice(batch, now)`, which gained an optional `now` for exactly this), and returned
as `generated_at`.

## 4. Sources and liveness

Every predicate is **imported** from where the site already defines it; none is re-implemented.

| source | collection(s) | live when | helper |
|---|---|---|---|
| `masterclass` | `masterclass_batches` ⋈ `masterclass_courses` **by `course_id` ObjectId** | batch `status ∈ {open, full}` ∧ course `is_published` ∧ `resolveBatchPrice(batch, now).is_early_bird` | `lib/masterclass/getMasterclass` |
| `builder_page` | `page_builder_pages` (`pageType: promotion`) | `isPubliclyVisible(page, now)`; kind `early_bird` also needs `earlyBirdIsActive(page, now)` — the min-of-two deadline (`min(binding.deadline, publishEndDate)`) in the future; kind `bundle` emits one item per `promotion_bundle` section with `content.registrationOpen === true` | `lib/pageBuilder/visibility`, `lib/earlyBird/pageWriteThrough`, `lib/pages/promotionMode` (`publicPageHref`) |
| `early_bird_config` | `early_bird_configs` | `deadline != null ∧ deadline > now` — **`is_active` is reported on the item and is never part of the filter** (three live rows pass `is_active` with deadlines 110/35/2 days past; a test pins this) | — |

Not served: the MSDB mirror (`promotions`) and `custom_pages`.

**`course_slug` on a batch is never read.** It is measured stale (`ai-content` where the course
is `mas-ai-dmc`); the course, its title, and the URL all come from the ObjectId join. A test
proves a batch whose stale slug happens to name a real course, but whose `course_id` resolves
nothing, is not served.

**De-duplication.** An `early_bird_configs` row whose `owner_page_id` is a builder page that
was served as an `early_bird` item is skipped: the page item carries every field the row does
plus a title and a URL, and two items for one deal would be the corpus disagreeing with itself.
A row whose page exists but was *not* served as an early-bird item (binding incomplete, page
not visible) is still served, with the page URL only if the page is publicly linkable.

## 5. Response

```jsonc
{
  "generated_at": "2026-09-12T18:32:54.995Z",
  "timezone_note": "all instants are UTC ISO-8601; deadlines are end-of-day Asia/Bangkok unless noted",
  "sources": {                                   // every source, every time — a partial response cannot look complete
    "masterclass":       { "ok": true,  "count": 2 },
    "builder_page":      { "ok": true,  "count": 1 },
    "early_bird_config": { "ok": false, "count": 0, "error": "read_failed" }   // logged server-side; the message stays there
  },
  "items": [
    {
      "id": "masterclass:<batch _id>",           // namespaced, stable: masterclass:<batch>, builder_page:<page>[:<section id>], early_bird_config:<row>
      "kind": "early_bird" | "bundle" | "page",
      "source": "masterclass" | "builder_page" | "early_bird_config",
      "title": "AI Digital Marketing Creator Masterclass — รุ่นที่ 1",
      "url": "https://www.9experttraining.com/masterclass/mas-ai-dmc" | null,
      "live_from": "2026-06-18T11:50:46.533Z" | null,   // masterclass: batch createdAt (a proxy); builder: publishStartDate; config: null
      "live_until": "2026-09-16T16:59:00.000Z" | null,  // THE deadline; null only for a windowless page
      "is_live": true,                           // always true this round — only live items are served; kept so a later round can add upcoming items without a contract change
      "is_active": true,                         // early_bird_config items ONLY — informational, never a filter
      "price": { "normal": 12900 | null, "special": 9030 | null, "currency": "THB", "discount_pct": 30 | null },
      "courses": [
        { "course_code": "M-AI-DMC", "title": "…" | null, "schedule_id": "…" | null,
          "dates": ["2026-09-26"], "time": "09:00–17:00" | null, "venue": "Asia Hotel | Bangkok" | null }
      ],                                         // [] when none; bundle items list each member course
      "bundle": null | { "label", "list_price", "net_price", "discount_code", "registration_open": true },
      "description": "…" | null
    }
  ]
}
```

Scalar fields with no data are `null`; list fields are `[]`. `discount_pct` is the whole-percent
`round((1 − special/normal) × 100)` and is `null` unless both prices are known and special ≤ normal.

**Order** — deterministic between calls: ascending `live_until` (soonest deadline first;
`null` last), then `id` ascending.

## 6. What it returned against live data at `2026-09-12T18:32:54.995Z`

| id | kind | title | url | live_until | price |
|---|---|---|---|---|---|
| `masterclass:6a33db96…` | early_bird | AI Digital Marketing Creator Masterclass — รุ่นที่ 1 | …/masterclass/mas-ai-dmc | 2026-09-16T16:59Z | 9,030 from 12,900 (−30%) |
| `masterclass:6a33631a…` | early_bird | Claude AI for Data Analyst — รุ่นที่ 2 | …/masterclass/mas-claude-ai-for-data-analyst | 2026-10-02T16:59Z | 9,675 from 12,900 (−25%) |
| `builder_page:6a9a9363…` | page | The Next Humans Skills | …/promotions/the-next-humans-skills | null | all null |

`sources`: all three `ok`; `early_bird_config` count 0 (every deadline is past), no bundles (the
bundle page is `closed`), no custom page (decision 1). Exactly the phase-A §6 prediction minus
the custom page.

## 7. Operator steps

1. Generate a key: `openssl rand -base64 32`.
2. **Vercel** (genesis-lab project): add `CORPUS_API_KEY=<key>` to Production — and to Preview
   only if the bot should read previews. Until it is set the route answers 503 to everyone.
3. **Chatbot (Cloud Run)**: add the same value to Secret Manager as a new secret (suggested name
   `GENESIS_CORPUS_API_KEY`), mount it into the service, and have the corpus sync call
   `GET https://www.9experttraining.com/api/corpus/promotions` with `x-api-key: <key>`.
   It is a **separate** secret from the MSDB `EXPERT_API_KEY`; do not reuse that value.
4. Verify: a request with the key returns 200 and `generated_at`; without it, 401; on a
   deployment without the variable, 503.

## 8. Found and left alone

- `early_bird_configs`: 4 of 5 rows are expired legacy/test data (`POWER-BI` at 59,999, two at
  1,000); the deadline filter hides them. Data hygiene, not this round.
- The MSDB mirror's `is_active` is false on all 21 rows, which is why `/api/search` returns no
  promotions. Not served here; not touched.
- `resolveBatchPrice` previously read its own `new Date()`; it now takes an optional `now`
  (default unchanged) so the corpus judges every batch against `generated_at`. No caller changed.
