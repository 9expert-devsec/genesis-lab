# `feature` and `dev` have diverged on src/lib/dashboard/, and the next integration hits it again

**Status:** open. This states the shape of a structural divergence. It proposes no
strategy — the choice of one is not this ticket's business.

## What is true today

`dev` carries a dashboard refactor that `feature` has never seen. `a7565086`
(*feat(dashboard): the default range is ทั้งหมด (E4.3)*, 2026-09-05) moved every read,
filter and payload decision out of `src/lib/actions/dashboard.js` and into a new
directory, leaving the action as a thin authorised wrapper: guard, scopes, models,
delegate.

```
git ls-tree feature -- src/lib/dashboard/
    (empty)
```

**`feature` has no `src/lib/dashboard/` directory at all.** Not an older version of it —
none of it. All eight modules are dev-only:

```
actionQueue.js   backfillPlan.js  buildMetrics.js  queueThresholds.js
ranges.js        scopeKeys.js     scopes.js        statusColors.js
```

And `feature` does not contain `a7565086`:

```
git merge-base --is-ancestor a7565086 feature   →  NO
```

So the same file has two shapes with no common ancestor for either of them:

| | `dev` | `feature` |
|---|---|---|
| `src/lib/actions/dashboard.js` | 124 lines, a wrapper | 236 lines, the whole implementation |
| signature | `getDashboardMetrics(range = DEFAULT_RANGE, from = '', to = '')` | `getDashboardMetrics(range = 'today')` |
| window resolution | `resolveCustomWindow` from `@/lib/dashboard/ranges` | local `function dateRange(range)` at line 41 |
| the reads | `buildDashboardMetrics(...)` in `@/lib/dashboard/buildMetrics` | inline, in the function body |

## Why this is a recurring hazard rather than a one-off

It has already fired once. `65034517` was cherry-picked from `feature` onto `dev`, hit a
conflict in this file, and was resolved by **keeping both sides**: dev's signature and
delegating `return`, feature's inline body, and neither side's imports. The result had
seven free identifiers and a duplicate `from`, and did not compile. It sat on `dev` from
2026-09-06 until it was found in Vercel's build log.

The conditions that produced it are all still in place, unchanged:

- the two versions of the file share no ancestor for their current shape, so git has no
  basis on which to merge them and will hand a conflict to a person every time;
- the conflict is large — a 124-line wrapper against a 236-line implementation — so the
  resolution is a judgement, not a hunk selection;
- **concatenation looks plausible.** Keeping both halves produces a file that reads like
  it contains everything, parses under the test suite's transpiler, and satisfies every
  text-based guard that reads it as a string. Nothing short of `npm run build` objects.

A future integration in either direction — merging `feature` into `dev`, cherry-picking
further from `feature`, or rebasing `feature` onto `dev` — meets the same conflict in the
same file with the same opportunity to resolve it the same way.

## Adjacent facts worth having in the same place

- The whole cherry-pick run touched **11 files where dev-side work and feature-side work
  overlapped**: `src/lib/actions/dashboard.js`, `src/lib/actions/registrations.js`,
  `src/models/RegisterPublic.js`, `src/app/(public)/[...slug]/page.jsx`,
  `src/app/sitemap.js`, `src/app/admin/registrations/_components/detailShell.jsx`,
  `.../RegistrationDetailClient.jsx`, `test/fakeDb.mjs`, `test/loader.mjs`,
  `test/fs/auditCoverage.test.mjs`, `test/fs/internalNotesSeparation.test.mjs`.
- `src/lib/dashboard/buildMetrics.js` does **not** fold registrations by request — its
  public aggregate groups by `{ source, status }`, one row per leg. Feature's
  *"an admin sees one bundle request, not N legs"* therefore reached
  `/admin/registrations` but has never been true of the dashboard on `dev`. That work
  still has to be ported into `buildMetrics.js`; it is tracked by the four currently-red
  tests in `test/fs/registrationsFoldWiring.test.mjs`.
