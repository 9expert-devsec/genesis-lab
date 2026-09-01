# Course rich body — reusing the Tiptap machinery that already exists

**Run date:** 2026-09-01 · **Branch:** `dev` · **HEAD (at start):** `74b97fd`
**Method:** read-only. Source reads and greps only. **No writes to Mongo or
MSDB. No source edits.**

**Decided, given (not re-opened here):** the rich body is genesis-owned, on
`CourseExtension`. MSDB's `title` stays out of scope and stays readOnly in the
form. The requirement is formatting "ทั้งหมด" — images and tables included —
which is broader than section 7's bullet editor, so this is about the
**article editor's** capabilities, not section 7's.

---

## 0. The finding that reframes the request

The team's mental model is "reuse the article editor." The repo has **three**
existing genesis-owned rich-HTML bodies, not one, and the closest precedent to
what is being asked for is not the article editor — it's the one nobody
mentioned.

| Field | Entity | Editor | Sanitized on save? | Sanitized on render? |
|---|---|---|---|---|
| `Article.content` | article | `ArticleForm.jsx`'s own Tiptap config (images, tables, colour, everything) | No | Only a colour-contrast pass that explicitly documents itself as **not a sanitizer** ([normalizeAuthoredColors.js:66](../../src/lib/articles/normalizeAuthoredColors.js#L66)) |
| `CustomPage.body` | custom page | Same Tiptap config as ArticleForm (byte-identical import list) | No | Yes — a real allow-list, `sanitizePageHtml.js` |
| `MasterclassCourse.description_html` (+ `system_requirements_html`, per-module `content_html`/`topics_html`) | masterclass course | `SimpleRichTextEditor.jsx` (no image/table/youtube) | **No — nothing sanitizes it, anywhere, ever** | **No — bare `dangerouslySetInnerHTML`** ([MasterclassDetailClient.jsx:384](../../src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx#L384)) |
| `CareerPath.description_html` | career path | not admin-authored — synced from an upstream API field (`detail.contentHtml`) | n/a (upstream content) | No sanitizer at the render site either ([CareerPathDetail.jsx:97](../../src/app/(public)/[...slug]/_components/CareerPathDetail.jsx#L97)) |

`MasterclassCourse` is a **course-shaped entity with a genesis-authored rich
body already shipping in production**, and it is the least safe of the four:
its write path (`updateMasterclassCourse`, below) has no field allow-list at
all, and its read path has no sanitizer at all. A "course rich body" that
mirrors this precedent inherits a real gap on day one, not a hypothetical one.

That reframes the options in §4: the question is not only "how do we reuse the
article editor," it's "do we also fix the pattern the nearest existing
precedent already got wrong."

---

## 1. The two existing Tiptap setups, side by side

*(Article editor and TopicBulletsEditor, as asked. `SimpleRichTextEditor` and
`CustomPageForm` are pulled in for context because §0 makes them load-bearing
too — see the callouts.)*

### 1.1 Extensions installed, and what's switched off

**Article editor** — [ArticleForm.jsx:319-401](../../src/app/admin/articles/_components/ArticleForm.jsx#L319-L401), its own inline `useEditor` config, not a shared module:

- `StarterKit` (all defaults, `heading: { levels: [1,2,3,4] }`), `Underline`,
  `Subscript`, `Superscript`, `TextStyle`, `Color`, `TextAlign`, `Placeholder`,
  `TiptapLink`, `ResizableImage` (shared, see 1.3), `Table` + `TableRow` +
  `TableHeader` + `TableCell` (resizable), `Youtube`, `CharacterCount`.
- **Nothing is switched off.** No excluded-extensions comment exists in this
  file the way it does for the other two editors below — there is no written
  reason for any StarterKit default, because none is disabled.
- It also has a raw-HTML **source view** (`sourceMode`/`sourceHtml` state,
  `toggleSourceMode` at [ArticleForm.jsx:426-438](../../src/app/admin/articles/_components/ArticleForm.jsx#L426-L438)) — a textarea an admin can paste arbitrary
  markup into, which then becomes `editor.commands.setContent(sourceHtml)`.

**TopicBulletsEditor** — extensions live in a separate module,
[topicEditorExtensions.js](../../src/components/admin/topicEditorExtensions.js), built explicitly to match a sanitizer allow-list:

- `StarterKit` with `orderedList`, `heading`, `blockquote`, `horizontalRule`,
  `codeBlock` all **off**, plus `listItem` replaced by a narrowed
  `TopicListItem` (content spec `paragraph bulletList*`, so a second paragraph
  inside one `<li>` cannot be authored at all — not stripped after the fact,
  structurally impossible). `Underline`, `Link` (protocols restricted to
  `http`/`https`/`mailto`), `Placeholder`, and a custom `TopicDepthLock`
  (caps nesting at `MAX_TOPIC_DEPTH`, Tab-key gated).
- **Stated reasons, quoted verbatim** ([topicEditorExtensions.js:18-49](../../src/components/admin/topicEditorExtensions.js#L18-L49)):
  - `orderedList` — *"THE ROWS ARE ALREADY NUMBERED... An ordered list inside
    the panel would add a third numbering scheme to a section that cannot
    keep two straight."*
  - `heading` / `blockquote` / `horizontalRule` — *"`<h2>`/`<h3>` open a block
    box inside an `<li>` — invalid nesting the browser reflows out of the
    list, and the accordion body is a grid track that would simply grow."*
  - `codeBlock` — *"same. The `code` MARK stays — inline code in a bullet is
    real."*
  - `Image, Table*, Youtube, TextAlign, TextStyle, Color, Subscript,
    Superscript` — **not installed at all**: *"The sanitiser would drop every
    one of them, and TextAlign is the one that would slip past a schema
    check — it is an ATTRIBUTE on paragraph, not a node or a mark, so
    `getSchema` still reads `paragraph` and the alignment vanishes at save
    with the contract green. It stays out by decision... because no test can
    catch it."*
  - **No source view**, on purpose: *"ArticleForm has one; this must not. A
    raw-HTML box is a way to put bytes into the field that the editor's own
    schema never approved."*

**For context — `SimpleRichTextEditor`** ([SimpleRichTextEditor.jsx:26-29](../../src/components/admin/SimpleRichTextEditor.jsx#L26-L29)):
*"Same core extension set as the Article editor but without
Image/Table/Youtube/Sub/Sup/CharacterCount."* It keeps `Color`/`TextStyle`/
`TextAlign`/headings/lists/links. This is what `MasterclassCourse.description_html`
is authored with, and what `TopicBulletsEditor` itself was forked from ([TopicBulletsEditor.jsx:22-31](../../src/components/admin/TopicBulletsEditor.jsx#L22-L31): *"SimpleRichTextEditor is the right BASE... It is not the right
COMPONENT, because its extension set is chosen for prose... every one of
those is either dropped by `sanitizeTopicHtml` or actively wrong inside an
`<li>`."*).

### 1.2 The sanitiser for each

| | Article editor | TopicBulletsEditor |
|---|---|---|
| **Module** | none dedicated — see below | [sanitizeTopicHtml.js](../../src/lib/courses/sanitizeTopicHtml.js) |
| **Allowed tags** | n/a | `ul, li, strong, em, u, s, sup, sub, code, br, span, a` — 12 tags, nothing that opens a block box ([sanitizeTopicHtml.js:78-80](../../src/lib/courses/sanitizeTopicHtml.js#L78-L80)) |
| **Allowed attributes** | n/a | `a`: `href, target, rel`; `span`: `style` (and only `color` + `font-size` on that style, hex/rgb only, no named colours) |
| **Where it runs** | Nowhere, as a *filter*. `normalizeAuthoredColors.js` runs at **render only**, and only classifies inline colour for dark-mode legibility — `allowedTags: false` / `allowedAttributes: false` puts `sanitize-html` in **pass-through mode**; its own header says so: *"THIS IS NOT A SANITIZER... Article bodies are rendered raw today"* ([normalizeAuthoredColors.js:66-70](../../src/lib/articles/normalizeAuthoredColors.js#L66-L70)). No filtering pass exists on save (`parseArticleFormData` at [articleFormPayload.js:67](../../src/lib/articleFormPayload.js#L67) does `String(formData.get('content') ?? '')`, and the Zod schema is `z.string().min(1)` — shape only, [article.js:63](../../src/lib/schemas/article.js#L63)) or on render. | Both — save (`buildTopicSavePayload`, [topicEditorSave.js:67](../../src/lib/courses/topicEditorSave.js#L67), and re-sanitised again server-side in `sanitiseTopicRichForWrite`, [topicEditorSave.js:163-170](../../src/lib/courses/topicEditorSave.js#L163-L170)) **and** render (`courseOutlineView.js`, "a THIRD time... stored bytes can predate any version of this code" — [topicEditorSave.js:151](../../src/lib/courses/topicEditorSave.js#L151)). |
| **Is the editor's output a subset of what the sanitiser allows?** | Not applicable — there is nothing restrictive to be a subset of. | **Yes, and proven by a running test**, not just a comment: `test/pure/topicEditorContract.test.mjs` checks the ProseMirror `getSchema` output against `ALLOWED_TOPIC_TAGS`, with the failure message *"the editor can author a tag sanitizeTopicHtml strips"* ([topicEditorContract.test.mjs:85](../../test/pure/topicEditorContract.test.mjs#L85)). |

`CustomPageForm` uses the **same** Tiptap config as `ArticleForm` (verified —
identical import list at [CustomPageForm.jsx:6-22](../../src/app/admin/pages/_components/CustomPageForm.jsx#L6-L22)) but its body **is** filtered
by a real allow-list at render, [sanitizePageHtml.js](../../src/lib/customPages/sanitizePageHtml.js): `sanitize-html`
defaults (which already include `table`/`thead`/`tbody`/`tr`/`td`/`th`, `p`,
`div`, headings, lists — verified against the installed package, not assumed)
plus `img`, `h1-h6`, `figure`, `figcaption`, an 11-host-whitelisted `iframe`,
`span`, `u`, `s`, `sub`, `sup`, `hr`. Like the article path, it is **not
re-sanitised on save** — `CustomPage.body` is stored raw and the model says so
outright: *"HTML from Tiptap; sanitized at render time"* ([CustomPage.js:17](../../src/models/CustomPage.js#L17)).
So this is a real, working example of "the same rich-editor extension set,
with a real filter" — closer to what a course body would need than the
article path itself.

### 1.3 Images, end to end (article editor)

- **Upload target:** the toolbar's upload button and the image-properties
  modal both POST to `/api/admin/upload` ([ArticleForm.jsx:1882](../../src/app/admin/articles/_components/ArticleForm.jsx#L1882)), a generic Cloudinary
  endpoint shared by every admin form, with a folder allow-list that already
  includes `'articles'` ([route.js:33-53](../../src/app/api/admin/upload/route.js#L33-L53)). 5 MB cap, `image/*` or `application/pdf`
  only, auth-gated.
- **What's stored in the HTML:** `chain().setImage({ src: data.url })` —
  **`src` only** ([ArticleForm.jsx:1890](../../src/app/admin/articles/_components/ArticleForm.jsx#L1890)). No `publicId` is stored anywhere on the article
  document or in the node's attributes (`ResizableImage`'s `addAttributes`
  only tracks `width`/`alt`/`style` — [resizableImage.js:288-308](../../src/lib/editor/resizableImage.js#L288-L308)).
- **Host:** Cloudinary (`res.cloudinary.com`), which **is** in
  `next.config`'s `remotePatterns` ([next.config.mjs:38-39](../../next.config.mjs#L38-L39)) — but that's moot for
  in-body images, because they render as plain `<img>` tags inside
  `dangerouslySetInnerHTML`, never through `next/image`. `remotePatterns`
  protects `next/image` call sites elsewhere on the site; it has no effect on
  what an article body can embed.
- **On delete:** **nothing.** `deleteArticle` is a bare
  `Article.findByIdAndDelete(id)` ([articles.js:494](../../src/lib/actions/articles.js#L494)) — no Cloudinary call. The only
  Cloudinary GC in the repo (`scripts/cloudinary-gc-dryrun.mjs`) is scoped
  **exclusively** to the `page-builder` subfolder and refuses to run wider,
  with its own header naming the risk explicitly: *"a too-wide scope pulls in
  assets owned by other features (**articles**, banners, instructors, …)
  whose references this walk does NOT collect, so it would mark THOSE live
  assets as orphans"* ([cloudinary-gc-dryrun.mjs:56-58](../../scripts/cloudinary-gc-dryrun.mjs#L56-L58)). Every image ever embedded
  in an article body is, and will stay, an orphan in Cloudinary after that
  article is deleted. A course body reusing this exact image flow inherits
  the same permanent leak.
- No `loading="lazy"` on in-body images — neither stock Tiptap `Image` nor
  `ResizableImage` sets it, so a 40-image course body would load every image
  eagerly regardless of scroll position.

### 1.4 Tables, including on mobile

**Recorded defect, and it is fixed** — at render time, not by migrating
stored HTML.

- **The defect** ([wrapArticleTables.js:6-14](../../src/lib/articles/wrapArticleTables.js#L6-L14)): `body { overflow-x: clip }`
  (globals.css, kept deliberately so `position: sticky` on the header
  doesn't break) means a table wider than the content column has **no**
  scrollbar, no touch-drag, not even programmatic `scrollLeft` — the columns
  are unreachable, not merely off-screen. Measured at 10 of 103 tables in the
  live corpus (five- and six-column ones; four and under fit).
  `table { display: block; overflow-x: auto }` was tried and rejected: a
  block-display `<table>`'s row-group children force an anonymous table box
  that is shrink-to-fit and unreachable by any selector, regressing 93 tables
  to rescue 10.
- **The fix:** [wrapArticleTables.js](../../src/lib/articles/wrapArticleTables.js) runs at render time (`page.jsx:143`, **after**
  the colour pass — order is load-bearing in that one direction, documented
  inline) and wraps each `<table>` in a `div.article-table-scroll` using
  `parse5` (chosen over `htmlparser2`, measured: 71/72 byte-identical
  round-trips vs 34/72). The wrapper is `overflow-x: auto`, `tabindex="0"`,
  `role="region"`, numbered `aria-label="ตารางที่ N"` — [globals.css:714-740](../../src/app/globals.css#L714-L740).
  Focus-visible ring, and dark/light-specific edge-fade gradients so the
  scroll affordance is visible in both themes ([globals.css:788-800](../../src/app/globals.css#L788-L800)).
- **Mobile:** no separate handling — `overflow-x: auto` is native browser
  touch-scroll, so the same wrapper that fixes desktop covers touch-drag on
  mobile with no extra code. Nothing stored is migrated; a table's bytes in
  Mongo are untouched, exactly like the colour pass.

TopicBulletsEditor has no tables at all — they're one of the extensions
switched off (§1.1) — so it has no analogous defect and no analogous fix to
report.

---

## 2. The known hazards

### 2.1 Inline colour — how it enters, and the mitigation's real scope

**How a colour enters an article today:** `TextStyle` + `Color` extensions
([ArticleForm.jsx:327-328](../../src/app/admin/articles/_components/ArticleForm.jsx#L327-L328)) wired to a colour-picker toolbar control (not traced
further here — out of scope per "no JSX," but the extensions are the only two
that can emit a `style="color:…"` span). Nothing in the sanitiser chain
strips it, because — restated from §1.2 — there is no sanitiser chain for
articles, only the pass-through colour classifier.

**Current mitigation, precisely:** [normalizeAuthoredColors.js](../../src/lib/articles/normalizeAuthoredColors.js) runs at render,
computes WCAG relative luminance for every inline `color`/`background-color`
declaration, and **adds** `data-authored-fg="dark|mid|light"` (and `-bg`)
without touching the original declaration. `globals.css` then overrides with
`color: inherit !important` only for the two hopeless combinations (dark ink
on dark theme, light ink on light theme) — [globals.css:821-825](../../src/app/globals.css#L821-L825). The module is
explicit that this is **not** an accessibility fix: the 3:1 floor used is WCAG
AA for *large* text, not the 4.5:1 body-copy floor, and no single colour can
clear 4.5:1 against both theme backgrounds at once ([normalizeAuthoredColors.js:28-34](../../src/lib/articles/normalizeAuthoredColors.js#L28-L34)).

**What a course body reusing the article editor would inherit:** the exact
same hazard, verbatim — same `Color`/`TextStyle` extensions, same absence of
any save-time normalisation, same reliance on a render-time patch that only
neutralises the worst case.

**What would have to change to avoid it, and the cost:**
- *Turn off `Color`/`TextStyle` entirely* — clean, but is a real capability
  loss ("ทั้งหมด" the team asked for did not explicitly ask for colour, so
  this may be acceptable — a product call, not a technical one). Turning
  it off for a **new** field breaks nothing existing, since no course body
  exists yet.
- *Keep it, reuse `normalizeAuthoredColors` at render* — the function is
  generic over "an HTML string with inline colour," not article-specific, so
  it could run on a course body's render path unchanged. It does not fix the
  underlying inconsistency (still not AA), it only avoids literally
  unreadable text, same as it does for articles today.
- **Turning it off for existing articles would break them:** ~200 of 484
  published articles carry hardcoded inline colours today ([normalizeAuthoredColors.js:11](../../src/lib/articles/normalizeAuthoredColors.js#L11)); a
  sanitiser change is scoped to whatever new field/editor instance is built,
  and does not touch the article path, so there's no shared-mitigation
  removal risk *if* course-body reuses a **separate** editor instance/config
  from `ArticleForm`'s. If instead the literal `richTextExtensions`/config
  object were shared and mutated, that risk would become real — another
  reason not to share the literal config object.

### 2.2 Every other trap a second consumer would inherit

- **No save-time sanitisation, articles or custom pages.** Both store raw
  Tiptap HTML and filter (or don't) only at render. The topic path's own
  comment states the general rule the article path violates: *"The store is
  not a trust boundary"* ([sanitizeTopicHtml.js:146-149](../../src/lib/courses/sanitizeTopicHtml.js#L146-L149),
  [topicEditorSave.js:137-149](../../src/lib/courses/topicEditorSave.js#L137-L149)). A server action is a POST endpoint; a client-only
  filter (even a real one) is "a formatting convenience, never a boundary."
  This makes `MasterclassCourse`'s write path (§0 table — `{ $set: data }`,
  no schema, no allow-list, [masterclass.js:32-39](../../src/lib/actions/masterclass.js#L32-L39)) the worst-shaped precedent
  in the repo and the one most tempting to copy by habit.
- **Empty-value detection has no shared helper**, and is duplicated
  ad hoc three times with three slightly different implementations:
  - `ArticleForm.jsx:458`: `html.replace(/<p>\s*<\/p>/g, '').trim()`
  - `CustomPageForm.jsx:231`: the identical regex, copy-pasted
  - `page.jsx:52-62` (article reading-time): a *different* regex that strips
    all tags, used to detect "no text at all" for a `Math.max(1, …)` word
    count, not reused by either form.
  None of these handle Tiptap's actual empty-doc output robustly (e.g. a
  paragraph containing only a `<br>`), they just happen to work for the one
  shape StarterKit currently emits for "nothing typed." Whichever field this
  becomes, its own empty check needs writing — there is nothing to import.
- **The hydration gap.** `ArticleDetailClient.jsx` documents a real, load-
  bearing complexity: heading-ID injection (for the table of contents) can't
  run synchronously against `dangerouslySetInnerHTML` content, so it retries
  with backoff (50/100/200/400/500ms) to *"cover the dangerouslySetInnerHTML
  hydration gap"* ([ArticleDetailClient.jsx:71-74](../../src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx#L71-L74)). This only matters if a course
  body needs heading-based navigation (a TOC); if it's rendered as a single
  block with no in-page anchors, this entire mechanism is unnecessary
  complexity to not copy.
- **SSR:** correctly handled everywhere already — **all five** `useEditor`
  call sites in the repo (`ArticleForm`, `CustomPageForm`, `TopicBulletsEditor`,
  `SimpleRichTextEditor`, the page-builder `RichTextEditor`) set
  `immediatelyRender: false`. This is not a gap; it's the one convention that
  is already consistent and would be inherited correctly by construction.
- **No lazy loading on in-body images** (§1.3) — same trap regardless of
  which editor is reused, since both `Image` and `ResizableImage` are the
  same underlying Tiptap node.
- **Cloudinary orphaning on delete** (§1.3) — inherited automatically unless
  explicitly designed around; nothing in the upload/delete flow is
  editor-specific, it's a property of the shared `/api/admin/upload` +
  "nothing ever calls destroy" pattern.

---

## 3. Where it would live

### 3.1 CourseExtension today

Full field list ([CourseExtension.js:82-204](../../src/models/CourseExtension.js#L82-L204)): `courseId`, `upstreamId`,
`formerCodes`, `urlAlias`, `metaTitle`, `metaDescription`, `ogImage`, `tags`,
`gallery`, `isPublished`, `omisePaymentEnabled`, `trainingTopicsRich`.

- **Read on the course detail page:** [resolveCourse.js](../../src/lib/resolveCourse.js) resolves `{ course,
  extension }`; `extension` is fetched with `.catch(() => null)` at
  [resolveCourse.js:154](../../src/lib/resolveCourse.js#L154) and every downstream read is optional-chained
  (`extension?.metaTitle`, `extension?.gallery` defaulted to `[]`, etc. —
  [page.jsx:395-402](../../src/app/(public)/[...slug]/page.jsx#L395-L402), [page.jsx:845](../../src/app/(public)/[...slug]/page.jsx#L845)).
- **Written from the admin:** `saveCourseExtension` ([course-extensions.js:248-](../../src/lib/actions/course-extensions.js#L248))
  runs `sanitiseTopicRichForWrite(data)` then `buildExtensionUpdate(...)` then
  `CourseExtension.findOneAndUpdate({ courseId }, update, …)`.
- **A course with no extension row:** behaves as if every extension field is
  absent — confirmed explicitly in the resolver's own comment: *"a course with
  no extension row at all"* is handled by checking `extension?.isPublished
  === false` rather than `!isPublished`, specifically so absence doesn't read
  as "hidden" ([resolveCourse.js:178](../../src/lib/resolveCourse.js#L178)). A new rich-body field would behave
  identically by construction — `extension?.newField` undefined, same as
  every other field today.

### 3.2 `trainingTopicsRich`'s save-path gate — reusable or not?

**Reusable, directly, no new guard needed.** The gate is generic, not
per-field: [extensionUpdate.js](../../src/lib/courses/extensionUpdate.js) selects keys by
`Object.prototype.hasOwnProperty.call(data, key)` — **presence, never
value or truthiness** — over a declared `EXTENSION_FIELDS` list, each with its
own `coerce` function. A key the caller doesn't name is left alone; only a
key the caller explicitly sent gets written, including `''`/`[]`/`false`.
`trainingTopicsRich` already follows the pattern that matters here: *"NO
FALLBACK ENTRY OF ITS OWN, deliberately... There is no value this builder
could invent for an absent key that would not be a wipe"* ([extensionUpdate.js:132-139](../../src/lib/courses/extensionUpdate.js#L132-L139)).

A new rich-body field is added to `EXTENSION_FIELDS` with its own `coerce`
(no fallback, same shape as `trainingTopicsRich`'s) and every existing caller
that doesn't send it (there would be none at launch, but the pattern is what
protects the *next* caller that doesn't know about the field) automatically
leaves it alone. **This is exactly the gate that would have prevented the two
recorded blind-write incidents** this repo already has on record:

1. `omisePaymentEnabled` — *"silently reset to false by a caller that did not
   render the toggle"* ([extensionUpdate.js:30-31](../../src/lib/courses/extensionUpdate.js#L30-L31)), the incident that got this
   builder written in the first place.
2. `title`/`bullets` on the MSDB course payload — the read-blind pair fixed
   in `74b97fd` (this session's prior commit): two keys the admin form could
   type into but that silently overwrote real upstream content on every
   save, because genesis could never read them back to know what it was
   about to clobber.

**Difference from `trainingTopicsRich` worth naming:** that field's real
complexity isn't the write gate, it's [topicRichState.js](../../src/lib/courses/topicRichState.js) — a **staleness
detector**, because `trainingTopicsRich` is an *overlay* on an MSDB-owned
array (`training_topics`) that MSDB's own admin can also edit, so genesis has
to detect when the two have drifted apart and fall back to plain. A course
rich body has **no MSDB counterpart to drift from** — `title` is out of scope
entirely per the brief — so it would need none of that machinery. It is
structurally a plain optional field, closer to `metaDescription` than to
`trainingTopicsRich`.

### 3.3 Where it would render, and whether "rich or teaser" fits

`course_teaser` renders today in exactly one place:
[CourseDescription.jsx](../../src/app/(public)/[...slug]/_components/CourseDescription.jsx):

```jsx
export function CourseDescription({ course }) {
  const teaser = course?.course_teaser;
  if (!teaser) return null;
  return (
    <ContentSection id="description" title={course.course_name}>
      <p className="whitespace-pre-line">{teaser}</p>
    </ContentSection>
  );
}
```

Two things worth flagging precisely:

- It's **plain text today** (`{teaser}`, React-escaped), not HTML. Swapping
  in a rich body means this specific line changes from interpolation to
  `dangerouslySetInnerHTML={{ __html: … }}` — a real, if small, behavioural
  change to an existing component, not purely additive.
- `ContentSection` ([ContentSection.jsx](../../src/app/(public)/[...slug]/_components/ContentSection.jsx)) is a thin `{title, children}` wrapper
  with no opinion about its children's shape, so **the fallback shape fits
  without restructuring**: the existing `if (!teaser) return null` becomes
  `if (!body && !teaser) return null`, and the body renders `richBody ||
  <p>{teaser}</p>`.

**Is "whitespace-only / `<p></p>` as empty" already handled anywhere?** Yes,
but — as noted in §2.2 — by three separate, non-shared, ad hoc
implementations, not a reusable helper. Whichever of them (if any) gets
reused, it should be extracted first rather than copied a fourth time.

---

## 4. Options

### A. Reuse the article editor wholesale

Same extension list as `ArticleForm.jsx`, verbatim: images, tables, colour,
alignment, subscript/superscript, YouTube, character count, source view.

- **Sanitiser:** none exists to reuse — would ship with the article path's
  current posture (raw storage, colour-only render pass) unless one is
  written. That is the same gap the article path already has, just extended
  to a second field.
- **Images/tables:** both covered, because nothing is switched off.
- **Dark-mode exposure:** full — `Color`/`TextStyle` included, same as
  articles, same as §2.1.
- **New vs. reused code:** least new code for the editor itself (import the
  same extension list into a new `useEditor` call, or genuinely share the
  config — sharing raises the risk noted in §2.1 about a future fix to one
  diverging from the other). Sanitiser and image-lifecycle work would be
  entirely new either way, since the article path doesn't have either.

### B. Reuse it minus specific extensions

Drop `Color`, `TextStyle`, `TextAlign`, `Youtube`, `Subscript`, `Superscript`,
`CharacterCount`, and the source view. Keep `StarterKit` (headings, lists,
blockquote), `Underline`, `Link`, `ResizableImage`, `Table*`.

- *Why each drop:* `Color`/`TextStyle` is §2.1's entire hazard, gone at the
  root rather than mitigated. `TextAlign` is the extension the article
  editor's own header names as the one a schema check *cannot* catch
  ([tiptapExtensions.js:34-36](../../src/components/pageBuilder/editor/richText/tiptapExtensions.js#L34-L36), same fact stated for the page-builder
  editor — it applies identically here since it's a Tiptap/ProseMirror
  property, not something specific to that file). `Youtube`/Sub/Sup are
  outside "images and tables," the stated requirement. The source view is
  the one thing `topicEditorExtensions.js` calls out by name as
  incompatible with any schema guarantee at all.
- **Sanitiser:** still needs writing, but the allow-list is smaller and the
  precedent to model it on already exists and already works —
  `sanitizePageHtml.js`'s defaults-plus-`img`/headings/tables config is
  close to exactly this option's needs, minus its iframe host-list (no
  embeds requested here) plus explicit table-tag coverage (already in
  `sanitize-html`'s defaults, confirmed against the installed package
  version — no config needed for that part).
- **Images/tables:** both covered, same flow as A (reuse §1.3/1.4 as-is,
  including their unfixed image-lifecycle gap unless that's addressed too).
- **Dark-mode exposure:** none — the hazard is removed, not mitigated.
- **New vs. reused code:** a genuinely new `useEditor` config (can't literally
  reuse `ArticleForm`'s object, since it's excluding named pieces of it), a
  new sanitiser module modeled closely on an existing one, reused image
  upload/table-wrap/table-CSS machinery as-is.

### C. Extend `TopicBulletsEditor` upward toward the requirement

Start from `topicEditorExtensions.js`'s pattern (schema-constrained,
contract-tested against a real sanitiser) and add back only `Image`, `Table*`,
and enough block structure (`heading`? `paragraph` is already implied) to
carry a real body, rewriting `sanitizeTopicHtml`'s allow-list to match.

- **Sanitiser:** this is the option that keeps §1.2's strongest property —
  editor output proven a subset of the sanitiser by a running schema-vs-
  allow-list test, not just a comment. That test would need rewriting for
  the new, larger contract, but the *pattern* (and the CI-enforced guarantee
  it buys) carries over directly.
  Note `SimpleRichTextEditor` is explicitly the base this editor was already
  forked from once (§1.1) — this option is forking it a second time, in the
  direction of more capability rather than less, which is the inverse of how
  `TopicBulletsEditor` itself came to exist. It also means fixing
  `SimpleRichTextEditor`'s consumers get nothing from this work — that
  editor's own zero-sanitisation gap for `MasterclassCourse.description_html`
  (§0) stays exactly as open as it is today.
- **Images/tables:** neither is covered *yet* — both would be new additions
  to a contract that currently has neither, unlike A/B where they're already
  proven to render (article/custom-page renderers already handle them).
  Rendering a course body isn't `tiptapToReact.jsx`'s walker or a bespoke
  React renderer today, either — it would render via `dangerouslySetInnerHTML`
  like articles/custom pages, since that's the pattern every genesis-owned
  rich-HTML field in the repo uses (`courseOutlineView`/`CourseOutline.jsx`
  included).
- **Dark-mode exposure:** none, same as B — `Color`/`TextStyle` were never in
  this editor's family to begin with.
- **New vs. reused code:** most new code of the three — a genuinely new
  extension module, a genuinely new (larger) sanitiser allow-list, a new
  contract test, and — unlike A/B — no existing table-overflow CSS/wrapper
  or image-upload wiring to reuse for *this specific field*, since
  `topicEditorExtensions.js`'s family has never had either.

---

## 5. What I could not determine, and why

- **What toolbar control actually emits a `Color`/`TextStyle` mark in
  `ArticleForm.jsx`.** The two extensions are wired in the `useEditor` call,
  but I did not trace `EditorToolbar`'s ~1866-2100 line body to find the
  specific colour-picker control and confirm exactly which values it can
  emit (a fixed palette vs. a free `<input type="color">`) — out of scope
  under "no JSX," and not necessary to answer "does colour enter the body,"
  only "how, precisely, in the UI." `sanitizeTopicHtml.js`'s own comment
  ([sanitizeTopicHtml.js:91-92](../../src/lib/courses/sanitizeTopicHtml.js#L91-L92)) says the topic editor's colour picker is
  `<input type="color">`-shaped (hex/rgb only); whether the article editor's
  is the same or free-typed CSS was not confirmed.
- **Whether `MasterclassCourse.description_html`'s live corpus has ever
  actually carried anything unsafe.** I confirmed the write and read paths
  have no sanitiser at any point (§0, §2.2) — a structural gap — but did not
  query production Mongo (read-only audit, and the running app's DB access
  wasn't exercised) to say whether that gap has ever been exploited or
  merely never been tested. Treat the gap as real and unmitigated regardless
  of whether it's been hit.
- **The exact toolbar/UI wiring for the image-properties modal's colour or
  size controls beyond what `imageModalAttrs`/`resizableImage.js` already
  documents** — same "no JSX" scoping reason as above; the data-shape
  contract (§1.3) is fully covered, the modal's own component tree was not
  opened.
- **Whether `sanitize-html`'s bundled defaults exactly match what
  `CustomPageForm`'s Tiptap config can emit** (i.e., whether §1.2's "editor
  output ⊆ sanitiser" property holds for the custom-page path the way it's
  *proven* to for TopicBulletsEditor). I confirmed the tag lists overlap
  heavily and checked the installed package's actual default list rather
  than assuming it, but there is no running contract test for this pair the
  way `topicEditorContract.test.mjs` exists for the topic path — so unlike
  §1.2's TopicBulletsEditor answer, this one is asserted from reading, not
  proven by a test that runs. Option C would inherit the provable version;
  A/B would not, unless such a test were written alongside them.
