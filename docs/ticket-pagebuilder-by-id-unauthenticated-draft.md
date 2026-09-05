# `getPageBuilderPageById` is an unauthenticated read path that returns draft content

**Filed** 2026-09-05, during the bundle-registration round (round B).
**Not fixed in that round**, deliberately — see *Why it was not fixed here*.

## What it is

`src/lib/actions/pageBuilder.js` opens with `"use server"`. **Every export of a
`'use server'` module is a POST endpoint**, reachable by anything that can speak
the server-action protocol. That is not a property of how the function is
called today; it is a property of the file.

The function, in full:

```js
export async function getPageBuilderPageById(id) {
  if (!id) return null;
  await dbConnect();
  return serialize(await PageBuilder.findById(id).lean());
}
```

Three things are absent, and each of them is present on the reads either side
of it:

| Guard | `getPageBuilderPageById` | `getPageBuilderPageBySlug` |
|---|---|---|
| `requireAdmin("pages")` | **no** | n/a — it is a deliberately public read |
| `status: "published"` filter | **no** | yes |
| `.select("-draft")` projection | **no** | yes |

So the function returns the **whole document for any status**, including the
`draft` sub-tree: the unpublished working copy of a page, with whatever an
author has typed into it and not yet published.

## Why that is the statement rather than "it lacks a guard"

The slug read carries a note explaining that `-draft` is a **projection and not
a post-filter**, because "an unpublished draft must never leave the database on
a public read, and the cheapest place to guarantee that is the query." That
sentence is the standard this repo already holds itself to for public page
reads. This function is a public read of the same collection that meets none of
it.

The exposure is:

* **draft content of any page**, published or not — copy an author is still
  working on, a promotion not yet announced, prices not yet agreed;
* **the whole document of a `draft` / `closed` / `archived` page**, which the
  public route deliberately 404s;
* `preview.passwordHash` (a bcrypt hash) and the Cloudinary ownership tokens,
  which the projection on the public reads was written to keep in.

The id is a Mongo ObjectId, so this is not guessable at scale — but "hard to
guess" is not a guard, and an id leaks through ordinary means: an admin URL
pasted into a chat, a browser history, a screenshot of `/admin/pages/builder/…`.

## Priority

**Higher than most of what is on the list.** It is an unauthenticated read
returning unpublished content, it is one line to close, and its blast radius is
every page in the collection rather than one screen.

## Why it was not fixed here

Round B's business is bundle registration. Adding `requireAdmin` to this
function changes an **admin** read path — it has callers in the editor — and
that needs its own check of who calls it and whether any of them run outside an
admin session. Doing that inside a round about a public form would put two
decisions behind one proof, and would mean this round's suite result no longer
says only what this round did.

Round B **did not call it**. It added
`getPublishedPageBuilderPageById` beside `getPageBuilderPageBySlug` instead —
same two guards, same reasoning, by id rather than by slug — and
`test/fs/bundleRequestReadGuard.test.mjs` pins the difference between the two.
That test's CONTROL asserts, in as many words, that `getPageBuilderPageById`
carries neither guard; **when this ticket is fixed, that control goes red and
must be updated rather than deleted.**

## What fixing it looks like

1. Enumerate the callers (`grep -rn getPageBuilderPageById src/`).
2. If all of them are admin surfaces: add `await requireAdmin("pages")`, matching
   `getPageVersions` immediately below it.
3. If any caller is public, it wants `getPublishedPageBuilderPageById` instead —
   which already exists.
4. Update the CONTROL in `test/fs/bundleRequestReadGuard.test.mjs`, which asserts
   the current unguarded state on purpose.
