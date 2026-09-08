# Two draft/publish assertions are flaky: the revalidation recorder is shared by the whole run

**Filed** 2026-09-06, during the bundle-request round. **Pre-existing** — not
introduced by that round's changes, and not fixed by it.

## The observation

Across six full-suite runs of the same tree, one run reported **60 failures**
where every other reported the frozen **57**. The three extra were:

```
✖ discardDraftContent clears the draft and nothing else
✖ a promotion rename also revalidates /promotions
✖ the draft/publish action layer            ← the parent suite line
```

An immediate re-run of the **identical tree, with no edits between**, was back
to 57 with both green. `test/fs/pageBuilderDraftActions.test.mjs` passes
**123 / 0** when run alone.

So: not a regression, not reproducible on demand, and invisible unless someone
is diffing failures by name rather than counting them.

## The mechanism

`test/stub-next-cache.mjs` records every revalidation into **one
module-level array**:

```js
export const _calls = [];
export function revalidatePath(path, type) { _calls.push({ kind: 'path', path, type }); }
export function revalidateTag(tag)         { _calls.push({ kind: 'tag', tag }); }
```

The runner is a **single shared process** — `test/run.mjs` registers the loader
once and drives the programmatic runner with `isolation: 'none'`, deliberately,
because `node --test` spawns children the loader never reaches. So that array is
shared by every file in the run. Three files touch it today:
`test/fs/pageBuilderDraftActions.test.mjs`, `test/pure/upstreamTagBusters.test.mjs`,
and `test/loader.mjs`.

`pageBuilderDraftActions` truncates it at the start of each scenario:

```js
const scenario = (name, fn) =>
  t.test(name, async () => {
    resetFakeDb();
    revalidations.length = 0;
    setSessionUser({ … });
    await fn();
  });
```

…and the two failing assertions compare the **exact set** of recorded paths:

```js
const paths = revalidations.filter((c) => c.kind === 'path').map((c) => c.path).sort();
assert.deepEqual(paths, ['/admin/pages', '/first-slug', '/promotions', '/renamed-slug', …]);
```

**Truncate-then-compare-exactly is only sound if nothing else can write to the
array between the truncation and the comparison.** In a single process with no
isolation, that is not guaranteed.

## What was NOT established

The specific writer that pollutes the array was **not identified**, and this
ticket does not claim one. Two shapes are consistent with the evidence and both
exist in this codebase; either, both, or neither may be responsible:

1. **Un-awaited revalidation.** Any action that calls `revalidatePath` from work
   the test does not await — the `recordAdminActionAfter` fire-and-forget shape
   is the family — lands whenever it lands, which may be inside a later
   scenario's window.
2. **Cross-file bleed.** `test/pure/upstreamTagBusters.test.mjs` imports the same
   stub. Nothing coordinates its writes with another file's truncation.

Naming a cause without proving it would be worse than leaving this open: the
whole point of the ticket is that the failure is timing-dependent, and a
plausible-sounding diagnosis is exactly what would get "fixed" without changing
anything.

## Why it matters more than two flaky tests

The project's release discipline is **"zero drift against the frozen 57"**, and
that check is only as good as its determinism. A suite that intermittently
reports 60 trains the reader to re-run until it looks clean — and the next real
regression arrives looking exactly like this one did.

It also degrades the assertions themselves. `deepEqual` on an exact set is a
strong claim and the right one for "which paths does this action revalidate";
a recorder that can be written to from outside makes that strength unreliable
rather than making it weaker in a visible way.

## Related, but not the same

`test/fakeDb.mjs` is reset in the same `scenario` helper and has the same shared
lifetime. No fakeDb-related flake has been observed, and this ticket does not
assume the two share a cause — the recorder's problem is specifically that its
writers are **not all inside the test that truncates it**, which is not true of
the database fake.

## Scope

No fix is proposed. The decision — whether to give the recorder per-test
lifetime, to scope assertions to the calls a test caused rather than to the
array's whole contents, or to change the runner's isolation — has consequences
for `test/run.mjs`'s single-process design, which exists for a documented reason
(the loader does not propagate to `node --test` children).

---

## Update — 2026-09-08, still open, and the symptom has widened

Six more full-suite runs across the Page Builder authored-colour rounds. The
ticket above is unchanged in its diagnosis; what is new is that **it is not two
assertions**, the flapping set moves between runs, and one attempt to rule it out
was made with an instrument that cannot see it.

### Four distinct names have now flapped

Two were already recorded above. Two are new, and neither is in the same
scenario as the originals:

| name | first seen flapping |
|---|---|
| `discardDraftContent clears the draft and nothing else` | 2026-09-06 (above) |
| `a promotion rename also revalidates /promotions` | 2026-09-06 (above) |
| `PRECONDITION: the gate refuses an unauthenticated request in BOTH modes` | 2026-09-08 |
| `the counter survives history being deleted — it is not derived from it` | 2026-09-08 |

All four are in `test/fs/pageBuilderDraftActions.test.mjs`. Observed going
**pass → fail → pass** on trees that differed only by edits which cannot reach
that file (a Tailwind class string in a Page Builder component; a comment).

The last two matter because they widen the mechanism. `PRECONDITION: the gate…`
and `the counter survives…` do not assert on `revalidations` at all — the shared
recorder above cannot be the whole story, and whatever pollutes it is reaching
other shared state in the same file (`test/fakeDb.mjs`'s tables are the obvious
candidate, and the "Related, but not the same" section above says no fakeDb
flake had been observed at the time. One has now, or something else has).

### The timings say it is load, not order

From the run where `discardDraftContent` failed — neighbouring tests in the same
file, against **milliseconds** for the same tests run alone:

```
✔ updatePageIdentity leaves slugHistory alone when the slug does not change   4440.8ms
✔ a rename retires the old slug and never leaves the new one in history       7008.9ms
✔ a draft survives an identity rename byte-identical                          3970.8ms
✔ updatePageIdentity rejects a slug already taken by another builder page      4336.5ms
✔ CONTROL: the same slug on the page ITSELF is not a collision                8326.0ms
```

Four to eight seconds for assertions that take single-digit milliseconds in
isolation. Whatever the writer is, it is landing inside a window that is orders
of magnitude wider under full-suite load than it is alone — which is why the
same tree passes and fails without an edit between.

### Isolation runs cannot observe this, and one round wrongly concluded it could

Recorded because the wrong conclusion was reached and published before it was
caught. The file was run **alone**, three times each at two commits, to test
whether the flake was order-sensitivity:

```
HEAD    2 failed / 123 total, three runs, identical
HEAD~2  2 failed / 123 total, three runs, identical
```

…and the round reported "**not** order-sensitive, therefore branch divergence".
That inference does not hold. A single-file run has no other file writing to the
shared recorder, no other file's un-awaited work in flight, and none of the load
that produces the timings above — **it removes the cause and then reports the
absence of the effect**. Isolation runs can establish that a failure is *not*
caused by the file's own contents. They cannot establish that a failure is not
order- or timing-dependent, and this ticket's whole subject is that it is.

The two failures those runs did find (`updatePageIdentity changes exactly the
four keys…` and its parent suite line) are a separate, **stable** matter —
`updatePageIdentity` now writes `earlyBird` and `promotionKind`, which the
four-key assertion predates. That one is real branch divergence and is not this
ticket.

### The sibling hazard, for whoever picks this up

`test/fs/envMutationGuard.test.mjs` is the same shape solved: shared state a
test mutates and must restore, with a sweep, an allow-list and a named helper
whose restore "took a bug" to get right. It covers `NODE_ENV` and `TZ`. A third
instance — a test that rewrites a tracked source file and restores it with the
wrong line endings — is filed as
`ticket-a-test-rewrites-a-source-file-and-restores-it-with-the-wrong-line-endings.md`.
Three instances of one hazard suggests the guard's *idea* generalises further
than its two keys, which is worth considering alongside any fix here.
