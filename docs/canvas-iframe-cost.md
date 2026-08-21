# Canvas-in-an-iframe — what route 2 would cost

Round 18 established that the editor's device toggle cannot show responsive
behaviour: it is a max-width clamp, every responsive class in the Page Builder
is a viewport media query, and so "มือถือ" draws a 3-column grid at 390px and
**inverts** `settings.visibility`.

Three routes were named. This measures the cost of route 2 — render the canvas
inside an iframe with a real width, so media queries resolve against a real
viewport and the **published page changes by zero bytes**. It does not advocate
for it. Nothing here is built.

A separate doc rather than an appendix to `docs/section-control-audit.md`,
because that one is a measurement of a moving surface that later rounds amend as
its findings get fixed, and this is a decision brief with a shelf life: once a
route is chosen it becomes the record of why. Round 18's §7 points here.

Measured at `720b34e`.

---

## 0. The two measurements that decide most of this

Both were run in real Chrome against the repo's own React
(`scripts/_probe-iframe-portal.mjs`), because both are usually answered from
folklore and the folklore is wrong in opposite directions.

### React events DO survive a portal into an iframe

The received wisdom is that React delegates at the root container, so events
inside an iframe never reach it. That is true of a **second `createRoot`** and
false of a **portal**: react-dom 18.3.1 calls
`preparePortalMount(portalInstance) → listenToAllSupportedEvents(portalInstance)`,
attaching the full delegated listener set to the portal container wherever it
lives. Measured, not read:

| probe | result |
|---|---|
| `portalRenderedIntoFrame` | `true` |
| `styleTagLandedInFrame` | `1` — the injected selection/hover `<style>` travels |
| `reactClickCaptureFired` | `1` — **`onClickCapture` fires** |
| `closestResolvedPath` | `"sections.0"` — `e.target.closest('[data-pb-path]')` resolves |
| `preventDefaultTook` | `true` — "the canvas is inert" still holds |
| `reactMouseOverFired` | `1` — hover works |
| `hoverResolvedPath` | `"sections.0"` |
| `parentDocumentCaptureSawFrameClick` | `false` |

**Consequence: `CanvasPanel`'s selection and hover handlers cost zero lines to
port.** They are the two mechanisms an estimate would normally price highest.

### The frame really does re-base the media queries

Same run, one page, one stylesheet, 390px frame in a 1382px window:

| probe | result |
|---|---|
| `windowInnerWidth` | `1382` |
| `frameInnerWidth` | `390` |
| `probeBoxWidthInFrame` | `100px` — `@media (min-width:768px)` did **not** apply |
| `mediaQueryFollowsFrame` | `true` |
| `probeBoxWidthUnderMaxWidthClamp` | **`300px`** — the same rule under today's clamp takes the desktop branch |

The last row is round 18's finding reproduced from first principles, and the
contrast between the last two rows is the entire value of route 2.

---

## 1. A — what crosses the canvas boundary today

Derived by reading `CanvasPanel.jsx`, `CanvasToolbar.jsx`, `EditorShell.jsx`,
`EditorProvider.jsx`, `SectionRenderer.jsx` and `useLeaveGuard.js`, plus a
repo-wide sweep for `data-pb-*`, `scrollIntoView`, `getBoundingClientRect`,
`document.`, `window.`, refs and portals in the editor tree.

**Three of the mechanisms the brief listed as starting points do not exist**, and
that is a real saving rather than an omission:

- **no floating per-section toolbar.** `CanvasPanel` and `CanvasToolbar` contain
  no `useRef`, no `createPortal`, and no absolute/fixed positioning. Nothing is
  positioned against canvas geometry.
- **no drag-and-drop into the canvas.** `useTreeDrag` is sibling-scoped inside
  the structure panel and never references `data-pb-*` or the canvas.
- **no scroll-into-view.** Selecting a section in the tree does not scroll the
  canvas to it; there is no `scrollIntoView` anywhere in the editor.

What does cross:

| # | mechanism | how it works today |
|---|---|---|
| 1 | **selection** | React `onClickCapture` on the `data-pb-canvas` div → `e.target.closest('[data-pb-path]')` → `dispatch({type:'SELECT', path})`. Capture phase + `preventDefault` so a section's own links never fire |
| 2 | **hover highlight** | React `onMouseOver` (bubbles, so one listener) + `onMouseLeave` → local `hoverKey` state |
| 3 | **selection / hover outline** | a `<style>` element rendered *inside* the canvas div, built by `canvasCss(hoverKey, selKey)` from parent state, keyed on the exact `data-pb-path` |
| 4 | **nested-iframe kill** | a rule in that same `<style>`: `[data-pb-canvas] iframe { pointer-events: none }` — for `embed` sections and `advanced.customHtml` |
| 5 | **theme surface + accent vars** | `themeSurface(page.theme).pageClass` (Tailwind classes) and `themeStyle(page.theme)` (inline `--pb-accent-*`) on the canvas div |
| 6 | **`resolvedData`** | plain prop from `EditorProvider` → `SectionRenderer` |
| 7 | **`inEditor` flag** | `SectionRenderer` derives it from `path != null`; `debug_json` renders only when true |
| 8 | **the device clamp** | `VIEWPORT_MAXW` → outer `style={{maxWidth}}` — the thing being replaced |
| 9 | **leave-guard exclusion** | `useLeaveGuard` installs a **document-level capture** click listener and explicitly skips `a.closest('[data-pb-canvas]')`, because capture-on-document runs *before* CanvasPanel's own handler |
| 10 | **the single scroll container** | `EditorShell`'s centre column is `min-h-0 flex-1 overflow-y-auto`; `CanvasPanel` is plain content inside it. **There is exactly one scrollbar today** |
| 11 | **inherited document context** | fonts (`--font-en`/`--font-thai` classes on `<html>`), dark mode (`.dark` from next-themes on `<html>`), and the app stylesheet |

---

## 2. B — what each would cost across the boundary

Assuming **strategy 2a: one React root in the parent, `createPortal` into
`iframe.contentDocument.body`.** That keeps `useEditor()`, `dispatch`,
`resolvedData` and every context in scope — **no postMessage anywhere.** The
alternative (a second `createRoot` inside the frame) is priced at the end.

| # | mechanism | cost across an iframe |
|---|---|---|
| 1 | selection | **zero.** Measured: `onClickCapture` fires, `closest()` resolves, `preventDefault` holds |
| 2 | hover | **zero.** Measured: `onMouseOver` fires and resolves the same path |
| 3 | outline `<style>` | **zero.** Measured: the style element lands in the frame document and its rules apply there |
| 4 | nested-iframe kill | **zero.** Same rule, same document as the sections it targets |
| 5 | theme + accent vars | **zero.** They are set on the canvas div, which is inside the portalled subtree |
| 6 | `resolvedData` | **zero.** A prop, not DOM |
| 7 | `inEditor` | **zero.** A prop, not DOM |
| 8 | the clamp | **replaced.** `style={{maxWidth}}` on an outer div becomes `width` on the iframe element. Net ~0 lines; `VIEWPORT_MAXW` keeps its three values and changes meaning from "clamp" to "viewport" |
| 9 | leave-guard exclusion | **becomes dead code, in the safe direction.** Measured: the parent's document-capture listener does not see frame clicks. It already skipped canvas clicks, so behaviour is unchanged; the `a.closest('[data-pb-canvas]')` line and the assertion naming it in `test/fs/pageBuilderLeaveGuard.test.mjs:175` become vestigial and should be retired deliberately rather than left to confuse |
| 10 | **the scroll container** | **new mechanism required — see below** |
| 11 | inherited document context | **new code required — see §3** |

### The hardest item is #10, and it is not the events

An iframe is a fixed-size box. Today the canvas is ordinary flow content inside
the editor's one scroll container, so it grows and the centre column scrolls.
Put it in a frame and there are two options, neither free:

- **let the frame scroll internally** — a nested scrollbar inside a panel that
  already scrolls, and the outer container no longer knows how tall the page is.
  Cheap to write, poor to use.
- **sync the frame's height to its content** — a `ResizeObserver` inside the
  frame document on `documentElement`, writing `iframe.style.height`. This is the
  standard answer, ~10–15 lines, and it is the one thing here I would not
  promise on paper: height-driven feedback loops (a rule that reacts to viewport
  height, an image loading late, a `100vh` inside `customHtml`) are the classic
  way it oscillates. It needs to be tried.

It is the hardest item precisely *because* the events turned out free. Without
the measurement in §0 this estimate would have named the wrong thing.

### If strategy 2b (a second React root) were chosen instead

Every "zero" above becomes work: `dispatch` is no longer in scope, so selection
and hover need a `postMessage` protocol with a message schema, and
`resolvedData` and the whole page tree have to be serialised across on every
keystroke. That is a different and much larger round. **Nothing measured here
requires it** — 2a is available because the portal delivers events.

---

## 3. C — how styles reach the canvas, and what a frame would need

Measured against the running dev server, not assumed.

**Today.** Exactly one stylesheet for the entire app:

```
<link rel="stylesheet" href="/_next/static/css/app/layout.css?v=1787708485368">
```

297 KB unminified in dev. It contains everything the canvas needs: all Tailwind
utilities, the `:root` CI token block (24 hits for `--9e-action` alone), 16
`@media` blocks, and all 11 `@font-face` rules.

**What a frame would need injected, and how hard each is:**

| what | how | difficulty |
|---|---|---|
| the app stylesheet | copy the parent's `<link rel="stylesheet">` nodes into the frame's `<head>`. Read at **runtime** from `document.querySelectorAll('link[rel="stylesheet"]')` — never a hardcoded path, so dev's `?v=` query and any prod hashing are both handled without knowing either | easy |
| **font variables** | **mandatory, and easy to miss.** The `<html>` element carries `class="__variable_454241 __variable_554fae"`, and those two classes are the *only* definition of `--font-en` / `--font-thai`. Tailwind's stacks read `"Google Sans", var(--font-en), …` — and `"Google Sans"` is not a declared `@font-face` family; the real faces are `'googleSans'` and `'lineSeedSansTH'`, reachable **only** through those variables. Without the classes the frame loses both self-hosted fonts and falls to `sans-serif`, changing every Thai metric | easy once known |
| **dark mode** | next-themes runs `attribute="class"`, putting `.dark` on the parent `<html>`. The frame's `<html>` gets nothing, so every `dark:` variant in every section component silently stops firing | easy once known |
| CI tokens (`--9e-*`, `--surface-*`) | ride along in the same stylesheet's `:root` block | free |
| `--pb-accent-*` and theme surface | already set by `CanvasPanel`'s own div, inside the portalled subtree | free |
| font **files** | `@font-face src: url(/_next/static/media/…)` — same-origin, resolves from the frame unchanged | free |

**Verdict on C: straightforward, with one awkward corner.** The font and dark-mode
problems collapse into a single line — mirror `document.documentElement.className`
onto the frame's `<html>`, which carries both — and the stylesheet is one
runtime-read `<link>` clone rather than any build-path knowledge. Next's dev/prod
asset paths turn out **not** to be the difficulty, because nothing needs to name
them.

The awkward corner is dev-only: Next replaces the stylesheet on HMR with a new
`?v=` timestamp, so a frame holding a snapshot href goes stale after a CSS edit.
A `MutationObserver` on the parent `<head>` fixes it (~10 lines) and is pure
developer-experience — it cannot affect production.

Second, smaller: the frame paints before its stylesheet loads, so an unstyled
flash is possible on every viewport switch if the frame is recreated. Keeping one
frame alive and only changing its `width` avoids it.

---

## 4. D — the canvas renders the public components, and they are unusually safe

The canvas renders through the **real `SectionRenderer`**, the real presets and
the real theme wrapper — deliberately, so it cannot drift from what publishes.
There is no editor-specific variant. The only editor concession is `data-pb-path`
plus the `inEditor` flag.

So changing the runtime context matters. It was checked rather than assumed —
a sweep of all 27 section components, the rich-text walker and `PageBuilderView`
for `window`, `document`, `IntersectionObserver`, `ResizeObserver`, `matchMedia`,
`useEffect` and `useLayoutEffect`:

**Zero hits.** Not one section component touches a browser global or runs an
effect.

Only two are client components at all — `accordion.jsx` and `tabs.jsx` — and both
use nothing but `useState` for local open/active state. (`course_schedule.jsx`
appears in a naive `'use client'` grep only because its docstring says it is
deliberately *not* the client `ScheduleCard`.) `ui/button.jsx`, reached through
`CourseCard`, is the one other client component in the path.

**Verdict on D: the render tree is about as iframe-safe as a render tree gets.**
Two side effects worth naming, both in the good direction:

- `next/image`'s `sizes="(max-width: 768px) 100vw, 1200px"` is itself a viewport
  media condition. Inside the frame it would start resolving against the frame,
  so the canvas would begin selecting the *correct* image candidate for the
  simulated device — a second thing the toggle currently gets wrong and nobody
  has counted.
- `next/link` inside a portal keeps the **parent's** router context, so an
  un-suppressed click would navigate the whole editor. Today `CanvasPanel`'s
  capture-phase `preventDefault` stops that, and §0 measured that it still holds
  inside the frame. It must not be removed.

---

## 5. E — precedent in this repo: none

Searched for `<iframe`, `contentDocument`, `contentWindow`, `postMessage`,
`srcDoc` across all of `src/`.

`<iframe>` appears nine times, and **every one is a third-party embed with an
external `src`** — YouTube, Vimeo, Google Maps and Google Forms in
`CourseGallery`, `CourseHero`, `HeroBannerCarousel`, `MapSection`,
`VideoSection`, `ContactAdminClient`, `MasterclassDetailClient`, the Page
Builder's own `embed` section, and the Tiptap `IframeNode` that preserves pasted
embeds. Content the app renders *into*, never reaches *back into*.

`contentDocument`, `contentWindow`, `postMessage` and `srcDoc`: **zero
occurrences anywhere in `src/`.**

**Verdict: there is no working precedent.** Route 2 would be the first
same-origin, reached-into frame in this codebase. That is not an argument against
it — §0 is a working precedent built from the repo's own React — but it means
none of the usual accumulated knowledge (height sync, HMR staleness, the
first-paint flash) exists here to copy, and the round that builds it will meet
each for the first time.

---

## 6. F — size estimate

**Files touched: 4 source, 4 test. Two modules deleted.**

| file | change | rough size |
|---|---|---|
| `CanvasPanel.jsx` | the frame element, the portal, `<head>` injection, `<html>` class mirror, height sync. Handlers 1–4 unchanged | +60 – 90 lines |
| a new `useCanvasFrame.js` | the frame lifecycle extracted, following `useTreeDrag` / `useLeaveGuard` / `useEditorSave` — this directory extracts hooks rather than growing components | 80 – 120 lines |
| `CanvasToolbar.jsx` | drop the caveat render | −8 lines |
| `useLeaveGuard.js` | retire the now-dead `data-pb-canvas` exclusion, or keep it with a note saying why it is vestigial | ±6 lines |
| `previewViewportCaveat.js` | **delete** — its own docstring says "when the fix lands, this is the thing to delete" | −53 lines |
| `test/pure/previewViewportCaveat.test.mjs` | delete with its module | −58 lines |
| `test/fs/canvasViewportHonesty.test.mjs` | **must be rewritten.** It pins `VIEWPORT_MAXW = { desktop: null, tablet: 768, mobile: 390 }` and the exact `style={clampWidth ? …}` expression, explicitly so an iframe round "cannot be smuggled in through" the honesty commit. Retiring it deliberately is the correct move, and is the tripwire working | ~30 lines rewritten |
| `test/fs/pageBuilderLeaveGuard.test.mjs` | update the `data-pb-canvas` needle if the exclusion goes | ~5 lines |
| new tests for the frame | the render tier cannot see layout (JSDOM), so the real assertions are source-level plus a Chrome probe of the kind in §0 | 80 – 150 lines |

**Net: roughly 250–400 lines**, this repo's comment density included, across a
single round.

**Routine, with high confidence:**
- selection, hover, the outline style, the nested-iframe kill, theme and accent
  vars — measured at zero cost in §0
- the stylesheet clone and the `<html>` class mirror (§3)
- swapping the clamp for a frame width
- deleting the caveat module and its test

**Genuinely unpredictable without trying:**
1. **height sync** — the feedback-loop risk in §2. The single biggest unknown.
2. **HMR stylesheet staleness** — the fix is known, whether it is *enough* in
   practice is not.
3. **first-paint flash** on viewport switches, if the frame is ever recreated.
4. **`advanced.customHtml`** — authors can inject arbitrary sanitised HTML,
   including `100vh` and nested iframes, into a box whose height is being
   computed from its content. Nothing in the repo has met this before (§5).
5. Whether any Radix layer ever needs to portal *out* of the canvas. Nothing does
   today; a future in-canvas control would.

---

## 7. G — route 3's honesty, and whether it is still honest

Round 0 already did this pass: commit **`20fc286`**, *"the device toggle stops
claiming a reflow it does not do"*. It removed the false sentence — both
docstrings had claimed sections "reflow under real CSS media queries exactly as
they will in production" — and added a **visible** caveat, not a `title`
attribute, whenever a clamp is on. It changed no behaviour, and left a guard
(§6) so the fix could not be smuggled in through the documentation commit.

**Current labels, quoted exactly.** The three buttons (`CanvasToolbar.jsx`):

> `เดสก์ท็อป` · `แท็บเล็ต` · `มือถือ`

The caveat (`PREVIEW_VIEWPORT_CAVEAT`), shown under the strip for `tablet` and
`mobile` and never for `desktop`:

> จำลองความกว้างเท่านั้น — breakpoint ยังอิงขนาดหน้าต่างเบราว์เซอร์จริง
> section ที่ตั้งค่าให้แสดงเฉพาะมือถือ/เดสก์ท็อปจะสลับกัน ตรวจของจริงที่ปุ่ม "ดูตัวอย่าง"

*("Width simulation only — breakpoints still follow the real browser window
size. Sections set to show only on mobile/desktop will be swapped. Check the
real thing with the ดูตัวอย่าง button.")*

**Verdict: the caveat is true, and incomplete relative to round 18.**

What it already covers, correctly: that only width is simulated, that breakpoints
follow the window, the `visibility` inversion by name, and where to go for a real
check. Its test pins three of those (`ดูตัวอย่าง`, `breakpoint`, `สลับกัน`).

What it does **not** say, and round 18 measured: **type scale does not change
either.** `heading`, `cta`, `stat_card` and `course_selector` carry `md:` size
variants and stay at their desktop size in "มือถือ" — and "does my heading shrink
on mobile" was the specific question that started this. An author reading
"จำลองความกว้างเท่านั้น" could reasonably take that as a statement about layout,
not about type.

The button labels themselves are also unchanged and still name devices. The
caveat carries all of the correction; nothing in `มือถือ` hints that it is not a
mobile preview until you read the line below it.

So route 3's remaining work is small and specific: extend the caveat to name the
type scale alongside the visibility inversion, and decide whether the buttons
should read as widths (`390px`) rather than devices. That is copy plus one test
assertion — a fraction of §6.

---

## 8. H — is there a cheaper partial?

**No.** The clamp cannot drive a media query, and this was measured rather than
argued: in §0, the identical rule under today's `max-width` clamp resolved to the
**desktop** branch (`300px`) while the same rule in a 390px frame resolved to the
mobile branch (`100px`). A parent's width is not an input to `@media`. There is
no arrangement of `max-width` that changes this.

That leaves two ways to make headings alone shrink, and both fail the brief's own
condition:

**(a) Canvas-only override CSS.** Inject, when clamped, an editor-scoped
stylesheet re-stating the mobile sizes: `[data-pb-canvas] h1 { font-size: … }`
and so on. The published page is untouched, which is what was asked. It is also
small — round 18 counted only **nine** `md:` type rules in the whole builder (six
heading levels plus `cta`, `stat_card`, `course_selector`).

The cost is not size, it is that those nine rules become a **second type scale**,
living in the editor, that must be kept in step with `heading.jsx`'s
`LEVEL_CLASS` map and three components by hand. This repo has rejected exactly
that shape repeatedly — it is the drift `SECTION_STYLE_CAPS` was built to make
impossible, and the reason `sectionIcons.js` is one map. A canvas that
re-implements any part of what publishes is the failure `CanvasPanel`'s own
docstring opens by refusing.

**(b) Container queries on the heading components only.** Would work, and would
change `heading.jsx`'s class strings — which are the published page's output.
Ruled out by the brief's condition, and it is route 1 in miniature.

**And it would not cover the part that actively misleads.** Type scale is the
*benign* half of round 18's finding: a heading at the wrong size looks wrong, and
the author can see that it looks wrong. `settings.visibility` **inverting** is the
malignant half — a `mobile_only` section vanishes from "มือถือ" and a
`desktop_only` one appears, so the toggle shows the author the exact opposite of
the truth and looks entirely plausible doing it. A heading-only partial leaves
that untouched, and leaves the 3-column-grid-at-390px problem untouched too.

So the honest summary: the partial is **cheap in lines, expensive in drift, and
fixes the least dangerous third of the problem.**

---

## 9. Test added

One, in `test/pure/canvasIframePrecedent.test.mjs`: the Page Builder tree
contains no `contentDocument`, `contentWindow`, `postMessage` or `srcDoc` — §5's
no-precedent finding, pinned.

It is self-retiring in the useful direction: it goes red on the **first commit of
the round that builds the iframe**, and its message says to reconcile this
document's §6 estimate against what it actually cost. An estimate nobody revisits
is how the next one gets made badly.

Scoped to `src/components/pageBuilder/` and `src/lib/pageBuilder/` rather than all
of `src/`, so an unrelated `postMessage` (an analytics or chat widget) cannot trip
it. It carries a control proving the scan discriminates.

Nothing else was added. Everything else measured here is a fact about React, about
Chrome, or about a design that does not exist yet — none of which a test in this
repo should be asserting.
