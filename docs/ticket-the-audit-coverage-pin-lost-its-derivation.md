# `MUTATING_EXPORT_COUNT` is a number nobody can audit

**Status:** open. Not a build problem. A legibility loss in the one file whose entire
purpose is to make a number checkable.

## What is true today

```
test/fs/auditCoverage.test.mjs:786    const MUTATING_EXPORT_COUNT = 184;
grep -c "REDIRECT PANEL\|AVATAR ROUND"  →  0
ls src/lib/actions/ | grep -E "redirects|avatar"
    admin-avatar.js
    redirects.js
```

Two dev-only rounds still contribute exports to that count, and the commentary explaining
how they moved it is gone.

## How it happened

`b3cb5767` was cherry-picked from `feature` (`b37fd282`) onto `dev` and stopped on a
conflict in this file — one of the four picks the reflog marks `commit (cherry-pick)`
rather than plain `cherry-pick`. The two sides had genuinely diverged:

```
dev before the pick  : 1468 lines
feature before       : 1453 lines
result on both       : 1478 lines   ← line-identical to feature's result
```

The resolution took feature's side wholesale. What dev lost:

```
- // REDIRECT PANEL: 177 -> 181, +4 — saveRedirectRule, deleteRedirectRule,
- // createRuleFromHit and reopenNotFoundHit added in the NEW module
- // src/lib/actions/redirects.js. All four write Mongo DIRECTLY in their own
- // body (create / findByIdAndUpdate / findByIdAndDelete / updateOne), so depth 0
- // sees all four and BOTH pins move together; REACHED_THROUGH_IMPORT is
- // unchanged and the delta stays 8.
-
- // AVATAR ROUND: 181 → 182, +1 — setOwnAvatar in the NEW module
- // src/lib/actions/admin-avatar.js. It writes Mongo directly in its own body
- // (`admin.save()`), so depth 0 sees it, BOTH pins move together, and
- // REACHED_THROUGH_IMPORT is unchanged so the delta stays 8.
```

and gained feature's, which describes a different round entirely:

```
+ // ── 177 → 180: the CustomPage draft/publish split ──
```

`65034517` later moved the number 180 → 184, so the **arithmetic** was patched downstream.
The **derivation** never came back.

## Why it matters more here than it would elsewhere

This is not a file where comments are decoration. Its own header argues that a bare count
is worthless without the reasoning attached — the same argument `test/run.mjs` makes for
its meta-controls, and the same one this file makes at `MUST_CONTAIN` about floors versus
anchors. The comments are how the next person confirms that 184 is 184 for the right
reasons rather than because someone adjusted it until the test went green.

Right now two of the rounds inside that number are unexplained, and the modules they refer
to are still on disk still contributing to it. A reader who tries to reconstruct 184 from
the remaining commentary cannot.

## Note on the current failures

`auditCoverage.test.mjs` has two failing tests in `dev`'s baseline:

- `the mutating-export count across every action module is pinned`
- `W2-b — CONTROL: the depth parameter is live, and depth 0 reproduces the pre-walk count`

**These predate the dashboard repair** — verified by running the file against the
pre-repair `dashboard.js` and getting the identical two failures. They are their own
question, and this ticket does not claim the lost comments caused them. But they should be
looked at together: whoever re-derives the pin will have to establish what the real count
is, and that is most of the work of restoring the derivation.

Recorded in `dev-suite-baseline.md`.
