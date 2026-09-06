# A registration with top-level `firstName`/`lastName` is unsearchable and renders a blank person

**Filed** 2026-09-06, during the bundle-request round.
**Not fixed in that round**, by instruction: the round's scope was the folded
list, the round lock and the delete warning. This is a real defect on a
different axis and it outlives the record that revealed it.

## What was found

`register_public` document `69e9c36f1105858c782d1020` (created 2026-04-23,
`COPILOT-STU`) stores the person as **top-level scalars**:

```
_id, courseId, courseCode, courseName, classId, classDate,
firstName, lastName, email, phone,          ← the person, at the top level
status, notes, source, ipAddress, createdAt, updatedAt, __v
```

There is **no `coordinator` subdocument**, no `attendees`, no `consent`, no
`scheduleType`. It is the shape this collection used before the coordinator
subdocument existed. Seventeen top-level keys against twenty-six on a current
record.

It was discovered while verifying a recovery dump, not on screen — which is
itself the point.

## Why it matters

Two live readers give a wrong answer on a document of this shape, and neither
fails loudly.

1. **IT CANNOT BE FOUND BY NAME.** The public search clause in
   [`src/lib/registrations/listFilter.js`](../src/lib/registrations/listFilter.js)
   is:

   ```js
   { courseName: rx }, { 'coordinator.firstName': rx },
   { 'coordinator.lastName': rx }, { 'coordinator.email': rx }
   ```

   This document's name and email are at `firstName` / `lastName` / `email`,
   which no clause names. Typing the customer's name returns nothing, and an
   empty result is indistinguishable from "no such customer".

2. **IT RENDERS A BLANK PERSON.** `PublicTable`'s `CoordinatorCell` reads
   `row.coordinator?.firstName`, and the detail heading goes through
   `publicHeadingIdentifier`. Both get `undefined` and render an em dash or the
   bare label — which reads as missing data rather than as a schema difference.

The row is not hidden, not broken, and not reported. It is simply a record the
search cannot reach and the table cannot name.

## How many are there?

**Unknown, and it cannot be answered from the live collection**: on 2026-09-05
`register_public` was emptied by an admin (46 → 1, one leg at a time through the
admin UI). The one surviving record is current-shaped.

It CAN be answered from the recovery dump, which holds full document images for
all 46 records that existed. In that dump the shape distribution is:

* 46 records total
* **1** in the legacy top-level-name shape (this one)
* top-level key counts spread 17 → 26, i.e. several schema generations

So: one in forty-six, in the last known state of the collection. Do not read
that as "one exists" — read it as "one existed in the 46 that were there", and
re-derive the number from the dump rather than from a query.

## What a fix would look like

1. **Widen the search clause** to cover both shapes:
   `{ $or: [ {'coordinator.firstName': rx}, {firstName: rx}, … ] }`. Cheap,
   reversible, and it makes the row reachable. It does NOT fix the render.
2. **A read-side normaliser** — one function that returns the coordinator of a
   document whichever shape it is in, read by the table, the detail heading and
   the search clause builder. This is the shape the repo already prefers (one
   derivation site, named readers) and it fixes both symptoms at once.
3. **A migration** copying the four scalars into a `coordinator` subdocument.
   Correct, and the one that needs a decision this ticket cannot make: it is a
   write to production over documents nobody has audited, and the shape spread
   (17→26 keys) suggests there may be more than one legacy generation to
   handle. It also needs a ruling on whether the old top-level fields are then
   removed or left as dead weight.

**Option 2 is the recommendation.** Option 1 alone would leave a searchable row
that still renders a blank person, which is arguably worse than today — the
admin would find the record and then not be able to read it.

## Do not assume this was the only one

The record that revealed this is deleted. The question "how many legacy-shaped
registrations exist" is answerable **only from the dump**, and any future
migration should be planned against that rather than against a live query, at
least until the collection is repopulated.
