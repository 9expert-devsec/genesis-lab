# Page Builder — status & decision record

Where the Page Builder actually stands, and **why** the gaps are gaps. Not a
TODO list: each entry is a decision with its reason and its cost. Keep it under
a page — a status doc nobody reads is worse than no doc, because it looks
authoritative while rotting.

Phase 1 (foundation) and 2A (rendering) shipped. **2B (editor) is complete and
has been through a browser pass** (see *Browser pass* below). **2C shipped the
self-contained components**: 3 Cards (`price_card`/`stat_card`/`icon_card`) and
all 4 Advanced (`custom_html`/`custom_css`/`embed`/`debug_json`). The 6
data-backed types (`course_card`, `instructor_card`, and the 4 Dynamic) are
deferred to **2C.2** — they need a request-time upstream fetch (async server
components), which the client-side canvas cannot draw; see forward-dependency
2C.2. JSON-LD and rollback are still 2C-tail/Phase 3.

## The three questions

The codebase makes three different questions look like one. "Zod is the single
source of truth" is true **only of the first**:

| Question | Answer lives in | Says |
|---|---|---|
| What is **valid**? | `lib/schemas/pageBuilder.js` | 27 section types, 4 `mobileBehavior` values, `CARD_STYLES`, `background:'image'` |
| What **renders**? | `SectionRenderer`'s `REGISTRY` | 21 types (after 2C). The other 6 — the data-backed types — validate, save, reload, and publish **nothing** |
| What is **honoured**? | the components themselves | `cardStyle`: `price_card`/`stat_card`/`icon_card` (2C). `ratio`: `two_column` only. `columns`: `card_grid`+`highlight_grid`. `buttonStyle`: `cta`+`price_card`. `two_column` honours only `reverse_stack`; `card_grid` only `carousel`; `hide` reaches nothing. `background:'image'` → `''` |

**Rule: the schema is the single source for _validation_, not for _existence_ or
_effect_.** Derive a picker from it and an author can add a `course_card` that
saves fine and publishes an empty page. Derive a settings control from it and the
author sets a value nothing reads — it looks like it worked, the page doesn't
change, nothing errors. The picker derives from `REGISTRY`; the panels derive
from what components actually read.

The same split appears at page level: `showHeader`/`showFooter`/`showStickyCta`
and all of `jsonLd` are stored, tier-checked, preserved — and read by nothing.
No controls exist for them.

## Self-retiring assertions

Every exclusion above ships a check that **fails loudly when the excluded thing
becomes real**, so exclusions can't rot into stale filters:

- `backgroundClass('image') === ''` → *"if this fails, image is implemented — delete the filter"*
- ~~`cardStyle` read by no component~~ **RETIRED in 2C, as designed**: the 2C Card components read `style.cardStyle`, the zero-reader assertion fired, and the panel paid its debt — the `cardStyle` control now lives in `SectionTypeFields` (per-type, on the card types). The live assertion is now the reader-set below.
- **`style` reader↔control: no longer an assertion — a structure (2C.3, DONE).** `cardStyle`/`buttonStyle` controls are DERIVED from `SECTION_STYLE_CAPS`, the same declaration the components read from (via the private-gated capability helpers), so reading a prop and offering its control cannot drift. There is nothing to assert about their correspondence; the three witnesses (`npm test`) prove the wire renders, the panel derives, and the raw fns stay private. **The LAYOUT reader-sets (`ratio`/`columns`/`mobileBehavior`) are NOT yet structural** — they stay a hardcoded per-type map and still carry the old exposure: a container that reads a layout prop without a panel control fails silently. Apply the 2C.3 pattern there later (precondition: confirm those readers are uniform first).
- `tiptapToReact` asserts its renderer tables match `richTextContract.js` at module load (throws; verified by injecting drift — the build dies)
- `RichTextEditor` imports no `@tiptap/extension-*` directly, only the verified list
- `PageBuilderView` still says `ACCEPTED, NOT HONORED`; the route still emits no builder JSON-LD
- **the thing that creates a default and the thing that rejects it share one definition.** The new-page seed (`app/admin/pages/builder/new/page.jsx`) imports `PLACEHOLDER_SLUG`/`PLACEHOLDER_TITLE` from `publishReadiness.js` — the same module that blocks publishing them. If they drifted, the gate would pass a page that still looks untouched: a check that *can't* fail, arriving through the back door. Any "reject the default" gate must import the default, never restate it.

**Ask of every check: _what would have to be true for this to pass while the
thing it guards is broken?_** This failure mode has surfaced three times here —
the false-green module graph (`_`-prefixed folders never compile), a vacuous
`ok(..., true, ...)`, and two Tiptap checks that verified the indirection instead
of the component that could bypass it. It is not fixed; it keeps finding new
doors. **The inverse matters too:** a check that _fails_ while the code is fine
erodes trust in the run just as fast — a guard here matched the word "rollback"
in the UI copy that exists to _tell authors rollback is Phase 3_.

Every check needs a **control** proving it can fail. Default `StarterKit` leaking
`codeBlock` is the model.

## Traps (each has bitten once)

- **Tailwind `content` globs** must include `./src/lib/pageBuilder/**` or preset classes silently vanish in prod.
- **A green `next build` proves only what's in the module graph.** `_`-prefixed folders are App Router *private* and never compile — this once hid a syntax error behind a green build. Verify by observable side-effect.
- **First Load JS is the wrong number to hold a new component to — route-specific JS is the right one.** Adding a section component changes the module graph, which reshuffles Next's chunk boundaries and nudges First Load JS by ±~1 kB on MANY routes at once, *including routes that can't import the new code* (2C.2a moved `/admin/about`). What a component actually costs the public page is its **route-specific** size — `/[...slug]` is 13.6 kB, unchanged by 2C.2a. The honest guarantee is "no new client module in the route graph," verified by route-specific size + checking the client-bearing deps were already present; NOT "First Load JS didn't move," which chases reshuffle noise. (2C.2a's "must not move 135 kB" was aimed at First Load and would have done exactly that.)
- **Components fail closed and tell no one.** `cta` renders *no button* on a bad href or missing label; `image` renders nothing without `src`; the rich-text walker unwraps unknown blocks to naked text. The renderer is right; the author is blind. Every editor warning exists for one of these.
- **Verification is `npm test`** (`node:test` + a committed loader; see §Item 1) — real modules run under Node with the `@/` alias resolved. It is NOT in CI (row 1-CI), and it structurally cannot catch the module-graph false-green above — that still needs an observable-side-effect check on the build.

## 2C.2 — the canvas invariant was not in conflict

The 6 data-backed types *looked* like they forced a choice between two
concessions (an async server component rendering inside the client canvas, or
client-fetch islands). Both options accepted a **false premise: that a
data-backed component must fetch where it renders.** `CourseCard` has no
server-only code — the async-ness lives in the **fetch**, not the **render**.
Hoisting the fetch **above** `SectionRenderer` (the server page pre-fetches; the
canvas pre-fetches via one admin-gated server action; both inject the result as
props into the one *sync* renderer) dissolves the conflict instead of paying for
it. **Lesson for the next apparent invariant conflict: check whether it is real
before shopping for concessions.**

Two things that look like costs and are not — stated so they aren't re-litigated:

- **ISR freshness is not new.** `/[...slug]` already renders `course_price` and
  schedules under `revalidate = 3600`/`1800`; two visitors an hour apart already
  see different data. A `course_card` at the same ISR is the accepted MSDB model,
  not a 2C.2 concession — the canvas showing edit-time data is no less "what
  publishes" than one ISR snapshot is versus another.
- **The public bundle adds no new client module.** Card presentation is
  server-rendered on the public page; the canvas fetch is client but
  **admin-only**. `/[...slug]` **route-specific JS is unchanged at 13.6 kB** —
  the data-backed components are server components, and their one client-bearing
  dependency (`CourseCard`'s `<Button asChild>` → `@radix-ui/react-slot`) was
  already in that route's graph before 2C.2a. First Load JS reads 135→136 kB, a
  ~1 kB move that tracks Next's cross-route chunk-boundary reshuffle (unrelated
  routes such as `/admin/about` moved the same amount), not a new import. The
  gated draft preview `/preview/[slug]` DID grow ~1.7 kB: it now renders course
  cards it never loaded before — expected, and not a published page.

**canvas-EXTRA vs canvas-FAKE** — the distinction `debug_json` established.
`debug_json` shows a `<pre>` in the canvas that never publishes: canvas-EXTRA, an
inspection affordance that is *never* published content. A placeholder course
card is canvas-FAKE: a mock standing in for content that *will* publish —
differently, or not at all. The test is **could an author trust it and publish
blind?** A `<pre>` that never publishes fails that test harmlessly; a plausible
card does not. That is why 2C.2b's label is a first.

**The split, and why 2C.2b does not ride along:**

- **2C.2a (authored references)** — `course_card`, `instructor_card`,
  `course_selector`, `bundle_courses`, `course_list:source='manual'`. The canvas
  shows the **real** entity (edit-time fetch), through the one renderer,
  validated, with a **fail-closed editor warning** when an id resolves to
  nothing (the warning is what makes this honest rather than a placeholder).
  Costs the invariant **nothing**. The warning is driven by a TRI-STATE, not a
  boolean — `undefined` = fetch in flight, `null`/`[]` = found nothing, entity =
  found — because the resolve is async and debounced: a "falsy → warn" collapse
  would flash "not found" on every keystroke and train authors to ignore it,
  which erodes *every* editor warning, not just this one. Reasoning kept at the
  code (`SectionContentEditor` / `EditorProvider`) per item 1's mitigation.
- **2C.2b (derived / time-varying)** — `course_list:source='skill'|'program'`,
  `course_schedule`. The set/rows are a function of request time, so the canvas
  can only show an edit-time **sample** — the first time this codebase would ship
  a canvas that knowingly shows content the published page won't match. Browser
  pass #2 rejected a canvas placeholder on this exact principle; 2C.2b asks for a
  narrow, **labelled** exception to it. **An exception to a rejected principle
  gets its own decision with that precedent in front of it — it does not land in
  the same pass as five components that cost nothing, where it is waved through
  as a rounding error.** Deferred.

**`course_list` straddles the split** and must not be the door 2C.2b walks
through early. Gate: `courseListContent.source` is narrowed to `['manual']` in
the schema (DB scan: 0 stored `course_list` sections → nothing to migrate, same
method as the embed `script` drop). A narrowed enum means an unhonoured `source`
cannot be *set* — no accepted-not-honored value. 2C.2b re-adds `'skill'` /
`'program'`, the `filter` field, the derived rendering, and the publish-time
label together.

## Item 1 — the verification suite (landed)

**The deferral's premise changed, and that is the finding.** It was "we lack test
infrastructure." After 2C it was "**we rebuilt the same loader + stubs +
assert-with-controls three times** (Wave 1's 58 checks, 2C.2a's 33, Part 1's
no-mutation controls) **and threw it away each session.**" Porting was mostly
committing what already worked.

**The sucrase finding — recorded because it was invisible.** Every verification
this phase ran only because `sucrase` was in `node_modules` **transitively** —
nobody declared it, nobody knew. The sanctioned verification method was standing
on an accident; the day that transitive dep dropped, the harness would have died
with an error no one would connect to a package they never chose. Same family as
the other findings this phase (authoritative-while-wrong). It is now a **declared
devDependency**.

**What landed:** `npm test` → `node test/run.mjs`, using `node:test` (built-in) +
a committed ~40-line loader (`test/loader.mjs`: resolves `@/` — invisible to Node,
and `#`-subpath imports can't express `@` — and transforms JSX via sucrase). The
runner uses the programmatic `run({ isolation: 'none' })` because `node --test`
isolates each file into a child process the `--import` loader **does not reach**
(verified). Tiers: `test/{pure,fs,render}` are gated; `test/smoke.mjs` (live MSDB)
is **never** part of `npm test` (`npm run test:smoke`, ungated). **Meta-control:** a
test-count floor (40) — the runner's own control against the zero-tests-green
false-green. **Canary:** `CANARY=1 npm test` injects one deliberately-failing test;
a human runs it to confirm the suite still goes red before trusting a green. It is
manual by design — automating "assert the canary is red" just moves the
unread-badge problem down a level.

**Ported: 58 tests / 12 files.** pure (schema enums, `embedSrc`, `lucideIcon`,
`dataRefSignature`, tier strip/keep, `reidSection`/`stripImageOwnership` incl.
no-mutation, `sectionRendersEmpty` static cases, `resolveSectionRefs` — a
`resolveSectionData` **refactor** split the pure walk/collect/key from the fetch so
it tests without a DB); render (REGISTRY membership, fail-closed component renders,
`custom_css` scoping, `debug_json` editor-only, `SectionRenderer` data injection,
`sectionRendersEmpty`-vs-render mirror, **behavioral reader-sets** — render
`cardStyle:shadow` vs `plain`, replacing the brittle source-grep, each with a
non-reader control); fs (the one surviving source-text check — `RichTextEditor`
imports no `@tiptap/extension-*`, **parsed** not substring-matched, with a control
proving the parser finds a real import).

**What the suite does NOT cover — the gap list, stated so it isn't mistaken for
coverage:**
- **The false-green module-graph class** (`_`-prefixed folders never compile) — NOT
  a unit test; it needs a post-`next build` observable-side-effect assertion (route
  in the manifest / expected string in emitted HTML). Not built. The class that has
  bitten three times is the one the unit suite structurally cannot catch.
- **Exhaustive "no OTHER type reads cardStyle/buttonStyle"** — the behavioral check
  proves the known readers read it (+ a non-reader control) but does not render all
  26 types to prove no hidden reader. That was the retired source-grep.
- **control-offered** (panel offers a control for each reader) — was deliberately
  NOT ported as a source-text scan; **2C.3 resolved it structurally** instead (the
  panel derives controls from `SECTION_STYLE_CAPS`), so there is no brittle
  standalone check to maintain — its witnesses are the behavioral + structural +
  import-scan trio, now in the suite.
- **The impure fetch** (`fetchCourses` chunking/error handling) — smoke-only; only
  the pure collect/assemble is gated.
- **Editor client behavior** (SettingsPanel tri-state warnings, canvas debounce,
  drag/drop) and anything needing a real browser (the 2B browser-pass items) — out
  of scope; no jsdom.
- `tiptapToReact`'s contract-match is a shipped module-load throw, not ported (it
  already fails the build on drift).

## Forward dependencies

| # | What | Why deferred / what it costs |
|---|---|---|
| 1 | ~~Test runner + porting the loader verifications~~ **DONE — see §Item 1** | Landed as `node:test` + a committed loader + declared `sucrase`; 58 tests across pure/fs/render, smoke ungated, a test-count meta-control, and a manual `CANARY=1`. The reframing (rebuilt 3× and discarded) and the sucrase-was-transitive finding are recorded there, along with the **gap list** — chiefly the false-green module-graph class, which is not a unit test. CI is deliberately NOT included (row 1-CI). |
| 1-CI | **CI for the verification suite** (open question, NOT started) | The suite runs locally (`npm test`); a CI badge is deliberately deferred. **The open question, in the doc's own terms:** CI's whole purpose is to remove the human who reads the output — but "a badge over a suite that can't fail is more dangerous than a throwaway harness, because someone at least read the harness." This codebase has produced three false-greens already; a green CI badge is a *stronger* false-green than a green `next build` because nobody re-runs it by hand. The meta-control + canary make the suite *able* to prove it can fail, but the canary only works when a **person** flips it — automating that assertion just relocates the unread badge. So: **what earns the trade of a read output for an unread badge?** Unknown, deliberately: a suite that has never survived a refactor hasn't earned a badge. Let `npm test` run locally through 2C.2b and 5b first — if it catches something real, that's evidence; if it goes red on a rename, that's evidence too. Decide then, with data. |
| 2 | ~~Card (5) + Dynamic (4)~~ **3 self-contained Cards SHIPPED (2C)** | `price_card`/`stat_card`/`icon_card` are in `REGISTRY`, offered, honoured (`cardStyle`; `price_card` also `buttonStyle`). The 2 data-backed cards moved to 2C.2. |
| 3 | **Advanced (4) SHIPPED (2C)** | `custom_html`/`custom_css`/`embed`/`debug_json` render. `embed` dropped `script` from its provider enum (DB scan found zero stored embeds → no migration; the shared sanitizer strips `<script>` anyway). `custom_css` scopes to `advanced.sectionId` via `scopeCss` (no id → injects nothing + editor warns). `debug_json` renders ONLY in the editor canvas, never on a published/preview page. The picker's developer-tier filter is **now exercised** — a non-developer sees these locked, a developer sees them offered (verify, don't assume). |
| 2C.2a | **Data-backed, authored-reference components SHIPPED** (`course_card`, `instructor_card`, `course_selector`, `bundle_courses`, `course_list:source='manual'`) | Resolved via **fetch-hoisting** (see §2C.2 above): `lib/pageBuilder/resolveSectionData.js` collects the tree's data refs and fetches them once (courses via the MSDB adapters, instructors from local Mongo), keyed by the section's unique `id`. `PageBuilderView` (server) awaits it and injects `resolvedData` into the one sync `SectionRenderer`; the canvas gets the SAME map from an admin-gated server action (`resolveBuilderSectionData`) — no public endpoint, and no new client module on the published page (`/[...slug]` route-specific JS unchanged at 13.6 kB; see §2C.2). Components render from injected data (`course_card`/`course_selector`/`bundle_courses`/`course_list` reuse `CourseCard`; `instructor_card` its own presentational card). Fail-closed: an unresolved ref renders nothing AND the editor warns at the field. No new Cloudinary uploads — images are existing MSDB/Mongo URLs (item 5 not widened). Multi-course grids are FIXED responsive columns, NOT `layout.columns` (keeps the columns reader-set = {`card_grid`,`highlight_grid`}). |
| 2C.2b | **Data-backed, derived/time-varying components** (`course_list:source='skill'|'program'`, `course_schedule`) | Deferred as **its own decision** (see §2C.2). These need a canvas that shows an edit-time *sample* of content the published page won't match — a labelled exception to the Browser-pass-#2 rule, which must be argued with that precedent in front of it, not waved through with 2C.2a. Picker keeps both as "เร็ว ๆ นี้"; `course_list.source` enum stays narrowed to `['manual']` until this lands. |
| 2C.3 | **Reader-set↔control drift — made structurally impossible** (DONE) | 2C made `cardStyle`/`buttonStyle` honoured, turning a self-enforcing exclusion into a convention: a component read a style prop, the panel had to *separately remember* to offer a control, and the 4th card that read `cardStyle` without a control would fail silently. **Fixed structurally, not with a check:** `SECTION_STYLE_CAPS` (`presets.js`) is the ONE source of which style props each type supports; the components apply a prop's class ONLY through the caps-gated helpers (`cardSurfaceClass`/`accentButtonClass`), and `SectionTypeFields` DERIVES its controls from the same caps. Reading a prop and offering its control are now one act — they cannot drift. **The load-bearing move is the un-export:** the raw `cardStyleClass`/`buttonStyleClass` are now PRIVATE to `presets.js`, so a component *cannot* read a style prop outside the caps (re-exporting either re-opens the drift — stated at the code, because it looks like two harmless unused functions). **Why it was a one-declaration change, not a component-unification** (the precondition the next application must re-check): all four readers already consumed the prop *identically* through the one helper, and those helpers were imported nowhere else. **Three witnesses** (all green, `npm test`): behavioral (caps-driven — the wire renders), structural (the panel derives == caps; raw fns undefined at runtime), and — REQUIRED — the **import-scan** (no component imports the raw fns). The import-scan is the only one that fails in the state where 2C.3 has silently reverted to convention (someone re-exports the raw fn, a component calls it directly) — the other two stay green there. **Out of scope, on purpose:** the LAYOUT correspondence (`ratio`/`columns`/`mobileBehavior` ↔ containers) stays hardcoded — the same pattern applies later, but only after confirming *its* readers are uniform first (that was 2C.3's safety precondition). |
| 4 | JSON-LD generator | Hook point marked in the catch-all. No controls until it emits. Never emit Review/AggregateRating. |
| 5 | **Cloudinary orphans: ownership + causes** (Part 1 DONE) | `content.publicId` / `seo.ogImagePublicId` are tracked *"for deletion"* and nothing safely can. **Orphans come from THREE causes, not one** — and the biggest is invisible in the old framing: (a) **snapshot pruning** — `snapshotVersion` keeps 20 per page and `deleteMany`s the rest, dropping the version doc but NEVER its Cloudinary asset, so every 21st publish strands assets referenced by nothing, with nothing that could ever collect them; (b) image replaced in a section; (c) page deleted (section assets never deleted; the page's snapshots aren't deleted either, so they keep pinning assets). **Ownership is many-to-one:** duplicate + `reidSection` copy the tree, so an asset is referenced by the uploader, every copy, every in-page section-copy, and ≤20 snapshots — no per-page/section delete is safe without a reference count over ALL of that. **Real vs latent:** section `publicId` IS populated on upload, so the shared-ownership is real today (harmless only because no delete is wired); the OG bug is LATENT — the builder OG field is a pasted URL with no upload widget, so `ogImagePublicId` is empty and `deleteFromCloudinary('')` is a no-op. Whoever adds an OG upload widget later detonates a delete-path bug they didn't write (noted at the field + at deletePageBuilderPage). **Part 1 (done):** duplicate + reidSection now STRIP the ownership token (`content.publicId`, `seo.ogImagePublicId`) — `src` is kept so the copy renders, but only one doc owns each asset. This makes the existing OG cleanup sound. **Part 1's cost, inherited by 5b:** it converts "two owners, either delete breaks the other" into "one owner, its delete 404s every copy — silently, because `src` is just a URL nothing validates." So 5b's reference count must count **`src` references, not only publicId**. |
| 5b | **Reference-counted, snapshot-aware GC** (Parts 2+3 — own phase, NOT started) | The ONLY safe cleanup: an OFFLINE sweep whose reference set = the union of every publicId/src in all live `PageBuilder` docs + all `PageVersion` snapshots, list the isolated `page-builder/` Cloudinary folder via the Admin API, delete the difference — with a **grace period** (skip assets younger than N days, to survive upload-then-save and duplicate races) and a **dry-run** first. Never an on-event delete (replace / section-delete / unpublish can't see the snapshot half of the reference set, and the whole-tree-diff-on-save buys nothing). **Part 3 (`PageVersion.deleteMany({ pageId })` on page delete) MUST land WITH Part 2, not alone:** today a deleted page's snapshots leak, but they still *pin* their assets; delete the snapshots without the GC and those pinned references become pure orphans with nothing to reclaim them — a "free cleanup" that strictly worsens the leak. **Asymmetry (why this stays deferred, not squeezed in):** an orphan costs storage and nothing else; a wrong delete is silent and irreversible — the page renders, the image 404s, no error fires, the asset is gone. An unsound cleanup is strictly worse than the leak. Do NOT wire a delete on any event before this phase exists. |
| 6 | `showHeader`/`showFooter` not honoured | Chrome is a sibling of the page in `(public)/layout.jsx`; RSC can't unrender a parent's siblings. Options both cost: middleware+layout lookup (a DB query on **every** public request) or a chrome-less route group (breaks the bare-slug URL contract). |
| 7 | `showStickyCta` renders nothing | No reusable component exists (the masterclass one is coupled to batch/early-bird data). |
| 8 | Published builder pages absent from `sitemap.js` | It only knows Article + CustomPage. **SEO gap.** |
| 9 | Rollback UI | Phase 3. Structurally unreachable today: the history list never holds a snapshot (`getPageVersions` projects metadata only) and no restore action exists. |
| 10 | Rich-text `table` node | §8 *"ถ้าจำเป็น"*. Walker is additive-ready; needs contract + renderer + extension, all three. |
| 11 | `background:'image'` has no source field | Excluded from the picker; self-retiring check above. |
| 12 | `dark_premium` aliases `default` | No treatment specced. The settings dialog says so. |
| 13 | Rich-text image-insert button | `Image` is loaded so a pasted `<img>` survives; deliberate insertion needs its own upload affordance, and the `image` **section** covers the common case. |
| 14 | Section picker only **appends** | Insertion *between* sections is more naturally a canvas gesture than a tree one — unspecced. Append-then-move works; the tree has move. |
| 15 | PromotionConfig retirement | See the Phase-2 plan. |

## Known limits, by decision

- **Attribute-only Tiptap extensions are invisible to the schema check.** `TextAlign` adds no node and no mark — it smuggles an attribute onto `paragraph`/`heading`, so the check stays green while alignment is silently lost at publish. Excluded **by decision, not by test**. Same holds for any future attribute-only extension.
- **Granular section actions are top-level only** (`addSection`, `updateSection`, …). They predate nesting; the editor doesn't use them (it saves the whole tree). Not a TODO — see the note in `lib/actions/pageBuilder.js`.
- **`updatePageStatus` is a narrow programmatic path with non-obvious requirements.** Its name says "set the status", but it has twice needed to know more: Item 7 found the editor must NOT use it (it sets status alone → publishes stale content and invalidates the conflict token — the editor publishes via a full save instead), and the readiness gate made it read `slug`/`title`/`sections` to judge the doc it only stamps a status on. The next caller who reaches for it because the name sounds right needs both lessons. Prefer `updatePageBuilderPage` from anything holding a working tree.
- **ISR:** the public route is `revalidate = 3600`, so a scheduled page goes live *within an hour* of its start, not on the second. The publish dialog says so.
- **Editor bundle is 382 kB First Load** (`sanitize-html` + Tiptap). Accepted: admin-only, in line with existing routes (registration steps 254–261 kB), and the alternative is a canvas that renders differently than production. Public bundles are unaffected — `/[...slug]` 135 kB, shared 102 kB.

## Browser pass

The end-to-end flow (create → sections → publish → public URL → preview form →
draft render) works. Four issues found and fixed; two of the fixes closed gates
that had been too loose and landed **after** this doc's first close-out:

1. **Preview password shown in plain text.** The dialog echoed the password back in a banner. Fixed: a typed password is never echoed (the admin has it); a *generated* one is masked and shown only behind an explicit reveal, cleared on close.
2. **Image sections render inconsistently.** Not a render bug — an image with no `src` returns null (the src guard, firing silently), so the tree listed a row the canvas had no counterpart for. Fixed by marking empty-rendering sections in the tree (`sectionRendersEmpty`), **not** by drawing a canvas placeholder — that would make the canvas disagree with the published page.
3. **Component library missing.** Card/Dynamic/Advanced types were absent from the picker, so an author couldn't tell they exist. Fixed: all types display; a type is clickable only when it is in `REGISTRY` and tier-allowed. Displaying a type is not offering it. *(2C update: the 3 self-contained Cards + 4 Advanced now render, so they became clickable automatically — the picker derives from `REGISTRY`, so it needed no edit. Advanced are clickable for developers only; the 6 data-backed types still show "เร็ว ๆ นี้".)*
4. **Publish gate too loose** *(post-close-out)*. A page at the untouched seed defaults published to a live `/untitled`. Fixed with `publishReadiness.js` — see the placeholder pattern under *Self-retiring assertions* and the `updatePageStatus` note under *Known limits*. Same commit raised the preview-password minimum from 4 to 8 (4 digits = ~10k combinations against the 5-try/15-min lock).

## Unverified in a browser

Verified in the pass: inert-click guard (no ejection from stray clicks on links/
CTAs), `rich_text` sustained typing (no caret fighting on selection changes),
the picker, the tree, page settings, image upload, and the full create → publish
→ public URL → preview flow.

**Still unverified** — reasoned and loader-checked, not yet exercised:

1. Back / Back-then-Forward across the create→edit `replaceState`.
2. Cross-parent drop refusal; sibling-only drop indicator.
3. 2A responsive check.
