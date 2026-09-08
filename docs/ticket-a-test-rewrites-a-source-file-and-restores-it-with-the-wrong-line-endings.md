# A test rewrites a tracked source file and restores it with the wrong line endings

**Filed** 2026-09-08, during the Page Builder authored-colour rounds.
**Pre-existing** — not introduced by them, and not fixed here. No fix proposed.

## The observation

`npm test` leaves the working tree dirty. Every full-suite run in these rounds
finished with one unstaged modification that no round had made:

```
 M src/models/RegisterPublic.js
```

`git diff` on it prints **nothing**. `git diff --numstat` reports **no changed
lines**. The file is nonetheless modified, and `git status` keeps saying so
until someone restores it:

```
warning: in the working copy of 'src/models/RegisterPublic.js',
         LF will be replaced by CRLF the next time Git touches it
```

It happened on **three separate rounds** and was restored by hand each time.

## The mechanism, which is not in doubt

`test/fs/orNotSpecifiedScope.test.mjs` mutates that file on purpose, as a
control, and restores it in a `finally`:

```js
test('CONTROL: referencing the constant in one write-path file reddens the guard above', () => {
  const rel = 'src/models/RegisterPublic.js';
  const abs = path.join(ROOT, rel);
  const original = readSource(rel).raw;
  const mutated = `import { NOT_SPECIFIED_LABEL } from '@/lib/orNotSpecified';\n${original}`;
  writeFileSync(abs, mutated, 'utf8');
  try {
    …
  } finally {
    writeFileSync(abs, original, 'utf8');
  }
  assert.equal(readSource(rel).raw, original, 'the write-path file was not restored byte-identically');
});
```

The control is a good one and the intent is right: it plants a real violation in
a real file so the guard above it is proved able to fire, then puts the file
back. The bug is in the round trip, and it is one line up from the restore.

`readSource(rel).raw` **normalises line endings**:

```js
raw: readFileSync(full, 'utf8').replace(/\r\n?/g, '\n'),
```

So `original` is the file with **LF**. The repo's checkout is **CRLF**. The
restore writes back the normalised copy, and the file on disk is now a
byte-different file that Git reports as modified even though its content, after
Git's own normalisation, is identical.

The test's own final assertion cannot catch this: it compares
`readSource(rel).raw` to `original`, and both sides have been through the same
normalisation. It is comparing the file to itself with the difference removed.

## Why it is worth a ticket rather than a `git checkout`

**An aborted run leaves a source file in the state the test wrote.** The restore
is in a `finally`, which covers a thrown assertion — but not a killed process,
and this suite is killed routinely: a `Ctrl-C`, a timeout, an editor stopping a
background task. In that window `src/models/RegisterPublic.js` on disk begins:

```js
import { NOT_SPECIFIED_LABEL } from '@/lib/orNotSpecified';
```

…which is a real import of a real module into a real Mongoose model, sitting in
the working tree of a repo whose `dev` database **is** production. Nothing about
that state announces itself; the next `git status` shows one modified file, the
same as the benign case, and `git diff` shows a one-line addition that looks
deliberate.

**And it trains the reader to ignore a dirty tree.** Every round in this series
ended by checking whether the suite had dirtied anything, found this, confirmed
it was the known no-op, and restored it. That is exactly the habit that lets the
next genuinely-modified file through — the same argument the revalidation ticket
makes about re-running until the count looks clean.

## The family this belongs to

The suite already recognises "a test mutates process- or repo-global state and
must put it back" as a hazard with a guard of its own:
`test/fs/envMutationGuard.test.mjs` sweeps the whole test tree for writes to
`NODE_ENV` and `TZ`, allows them only in named files, and its own header records
that **`TZ` was not latent** — two files restored it wrongly, and the restore in
`test/withTZ.mjs` "took a bug" to get right, because deleting `TZ` does not
restore the ambient zone.

That guard covers two environment keys. It does not cover **the filesystem**,
which is the same hazard with a larger blast radius: an env var is gone at
process exit, and a source file is not.

## Scope

No fix, and the choice is not obvious. At least three shapes exist and they are
not equivalent:

- restore from a **byte-exact** read (`readFileSync` without the normalisation)
  rather than from `readSource().raw` — smallest change, fixes the dirty tree,
  does nothing about the aborted-run window;
- plant the violation in a **scratch file** the guard also walks, instead of in
  a tracked one — removes the window entirely, but weakens the control's claim,
  which is specifically that the guard fires on a **write-path** file;
- extend `envMutationGuard`'s idea to the filesystem: a sweep for tests that
  write into `src/`, with an allow-list.

Choosing needs someone to weigh the control's strength against the window, which
is a judgement about the test tier rather than a repair.
