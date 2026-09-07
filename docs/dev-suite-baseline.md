# `dev`'s suite baseline — 96 failures across 29 groups

**Measured:** 2026-09-07, on `dev` after the request-fold port.

```
[suite] 10697 passed, 96 failed, 10793 total across 703 files (floor 5000)
exit=1
```

**Previous measurement**, at `41c174c4` (*fix(dashboard): restore the action wrapper a
cherry-pick concatenated*), before the fold port:

```
[suite] 10680 passed, 100 failed, 10780 total across 702 files (floor 5000)
```

Diffed BY NAME, not by count. Four names left the set and **none joined it**:

```
- CONTROL: the dashboard slice is the trend aggregation and nothing else
- the SEVEN-DAY TREND counts requests too
- the dashboard imports the SAME key and the SAME precedence
- the dashboard no longer counts public registrations one status at a time
```

All four are the `registrationsFoldWiring` group. One kept its name and is now green
against `buildMetrics.js`; the other three were replaced by the guards described in that
section below.

## Why this file exists

The number people were carrying — **57** — was measured on `feature`. It is not this
branch's baseline and never was. Diffing a `dev` run against it produces noise in both
directions, and that is how a branch ends up with a failure set nobody can reason about.

This records `dev`'s own set **by name**, so the next round on this branch has something
to diff against. The point of naming them rather than pinning the count is the one
`test/run.mjs` already makes about its own meta-controls: a count is satisfied by any 100
failures, including 100 different ones. Names are not.

## How to diff against it

```
npm test > /tmp/run.txt 2>&1
grep '^\s*✖ ' /tmp/run.txt | sed 's/([0-9.]*ms)//' | sed 's/^\s*✖ //' | sort -u
```

Compare that set against the names below. A name that leaves the set is a fix; a name that
joins it is a regression. **Neither is visible in the total** — 100 can stay 100 while
every member changes.

## Two caveats that are part of the measurement

1. **A green suite does not mean the app builds, and a stable failure count does not
   either.** This baseline was taken on a branch that had been unbuildable for a day while
   the suite ran. Build status is a separate question with a separate instrument
   (`npm run build`), and it must be asked separately.

2. **The four `registrationsFoldWiring` failures are gone, and not by re-pointing a
   regex.** `buildMetrics.js` now folds legs into requests in every counting branch, so
   the dashboard and `/admin/registrations` answer the same number. The guarantee moved
   with the behaviour: `test/pure/dashboardFoldsRequests.test.mjs` asserts on the
   PIPELINE OBJECT the real code builds — which cannot pass on dead code, the way the
   three source scans it replaced did for a day — and the source-text half that remains in
   `registrationsFoldWiring` now checks `buildMetrics.js` for the one claim that really is
   about text: that it imports the shared rules rather than restating them.

Three names are generated at runtime from template literals and could not be mapped back
to a file by string search; they are grouped at the end.

---

### `test/pure/recruitHeadcountWrite.test.mjs` — 20

- CONTROL: the action really writes, and this test reads it back
- CONTROL: the reset really isolates — rows do not carry over
- a blank submission stores null — not 0, and not the empty string
- a posting written before this field existed round-trips unchanged
- a real headcount is stored as a NUMBER, not the string it arrived as
- a submission with the key absent altogether also stores null
- create: a boolean that would coerce is normalised by the SERVER, not stored raw
- create: a fraction as a number is normalised by the SERVER, not stored raw
- create: a fraction is normalised by the SERVER, not stored raw
- create: a negative is normalised by the SERVER, not stored raw
- create: an array that would coerce is normalised by the SERVER, not stored raw
- create: an object is normalised by the SERVER, not stored raw
- create: over the cap is normalised by the SERVER, not stored raw
- create: text is normalised by the SERVER, not stored raw
- create: the cap boundary is enforced server-side, inclusive
- create: zero is normalised by the SERVER, not stored raw
- the recruit write path, executed
- update: OMITTING the key leaves the stored value alone
- update: a bypassing payload is normalised on the way in
- update: clearing the input sets the stored value back to null

### `test/pure/avatarWrite.test.mjs` — 11

- CONTROL: the fake actually records deletes, so the [] assertions mean something
- action: a client-supplied target identifier changes nothing
- action: a malformed publicId is refused and nothing is written or deleted
- action: a session with no matching record refuses rather than creating one
- action: an object pretending to be a publicId is refused, not coerced
- action: it only ever touches the SESSION email's record
- action: re-saving the same id writes no delete
- action: removing sets the field to null and deletes the old publicId
- action: replacing deletes the OLD publicId, exactly once
- action: setting an avatar writes it to MY record
- the avatar write action

### `test/render/onlineCourseCardPills.test.mjs` — 8

- CONTROL: the pill really is hardcoded — no course field can suppress it
- the e-Learning pill did NOT become a second certificate gate
- the e-Learning pill renders, matched at its element boundaries
- the e-Learning pill sits BEFORE the skill pill — order, not just presence
- the pill is a plain <span>, not a link — it names a kind, it does not navigate
- the pill string is in the CODE, not only in a comment about the code
- the pill survives a course with NO skills — it is constant, not derived
- with several skills the pill still leads and the skills keep their order

### `test/fs/heroOverlayOptIn.test.mjs` — 5

- CONTROL: the image-block extractor isolates ONE element
- Home renders <HeroSection /> as the first thing in <main>
- Home still falls back between carousel and static banner, untouched
- both sides import the sentinel id — neither hardcodes the string
- the astronaut is NOT priority, and is never object-cover

### `test/fs/previewPublishedMode.test.mjs` — 5

- CONTROL: the action file DOES carry it, so the probe is live
- every mutating action opens with requireAdmin, but one
- the published view is read-only, and something enforces it
- the published-version reader is NOT a server action
- …and that one can only touch the lockout counters

### `test/render/settingsPanelTabs.test.mjs` — 5

- the active tab is DERIVED by clamping to the tabs that exist, never by an effect
- the fallback target is a tab that always exists
- the panel dispatches the TOP-LEVEL merge for the name, not the sub-object one
- the tab strip does not re-implement the rule — it calls the one function
- the type is not stated twice anywhere in the panel body

### `test/fs/pageBuilderVersionSnapshot.test.mjs` — 4

- CONTROL: a widened projection IS caught
- and `snapshot` is not in it, by name
- getPageVersions still refuses the snapshot
- the projection is exactly the metadata fields

### `test/render/onlineCourseCardSkillCapsule.test.mjs` — 4

- THE Development case holds here too
- an empty slug map renders spans and does not throw
- resolvable capsules render anchors to the catalog pages
- the capsule link is INTERNAL while every other link on the card is not

### `test/fs/pageBuilderDraftActions.test.mjs` — 3

- PRECONDITION: the gate refuses an unauthenticated request in BOTH modes
- discardDraftContent clears the draft and nothing else
- the draft/publish action layer

### `test/fs/runnerFlush.test.mjs` — 3

- no file in the runner calls process.exit() — read from scrubbed code
- run.mjs decides its exit code by delegating to reportSuite
- the runner still runs one shared process and still honours CANARY=1

### `test/render/sectionPickerWidthStability.test.mjs` — 3

- the clamped box and the scroller are SEPARATE, and the gutter follows the scroller
- the height declaration is a static literal — it cannot vary with filter state
- the width declaration is a static literal — it cannot vary with filter state

### `test/fs/auditCoverage.test.mjs` — 2

- W2-b — CONTROL: the depth parameter is live, and depth 0 reproduces the pre-walk count
- the mutating-export count across every action module is pinned

### `test/fs/canvasViewportHonesty.test.mjs` — 2

- CanvasPanel renders an iframe and portals the canvas into its document
- the device widths are the FRAME width, not an outer max-width

### `test/pure/previewExpiry.test.mjs` — 2

- the action reaches for round 42's conversion and defines none of its own
- the action turns a refused date into an error, not into "no expiry"

### `test/render/programOnlineCoursesSection.test.mjs` — 2

- CONTROL: a program with no icon still renders the heading and the pill
- CONTROL: the same component DOES render when given one course — so the empties above are the guard, not a broken component

### `test/render/sectionTypeCoverage.test.mjs` — 2

- no button reaches onPick without the guard: disabled is bound to state !== "add"
- the fail-closed "soon" branch is still IN typeState — this file does not license deleting it

### One failure each

- `test/fs/containerGapScale.test.mjs` — the padding scale it borrows from is untouched (§H)
- `test/fs/courseCanonicalWiring.test.mjs` — the custom page canonical is UNCHANGED — it still prefers its own field
- `test/fs/courseHrefCensus.test.mjs` — courseHref has NO callers in src — the census records that
- `test/fs/reservedPaths.test.mjs` — the static-sourced entries match the public/ directory
- `test/pure/auditTrail.test.mjs` — the read is gated on the SAME key every other page read uses
- `test/pure/envRestore.test.mjs` — the readers WOULD change answer if it flipped — so the invariant matters
- `test/render/catalogueProp.test.mjs` — BOTH builder routes read the catalogue and pass it down
- `test/render/containerGap.test.mjs` — the two neighbours it sits beside are untouched
- `test/render/courseCardSkillCapsule.test.mjs` — an unresolvable capsule stays an inert `<span>`
- `test/render/featureContentCarouselLayout.test.mjs` — the stage is 12:5 from lg, and its cap meets the ratio at 1200
- `test/render/homeHeroSection.test.mjs` — both hero images are present
- `test/render/iconPicker.test.mjs` — both card editors use the picker, and neither still takes a typed icon name

### Names generated at runtime — could not be mapped by string search — 3

- src/app/(public)/promotions/page.jsx: every max-w-[1200px] content column is inset on mobile
- the editor canvas carries [overflow-wrap:anywhere] on its wrapper
- the image slide's artwork is 16:9 below lg
