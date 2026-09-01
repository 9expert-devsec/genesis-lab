# Unsanitised HTML render sites — full measurement, before writing anything

**Run date:** 2026-09-01 · **Branch:** `dev` · **HEAD (at start):** `e5973db`
**Method:** read-only. Source reads/greps plus one read-only Mongo probe
(`scripts/_probe-unsanitized-html-fields.mjs` — `find()` only, no write, no
migration). **No writes to Mongo or MSDB. No source edits. No sanitiser
written yet — this is §1 only, and it stops here for allow-list approval.**

**Given, from audit `e5973db` (not re-derived):** `MasterclassCourse.description_html`
is written by a bare `{ $set: data }` with no schema and rendered by a bare
`dangerouslySetInnerHTML`. `Article.content` has no sanitiser either — the
render-time pass (`normalizeAuthoredColors`) documents itself as NOT one.
`sanitizeTopicHtml` is the working precedent: save AND render, a stated
allow-list, a running test proving editor output is a subset of it.

---

## 1.1 Every site that renders stored HTML to a user

The prior audit found two (`Article.content`, `MasterclassCourse.description_html`).
**This sweep found nineteen** `dangerouslySetInnerHTML` call sites that render a
stored field (the repo has ~50 occurrences total; the rest are JSON-LD `<script
type="application/ld+json">` — safe, `JSON.stringify` output, not HTML — or
comments, and are excluded from the table below). No `innerHTML =`,
`insertAdjacentHTML`, `document.write`, or `outerHTML =` site renders stored
content anywhere in the repo (checked; the only 4 hits on those patterns are a
test file, two dev-only probe scripts, and one hardcoded SVG-icon string in
`resizableImage.js`).

### Already closed — not part of this round's work

| Site | Field | Sanitiser |
|---|---|---|
| [SectionRenderer.jsx:292](../../src/components/pageBuilder/SectionRenderer.jsx#L292), [custom_html.jsx:21](../../src/components/pageBuilder/sections/custom_html.jsx#L21), [embed.jsx:36](../../src/components/pageBuilder/sections/embed.jsx#L36) (iframe provider) | PageBuilder `advanced.customHtml` / `custom_html` section / `embed` section (iframe) | `sanitizePageHtml` — real allow-list, host-whitelisted iframe, runs on every render |
| [SectionRenderer.jsx:288](../../src/components/pageBuilder/SectionRenderer.jsx#L288), [custom_css.jsx:30](../../src/components/pageBuilder/sections/custom_css.jsx#L30) | PageBuilder `advanced.customCss` / `custom_css` section | `scopeCss` — a dedicated CSS scoper (drops `html`/`body`/`:root` selectors, rejects unparseable/oversize input) |
| [CustomPageView.jsx:22](../../src/app/(public)/[...slug]/_components/CustomPageView.jsx#L22) | `CustomPage.body` | `sanitizePageHtml`, render-time |
| `CourseOutline.jsx` (via `courseOutlineView.js`) | `CourseExtension.trainingTopicsRich` | `sanitizeTopicHtml`, save **and** render (established in the given facts) |
| [CanvasPanel.jsx:159](../../src/components/pageBuilder/editor/CanvasPanel.jsx#L159) | n/a — `<style>` from `canvasCss(hoverKey, selKey)`, a function that only interpolates internal editor state keys (section paths), never user text | not a hazard — no stored content reaches it |

### Open — admin-authored, genesis owns the write path

| # | Site (file:line) | Field | Public or admin | Written by |
|---|---|---|---|---|
| 1 | [ArticleDetailClient.jsx:618](../../src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx#L618) | `Article.content` | **Public** | `ArticleForm.jsx`'s full Tiptap set (images, tables, colour, iframe/YouTube) |
| 2 | [ArticleForm.jsx:1403](../../src/app/admin/articles/_components/ArticleForm.jsx#L1403) | same, `previewData.content` — the admin's own just-typed draft | Admin-only | same |
| 3 | [FaqAccordionSection.jsx:107](../../src/components/faq/FaqAccordionSection.jsx#L107) | `LocalFaq.answer_html` — rendered on the course, program, skill, masterclass **and** career-path detail pages (all import this one component) | **Public** (5 route families) | `SimpleRichTextEditor`, via `CourseFaqManager` / `CareerPathFaqClient` / `ProgramFaqClient` / `SkillFaqClient` / `MasterclassFaqClient` |
| 4 | [MasterclassDetailClient.jsx:384](../../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx#L384) | `MasterclassCourse.description_html` | **Public** | `SimpleRichTextEditor` (given) |
| 5 | [MasterclassDetailClient.jsx:716](../../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx#L716) | `MasterclassCourse.system_requirements_html` | **Public** | `SimpleRichTextEditor` |
| 6 | [MasterclassDetailClient.jsx:830](../../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx#L830) | `MasterclassCourse.curriculum[].modules[].topics_html` | **Public** | `SimpleRichTextEditor` |
| 7 | [MasterclassDetailClient.jsx:868](../../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx#L868) | `MasterclassCourse.curriculum[].modules[].content_html` | **Public** | `SimpleRichTextEditor` |
| 8 | [MasterclassRegisterClient.jsx:228](../../src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx#L228) | `MasterclassCourse.license_options.choices[].info_popup.html_content` | **Public** (registration page) | `SimpleRichTextEditor`, [MasterclassCourseFormClient.jsx:895](../../src/app/admin/masterclass/_components/MasterclassCourseFormClient.jsx#L895) |
| 9 | [MasterclassRegisterClient.jsx:2103](../../src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx#L2103) | `MasterclassBatch.preparation_html` | **Public** | `SimpleRichTextEditor`, [MasterclassBatchListClient.jsx:426](../../src/app/admin/masterclass/[id]/batches/_components/MasterclassBatchListClient.jsx#L426) |
| 10 | [CareerPathDetail.jsx:97](../../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L97) | `CareerPath.description_html` | **Public** | **Correction to the prior audit** — see callout below |
| 11 | [CareerPathForm.jsx:499](../../src/app/admin/career-paths/_components/CareerPathForm.jsx#L499) | same, live preview of the admin's own draft | Admin-only | a bare `<textarea>` — no Tiptap at all, see callout |
| 12 | [HeroBannerCarousel.jsx:615](../../src/app/_components/home/HeroBannerCarousel.jsx#L615) | `Banner.slide_text` | **Public** (homepage) | legacy — see callout |

### Open — upstream-authored, genesis only mirrors and renders

| # | Site (file:line) | Field | Public or admin | Source |
|---|---|---|---|---|
| 13 | [promotions/[slug]/page.jsx:192](../../src/app/(public)/promotions/[slug]/page.jsx#L192) | `Promotion.html_content` (= upstream `detail_html`) | **Public** (fallback route, reached when the promotion has no Page Builder page yet) | `syncPromotions.js`, MSDB. Genesis has no write path — its own header states *"Genesis never writes back to MSDB"* |
| 14 | [FaqClient.jsx:35](../../src/app/(public)/faq/_components/FaqClient.jsx#L35) | `Faq.answer_html` (the `/faq` hub, distinct model from `LocalFaq`) | **Public** | `syncFaqs.js`, MSDB. No genesis write path |

**Two callouts, because they change the shape of the work:**

- **`CareerPath.description_html` is admin-authored, not upstream-only —
  correcting the prior audit.** `e5973db` characterized it as "synced from an
  upstream API field," which is true of the *sync job* but incomplete: the
  admin form ([CareerPathForm.jsx:474-503](../../src/app/admin/career-paths/_components/CareerPathForm.jsx#L474-L503)) has its own **plain `<textarea>`** —
  no Tiptap, no editor mediation at all — labeled *"เนื้อหา (HTML) — รองรับ
  HTML/CSS inline"* ("supports inline HTML/CSS") with a raw-tag placeholder
  (`<h2>หัวข้อ</h2>`), live-previewed via `dangerouslySetInnerHTML` right next
  to it. On submit this becomes `detail.contentHtml` → **dual-written to
  MSDB first, then mirrored into local Mongo** ([career-paths.js:6-13](../../src/lib/actions/career-paths.js#L6-L13),
  `msdbCreate`/`msdbUpdate`). This is the single most direct hand-typed-HTML
  path in the repo — no editor schema stands between the admin and the byte
  stream. It happens to be empty on all 10 live rows today (§1.2), which is
  why it wasn't caught by rendering alone, but the capability is live.
- **`Banner.slide_text` is a legacy field mid-retirement, not an active
  write path.** [bannerFormPayload.js:51-58](../../src/lib/banners/bannerFormPayload.js#L51-L58): the current Banner admin form
  no longer edits or previews it — it was replaced by `description`, and
  readers fall back with `description ?? slide_text`. But the fallback *is*
  still live at `HeroBannerCarousel.jsx:615`, and 6 of 22 stored banners
  still carry a non-empty value there (§1.2). It is not admin-editable
  today, only admin-editABLE **historically** — closing the render site
  costs nothing forward (no form writes it) and protects the 6 legacy rows.

---

## 1.2 What the stored HTML actually contains

Measured directly against the live database (`scripts/_probe-unsanitized-html-fields.mjs`,
`find()` only). Full tag/attribute unions in the script's output; summarised
here.

| Field | Rows | Non-empty | Tag union | Attr union | Already dangerous? |
|---|---:|---:|---|---|---|
| `Article.content` | 488 | 488 | 30 tags: `a blockquote br code col colgroup div em h1-h4 hr iframe img li ol p pre span strong sub sup table tbody td th tr u ul` | 26 attrs incl. `style`, `href`, `src`, YouTube params (`data-youtube-video`, `enableiframeapi`, …) | **41 `<iframe>` elements — all `www.youtube-nocookie.com`** (verified by hostname, every single one), the Youtube extension's intended output. No script, no on\*, no `javascript:`. |
| `LocalFaq.answer_html` | 36 | 36 | `a li p span strong ul` | `href rel style target` | none |
| `MasterclassCourse.description_html` | 2 | 2 | `p` | — | none |
| `MasterclassCourse.system_requirements_html` | 2 | 2 | `li ol p ul` | — | none |
| `MasterclassCourse.curriculum[].modules[].topics_html` | 13 rows | 13 | `li p span ul` | — | none |
| `MasterclassCourse.curriculum[].modules[].content_html` | 13 rows | 0 | — | — | none (all empty) |
| `MasterclassCourse.license_options…info_popup.html_content` | 3 rows | 3 | `h3 li ol p strong` | — | none |
| `MasterclassBatch.preparation_html` | 4 | 4 | `li ol p strong` | — | none |
| `CareerPath.description_html` | 10 | **0** | — | — | none (all empty — see callout above) |
| `Banner.slide_text` | 22 | 6 | **none — pure text, zero tags** | — | none |
| `Promotion.html_content` (upstream) | 21 | 21 | 35 tags incl. `script style meta title header main section` | 25 attrs incl. `onerror onmouseover onmouseout style` | **YES — see below** |
| `Faq.answer_html` (upstream) | 31 | 31 | `a br li p span strong ul` | `aria-level dir href` | none |
| `CustomPage.body` (control, already sanitised) | 1 | 1 | `iframe` | 7 attrs | 1 `<iframe>` — the sanitiser's intended, host-checked use case |
| `CourseExtension.trainingTopicsRich` (control, already sanitised) | 3 rows | 3 | `li ul` | — | none |

### The one field that is already dangerous today: `Promotion.html_content`

Upstream-authored (MSDB), not genesis-admin-typed, but rendered raw to the
public with no sanitiser anywhere in the chain — and it already contains
live, working hazards:

- **`<script>` present in 2 of 21 promotions** (`692e78d4…`, `6a212efd…`).
- **Inline event handlers in 3 of 21 promotions** (`692e78d4…`, `692eb068…`,
  `6a212efd…`) — real, functioning JS, e.g.
  `<a onmouseout="this.style.color='white';this.style.textDecoration='none';">`
  and `<img onerror="this.style.display='none'; …">`.
- **`<meta>`/`<title>`/`<header>` in 4 of 21** — someone pasted a full email
  or webpage fragment into the CMS field upstream, not a targeted attack, but
  it demonstrates the field is not curated markup — it is whatever landed in
  a rich-text box.

None of this is exploitable through a genesis write path (genesis never
writes `html_content`), but it **is** exploitable through the render path
today: any visitor loading `/promotions/<slug>` for one of those 3 slugs runs
that inline JS in their browser, unconditionally. This is the single
highest-priority render site in the whole sweep, and it's the one the prior
audit's two-site list didn't include at all.

---

## 1.3 The inline-colour picture

| Field | Values with `color`/`background-color` (style attr) or `<font color>` | Denominator |
|---|---:|---:|
| `Article.content` | **81** | of 488 |
| `LocalFaq.answer_html` | **8** | of 36 |
| `Promotion.html_content` | **4** | of 21 |
| every other field measured | 0 | — |

Only `Article.content` and `LocalFaq.answer_html` carry admin-chosen inline
colour via `style="color:…"` on a `<span>` — consistent with §1.1: the article
editor has `Color`/`TextStyle`, and `LocalFaq` is authored with
`SimpleRichTextEditor` which also keeps `Color`/`TextStyle` (per `e5973db`'s
§1.1). None of the `MasterclassCourse`/`MasterclassBatch` fields carry any —
consistent with their small live corpus (2 courses, 4 batches) rather than
with the editor being incapable of it (it is the same `SimpleRichTextEditor`).
`Promotion`'s 4 are upstream-authored, not genesis-editor output.

This is the same hazard `e5973db` §2.1 described for `Article.content`
(`normalizeAuthoredColors` mitigates it there, render-only, not a sanitiser)
— and it now has a second, smaller, real corpus in `LocalFaq.answer_html`
that no mitigation touches at all today.

---

## 1.4 Can `sanitizeTopicHtml` be generalised?

**Not by widening a parameter — its allow-list is hardcoded, and it is
structurally coupled to the topic-bullet shape in a way a course/article body
does not share.**

- **The allow-list is a module-level constant, not a parameter.**
  [sanitizeTopicHtml.js:78-141](../../src/lib/courses/sanitizeTopicHtml.js#L78-L141): `ALLOWED_TOPIC_TAGS`, `TOPIC_STYLES`,
  `ALLOWED_TOPIC_SCHEMES` and the full `SANITIZE_CONFIG` object are all
  declared at module scope and closed over by `sanitizeTopicHtml`. The
  function's only parameter is `{ maxDepth = MAX_TOPIC_DEPTH }` — depth, not
  tags.
- **It always runs `clampDepth` after sanitising** ([sanitizeTopicHtml.js:151-159](../../src/lib/courses/sanitizeTopicHtml.js#L151-L159)),
  a bullet-nesting-specific post-process imported from `topicHtml.js` that
  measures `<ul>`/`<li>` nesting depth and truncates past `MAX_TOPIC_DEPTH`.
  A course/article body has headings, paragraphs, tables and images —
  "nesting depth of bullet lists" isn't a concept that applies to it, and
  running `clampDepth` against one would either no-op uselessly or, worse,
  silently mangle a table nested inside a blockquote (untested territory —
  `clampDepth` was built and measured only against bullet-list fixtures).
- **The tag list itself is deliberately narrow for a reason that doesn't
  generalise**: no block-level element is allowed *because* the destination
  is always inside an `<li>` inside a CSS-grid accordion track
  ([sanitizeTopicHtml.js:11-25](../../src/lib/courses/sanitizeTopicHtml.js#L11-L25)). A course body isn't inside an `<li>`; the
  entire reason `<div>`/`<table>`/`<h2>` are excluded there doesn't hold for
  it.

**What a second, wider-allow-list caller would need, concretely:**
1. `allowedTags`/`allowedAttributes`/`allowedStyles`/`allowedSchemes` passed
   in (or selected by a named preset) rather than closed over.
2. The `clampDepth` call made conditional — skipped entirely for a caller
   whose shape has no list-depth concept — or factored out so it's opt-in.
3. Its own `TOPIC_STYLES` colour/font-size regexes are shape-agnostic
   already (they validate a CSS value, not a topic-bullet concept) and
   **could** be lifted into a shared constant rather than redefined, if a
   wider sanitiser wants to allow the same `color`/`font-size` grammar on
   `<span>`.

Given that, per the round's constraint ("if it can be generalised, extend
it; if not, state which you did and why"): **extending `sanitizeTopicHtml`
in place is the wrong shape** — its hardcoded config and unconditional
depth-clamp are load-bearing for *why bullets stay flat*, and parameterising
both away would make the module's own reason for existing (the accordion
block-box constraint) merely optional, which is how that constraint
regresses silently later. A new module is the right call; **the specific
things worth sharing between the two** (the colour/font-size regex grammar,
the URL-scheme constant shape, the fail-closed try/catch-returns-''
posture, `sanitize-html` as the one underlying library both use) are named
above so the two don't silently diverge on those specific points even
though their tag allow-lists differ by design.

---

## STOP — this is §1. No sanitiser has been written, no editor changed, no
render site touched. Awaiting the allow-list decision before §2.
