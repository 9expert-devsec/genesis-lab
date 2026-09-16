# Masterclass chat card — phase A (genesis side): what the widget can show, and from where

Round 2, step S-G. Read-only survey on branch `staging` at `2058a2ae`, 2026-09-16, against the
live database (`find` only). Every value below is measured unless marked **hypothesis**. The
Masterclass card is to be a NEW card type on its own path — not `promotion_query`, whose
masterclass items disappear when the last early bird ends (2 Oct 2026).

---

## A. Cover image

### A1. Fields on the course model

[src/models/MasterclassCourse.js](../src/models/MasterclassCourse.js):

| field | line | type | meaning |
|---|---|---|---|
| `cover_image_url` | 65 | String | the listing-card and OG image |
| `cover_image_public_id` | 66 | String | Cloudinary public id (**empty on both rows**) |
| `hero_gradient_from` / `_to` | 68–69 | hex | fallback gradient when there is no cover (schema defaults on both rows) |
| `gallery[]` | 72–80 | `{type: 'image'\|'youtube', url, videoId, alt, order}` | the detail-page hero slider, 6 entries each (1 YouTube + 5 images) |
| `suitable_for[].image_url` | 96 | String | audience tiles — not a cover |

There is no dedicated thumbnail or OG field; the OG image is **derived** by
[src/lib/seo/ogImage.js:55-83](../src/lib/seo/ogImage.js#L55-L83) `resolveCourseOgImage`:
`cover_image_url` first, else the first `gallery` entry with `type === 'image'`, else the
site default.

Values on the two published courses (both **absolute HTTPS URLs on `res.cloudinary.com`**,
cloud `ddva7xvdt`, folder `9exp-genesis/masterclass/`, `.webp`):

| course | `cover_image_url` | first gallery image (differs) |
|---|---|---|
| `mas-claude-ai-for-data-analyst` | `https://res.cloudinary.com/ddva7xvdt/image/upload/v1782108378/9exp-genesis/masterclass/jw8l70zcannlfvjy6itl.webp` | `…/v1782976135/9exp-genesis/masterclass/bj4laqfutrpydaaj6i5l.webp` |
| `mas-ai-dmc` | `https://res.cloudinary.com/ddva7xvdt/image/upload/v1783333443/9exp-genesis/masterclass/wgnrofx9womyejd0crx9.webp` | `…/v1783588162/9exp-genesis/masterclass/nyzadcz2z7nb9filh8xu.webp` |

`cover_image_public_id` is `''` on both, so there is no public id to rebuild a transform from;
the stored URL is the only handle.

### A2. What the `/masterclass` listing card renders

[MasterclassCard.jsx:49-52](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L49-L52):
`cardImage = course.cover_image_url || FALLBACK_IMAGE[course.slug] || DEFAULT_FALLBACK_IMAGE`
(the fallbacks are two static files under `/public/masterclass-element/`, lines 39–44, and
never fire today because both rows carry a cover). Rendered through **`next/image`**
(`<Image src={cardImage} fill className="object-cover" sizes="(max-width:768px) 100vw, 50vw" />`,
lines 63–69) — no URL builder, no Cloudinary transform; Next's own optimizer fetches the
stored URL. So "the same image as the listing card" is exactly `cover_image_url`, raw.

### A3. Why `/api/corpus/promotions` says `image_url: null`

On the genesis side the field is **not wired at all**: `masterclassItems()` in
[src/lib/corpus/promotions.js:121-150](../src/lib/corpus/promotions.js#L121-L150) emits
`id, kind, source, title, url, live_from, live_until, is_live, price, courses[], bundle,
description` — no image key of any name (`grep image src/lib/corpus/promotions.js` is empty),
and the course projection at [line 315](../src/lib/corpus/promotions.js#L315) is
`slug course_code title_th subtitle_th time_start time_end is_published`, so
`cover_image_url` never leaves Mongo on that path. The `null` the chatbot sees is therefore
its composer's default for an absent key, not a null stored in genesis. **The data exists**
(A1). Filling it would be two lines in that module (add `cover_image_url` to the projection,
emit `image_url: text(c.cover_image_url)`); the same two-line shape would fill a masterclass
card feed. That change is out of scope for this survey and touches the promotion path, which
the standing constraint says not to modify.

---

## B. Card fields available

### B4. Per published course

Sources: `masterclass_courses` (course fields), `instructors` joined by `instructor_ids`
([getMasterclass.js:135-141](../src/lib/masterclass/getMasterclass.js#L135-L141)
`getInstructorsByIds`), `masterclass_batches` joined by `course_id` ObjectId
([getMasterclass.js:43-69](../src/lib/masterclass/getMasterclass.js#L43-L69)).

| field | source | `mas-claude-ai-for-data-analyst` | `mas-ai-dmc` |
|---|---|---|---|
| title | `title_th` (English by content) | "Claude AI for Data Analyst" (26) | "AI Digital Marketing Creator Masterclass" (40) |
| slug | `slug` | `mas-claude-ai-for-data-analyst` | `mas-ai-dmc` |
| canonical URL | `${CORPUS_PUBLIC_ORIGIN}/masterclass/${slug}` ([promotions.js:52](../src/lib/corpus/promotions.js#L52)) | `https://www.9experttraining.com/masterclass/mas-claude-ai-for-data-analyst` | `https://www.9experttraining.com/masterclass/mas-ai-dmc` |
| tagline | `subtitle_th` (the listing card's 3-line clamp, [card:101-103](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L101-L103)) | 166 chars | 178 chars |
| longer description | `description_html` → text (not on the listing card) | 594 chars | 565 chars |
| instructor name(s) | `instructors.name` via `instructor_ids` | ชไลเวท พิพัฒพรรณวงศ์ | ชไลเวท พิพัฒพรรณวงศ์, โทวิทูร เอื้อประเสริฐวณิช |
| level | `level` enum → `LEVEL_MAP` ([card:28-32, 94](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L28-L32)) | intermediate → "Intermediate" | intermediate → "Intermediate" |
| duration | `duration_days` / `duration_hours` ([card:89](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L89) shows days only) | 1 วัน / 7 ชม. | 1 วัน / 7 ชม. |
| schedule note | `schedule_days` + `time_start/end` ([card:53](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L53)) | "*เรียนเฉพาะวันเสาร์ 09:00 - 17:00 น." | same |

**Which batch the card shows:** `firstBatch = course.batches?.[0]`
([card:47](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L47)), where
`batches` is what `getPublishedMasterclasses()` attached: batches with
`status ∈ {open, full}` for that `course_id`, sorted `batch_no: 1`
([getMasterclass.js:50-54](../src/lib/masterclass/getMasterclass.js#L50-L54)). So the rule is
**"the lowest-numbered open-or-full batch"**, not "the next by date" — today those coincide
because each course has exactly one open batch (Claude รุ่นที่ 2 on 2026-10-17; AI-DMC
รุ่นที่ 1 on 2026-09-26). A published course with no open batch renders the
`ยังไม่เปิดรับสมัคร` branch ([card:192](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L192)).

### B5. Price

The card shows `firstBatch.effective_price` in `th-TH` locale
([card:118](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L118)); when
`is_early_bird` it adds the struck-through `original_price` ([:122](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L122)),
the note "*ราคาพิเศษลงทะเบียนล่วงหน้า Early Bird" ([:128](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L128))
and the `CountdownTimer` to `early_bird_deadline` ([:143-144](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L143-L144)).
Those three fields are computed by `resolveBatchPrice(batch, now)`
([getMasterclass.js:25-38](../src/lib/masterclass/getMasterclass.js#L25-L38)):
`is_early_bird = early_bird_active && price_early_bird != null && (deadline == null || deadline > now)`;
`effective_price = is_early_bird ? price_early_bird : price_normal`; `original_price = price_normal`.

After the early bird ends: `is_early_bird` is false, `effective_price` = `price_normal`
(12,900 on both), no strike-through, and the note line falls back to the schedule note. **The
`now` is injectable** (`resolveBatchPrice(b, now)`; the promotions corpus already threads one
instant per request, [promotions.js:131](../src/lib/corpus/promotions.js#L131)), so a card
feed can judge every row against a single `now` and return it as `generated_at`.

Live values today (2026-09-16 Asia/Bangkok): Claude รุ่นที่ 2 — 9,675 early bird until
2026-10-02T16:59Z, normal 12,900; AI-DMC รุ่นที่ 1 — 9,030 early bird until
**2026-09-16T16:59Z (tonight)**, normal 12,900.

### B6. Dates

The next batch date is `batches[].dates[0].date` (a `Date`, stored at UTC midnight) with a
Thai Buddhist-era `day_label` beside it ("เสาร์ที่ 17 ตุลาคม 2569")
([MasterclassBatch.js:6-10](../src/models/MasterclassBatch.js#L6-L10)). **The listing card does
not render the date at all** — it shows the weekday/time schedule note (B4) and the early-bird
countdown; the date appears on the detail page, formatted by `formatBatchDate` → `en-GB`
"Sat, 17 Oct 2026" ([MasterclassDetailClient.jsx:35-45](../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx#L35-L45)),
and the deadline by `formatEarlyBirdDeadline`, `en-GB` pinned to `Asia/Bangkok`
([:59-70](../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx#L59-L70)).
The promotions corpus emits the same date as `YYYY-MM-DD` (`day()`, [promotions.js:137](../src/lib/corpus/promotions.js#L137)).

### B7. On the listing card but NOT for the chat card (standing rulings)

- **Seats**: "รับจำกัด {capacity} ที่นั่ง" ([card:154](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L154)),
  "ว่าง {capacity − registered_count} ที่นั่ง" ([:165](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L165)),
  the progress bar ([:174](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L174)) and the
  "เต็มแล้ว" CTA state ([:164, :183](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L164)) —
  all derive from `registered_count`, which is not served anywhere. (It moved again since M1:
  AI-DMC รุ่นที่ 1 now reads 1.) `capacity` alone (50 on every batch) is a fact about the room;
  the ruling covers seats/availability, not the cap — an open decision (below).
- **The live countdown** ([:143](../src/app/(public)/masterclass/_components/MasterclassCard.jsx#L143)):
  a clock the widget would have to run itself; the deadline instant can travel, the ticking
  cannot.
- **`course_slug` on the batch**: stale on every row — the join is `course_id` only
  ([promotions.js:126](../src/lib/corpus/promotions.js#L126)).
- Anything with a clock on it (price, deadline, date) is served live by
  `/api/corpus/promotions` today; a card feed that also carries them must compute them from the
  same `resolveBatchPrice` against one `now`, per the standing "two clocks" ruling in
  [masterclass-corpus-endpoint.md §1](./masterclass-corpus-endpoint.md).

---

## C. Delivery endpoint

### C8. `/api/corpus/masterclass` today, and the two ways to carry card fields

Exact shape ([src/lib/corpus/masterclass.js:103-145, 196-201](../src/lib/corpus/masterclass.js#L103-L145)):

```
{
  generated_at, source_note, count,
  courses: [{
    id: "masterclass:<course _id>", slug, course_code, title, subtitle, url, outline_pdf_url,
    level, duration: { days, hours }, schedule: { days: [], time },
    description, objectives: [], benefits: [], audience: [], prerequisites: [],
    system_requirements,
    curriculum: [{ session, modules: [{ no, title, topics, workshop, output, notes }] }],
    instructors: [{ name, name_en, title, bio }],
    faqs: [{ question, answer }]
  }]
}
```

Every string is plain text (the builder throws on markup,
[:59-78, :204-205](../src/lib/corpus/masterclass.js#L59-L78)); `source_note` states that prices,
dates, deadlines, venues and seats are deliberately absent.

**Option 1 — add card fields to this route.** Additive keys (`image_url`, a `card` block, or a
`next_batch` block with price/date) do not remove or rename anything the corpus composer reads,
so an additive change cannot break a composer that reads by name. Costs: the endpoint's own
header and `source_note` currently promise "course content only, nothing with a clock" — a
price/date block reverses that ruling and the doc that records it; the markup guard walks every
string, so an image URL is fine but any new HTML field must go through `htmlToText`; the
composer would receive fields it must ignore, and the corpus document's freshness (sync-time
snapshot) would then differ from the card's (per request) inside one payload — the "two clocks
in one answer" shape the endpoint doc names as the defect. **Hypothesis** (the composer lives
in the chatbot repo): a composer that serialises every key would put a price into a corpus
document that goes stale.

**Option 2 — a sibling `/api/corpus/masterclass-cards`.** A new route file plus a small lib
module (a mapper over the same `getPublishedMasterclasses()` read, which already attaches the
open batches with `resolveBatchPrice` applied, so the join and the price rule come for free),
reusing the auth/no-store shell in C9 verbatim; one more `CORPUS_API_KEY` consumer to wire on
the chatbot side; one more test file. The two masterclass endpoints would then read the same
rows twice if the sync calls both. Nothing existing changes.

### C9. The reusable shell

Both corpus routes are identical in shape ([masterclass/route.js:26-57](../src/app/api/corpus/masterclass/route.js#L26-L57),
[promotions/route.js](../src/app/api/corpus/promotions/route.js)):

- `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` (no ISR);
- `corpusAuthStatus(req.headers.get(CORPUS_KEY_HEADER), process.env.CORPUS_API_KEY)` from
  [src/lib/corpus/promotionsAuth.js:37-43](../src/lib/corpus/promotionsAuth.js#L37-L43):
  **503** `corpus_unavailable` when the variable is unset/blank (fail closed), **401** empty body
  on a wrong or missing `x-api-key`, SHA-256 + `timingSafeEqual` compare;
- every response carries `cache-control: no-store` (`NO_STORE`, line 32);
- one `now` captured inside the builder and returned as `generated_at`;
- a builder that throws → 500 `corpus_invalid`, nothing partial.

A new route can import `CORPUS_KEY_HEADER`, `corpusAuthStatus` and `CORPUS_PUBLIC_ORIGIN` and
copy the ~30-line handler unchanged.

---

## D. Widget rendering path

### D10. The chat proxy passes the body through

[src/app/api/chat/route.js](../src/app/api/chat/route.js): the upstream text is parsed
(`safeJsonParse`, [:265-266](../src/app/api/chat/route.js#L265-L266)); non-JSON → 502 and the
body is not relayed ([:270-283](../src/app/api/chat/route.js#L270-L283)). The **only** mutation
is injecting fallback `quick_replies` when the model asks for a category and sends none
([:287-291](../src/app/api/chat/route.js#L287-L291)). Then
`NextResponse.json(data, …)` ([:293](../src/app/api/chat/route.js#L293)) returns **the whole
object** with the upstream status. There is no whitelist and no reshape on the response, so
**every** upstream field reaches the browser today — a new top-level field (as `message_id` did)
and a new card array both arrive untouched. (The *request* to upstream IS rebuilt to
`{sessionId, user_id, message, history}`, [:240-245](../src/app/api/chat/route.js#L240-L245) —
that is the only whitelist in the file.)

### D11. What the client keeps

`chatClient.sendChat` ([src/lib/chat/chatClient.js:144-159](../src/lib/chat/chatClient.js#L144-L159))
returns `{ raw, reply, quickReplies, courses, promotions, serverMessageId }`; `courses` and
`promotions` are picked from the body by name through fallback chains
(`courses ?? courseRecommendations ?? recommendations.courses ?? cards.courses ?? ui.courses`,
[:87-95](../src/lib/chat/chatClient.js#L87-L95); the promotions chain at
[:97-105](../src/lib/chat/chatClient.js#L97-L105)) and passed through **as arrays, elements
unvalidated**. `useChatStore` dispatches exactly `id, createdAt, text, quickReplies, courses,
promotions, serverMessageId` ([useChatStore.js:71-80](../src/components/chat/useChatStore.js#L71-L80));
the reducer copies those (`safeArr`) onto the message
([chatState.js:97-118](../src/lib/chat/chatState.js#L97-L118)). Persistence is
`JSON.stringify(messages.slice(-40))` into sessionStorage
([transcriptStore.js:105-110](../src/lib/chat/transcriptStore.js#L105-L110)); on read only the two
rating fields are normalised ([:71-79](../src/lib/chat/transcriptStore.js#L71-L79)), everything
else is returned as stored.

So: **no shape validation drops an unknown card element** — but a card under a NEW top-level
key (say `masterclasses`) is dropped at `sendChat`'s return (not picked), at the dispatch (not
named) and at the reducer (not copied). A masterclass card path needs one new pick in
`chatClient`, one new field in the dispatch, one in the reducer, and it then persists for free.
A masterclass item smuggled inside `courses[]` would render as a `CourseCard` today — the panel
chooses the carousel by the message field, not by a `type` on the item.

### D12. `ChatCards.jsx`

**Card types and discriminator.** Two: `CourseCard` and `PromotionCard`. There is **no `type`
field**; the discriminator is *which message array the item sits in* —
[ChatPanel.jsx:408-447](../src/components/chat/ChatPanel.jsx#L408-L447) renders
`message.promotions` (after `sortPromotions`) through `PromotionCarousel` and
`message.courses` through `CourseCarousel`, in that order.

**Props read** ([ChatCards.jsx:286-295](../src/components/chat/ChatCards.jsx#L286-L295), [:404-410](../src/components/chat/ChatCards.jsx#L404-L410); carousel keys [:479-499](../src/components/chat/ChatCards.jsx#L479-L499)):

| card | field read (first non-empty wins) |
|---|---|
| CourseCard | `title \| name`; `description`; `instructor`; `image_url \| imageUrl`; `course_url \| url \| link`; `price` (string; empty → "สอบถามราคา"); `training_days`, `training_hours` (→ "N วัน M ชม."); key `course_id \| id \| _id` |
| PromotionCard | `title \| name` (→ "Promotion"); `description \| desc`; `badge \| tag`; `image_url \| imageUrl \| cover`; `url \| link`; key `id \| _id`; sort reads `isFeatured/featured/pinned/isPinned`, `displayOrder/order/priority/rank`, `publishedAt/updatedAt/createdAt` ([:372-402](../src/components/chat/ChatCards.jsx#L372-L402)) |

**Images.** Raw `<img … loading="lazy">` with the `no-img-element` disable
([:313-314](../src/components/chat/ChatCards.jsx#L313-L314), [:418-419](../src/components/chat/ChatCards.jsx#L418-L419)),
deliberately **not** `next/image` (header [:31-35](../src/components/chat/ChatCards.jsx#L31-L35):
it throws on a host missing from `remotePatterns`, and the model's hosts are unenumerated;
`test/fs/chatWiring.test.mjs:201` pins this). For the record, `remotePatterns` **does** cover
`res.cloudinary.com` ([next.config.mjs:42](../next.config.mjs#L42)), so the listing card's
`next/image` is fine and a chat `<img>` needs nothing.

**CSP.** `Content-Security-Policy-Report-Only` only ([next.config.mjs:554](../next.config.mjs#L554));
its `img-src` ([:557](../next.config.mjs#L557)) lists `'self' https://res.cloudinary.com
https://ddva7xvdt.res.cloudinary.com … data: blob:` — the cover host is covered, so the cover
would not even log a violation. No `img-src` in `src/middleware.js`.

**Fallback when `image_url` is null.** No placeholder: the whole image block is omitted
(`{img ? (…) : null}`, [:311-316](../src/components/chat/ChatCards.jsx#L311-L316) and
[:415-421](../src/components/chat/ChatCards.jsx#L415-L421)); the card is text-only.

**Colour vocabulary.** Semantic tokens only — `bg-[var(--surface)]`, `--surface-muted`,
`--surface-raised`, `--surface-hover`, `--surface-border`, `text-[var(--text-primary)]`,
`--text-secondary`, `--text-muted`; shadows `shadow-9e-sm/md`; motion `duration-9e-micro`
([:20-29](../src/components/chat/ChatCards.jsx#L20-L29), `CARD_SHELL` [:279](../src/components/chat/ChatCards.jsx#L279),
`PILL` [:281](../src/components/chat/ChatCards.jsx#L281)). The tokens carry their own dark values,
so the only `dark:` in the file is the link colour `text-9e-action … dark:text-9e-air`
([:352](../src/components/chat/ChatCards.jsx#L352), [:435](../src/components/chat/ChatCards.jsx#L435)).
`chatWiring.test.mjs:187` pins that no hardcoded light palette (bg-white/slate) returns.

### D13. Tests a new card type would touch

| file | tests | what it covers |
|---|---|---|
| `test/render/chatCarousel.test.mjs` | 3 | `CourseCarousel` / `PromotionCarousel` paging controls — a new carousel would add its cases here |
| `test/fs/chatWiring.test.mjs` | 21 | raw `<img>` + eslint-disable on card art (:201), no light-mode palette (:187), no cover overlay chips (:250), proxy forwards `user_id` (:370), the store's drop-before-rotate |
| `test/pure/chatClient.test.mjs` | 7 (one sequential group) | `sendChat` picks + `serverMessageId`; a new pick (`masterclasses`) needs a case here — fetch via `test/fetchStub.mjs` |
| `test/pure/chatState.test.mjs` | 18 | the `ASSISTANT` message shape (`Object.keys` is pinned exactly — a new field must be added to that list), `RATE` |
| `test/pure/chatTranscriptStore.test.mjs` | 12 | round-trip; `RESTORED` pins the assistant shape |
| `test/render/chatRatingThumbs.test.mjs` | 5 | the assistant bubble via `ChatPanel` + store prop — the natural home for "a masterclass array renders its own carousel" |
| `test/render/chatTranscript.test.mjs` | 5 | panel renders the handed transcript |
| (chat proxy) `test/fs/chatWiring.test.mjs:370`, `test/pure/chatRateLimit.test.mjs` | — | no test drives `/api/chat`'s POST end to end |

Runner rule (learned in `cb94ee04`): top-level tests of every file run concurrently in one
process, so any test touching `process.env` or `fetch` must be **one** top-level test with
awaited sequential subtests, stubbing fetch through `test/fetchStub.mjs` (a URL-keyed
dispatcher, restored when the last handler leaves).

---

## E. Contract as the widget sees it

The exact names the widget reads (first non-empty wins; nothing else on the item is used):

**Course card** (an element of the message's `courses[]`, picked from the response's
`courses` — or `courseRecommendations`, `recommendations.courses`, `cards.courses`, `ui.courses`):

```
title | name            string   heading
description             string   2-line clamp
instructor              string   pill (omitted when empty)
image_url | imageUrl    string   raw <img>, block omitted when empty
course_url | url | link string   "คลิกเพื่อดูรายละเอียด" link; empty → "กรุณาติดต่อสอบถาม"
price                   string   pill; empty → "สอบถามราคา"  (a STRING, not a number — cleanPrice)
training_days           number   "N วัน"
training_hours          number   "M ชม."
course_id | id | _id    any      React key only
```

**Promotion card** (an element of `promotions[]`, picked from `promotions` — or
`promotionCards`, `recommendations.promotions`, `cards.promotions`, `ui.promotions`):

```
title | name                     string   heading; empty → "Promotion"
description | desc               string   3-line clamp
badge | tag                      string   overlay badge on the image
image_url | imageUrl | cover     string   raw <img>, block omitted when empty
url | link                       string   link
id | _id                         any      React key
isFeatured|featured|pinned|isPinned, displayOrder|order|priority|rank, publishedAt|updatedAt|createdAt — sort only
```

There is no `type` discriminator on either; a masterclass card on its own path would be a
third array (its own pick, dispatch field, reducer field and carousel) or a `type` on a shared
array with a branch in the panel — the second does not exist today.

---

## Open decisions (facts and costs only)

1. **Where the card feed lives** — C8: additive keys on `/api/corpus/masterclass` (reverses its
   "no clock" ruling, mixes snapshot and live freshness in one payload, composer must ignore
   new keys) versus a sibling `/api/corpus/masterclass-cards` (new route + lib + test file,
   same auth shell, the same rows read twice by the sync, nothing existing changes).
2. **Whether the feed carries a price/date at all** — B5/B6: it can (one `now`,
   `resolveBatchPrice`, `dates[0].date`), and after 2 Oct 2026 the promotions feed will show no
   masterclass item, so a card with no price would then be the only place a price appears in
   the widget. The listing card shows the price, not the date.
3. **`capacity`** — B7: 50 on every batch, a fact about the room; the standing ruling names
   seats/availability (`registered_count`). Serving `capacity` alone is not covered either way.
4. **Image field name** — E: the widget reads `image_url` on both existing cards; the cover is
   the raw `cover_image_url` (A2), no transform. `/api/corpus/promotions` does not emit it at
   all (A3) — filling it there is two lines on the promotion path, which this survey's
   constraints did not allow touching.
5. **Widget path for the new type** — D11/D12: a third array needs one pick in `chatClient`,
   one field in the dispatch and one in the reducer (three exact-keys pins to update:
   `chatState.test.mjs`, `chatTranscriptStore.test.mjs` RESTORED, `chatRatingThumbs` fixture),
   plus a carousel and its 3-test sibling; a `type` on `courses[]` needs a branch in the panel
   and none of the store changes, but today would render as a CourseCard until that branch
   exists.
6. **Level / instructor / duration on the card** — B4: all present on both rows
   (`level` → `LEVEL_MAP`, one or two instructor names, 1 day / 7 h); the existing course
   card shows duration and instructor pills, no level.

---

*Method: read-only Mongo `find` from a scratch script (deleted), files read as cited, no source
file modified, no tests run.*
