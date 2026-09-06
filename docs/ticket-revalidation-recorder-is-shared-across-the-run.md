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
