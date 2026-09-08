# `feature`'s suite baseline — 102 failures across 32 groups

**Measured:** 2026-09-08, on `feature` at `13a0d895` (*feat(pageBuilder/rich_text): an
author colour on part of a sentence*), i.e. after round B and before round C.

```
[suite] 10884 passed, 103 failed, 10987 total across 717 files (floor 5000)
```

**103, and the set below has 102.** The extra is a FLAKE, named separately at the foot of
this file rather than folded into the stable set — a name that comes and goes is not a
baseline, and a future round diffing against it would read the flake as its own
regression.

**Previous measurement**, at `8f3ca97a` (*feat(pageBuilder/price_card): the three pieces
the promotion card was missing*), before round B:

```
[suite] 10855 passed, 102 failed, 10957 total across 714 files (floor 5000)
```

Diffed BY NAME. **The 102 below are identical across both runs** — none left, none joined.
Round B added 30 tests and 3 files and moved no existing name into or out of the set. That
is the evidence the set is a baseline rather than one run's weather: it survived a round
that touched the rich-text contract, the walker, the editor toolbar and a shared test
guard.

## Why this file exists

`docs/dev-suite-baseline.md` records **`dev`'s** set, and it says plainly that the number
people were carrying — 57 — was measured on `feature` and "is not this branch's baseline
and never was". The symmetric gap was never closed: `feature` had no record of its own, so
round B had to spend a full extra suite pass measuring one before it could touch anything,
purely to have something to diff against at the end.

This is that record, in the same shape and for the same reason: **a count is satisfied by
any 102 failures, including 102 different ones. Names are not.**

## How to diff against it

```
npm test > /tmp/run.txt 2>&1
grep '^\s*✖ ' /tmp/run.txt | sed 's/([0-9.]*ms)//' | sed 's/^\s*✖ //' | sort -u
```

A name that leaves the set is a fix; a name that joins it is a regression. **Neither is
visible in the total** — 102 can stay 102 while every member changes.

## Three caveats that are part of the measurement

1. **A green suite does not mean the app builds.** Carried over from `dev`'s file because
   it is not a property of either branch: build status is a separate question with a
   separate instrument (`npm run build`), and it must be asked separately.

2. **This suite dirties the working tree, every run.** `test/fs/orNotSpecifiedScope.test.mjs`
   plants a violation in `src/models/RegisterPublic.js` and restores it from
   `readSource(rel).raw`, which normalises CRLF to LF — so `git status` reports the file
   modified while `git diff` and `git diff --numstat` report nothing. Observed after all
   three passes taken for this file. See
   `docs/ticket-a-test-rewrites-a-source-file-and-restores-it-with-the-wrong-line-endings.md`.
   `git checkout -- src/models/RegisterPublic.js` after every run; a dirty tree here is
   the suite, not your change.

3. **The file attribution below is derived, not reported.** `test/run.mjs` prints no
   per-file failure block, so each name was matched back to its file by literal search
   across `test/`. Six names are built from template literals at runtime and were mapped
   by matching the surrounding template instead — `recruitHeadcountWrite`'s nine
   `create: … normalised by the SERVER` cases, `avatarWrite`'s `SESSION email` case,
   `mobileEdgeInset`, `pageWrapAnywhere`, `featureContentCarouselLayout`'s 16:9 case, and
   `onlineCourseCardSkillCapsule`'s inert-span case, which shares its name with a passing
   test in `courseCardSkillCapsule` and was placed by its neighbours in the run output.
   All 102 are attributed; none is a guess between two live candidates.

## The flake

```
discardDraftContent clears the draft and nothing else
```

Absent at `8f3ca97a`, present in both runs at `13a0d895`. It is already filed —
`docs/ticket-revalidation-recorder-is-shared-across-the-run.md` names it at line 12 and
records it as one of four names that have flapped, with the shared `_calls` array in
`test/stub-next-cache.mjs` as the suspected mechanism and a note that isolation runs
cannot reproduce it. **Do not treat its presence or absence as a signal.**

---

## The 102, by file

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

### `test/render/onlineCourseCardSkillCapsule.test.mjs` — 5

- THE Development case holds here too
- an empty slug map renders spans and does not throw
- an unresolvable capsule stays an inert <span>
- resolvable capsules render anchors to the catalog pages
- the capsule link is INTERNAL while every other link on the card is not

### `test/render/settingsPanelTabs.test.mjs` — 5

- the active tab is DERIVED by clamping to the tabs that exist, never by an effect
- the fallback target is a tab that always exists
- the panel dispatches the TOP-LEVEL merge for the name, not the sub-object one
- the tab strip does not re-implement the rule — it calls the one function
- the type is not stated twice anywhere in the panel body

### `test/fs/pageBuilderDraftActions.test.mjs` — 4

- PRECONDITION: the gate refuses an unauthenticated request in BOTH modes
- the counter survives history being deleted — it is not derived from it
- the draft/publish action layer
- updatePageIdentity changes exactly the four keys, and nothing else

### `test/fs/pageBuilderVersionSnapshot.test.mjs` — 4

- CONTROL: a widened projection IS caught
- and `snapshot` is not in it, by name
- getPageVersions still refuses the snapshot
- the projection is exactly the metadata fields

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

### `test/fs/dashboardScopeEnforcement.test.mjs` — 2

- scope enforcement: requirePage/requireAdmin on `dashboard` is NOT weakened
- scope enforcement: the action reads the scopes off the session it guarded

### `test/pure/previewExpiry.test.mjs` — 2

- the action reaches for round 42’s conversion and defines none of its own
- the action turns a refused date into an error, not into "no expiry"

### `test/render/catalogueProp.test.mjs` — 2

- BOTH builder routes read the catalogue and pass it down
- the declared key set is exactly two keys

### `test/render/featureContentCarouselLayout.test.mjs` — 2

- the image slide's artwork is 16:9 below lg
- the stage is 12:5 from lg, and its cap meets the ratio at 1200

### `test/render/programOnlineCoursesSection.test.mjs` — 2

- CONTROL: a program with no icon still renders the heading and the pill
- CONTROL: the same component DOES render when given one course — so the empties above are the guard, not a broken component

### `test/render/sectionTypeCoverage.test.mjs` — 2

- no button reaches onPick without the guard: disabled is bound to state !== "add"
- the fail-closed "soon" branch is still IN typeState — this file does not license deleting it

### `test/fs/containerGapScale.test.mjs` — 1

- the padding scale it borrows from is untouched (§H)

### `test/fs/courseCanonicalWiring.test.mjs` — 1

- the custom page canonical is UNCHANGED — it still prefers its own field

### `test/fs/courseHrefCensus.test.mjs` — 1

- courseHref has NO callers in src — the census records that

### `test/fs/mobileEdgeInset.test.mjs` — 1

- src/app/(public)/promotions/page.jsx: every max-w-[1200px] content column is inset on mobile

### `test/fs/registrationQuoteConsentWiring.test.mjs` — 1

- the quote route builds its document through buildQuoteRegistration

### `test/fs/reservedPaths.test.mjs` — 1

- the static-sourced entries match the public/ directory

### `test/pure/auditTrail.test.mjs` — 1

- the read is gated on the SAME key every other page read uses

### `test/pure/dashboardDefaultRange.test.mjs` — 1

- default: no file re-declares the default as a literal

### `test/pure/envRestore.test.mjs` — 1

- the readers WOULD change answer if it flipped — so the invariant matters

### `test/render/containerGap.test.mjs` — 1

- the two neighbours it sits beside are untouched

### `test/render/homeHeroSection.test.mjs` — 1

- both hero images are present

### `test/render/iconPicker.test.mjs` — 1

- both card editors use the picker, and neither still takes a typed icon name

### `test/render/pageWrapAnywhere.test.mjs` — 1

- the editor canvas carries [overflow-wrap:anywhere] on its wrapper

