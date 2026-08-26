# PageSettingsDialog redesign — what exists, what is new, and what not to build

Four mockup screens propose replacing today's single scrolling form with a
left-hand menu: ข้อมูลหน้า / SEO / JSON-LD / Preview Link / Version History.

Survey and proposal. **Nothing here is built.** Measured at `d6b51c0` against
the code, not against the docstrings — twice this round a docstring turned out
to be the least reliable source in the file.

---

## 0. The headline, before the detail

**The redesign is mostly a reorganization of things that already exist, plus a
small number of genuinely new features, plus four things that should not be
built at all.**

| verdict | count |
|---|---:|
| **EXISTS** — already in this dialog; the mockup only relocates it | **8** |
| **EXISTS-ELSE** — in the codebase, but not in this dialog | **9** |
| **NEW** — nothing does this today | **11** |

Of the 11 NEW, **6 are recommended against** (§F) — four because they would
claim something nothing verifies, one because it is factually wrong, and one
because it creates a second save authority.

Two corrections to the brief's own framing, both material:

- **Version History is already inside this dialog.** The brief expected it to
  live elsewhere. It is rendered at the bottom of `PageSettingsDialog` today, so
  making it a menu item is a relocation *within* the dialog, not a navigation
  change.
- **Preview Link is a complete, working dialog already.** `PreviewDialog.jsx`
  implements nearly every element of screen 4 against five server actions. The
  work there is consolidation, not construction.

---

## A. Per-element verdicts

### Screen 1 — ข้อมูลพื้นฐาน

| element | verdict | evidence |
|---|---|---|
| Page Title | **EXISTS** | `PageSettingsDialog.jsx` — `ชื่อหน้า`, `patch({title})`, with an empty-title red warning |
| Slug / URL | **EXISTS** | `URL (slug)` with `SLUG_RE` format check and `isReservedSlug` |
| the `/promotion/` inline prefix | **NEW — and factually wrong** | the route is **`/promotions/`**, plural: `[...slug]/page.jsx` `permanentRedirect(\`/promotions/${slug}\`)`, and `promotionMode.js` `href: \`/promotions/${slug}\`` |
| Page Type | **EXISTS** | `ชนิดหน้า` select over `PAGE_TYPES` |
| Page Theme | **EXISTS** | `ธีม` select over `PAGE_THEMES`, plus a warning that `dark_premium` is undesigned |
| Status | **EXISTS-ELSE** | `PublishDialog.jsx` — five statuses, publish window dates, and publishing is "a FULL SAVE with a new status" |
| แสดง Header | **NEW** | zero readers. `PageBuilderView.jsx`: "ACCEPTED, NOT HONORED" |
| แสดง Footer | **NEW** | same — chrome is a layout sibling; an RSC page cannot unrender it |
| แสดง Sticky CTA | **NEW** | no sticky-CTA component exists; the flag renders nothing |

The three flags were checked by grepping every reader, not by trusting the
docstring that describes them: outside `models/PageBuilder.js` (storage) and two
explanatory comments, **nothing in `src/` reads any of them.**

**The mockup silently drops five fields that exist and work.** A redesign that
ships as drawn would remove them:

`Promotion ID (MSDB)` · `ลำดับในหน้าโปรโมชัน` · `ภาพปกโปรโมชัน` (an upload
widget with a deliberate `publicId`-discard rule) · `Canonical URL` ·
`OG image URL` (with a load-bearing comment about the delete path).

### Screen 2 — Search & Social

| element | verdict | evidence |
|---|---|---|
| SEO Title + `52 / 60` counter | **EXISTS** | hint renders `` `${len}/60` ``; the field goes `invalid` past 60 |
| Meta Description + `124 / 160` | **EXISTS** | hint renders `` `${len}/160` `` — but see §B, it does **not** flag |
| Google-style search-result preview | **NEW** | nothing in the codebase renders one |
| noindex toggle | **EXISTS** | `ไม่ให้ Google เก็บหน้านี้ (noindex)` → `seo.noIndex` |
| sub-copy about Sitemap | **NEW (copy only)** | the claim is true and structural — see §B |

### Screen 3 — JSON-LD

| element | verdict | evidence |
|---|---|---|
| "Auto generated" badge | **NEW** | `jsonLdSchema` has `mode: auto\|manual\|off`, but nothing consumes it |
| five green type chips | **NEW — do not build** | `[...slug]/page.jsx`: "JSON-LD HOOK POINT — generation is 2C, **deliberately not built here**" |
| green `ข้อมูลพร้อมใช้งาน · 5 Types` card | **NEW — do not build** | same; there is no emitted set to count |
| dark code block + Copy | **NEW** | there is no document to preview |

### Screen 4 — Preview Link

| element | verdict | evidence |
|---|---|---|
| master toggle | **EXISTS-ELSE** | `PreviewDialog.jsx` → `enablePreviewLink` / `revokePreviewAccess` |
| green "enabled" status card | **EXISTS-ELSE** | renders `เปิดใช้งานอยู่ / หมดอายุแล้ว / ปิดอยู่` from a fresh server read |
| …naming **who** created it | **NEW** | `getPreviewState` returns no actor, and the audit log is write-only (§B) |
| …and **when** | **EXISTS-ELSE** | `passwordUpdatedAt` and `expireDate` are both returned and shown |
| the link + `คัดลอก` | **EXISTS-ELSE** | copy button, plus an open-in-new-tab link |
| masked password + `สร้างใหม่` | **EXISTS-ELSE** | reveal/hide toggle, copy, and `regeneratePreviewPassword` |
| expiry DATE field | **EXISTS-ELSE** | `setPreviewExpiry`, date input, re-seeded on fresh read |
| noindex / not-in-Sitemap / not-cached info line | **NEW (copy only)** | every clause verified true — see §B |
| red "Revoke Preview Access" | **EXISTS-ELSE** | `revokePreviewAccess`, already styled red |

### Screen 5 — Version History

| element | verdict | evidence |
|---|---|---|
| Version History as a menu item | **EXISTS** | already rendered in this dialog under `<Group title="ประวัติการเผยแพร่">` |

---

## B. What each NEW element actually requires

### The character counters — a rule exists, and it agrees

The brief asked whether 60/160 are the mockup's invention. **They are not, and
they match:** `seoSchema` declares `metaTitle: max(60)` and
`metaDescription: max(160)`. Parsed both boundaries — 60 and 160 accepted, 61
and 161 **rejected**.

**But the two fields are guarded asymmetrically, and that is a real defect this
survey found.** `metaTitle` gets `invalid={len > 60}`; `metaDescription` gets no
`invalid` prop at all. So a 161-character description shows a counter reading
`161/160`, looks fine, and is **rejected by the schema when the save runs**. One
of the two fields warns; the other lets the author walk into a failed save.

This is the only thing measured this round that warrants a test — see §Tests.

### The search-result preview — the data is here, the URL is the problem

It needs a title, a URL and a snippet. Title and snippet are in the dialog
already (`seo.metaTitle || page.title`, `seo.metaDescription`). The URL is the
question, and it is the interesting one.

**There is no shared "public URL of this page" helper.** The rule — promotion
pages live at `/promotions/<slug>`, everything else at `/<slug>` — is written
out **twice** today, in two unrelated files:

- `[...slug]/page.jsx` `generateMetadata`, inline, for the canonical tag
- `promotionMode.js` `builderPromotionToCard`, inside a card view-model

A preview widget would be a **third copy** — the exact second-authority shape
rounds 21-25 spent four rounds removing from the width control. The ingredients
for a shared helper exist and are client-safe (`isPromotionPage` is a pure
predicate in `promotionMode.js`), so the honest order is: **extract one helper,
repoint the two existing callers at it, then build the widget on top.** Building
the widget first would make the drift worse and call it a feature.

Note also that the widget's URL would disagree with the mockup's own
`/promotion/` prefix, which is singular and wrong.

### The JSON-LD chips — nothing to verify them against

**No JSON-LD is emitted for builder pages.** The catch-all route carries a
comment where the generator will go and emits nothing. (Course pages *do* emit
`Course` + `BreadcrumbList`, but that is a different branch of the same route
and has nothing to do with a builder page.)

The brief asked whether the emitted set is enumerable at authoring time. **The
question does not yet have a subject** — there is no emitted set, empty or
otherwise. And when generation lands, the set will be a function of the page's
sections and its resolved data, which is a **render-time** fact: a course chip
would depend on a `course_*` section resolving to a real course, which the
editor cannot know without doing the resolution the renderer does.

So a chip reading "Course ✓" today would be a claim with nothing behind it, and
after generation lands it would still be a claim the authoring tier cannot check
without duplicating the generator. Round 18's lesson exactly.

### Preview expiry and revoke — already built, and more complete than the mockup

The brief expected expiry to be missing. It is not. `previewSchema` carries
`enabled`, `passwordHash`, `passwordUpdatedAt`, `expireDate`,
`status: active|expired|disabled`, `failedAttempts` and `lockedUntil`, and five
server actions operate on it:

| action | does |
|---|---|
| `enablePreviewLink(id, password)` | bcrypt-hashes, sets active, resets lockout |
| `regeneratePreviewPassword(id)` | generates, hashes, returns plaintext **once** |
| `getPreviewState(id)` | fresh read; never returns the hash |
| `setPreviewExpiry(id, date)` | sets `expireDate`, flips status to `expired` if past |
| `revokePreviewAccess(id)` | disables and **clears the hash** |

All five are tier-gated (`requirePreviewTier`) and all five write an audit row.
Revoke is meaningful rather than cosmetic: the signed preview cookie's HMAC
covers `passwordHash + passwordUpdatedAt`, so rotating or revoking invalidates
outstanding cookies.

**What the mockup adds here is one field: "who".**

### "Who created it and when" — half exists, half is blocked

**When: exists.** `passwordUpdatedAt` is stored and returned.

**Who: does not, and is not cheaply reachable.** `getPreviewState` returns no
actor. The actor *is* recorded — every preview action calls
`recordAudit({… actor: currentUserStamp(session)})` — but **the audit log is
write-only**: `PageAuditLog.create` is the only reference to that collection
anywhere in `src/`. Nothing reads it back.

So "created by X" requires a new tier-gated read action over a collection with
no read surface today (there is a `docs/admin-audit-log-plan.md` — a plan, not a
build). That is its own round, and it is worth noticing that it is the *only*
element on screen 4 that is not already finished.

### The info line's three claims — all true, all structural

Worth stating because a UI claim that nobody checks is what this whole audit
arc has been about. Each was verified:

| claim | true? | mechanism |
|---|---|---|
| noindex | **yes** | `/preview/[slug]/page.jsx` — `robots: {index:false, follow:false, nocache:true}` |
| not in Sitemap | **yes** | `sitemap.js` enumerates `status: 'published'` pages as `/${slug}`; `/preview/*` is never emitted |
| not publicly cached | **yes** | `export const dynamic = 'force-dynamic'` and `revalidate = 0` |

This is the one piece of new *copy* that can be recommended without reservation.

---

## C. Version History as a menu item

**It is already in this dialog** — the brief's premise that it lives elsewhere
is wrong. `PageSettingsDialog` renders
`<Group title="ประวัติการเผยแพร่"><VersionHistory pageId={pageId} open={open} /></Group>`
as its last block. `VersionHistory.jsx` is a separate *component*, not a
separate *destination*.

So promoting it to a menu item is a low-risk move, and two things make it
slightly awkward rather than free:

1. **It fetches on open.** It takes `open` as a prop and re-fetches whenever the
   dialog opens. Under a menu, "open" would need to mean "this menu item is
   selected", or the list refetches every time the dialog opens regardless of
   which screen is showing. A small contract change, but a real one.
2. **It is read-only by design, and structurally so.** `getPageVersions`
   projects metadata and never reads `snapshot`, so the component *cannot* show
   a preview or a diff even if the redesign wanted one. Rollback is Phase 3 and
   the component says so on screen.

That second point matters for the redesign: a full-height menu screen dedicated
to Version History will look conspicuously empty next to four screens of
controls, and the temptation will be to fill it with a restore button the data
layer cannot serve. The component's own docstring already argues against a
half-rollback. **Give it the smallest screen, not the emptiest one.**

---

## D. The save model — the most important question

### What today's dialog actually does

**It has no ยกเลิก and no บันทึกการตั้งค่า.** Its only chrome is an X close. Every
field dispatches `PATCH_PAGE`, the reducer marks the page dirty
(`contentDirty` / `identityDirty` by key), and persistence is owned entirely by
the editor: a `บันทึกฉบับร่าง` button in `EditorTopBar`, plus a **5-second
debounced autosave** that flushes both content and identity.

The dialog's own docstring states the rule: it "rides the same dirty/autosave
path as every other edit — **this dialog writes nothing itself**."

### The conflict

The mockups put ยกเลิก / บันทึกการตั้งค่า at the dialog's foot. That is **a second
save authority for one document**, and it is the same shape as the width clamp
rounds 21-25 removed: two layers each believing they own one concept.

It is worse than untidy, because both buttons would be actively misleading:

- **"บันทึกการตั้งค่า" would not be the thing that saves.** Autosave has almost
  certainly already fired — five seconds after the first keystroke. The button
  would either duplicate a save that happened, or become a *third* write path
  alongside autosave and the top bar.
- **"ยกเลิก" would not cancel anything.** The edits are already in the working
  tree and probably already on the server. A Cancel that leaves the change in
  place is the dead-control defect with a destructive label.
- **It cannot be true for the whole dialog anyway.** Screen 4's preview actions
  write to the server *immediately and individually* — that is their design,
  because `passwordHash` must never enter the client tree. A footer Save sitting
  under a revoke button that already ran is a lie about the one screen where
  the stakes are credentials.

### Proposed resolution

**Take the footer buttons out. Keep one save authority — the editor's.**

Concretely:

1. **No dialog-level Save.** Fields keep dispatching `PATCH_PAGE`; the editor
   keeps owning persistence. Consistent with `SettingsPanel`, which edits live
   the same way.
2. **Replace the footer with save STATE, not a save action** — the same
   saving / saved / conflict indicator the top bar already derives. It answers
   the question the author actually has ("is this safe yet?") without inventing
   a second way to answer it.
3. **Keep the immediate-write screen visibly different.** `PreviewDialog`
   already warns that its buttons behave differently from the rest of the
   editor. That warning must survive the merge — it is more necessary under a
   unified menu, not less, because the menu makes the screens look uniform.
4. **If a Cancel is genuinely wanted**, the only coherent version is a
   dialog-local buffer that does not touch the tree until Save. It is
   implementable, but it would make this dialog behave unlike every other
   editing surface, and it cannot cover screen 4 at all. **Not recommended** —
   and if it is chosen, it must be chosen deliberately, not inherited from a
   mockup.

---

## E. Elements that label rather than configure (the round-17 check)

Round 17 moved the section-name control above the tab strip because it *labels*
rather than *configures*, and filing it under a configuration tab would have put
an editor-only field in a tab promising "this is what visitors read".

Three mockup elements have that character and would land as peers of
configuration screens by default:

| element | why it is not configuration |
|---|---|
| Version History | a **record**. Changes nothing, and cannot — the data layer is metadata-only |
| the search-result preview | a **mirror**. Renders fields configured elsewhere on the same screen |
| the JSON-LD code block | a **readout**. Shows generated output; the mode picker beside it is the only control |

And one element has the *opposite* mismatch, which is the sharper problem:

**Preview Link is the only screen that writes immediately.** Every other screen
defers to autosave. Under a uniform menu, four screens that stage edits and one
that commits credentials on click will look identical — and the one that
commits is the one where being wrong is expensive.

**Recommendation:** separate the menu into a configuration group and a
read-and-act group, rather than a flat list of five equals. Version History and
any preview/readout belong in the second; Preview Link belongs there too, marked
as immediate, precisely because it does not share the deferred-write contract.

---

## F. Recommended NOT to build

Six, in descending order of how confidently:

1. **แสดง Header / Footer / Sticky CTA** *(three controls)*. Nothing reads any
   of them — verified by grepping every reader. `PageBuilderView` says outright
   that it "cannot act on them, and deliberately does not fake it". These are
   the canonical dead control, and the dialog's own docstring already records
   the decision to omit them. Shipping the mockup as drawn would knowingly
   reintroduce the defect this whole audit arc removed. **They come back when
   their render path does.**
2. **The JSON-LD type chips and the "· 5 Types" status card.** Nothing is
   emitted for builder pages, so the chips would claim a fact with no source.
   And after generation lands, the emitted set is a render-time function of
   resolved data — an authoring-tier chip could only be right by duplicating the
   generator. A chip that cannot verify its own claim is worse than no chip.
3. **A dialog-level Save / Cancel pair.** §D. Two save authorities for one
   document, with both labels wrong.
4. **The `/promotion/` inline prefix as drawn.** The route is `/promotions/`.
   Ship the prefix only when it is *derived* from the same helper the canonical
   tag uses — never typed into a component as a literal.
5. **A Status dropdown on screen 1.** Status lives in `PublishDialog`, where
   changing it is a full save with publish-window validation and a
   flush-before-publish step. A bare select here would be a fourth write path
   into the most consequential field on the page, bypassing all of that. Link to
   the publish flow instead of reproducing its most dangerous control.
6. **"Created by X" on the preview card** — *unless* the paired audit-read
   action is built in the same round. Otherwise it is a field with no source.

Everything else in the mockups is either worth building or already built.

---

## G. Proposed build sequence

Ordered so the riskiest is not first, and split so that pure reorganization
never travels with new behaviour.

### Step 0 — cover the dialog before moving anything *(prep, no user-visible change)*

**There is no test coverage over `PageSettingsDialog` or `PreviewDialog` at
all.** The only test file mentioning either is `test/pure/editorSaveState.test.mjs`,
and it is about the save state machine.

That is the single largest risk in this whole redesign: round 15's reorganization
of `SettingsPanel` was safe *because* a union check pinned the exact field set
first, and the failure mode it caught — a field landing in no tab and vanishing
— is exactly what a five-screen menu invites. Given the mockup already drops
five existing fields (§A), this is not hypothetical.

**Build the union check first**, modelled on round 15: the union of all menu
screens equals the exact field set the dialog renders today. That requires
exporting the screen bodies the way `SettingsPanel` exports its tab bodies.

### Step 1 — the menu shell and relocation *(low risk, editor-only)*

The chrome plus moving existing controls into screens. **No new field, no new
behaviour, no footer buttons.** Version History becomes a menu item (§C), with
its `open` contract adjusted. Guarded by step 0's union check.

### Step 2 — absorb `PreviewDialog` as a menu item *(low risk, navigation only)*

Both dialogs are already siblings in `EditorShell`, opened from the same
`dialog` state, so this is a consolidation rather than a rewrite. Its
immediate-write warning must survive (§E). No action changes.

### Step 3 — extract a shared public-URL helper *(medium risk — touches the public path)*

One helper for "the public URL of this page", with `generateMetadata` and
`builderPromotionToCard` repointed at it. **This is a refactor with no visible
change**, and it is deliberately *before* the feature that needs it so the
feature cannot become a third copy. It changes a file the published page runs,
so it takes rounds 20/23's verification: transitive public-path comparison,
normalised, plus a before/after render differential.

### Step 4 — the search-result preview *(low risk once step 3 lands)*

Pure presentation over data already in the dialog, using step 3's helper. Add
the Sitemap sub-copy here.

### Step 5 — the `metaDescription` invalid flag *(trivial, independent)*

The asymmetry in §B. Can ship any time; listed separately so it is not lost
inside a bigger change. Retires the tripwire below.

### Step 6 — preview "created by" *(blocked)*

Needs a tier-gated audit-read action over a write-only collection. Its own
round, and only if the field is actually wanted.

### Not scheduled

JSON-LD (§F.2) is blocked behind generation, which is its own phase. The three
chrome toggles (§F.1) are blocked behind render paths that do not exist. Status
(§F.5) should link to the publish flow, not be reproduced.

**Steps 0-2 deliver the entire visual redesign** — the menu, every screen, and
the Preview Link consolidation — without one new feature and without touching
the public render path.

---

## Tests

**One assertion added**, in `test/pure/pageSettingsSeoLimits.test.mjs`.

It pins the §B asymmetry: both SEO fields carry a schema maximum and both render
a counter, but only `metaTitle` renders an `invalid` flag. A 161-character
description therefore looks acceptable and is rejected when the save runs.

It is **self-retiring** in the manner of the audit tripwires: it goes red on the
commit that gives `metaDescription` the same guard, and the correct response is
to delete it along with step 5 above — not to update it.

It is a source-level assertion rather than a render one because the dialog reads
`useEditor()` and cannot be rendered without a selection-bearing context, and
exporting its bodies is step 0's job, not this round's.

Nothing else measured here warrants a test: the rest is either a fact about code
that already has coverage, or a proposal for code that does not exist yet.
