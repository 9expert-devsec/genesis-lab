# "Is this bundle request complete?" is answerable, but nowhere an admin can ask it

**Filed** 2026-09-05, at the close of the bundle-registration round (round B).
**Not built in that round**, by instruction: the round's ruling was that if the
answer is "there is nowhere to run it", that is a ticket rather than a build.

## The property exists and is exact

A bundle quotation request writes one `register_public` row per course, all
sharing `bundle.requestId`, and they are written **marker-last**: the leg whose
`_id` IS the `requestId` is created last (`orderLegsMarkerLast`, in
`src/lib/registration/bundleLegs.js`). So:

> **a request is COMPLETE ⟺ a row exists whose `_id` equals its own
> `bundle.requestId`.**

**For one request**, given a reference number or a `requestId`:

```js
db.register_public.findOne({ _id: ObjectId("<requestId>") })
// a document → complete.   null → the marker never landed: incomplete.
```

**Sweep for every incomplete request in the collection:**

```js
db.register_public.aggregate([
  { $match: { bundle: { $exists: true } } },
  { $group: {
      _id: '$bundle.requestId',
      legs:   { $sum: 1 },
      marker: { $sum: { $cond: [ { $eq: ['$_id', { $toObjectId: '$bundle.requestId' }] }, 1, 0 ] } },
  } },
  { $match: { marker: 0 } },
])
```

Rows returned are requests whose marker leg is missing. Expected result on a
healthy collection: **empty**.

## Where an admin can run it today

**Nowhere in this application.** Stated plainly rather than softened:

* `/admin/registrations` lists legs. It shows the แพ็กเกจ chip, so an admin can
  see that a row belongs to a package — and cannot see how many courses that
  package was supposed to have, so a 2-leg wreck of a 3-course bundle reads as
  an ordinary 2-course bundle.
* The detail screen names the package and nothing about its siblings.
* No count, card or filter is derived from `bundle.requestId`.
* So the only way to run either query is **MongoDB Atlas or `mongosh`, by
  someone with database credentials** — which is not an admin, and not a thing
  anyone will do unprompted.

## How likely is it to matter?

Low, and non-zero. The write is wrapped in a transaction against a deployment
confirmed (read-only, 2026-09-05) to be a replica set — `hello` reports
`setName: atlas-jckskf-shard-0`, `logicalSessionTimeoutMinutes: 30`, MongoDB
8.0.30 — so while that holds, a partial write cannot occur and this sweep can
only ever return empty.

**The ordering exists for the world where that stops holding**: a host move, a
cluster change, or someone removing the transaction wrapper without knowing what
it was load-bearing for. In that world partial writes become possible and this
query becomes the only thing that can name one. Both guards are kept for the
same reason `writeEarlyBird` keeps its pre-read beside its E11000 — they fail in
different worlds.

## What a fix would look like

1. **Cheapest, and the recommendation:** a line on the admin registration detail
   screen for a bundle leg — "หลักสูตรที่ 2 จาก 3 ในแพ็กเกจนี้" — derived from
   one `countDocuments({'bundle.requestId': …})` on a page that already does a
   `findById`. It does not answer the marker question directly, but it makes an
   incomplete request **visible where a human already looks**, which is the part
   that is missing. It would also need the authored item count to compare
   against, which the tag does not carry (`itemCount` was considered and
   rejected in round B precisely because nothing read it — this would be the
   reader that changes that decision).
2. A grouped view: bundle requests as rows, legs as children. Larger, and it
   collides with the round's ruling that the list shows legs because legs are
   what the collection holds.
3. A scheduled sweep running the aggregate above and alerting on a non-empty
   result. Correct, cheap to run, and needs a decision about who is alerted —
   the same unanswered question that keeps
   [ticket-bundle-unavailable-invisible.md](./ticket-bundle-unavailable-invisible.md)
   unbuilt.

Option 1 is the smallest thing that turns "queryable by someone with database
access" into "visible to the person holding the phone".
