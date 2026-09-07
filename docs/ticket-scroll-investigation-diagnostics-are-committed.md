# The scroll investigation's diagnostics are committed on dev

**Status:** open, not urgent. Legibility, not correctness. Nothing here breaks the build
or the suite, and three of the files are load-bearing for tests that would go red if they
were deleted.

## The counts

`scripts/` holds **215 tracked files**. **165** of them are underscore-prefixed
instruments from one bug hunt, totalling **1,546,043 bytes (~1.5 MB)**:

| prefix        | count |     | prefix         | count |
|---------------|-------|-----|----------------|-------|
| `_probe-*`    | 71    |     | `_audit-*`     | 7     |
| `_measure-*`  | 40    |     | `_diagnose-*`  | 6     |
| `_rehearse-*` | 21    |     | `_walk-*`      | 3     |
| `_control-*`  | 12    |     | `_run-*`       | 2     |
|               |       |     | `_drive-*`, `_parse-*`, `_verify-*` | 1 each |

That leaves the real tooling — `backfill-*`, `migrate-*`, `audit-*`, `import-*`,
`seed-*` — at roughly one file in four in its own directory.

## Reachability

**The build: no.** `scripts/` sits outside the app router and nothing under `src/`
imports it. The ~20 `src/` references to `scripts/…` are all inside doc comments, citing
a script as a reproduction step (`node scripts/_probe-thai-type-metrics.mjs`,
`_probe-twmerge-9e.mjs`, `_probe-round61-overflow.mjs`, and so on). Zero compile cost.

**`npm test`: mostly no — but not entirely, and this is the part that matters.**
`test/run.mjs` enumerates one level deep in `test/{pure,fs,render}` and its `undiscovered`
walk never leaves `TEST_DIR`, so no script is ever *run* as a test. But several tests read
scripts **as data**, and three of those read the throwaways by name:

```
test/fs/envMutationGuard.test.mjs:192        readSource('scripts/_probe-list-column-widths.mjs')
test/fs/msdbPutProbeSafety.test.mjs:26       REL = 'scripts/_probe-msdb-put-semantics.mjs'
test/fs/webrootRestoreScriptWiring.test.mjs:21  REHEARSAL = 'scripts/_rehearse-webroot-restore.mjs'
```

Delete any of those three and the corresponding test goes red.

## The entanglement that makes a bulk deletion non-trivial

```
test/fs/rootDocumentWrites.test.mjs:190   const files = [...walkSources('src'), ...walkSources('scripts')];
test/fs/rootDocumentWrites.test.mjs:197   for (const file of [...walkSources('src'), ...walkSources('scripts')])
test/fs/rootDocumentWrites.test.mjs:216   for (const file of [...walkSources('src'), ...walkSources('scripts')])
```

`rootDocumentWrites` **walks the whole `scripts/` directory**, three times. It does not
name individual files, so it will not go red on a deletion — it will simply scan less.
Any bulk removal silently changes that guard's corpus without changing its result, which
is the shape of a check quietly losing its subject rather than failing.

A further five non-underscore scripts are pinned by wiring tests and are *not* throwaways:
`backfill-dashboard-scopes.mjs`, `backfill-extension-upstream-id.mjs`,
`audit-extension-upstream-id.mjs`, `verify-legacy-delivery.mjs`,
`rewrite-legacy-references.mjs`, `restore-webroot-document.mjs`,
`backfill-upload-stage.mjs`.

## Shape of the work, if it is ever done

Roughly 160 of the 165 are genuinely inert and could go without any test noticing. The
three named above must be kept or their tests re-pointed first. Whatever is removed,
`rootDocumentWrites`'s directory walk should be looked at in the same change, so that the
reduction in what it scans is a decision rather than a side effect.
