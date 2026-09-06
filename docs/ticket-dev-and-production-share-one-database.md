# Dev and production are the same MongoDB. There is no dev database.

**Filed** 2026-09-06, after a round in which routine click-testing wrote
production data and 53 production records were deleted.

**This ticket states the problem. It proposes no implementation** — by
instruction, and because the fix is a decision about environments and cost that
is not this round's to make.

---

## The fact

`.env.local` holds ONE connection string, and the repository holds no other env
file:

```
$ ls -a | grep '^\.env'
.env.example
.env.local

$ grep '^MONGODB' .env.local          # password masked
MONGODB_URI=mongodb+srv://***:***@genesis-cluster0.mrhpieh.mongodb.net/9exp_genesis
MONGODB_DB_NAME=9exp_genesis
```

`next dev` and `next start` both load `.env.local`. `dbConnect` reads
`MONGODB_URI` and `MONGODB_DB_NAME` from the environment and nothing else. So
the local dev server, a production deploy, and any script run with
`--env-file=.env.local` all open the same database.

**Verified empirically rather than inferred from the string.** The app's own
unauthenticated route `/api/registration/public/status` reads through the app's
`dbConnect` and its own model. Probed against the single `_id` a separate
connection could see, with controls:

| Probe | Result |
|---|---|
| `?id=6a7db1ce826b6e426aaed810` | `200 {"status":"pending"}` — the app finds it |
| `?id=000000000000000000000000` | `404 not_found` |
| no id | `400 missing_id` |

The cluster carries no second database to be a dev one. `listDatabases`:

```
9exp_genesis (25.8 MB) · 9exp_payment (0.3 MB) · admin · config · local
```

`9exp_genesis` is the only database holding `register_public`.

---

## What that means concretely

### 1. Testing a write path is indistinguishable from using the product

There is no action a developer can take against the running app that is
"only a test". Submitting the bundle registration form to see whether the round
works writes N real rows into `register_public`, sends a real confirmation
email, and adds N entries to every count on the admin screens. The rows are not
marked, not separable, and not removable except by deleting them — which is
itself a production deletion.

The codebase already says this, in its own words, and has never named it as a
problem. From `src/app/api/registration/public/dev-mark-paid/route.js`:

> Allow this endpoint ONLY when `PAYMENT_TEST_MODE=true` is explicitly set,
> regardless of NODE_ENV. **This lets us test on production with test keys
> without exposing it permanently.**

and, in the same file, arguing for a guard:

> The deciding fact is not that this is "dev-only". Its own comment says
> `PAYMENT_TEST_MODE` is meant to be settable ON PRODUCTION, deliberately, so
> the flow can be tested with test keys **against real data**.

That reasoning is correct and it is the symptom. A route named `dev-mark-paid`
exists, is documented as production-reachable, and writes to the collection the
business runs on.

The residue is visible elsewhere too: `scripts/audit-orphan-registrations.mjs`
exists because the charge endpoint writes a registration BEFORE payment, so
every abandoned test checkout leaves a `pending` document behind forever. That
script measures a problem that only exists because tests and customers write to
the same place.

### 2. Nobody can safely exercise a destructive path

Delete, cancel, status transitions, the round mover, the invoice writer — every
one of them can only be exercised on real records. There is no copy to break.
The practical consequences:

* a destructive path is either **tested on real data** or **not tested at all**,
  and both are bad in different ways;
* the safe-looking option — "just try it on a test record" — is the one that
  produced this round's incident, because a test record and a real record live
  in the same collection and look the same in the same list;
* code review and the automated suite carry the entire load. The suite has **no
  database at all** (`test/fakeDb.mjs` is a hand-written stand-in with no
  transaction semantics), which is honest and is stated in
  `test/fs/bundleWritePath.test.mjs` — but it means claims like "the transaction
  aborts cleanly" are verified only by a manual click-test, and a manual
  click-test is a production write.

### 3. It has already cost real data

On **2026-09-05, 23:03–23:09 (+07)**, 53 registrations were deleted one at a
time through the admin UI:

* `register_inhouse` 8 → **0**
* `register_public` 46 → **1**

Among them were five legs of two bundle quotation requests, created the same
evening by testing the bundle registration form. The audit trail records every
deletion with an actor. Nothing about the operation was a malfunction: the
admin UI did exactly what it is built to do, on records that were indeed test
submissions — mixed into the same collection as everything else.

### 4. The recovery was luck, not a safety net

All 46 public and 8 in-house documents were recovered — **only because the
replica-set oplog still held the window**. The window had opened
**2026-09-04T05:41Z**, roughly a day and a half earlier. The insert images for
every one of those records happened to fall inside it.

There is no backup that made this work. The oplog is a rolling buffer sized by
the cluster, not a retention policy anybody chose, and it will discard the
oldest entries continuously. Had the deletions happened a week after the
records were written, or had the cluster been busier, the same operation would
have been unrecoverable.

**Do not read the successful recovery as evidence that this is survivable.**
Read it as one instance where a coin landed the right way.

---

## What this ticket is not

It does not propose a second cluster, a seeded local database, a docker-compose
Mongo, a `NODE_ENV`-switched connection string, snapshot/restore tooling, or a
test-data marker on the schema. Those are all plausible and they are all
decisions with cost and operational consequences — about who pays for a second
Atlas cluster, who keeps a dev database in sync, and what happens to the
upstream MSDB and Omise integrations that the app also talks to.

The purpose here is that the situation is **written down and named**, because
until now it has only ever appeared as a parenthetical inside a route comment,
and the people making a decision about it should be looking at the whole
statement rather than at one endpoint's guard.
