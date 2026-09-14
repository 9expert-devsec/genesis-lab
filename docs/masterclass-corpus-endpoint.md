# `GET /api/corpus/masterclass` — the read-only Masterclass content corpus

Round M2. Built to [masterclass-corpus-phase-a.md](./masterclass-corpus-phase-a.md) §9 under
the constraints in §1 below. The chatbot repo composes the `.txt` documents from these fields;
this route emits structured plain text and no prose of its own. Files:

| file | role |
|---|---|
| `src/app/api/corpus/masterclass/route.js` | auth (same key and check as promotions), `no-store`, `force-dynamic`, 500 on a build that throws |
| `src/lib/corpus/htmlToText.js` | the ONE HTML → plain-text converter (`htmlToText`) and the plain-field normaliser (`plainText`); pure |
| `src/lib/corpus/masterclass.js` | `masterclassCourseItem` (pure mapper), `findMarkup` (the guard), the default readers, `buildMasterclassCorpus` |
| `test/pure/masterclassCorpus.test.mjs` | 22 tests: converter, exact field set, exclusions, injected-read build, the guard, 503/401/200/500 through the route |

## 1. Decisions

1. **Course content only.** Nothing from `masterclass_batches` is served — not price, dates,
   early-bird deadline, venue, capacity or `registered_count`. `/api/corpus/promotions`
   serves the live offer per request; a corpus document is a snapshot refreshed at sync time,
   and two clocks in one answer is the defect. Seats stay out under the standing ruling
   ([promotions-corpus-endpoint.md](./promotions-corpus-endpoint.md) §1.3), which M1 §7
   found still wrong in production. The body carries a `source_note` saying so.
2. **`system_requirements_html` only.** The structured `system_requirements{}` object is
   never read: it is unrendered and contradicts the HTML on the Claude course.
3. **Register-page licence terms are not quoted** (`license_options.*`): contractual wording;
   the bot links to the page.
4. **Unrendered fields are not served:** `equipment_required[]`, `tags`, `faq_category`,
   `is_active`, `gallery`, `hero_gradient_*`, `cover_image_*`, batch `course_slug`.
5. **One title.** The model has `title_th` only (English by content on both rows); it is
   served as `title`. No `title_en` is invented.
6. **Predicates are imported, not re-implemented.** Published = `getPublishedMasterclasses()`
   (the `/masterclass` hub's and the sitemap's read); FAQs = `getLocalFaqsForCourse(...)`
   (`is_active` + display sort); instructors = `getInstructorsByIds(...)`, re-ordered to
   `instructor_ids` order. URL host = `CORPUS_PUBLIC_ORIGIN` from `lib/corpus/promotions`.
7. **The same `CORPUS_API_KEY`**, via the same `corpusAuthStatus`: 503 fail-closed when unset,
   401 empty body on a wrong or missing key.
8. **Markup is asserted absent.** Before the body is returned every string in it is walked;
   a markup-shaped `<` (`/<[a-zA-Z!/?]/`) makes the build throw and the route answer
   **500 `corpus_invalid`** with nothing partial. A bare `<` in prose ("x < 5") is not markup
   and passes. A `&lt;tag&gt;` typed into a rich-text field would decode to a tag and trip
   the guard — by design: a tag quoted by the bot is worse than a sync that fails loudly.

## 2. Response

```
{
  "generated_at": "2026-09-14T07:19:26.368Z",
  "source_note":  "course content only; prices, batch dates, … are served live by /api/corpus/promotions …",
  "count": 2,
  "courses": [
    {
      "id":              "masterclass:<course _id>",
      "slug":            "mas-ai-dmc",
      "course_code":     "M-AI-DMC",
      "title":           "AI Digital Marketing Creator Masterclass",
      "subtitle":        "…",                          // subtitle_th — also the promotions item's `description`
      "url":             "https://www.9experttraining.com/masterclass/mas-ai-dmc",
      "outline_pdf_url": "https://res.cloudinary.com/…pdf",
      "level":           "intermediate",
      "duration":        { "days": 1, "hours": 7 },
      "schedule":        { "days": ["เสาร์"], "time": "09:00–17:00" },
      "description":     "…",                          // description_html → text
      "objectives":      ["…"],                        // what you will learn
      "benefits":        ["…"],                        // what you will get
      "audience":        ["…"],                        // suitable_for[].label
      "prerequisites":   ["…"],
      "system_requirements": "- …\n  - …",             // system_requirements_html → text
      "curriculum": [
        { "session": "Morning (09.00 – 12.00)",
          "modules": [ { "no": 1, "title": "…", "topics": "- …\n- …\n  - …",
                         "workshop": null, "output": null, "notes": null } ] }
      ],
      "instructors": [ { "name": "…", "name_en": "…", "title": "…", "bio": "line\nline" } ],
      "faqs":        [ { "question": "…", "answer": "…" } ]
    }
  ]
}
```

Every string is plain text. Absent, empty and whitespace-only sources are `null` (scalars)
or `[]` (lists) — never `""`. `topics` comes from `topics_html` when present and from the
plain `topics[]` array otherwise, exactly as the detail page chooses. `workshop`, `output`
and `notes` (`content_html`) are empty on every live module and are carried so that an admin
filling them in needs no new round here.

## 3. Plain-text rules (`htmlToText`)

- block elements → paragraphs separated by one blank line;
- `<li>` → a line beginning `- `, in source order; a nested list is indented two spaces per
  level (`  - `) so the outline's hierarchy survives; `<ol>` is not numbered;
- a `<p>` inside an `<li>` is a word boundary, not a paragraph (TipTap wraps every item);
- inline tags vanish without inserting a space; `<br>` breaks a line;
- `<script>`/`<style>` bodies, comments and CDATA are dropped;
- entities decode (named set + numeric); whitespace collapses within a line; lines are
  trimmed; runs of blank lines collapse to one.

`plainText` (for non-HTML fields such as an instructor bio) trims, collapses spaces and
keeps single newlines, which is how the page renders a bio — one line per `\n`.

## 4. Measured against the live database (2026-09-14T07:19Z)

Called through the route as a function with the real readers (`node`, `@/` alias resolver,
no stubs; the key from `.env.local`): wrong key → 401 empty; no key → 401; right key → 200
`no-store`; **0 of 128 strings contain `<`**.

| field | mas-claude-ai-for-data-analyst | mas-ai-dmc |
|---|---:|---:|
| title / subtitle / course_code | 26 / 166 / 11 | 40 / 178 / 8 |
| url / outline_pdf_url / level / schedule.time / schedule.days | 74 / 111 / 12 / 11 / 5 | 54 / 113 / 12 / 11 / 5 |
| description | 594 | 561 |
| objectives (5 / 5) | 396 | 710 |
| benefits (5 / 5) | 520 | 659 |
| audience (4 / 7) | 106 | 448 |
| prerequisites (5 / 4) | 490 | 420 |
| system_requirements | 266 | 360 |
| curriculum: session labels (2) / module titles (6 / 7) / topics | 48 / 223 / 1,649 | 48 / 210 / 1,776 |
| instructors (1 / 2) name + name_en + title + bio | 159 | 290 |
| faqs (5 / 5) question + answer | 1,455 | 1,708 |
| **total text characters** | **6,322** | **7,611** |

Reconciliation with M1's composed documents (7,645 / 9,076): those included the licence
terms (606 / 521) and `equipment_required` (127 / 332), both excluded here by decision, plus
Markdown headings, `- ` prefixes on every array item and a batch line. Net of those the
figures agree within the converter's whitespace treatment; no field is dropped.

## 5. Operator notes

- No new environment variable. `CORPUS_API_KEY` is shared with `/api/corpus/promotions`.
- The chatbot's sync should call both routes: this one for the document body, promotions
  for anything with a price or a date.
- `generateJsonLd.js` still hard-codes the `masterclass.` subdomain (M1 §0); this route does
  not read it. Separate ticket.
