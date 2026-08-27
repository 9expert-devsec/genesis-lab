# The Version model — what is reachable from what exists

A requirements document has landed covering draft/publish, version numbering,
version history, rollback, collaboration and locking. Rounds 1–8 built the
draft/published half. This measures the **version** half against the code, and
proposes a build sequence. **Nothing here is built.** No schema, action or
component changed this round.

Measured at `5a67abb` (round 32), `[suite] 6290 passed, 0 failed, 6290 total
across 418 files (floor 1582)`.

A decision brief, not a status page: `docs/page-builder-status.md` is amended by
later rounds as its findings get fixed; this one is the record of *why* a route
was chosen, and has a shelf life. Same shape as `docs/canvas-iframe-cost.md`.

---

## 0. Verification — the six facts this brief stands on

All six hold. Two comments describing them have rotted; the code has not.

| Claim | Verdict | Where |
|---|---|---|
| `PageBuilder.draft` holds the working draft; publish promotes it and clears it in ONE write, under `expectedUpdatedAt` | **HOLDS** | `pageBuilder.js:717–808`. One `findByIdAndUpdate` sets status + dates + the promoted content + `draft: null`. `draftConflict` gates it at :729 |
| `snapshotVersion` writes a `PageVersion` on EVERY publish; the pruning `deleteMany` is gone | **HOLDS** | `pageAudit.js:82–90` has no delete. `pageBuilder.js:800–805` snapshots inside `if (isPublishTarget)`, which is true for a republish with no draft. History grows unbounded |
| Snapshots strip `.draft` | **HOLDS** | `stripDraft(updated.toObject())` at `pageBuilder.js:803`; asserted by `pageBuilderDraftActions.test.mjs:290` |
| `getPageVersions` projects metadata, NOT `snapshot` | **HOLDS** | `pageBuilder.js:195` — `.select('label actor createdAt')` |
| `PageAuditLog` is write-only | **HOLDS** | `PageAuditLog.create` at `pageAudit.js:22` is the only reference in `src/`. Every other hit is a comment |
| Conflict is terminal | **HOLDS** | `editorReducer.js:206` sets it; no other case clears it. `RESET` (:215) rebuilds initial state, and the only `RESET` dispatcher in the tree belongs to the chat store |

**Two rotted comments, flagged not fixed** (this round changes no source):

- `models/PageBuilder.js:195–199` still describes `PageVersion` as *"capped at
  20 per page with a prune that DELETES rows"*. Round 2 removed that prune. The
  reasoning that follows the sentence ("a draft must never be snapshotted") is
  still correct, but it is now justified by a mechanism that does not exist.
- `models/PageVersion.js:15` says *"A snapshot is taken on every PUBLISH **and
  before every rollback**."* Nothing writes `label: 'pre-rollback'` — all three
  `snapshotVersion` call sites write `label: 'publish'`. `VersionHistory.jsx:28`
  carries a Thai label for `'pre-rollback'` that can never render. Harmless
  today; it becomes a live path the moment B lands.

### 0b. Two facts NOT in the brief that change several answers

**`updatedBy` on a live page is frozen at creation.** `publishPageStatus` does
not write it — its `$set` is status, the two dates, the promoted content, and
`draft: null`. The only writers are `createPageBuilderPage` (:326),
`duplicatePageBuilderPage` (:515) and `updatePageBuilderPage` (:411) — and
`updatePageBuilderPage` **has no live caller** (its one non-self reference in
`src/` is a comment in the edit route). There are no Mongoose hooks on the
schema. So on any page that has been edited since it was created,
`page.updatedBy` names the person who *created* it and nothing else.

This is the trap behind D and E: "ผู้แก้ไขล่าสุด" has an obvious-looking field
to read, and that field lies. A self-retiring assertion now pins it (§10).

**Six of the nineteen audit `action` values are never written.** All six
`section.*` actions (`add`/`update`/`delete`/`duplicate`/`reorder`/`toggle`),
plus the legacy `update` at :418 and `status` at :585, sit behind functions with
zero live callers — every reference outside `pageBuilder.js` is a comment. The
reachable vocabulary today is twelve: `create`, `update` (identity only),
`delete`, `duplicate`, `draft.save`, `draft.discard`, `publish`, `status`, and
the four `preview.*`.

---

## A. Version numbers

### What a row actually stores

`PageVersion` (`models/PageVersion.js`), collection `page_versions`:

| field | type | written by |
|---|---|---|
| `pageId` | String, required, indexed | caller |
| `snapshot` | Mixed, required — the **whole page doc**, `draft` stripped | caller |
| `label` | String, default `''` | always the literal `'publish'` today |
| `actor` | `{ id, name }`, both default `''` | `currentUserStamp(session)` |
| `createdAt` | Date | `timestamps: { createdAt: true, updatedAt: false }` |
| `_id` | ObjectId | implicit; `VersionHistory` uses it as the React key |

Index: `{ pageId: 1, createdAt: -1 }`. **There is no number, and no field that
could carry one by accident.**

### Do not derive the number at read time

`versionNumber = total − index` is the tempting one-liner and it fails all three
requirements. It is not *never reused*: delete a row (item 5b's Cloudinary GC
will eventually want to) and every later row renumbers. It is not *monotonic per
row*: inserting a Draft Backup row (§C) shifts everything above it. And it is
not *stable across reads*, because `getPageVersions` has a `.limit(20)` display
cap, so the derivation would number from a window rather than from the history.
A number that changes when nothing was published is worse than no number.

### Proposal: `$inc` a counter on the page, in the publish write itself

Two additive fields, one on each model:

```
PageBuilder:  publishedVersion: { type: Number, default: 0 }
PageVersion:  versionNumber:    { type: Number, default: null }
```

and one change to the existing publish write:

```
findByIdAndUpdate(id, { $set: set, $inc: { publishedVersion: 1 } }, { new: true })
… snapshotVersion({ …, versionNumber: updated.publishedVersion })
```

Why this shape:

- **Monotonic** — `$inc` is atomic at the document level, so it is monotonic
  even in the TOCTOU window that `draftConflict` leaves open. `draftConflict`
  reads `existing.updatedAt` in a *separate* query before the write; two
  publishes that both clear that check would both write, and `count()+1` would
  hand them the same number while `$inc` cannot. That window is the whole reason
  to prefer `$inc` over counting rows — not raw speed.
- **Never reused** — the counter lives on the page, not on the history, so
  deleting a `PageVersion` row does not decrement it. This is the property a
  derived number cannot have, and it is exactly the property item 5b's GC will
  need when it eventually starts deleting snapshots.
- **Never editable** — `publishedVersion` is in none of `DRAFT_CONTENT_KEYS`,
  `IDENTITY_KEYS` or `STATUS_KEYS`, and not in `pageBuilderSchema`. Every
  writing action either picks its `$set` from one of those key lists or builds
  it literally, so there is no surface through which a client could submit it.
  Same posture as `preview` and `draft.savedBy`: server-managed, deliberately
  outside the zod schema.
- **The schema can carry it**, additively, on both models. `snapshot` stays
  Mixed and untouched. But it is **two fields, not one** — a number stored only
  on `PageVersion` has nowhere to come from.

**Do not add a unique index on `{pageId, versionNumber}` without changing
`snapshotVersion` first.** `snapshotVersion` swallows every error by design ("a
lost snapshot is acceptable; a lost save is not"). A duplicate-key rejection
would therefore be silent, and the failure mode of a *silently missing* snapshot
is strictly worse than a duplicated number. If the index is wanted as a
backstop, `snapshotVersion` needs to log before it swallows. That is a decision,
not an oversight — name it when A is built.

### Rows that already exist

Every existing row has no number, and every existing page has no counter. Two
honest options:

1. **Backfill in one migration.** Per page, walk `{pageId, createdAt: 1}` (the
   existing index serves this directly), assign 1..N, then seed
   `PageBuilder.publishedVersion = N` **in the same migration**. Rows are
   immutable so the walk is safe. If the counter is not seeded, the next publish
   writes version 1 over an existing version 1.
2. **Leave them null, render "—".**

**Recommend (1).** Option 2 sounds more honest but is not: the change lands
after every page in the system already has history, so the version column would
be empty on essentially every row an author looks at, and "—" everywhere reads
as broken rather than as unknown. The invented numbers are ordinal only, derived
from the true publish order, and the migration says so.

---

## B. Rollback reachability — **the blocking item**

Round 2's finding is confirmed and it is load-bearing.

**What it projects.** `pageBuilder.js:194–198`:

```js
PageVersion.find({ pageId: String(id) })
  .select('label actor createdAt')   // NOT snapshot
  .sort({ createdAt: -1 })
  .limit(MAX_VERSION_ROWS)           // 20 — a DISPLAY cap, not retention
  .lean()
```

Four fields reach the client: `_id` (implicit), `label`, `actor`, `createdAt`.

**What reads it.** Exactly one caller: `VersionHistory.jsx:44`, inside a
`useEffect` gated on `open`. It renders a `<ul>` of timestamp · label · actor
name. Its own header comment states the consequence — *"this cannot show a
preview even if it wanted to"*.

**Verdict: rollback is structurally unreachable, and it is one action away from
being reachable.** Not one action away from being *built* — one action away from
being *possible*. There is no path today by which a snapshot's bytes leave the
database.

### The minimal change

A **new** action, not a widened one:

```js
export async function getPageVersionSnapshot(versionId) {
  await requireAdmin('pages');
  await dbConnect();
  return serialize(
    await PageVersion.findById(versionId)
      .select('snapshot label actor createdAt versionNumber').lean()
  );
}
```

**New rather than widened, and the payload is the whole argument.** A snapshot
is a full page document. Its size is dominated by `sections[]`, and each section
carries `advanced.customHtml` and `advanced.customCss` — unbounded free text a
developer-tier author types by hand. A metadata row is on the order of a hundred
bytes; a page document is on the order of a page. `getPageVersions` returns
twenty rows and fires on **every dialog open**, so widening it multiplies the
dialog's cost by twenty whole pages and pays that on every open, including the
common case where the author is just looking at the list. Fetch-one fires on an
explicit click, once, for the version actually chosen. That is the cost worth
naming, and it decides the shape.

### What this unlocks, and how cheaply

"Create a draft from this version" is then a client call into machinery that
already exists:

```
snap = await getPageVersionSnapshot(versionId)
await saveDraftContent(pageId, pick(DRAFT_CONTENT_KEYS, snap.snapshot), token)
```

`saveDraftContent` already applies `sanitizePageForTier`, `renumberSections`,
the `expectedUpdatedAt` check and the `draft.save` audit row. Rollback therefore
does **not** need a rollback action, a `'pre-rollback'` snapshot, or a second
write path — because round 2 made "restore" a special case of "save a draft",
and a draft can be discarded. The `label: 'pre-rollback'` vocabulary in
`PageVersion.js:21` and `VersionHistory.jsx:28` becomes unnecessary rather than
unimplemented: nothing is overwritten, so nothing needs archiving first.

**This is why B goes first in the sequence.** It is the only item on this list
that is *structurally* blocking — C, D and the whole restore UI are downstream
of a snapshot being fetchable, and it is also the cheapest item on the list.

---

## C. Draft Backup

The requirement: creating a draft from an old version, while a working draft
exists, preserves the current draft as a **"Draft Backup"** that takes **no**
version number.

### Where the row lives

**A `PageVersion` row with `label: 'draft-backup'` and `versionNumber: null`.**
Not a separate collection. The row is a full page snapshot keyed by `pageId`,
sorted by `createdAt`, shown in the same dialog — that is `PageVersion`'s exact
shape, and a second collection would duplicate the model, the index, the
serializer and the Cloudinary-ownership reasoning in `snapshotVersion`'s
comment for one boolean's worth of difference.

`label` is already a free `String` with `default: ''` and no enum, so it carries
this with **no schema change at all**. `versionNumber: null` is the §A default.
The `$inc` on `PageBuilder.publishedVersion` is simply not performed for a
backup write — which is why the counter belongs on the page rather than being
derived from row count.

One deviation from `snapshotVersion`'s current contract to write down: every
snapshot today is content that was once **actually public**, which is why
`stripDraft` is applied. A Draft Backup is the opposite — it is unpublished
content, deliberately archived. `stripDraft` is still correct (the archived
draft becomes the row's *content*, not a nested `.draft` key), but the comment
in `pageAudit.js` that says a snapshot records what was public stops being true
of every row, and must be amended when this lands.

### What distinguishes it in every query that reads versions today

**Nothing does — and there is exactly one such query.**
`getPageVersions` filters on `pageId` alone. So on the day a backup row is first
written, with no other change:

- it appears in the history list, interleaved by `createdAt` with real versions;
- it consumes one of the twenty `MAX_VERSION_ROWS` display slots, so a page with
  frequent backups pushes real published versions off the visible list;
- `VersionHistory.jsx:28`'s `LABELS[v.label] ?? (v.label || 'snapshot')`
  fallback renders it as the **raw ASCII string** `draft-backup` in a Thai UI.

So C is not "add a label" — it is: add the label, **and** decide the filter.
Either `getPageVersions` grows a `label` filter and a second read serves
backups, or it returns both and the client bands them (which round 32's
three-band structure panel is a precedent for). Either way `MAX_VERSION_ROWS`
stops meaning "the last 20 publishes" the moment a non-publish row can exist,
and the display cap has to be reasoned about per band. That is the real cost of
C, and it is larger than the row itself.

---

## D. Published-version read-only view

### The route can carry both modes. It should.

`/preview/[slug]` (`app/(public)/preview/[slug]/page.jsx`) today:

1. `getPageBuilderPageBySlugAny(slug)` — any status;
2. three terminal gates — preview disabled / no password hash / expired;
3. a signed, slug-scoped, HttpOnly cookie check (`verifyPreviewCookie`);
4. `<PreviewBanner pending={hasUnpublishedDraft(page)} />` +
   `<PageBuilderView page={composeWorkingView(page)} />`.

The published mode differs at **step 4 only**: `stripDraft(page)` instead of
`composeWorkingView(page)`. Steps 1–3 are identical and are four security gates
plus a constant-time HMAC compare. A sibling route would duplicate all four, and
`page.jsx`'s own header comment is a list of the things that go wrong when a
builder page gets a second render path. **A `?mode=published` search param on
the existing route**, `force-dynamic` already set, is the right shape.

The banner already has a two-state message and would need a third. The gate is
*still required* in published mode: a page whose `status` is `draft` has
published fields that are not public, so this view is not "showing what anyone
can already see at `/${slug}`".

### Where the metadata comes from — and it is not the audit log

`PageAuditLog` records the publish actor and is unreadable (§0, §E). But the
brief's premise that this blocks D is **wrong in the useful direction**:

**`PageVersion` already carries both, and `getPageVersions` already projects
both.** Every publish writes a row with `actor: { id, name }` and `createdAt`,
and the newest row for a page **is** the currently-published content, because
the snapshot is taken after the write. So:

- **publisher** → newest `PageVersion.actor.name` for that page;
- **publish time** → newest `PageVersion.createdAt`;
- **version number** → that row's `versionNumber`, once §A lands.

Three caveats to state on the page rather than paper over:

1. `actor.name` is denormalised at write time and defaults to `''`. A session
   with no `name` publishes an anonymous row, and the UI must render "—" rather
   than an empty span. It does **not** track a later rename, which is correct
   for an audit trail and should not be "fixed" with a join.
2. `getPageVersions` calls `requireAdmin('pages')` and `/preview/[slug]` is a
   public route. D needs a **new, narrow, unauthenticated-safe read** —
   newest-row metadata for one `pageId`, no `snapshot`, no list — not a call
   into the admin action.
3. Pages published **before** §A's migration have rows but no number. Same
   answer as §A: backfill, or render "—".

`page.updatedBy` is **not** an alternative source. It is frozen at creation
(§0b) and would name the wrong person confidently.

---

## E. Activity-log readability

### What a row stores

`PageAuditLog` (`models/PageAuditLog.js`), collection `page_audit_logs`,
index `{ pageId: 1, createdAt: -1 }`:

`pageId`, `pageType` (`'builder' | 'advanced_html'`), `action`, `sectionId`,
`field`, `before` (Mixed), `after` (Mixed), `actor: { id, name }`, `createdAt`.

### What a read path would require

Structurally, very little: the model exists, the index is the one query that
matters, and `lib/audit/readAuditLog.js` is a working precedent for the sibling
`AdminAuditLog` — pagination, filters, `menusForUser` clamping. A
`getPageAuditLog(pageId, { limit })` behind `requireAdmin('pages')` is a small,
low-risk action.

### Round 26's finding is confirmed — but write-only is **no longer the only obstacle**, and for one of the two questions it is not the obstacle at all

**"Who last edited the draft" — already answerable, without touching the audit
log.** `saveDraftContent:682` writes `draft = { ...sanitized, savedAt: new
Date(), savedBy: actor }` on every autosave tick. So while a draft exists, the
live document itself carries who last touched it and when. The editor never sees
these — `effectiveContent` restricts to `DRAFT_CONTENT_KEYS`, deliberately
dropping the stamps — but they are on the document and a server component
already reading the page can read them. **This is the cheapest correct answer to
"ผู้แก้ไขล่าสุด" in the whole brief, and it needs no new read path.** Its one
limit: publish and discard both clear `draft`, so the stamp is destroyed the
moment the edit stops being pending. Which is honest — after a publish, the
question is answered by §D's `PageVersion.actor`.

**"What changed" — not answerable, and the stored shape is why.** The file's own
convention is that `before`/`after` hold *a status or a `{slug,title}` pair,
never a whole doc*. `draft.save` accordingly writes
`before: { hadDraft }, after: { hasDraft }` — **presence flags**. Every
content-shaped `action` value that might have carried a field-level delta
(`section.update`, with its `sectionId`/`field` columns) is one of the six that
**no live caller writes** (§0b). So a fully-built read path would produce a
truthful, complete, and almost entirely contentless timeline: a run of
`draft.save` rows saying a draft existed before and after, one per autosave tick.

That is not a reason to skip E. It is the reason K rules out the semantic diff.

---

## F. The "บันทึกฉบับร่าง" button

The requirement says an autosave-equipped editor does not need it. Round 27
reached the same conclusion for the settings dialog and **kept** the editor's
button. Round 27 was right, and here is the mechanism.

**What removing it touches**, mechanically: the `<button>` at
`EditorTopBar.jsx:126–134` (with its `Save`/`Loader2` icons and its
`disabled={saving || Boolean(conflict)}`), the `onSave` prop through
`EditorTopBar`'s signature, and the wiring at `EditorShell.jsx:151`. Three
places. `saveNow` itself **must stay** regardless — `runPublish({ flush: saveNow })`
is the publish path.

**What still needs a manual trigger — and one of them is fatal to removing it:**

1. **Creating a page at all.** Autosave is explicitly disabled for an unsaved
   page: `useEditorSave.js:225` returns early when `!pageId`, and the header
   comment says *"NEVER for an unsaved page — an abandoned /builder/new must
   leave nothing behind."* The `createNow` path is reachable **only** through
   `save()`, i.e. only through the manual button (or through publish, which
   flushes first). Remove the button and the only way to create a page is to
   press เผยแพร่ — so **an `editor`-tier user, for whom `canPublish` is false
   and the publish button is disabled, could never create a page.** That alone
   settles it: the button cannot go until an unsaved page has some other route
   to its first write.
2. **Round 4's flush-before-publish** survives either way — it calls `saveNow`
   directly, not the button.
3. **Round 7's publishing flag** (`PUBLISH_START`/`PUBLISH_END` held across
   flush *and* promote) is likewise internal to `publish()`.

**One contradiction found while measuring this.** `useLeaveGuard.js:84` reasons
that *"a conflicted session keeps its manual button, which is right — leaving
one genuinely does lose the work."* But `EditorTopBar.jsx:129` disables the
button on `Boolean(conflict)`. A conflicted session has **no** manual save. The
guard's *behaviour* is still correct (it escalates at `conflict` and blocks the
exit), but the sentence explaining why is false. Worth fixing when G is touched —
it is exactly the premise G would change.

---

## G. Non-terminal conflict, and what "keep mine" really is

The requirement offers four choices. Mapped onto what exists:

| choice | cost today |
|---|---|
| **cancel** | free — already the behaviour. Stay conflicted, autosave stays stopped |
| **take theirs** | cheap. `window.location.reload()`, the same mechanism `discard()` already uses at `useEditorSave.js:305`. The route re-reads and re-seeds; no reducer change needed |
| **view changes** | needs a new read. `draftConflict` returns `{ ok: false, conflict: true, error: CONFLICT_MESSAGE }` — **no payload**. The server's current draft never reaches the client, so there is nothing to diff against |
| **keep mine** | see below. It is not a merge, or it is a project |

**What a non-terminal conflict requires structurally.** `conflict` gates four
places: `save()` at :153, the autosave effect at :225, `publish()` at :242, and
the trailing-save re-entry at :212. Clearing it needs a `CONFLICT_RESOLVED`
reducer action — and, critically, **a `savedUpdatedAt` the server will accept**.
Every resolution path must end by refreshing the token, or the first autosave
tick after resolution re-conflicts and the author loops. Autosave stopping is
what makes the current conflict state *safe*; making it non-terminal means
owning that loop.

`useLeaveGuard`'s `ESCALATION_FLOOR = REASON_RANK.conflict` also depends on
`conflict` never falling (`useLeaveGuard.js:81–85`). It is written as a floor
rather than an equality check, so it survives — but its comment does not.

### "Keep mine" is a merge, and the token cannot express one

`expectedUpdatedAt` is a **single whole-document** token: `draftConflict`
compares `new Date(existing.updatedAt).getTime()` against the client's and
rejects on any inequality. It says *"the document moved"*. It does not say
**which** of the nine `DRAFT_CONTENT_KEYS` moved, or which sections, or who
moved them. And `saveDraftContent` writes the whole nine-key draft in one
`$set` — there is **no partial-write primitive** to merge into.

So "keep mine", implemented against what exists, is: re-read the page, take its
fresh `updatedAt`, and write the client's tree with it. That is **last-writer-
wins with a confirmation dialog in front of it**. It silently destroys the other
author's draft, and it looks more considered than the current terminal conflict
while being strictly more destructive — the current behaviour at least *stops*.

A real merge needs three things, and the third is the one that is missing:

1. the server's current draft in the conflict response — additive, easy;
2. per-key or per-section-`id` granularity — the section `id`s are stable
   (`reidSection` guarantees it), so a section-level merge is expressible;
3. **the common ancestor** — the tree the client last received a token for.
   Nothing stores it. The editor keeps `page` (current) and `savedUpdatedAt` (a
   timestamp), never the last-saved *tree*. Without an ancestor a merge is
   two-way, and a two-way merge cannot distinguish *"I added this section"* from
   *"they deleted it"* — it will resurrect deletions.

**So G's cost is not the four buttons.** Three of them are cheap and one of them
requires retaining a base tree per session, which is a change to what the editor
holds in memory and what the server returns on every save. `keep mine` should
either be dropped, or shipped explicitly labelled as an overwrite — never as a
merge.

---

## H. The JSON-LD pre-publish gate — **still inert**

Round 27's measurement holds unchanged. No JSON-LD is emitted for builder pages.

`app/(public)/[...slug]/page.jsx:684–700` — the builder branch handles the
promotion redirect and then returns `<PageBuilderView page={builderPage} />`.
Between them sits a **comment**:

```
// JSON-LD HOOK POINT — generation is 2C, deliberately not built here.
```

The custom-page branch immediately below (:707–713) and the course, article and
masterclass routes all emit a real `<script type="application/ld+json">`. The
builder branch emits nothing.

Meanwhile the `jsonLd` block **is** stored (`models/PageBuilder.js`,
`schemas/pageBuilder.js`), **is** tier-gated (`canUseAdvanced` → developer only,
enforced in `tierSanitize`), and **has a full settings UI** (`JsonLdSection`,
`PageSettingsDialog.jsx:224`, reachable at :509).

So a "JSON-LD ถูกต้อง" pre-publish gate would validate an author's input against
a spec, block a publish on it, and the validated document would reach **no
rendered output on any page**. That is the inert-control class round 18 exists to
catch, in its purest form: a *blocking* control over a field with zero readers.
`docs/page-builder-status.md` already carries the standing assertion — *"the
route still emits no builder JSON-LD"*.

**The gate must not ship before the generator.** Order is not negotiable here;
shipping the gate first makes the system actively worse than having neither.

---

## I. Four roles vs. what exists

Today there are **two orthogonal axes**, and the requirement's four roles are one
axis.

**Axis 1 — menu access.** `requireAdmin(pageKey)` (`actions/auth.js:23`) →
`canAccess(user, pageKey)`. Binary per menu key, with `isSuperadmin` or
`pages == null` as the allow-all sentinel. Throws 401/403.

**Axis 2 — capability tier.** `ROLE_TIERS = ['editor', 'marketing', 'developer']`,
least→most (`rbac/access.js`). `getTier` forces superadmin to `developer` and
falls back to `editor` (least privilege) on anything unknown. Stored on
`Role.tier` with `enum: ROLE_TIERS`. Three predicates:

| predicate | grants | to |
|---|---|---|
| `canPublish` | publish / schedule | marketing, developer |
| `canManagePreview` | enable/rotate/revoke preview links | marketing, developer |
| `canUseAdvanced` | raw HTML / CSS / **JSON-LD** overrides | developer only |

And `coercePublishStatus` (`pageBuilder.js:125`) **downgrades rather than
errors**: a non-publisher requesting `published` silently gets the fallback
status, keeping their date edits. That is a deliberate design choice and it has
no equivalent in a role-based model, which would normally reject.

### What a four-role model changes

- **Publisher ≈ marketing** and **Editor ≈ editor** — mostly a rename.
- **Admin ≠ developer, and conflating them is the trap.** `developer` means *may
  write raw HTML/CSS/JSON-LD* — a **content-safety** capability. The
  requirement's Admin is about managing users and roles — an **administrative**
  one. Mapping developer→Admin grants raw-code injection to everyone who can
  manage users, and denies it to a senior developer who cannot. These are two
  axes wearing one name; keep `canUseAdvanced` separate whatever the roles get
  called.
- **Viewer has no counterpart at all, and it is the real work.** Access to
  `/admin/pages` is binary: if `canAccess` passes, you can mutate. **No mutation
  in `pageBuilder.js` checks a "may I write" predicate** — they check
  `requireAdmin('pages')` plus, sometimes, a tier predicate for a *specific*
  capability. A read-only role therefore needs a write gate at every mutating
  action (twelve reachable ones today), **and** a read-only mode in the editor —
  which `EditorProvider`/`editorReducer` have no concept of. There is no
  disabled tree, no suppressed autosave-on-dirty, no gated section controls.
- **Renaming the tiers is a data migration**, not a constant edit: `Role.tier`
  carries `enum: ROLE_TIERS`, so every stored Role document must be rewritten in
  step with the constant, and sixteen files consume the tier predicates.

**Viewer is the only genuinely new role.** The other three are a rename plus a
careful decision about which axis "Admin" names.

---

## J. §10–11 — presence and per-component locking

### Nothing in this repo does realtime. Plainly: nothing.

Measured, not assumed:

- **No WebSocket** — zero `new WebSocket` in `src/`.
- **No SSE** — zero `EventSource`, zero `text/event-stream`, no streaming
  `ReadableStream` response in any route handler.
- **No third-party realtime** — `socket.io`, `pusher`, `ably`, `liveblocks`,
  `yjs`, `partykit` are **absent from `package.json` entirely**, dependencies
  and devDependencies both.
- **No polling of server state.** Every `setInterval` in `src/` drives local UI
  — carousels, countdown timers, an "open now" badge. None fetches.
- **No presence concept anywhere** — no heartbeat, no session registry, no
  "who else is here" for any resource in the product.

The entire transport is Next.js server actions over ordinary HTTP, plus ISR
cache tags. The editor's own concurrency model is one optimistic token
(`expectedUpdatedAt`) and a 5-second idle debounce — deliberately *stateless*
between requests.

### Honest sizing

§10–11 is **its own project, not a round.** It needs, at minimum: a transport
(managed service, or self-hosted with a connection-state story that survives
Next's serverless deployment model); a presence store with heartbeats and
expiry; a lock store with TTL, renewal, and — the hard part — a **defensible
answer for a lock whose holder's tab died**, which is where per-component
locking gets its reputation; a merge model, because a lock that is not enforced
server-side is advisory, and an advisory lock plus terminal conflict (§G) is
what already exists; and enforcement inside `saveDraftContent`, which today
writes the whole nine-key draft in one `$set` and has no per-component
granularity to lock *against*.

That last point deserves emphasis: **per-component locking presupposes
per-component writes, and there are none.** The write granularity is the whole
content surface. Locking section 3 while the save path rewrites all sections is
a lock over a thing the storage layer does not recognise. §11 is therefore not
"add locks to the editor" — it is "make the draft write granular, *then* add
locks", and the first half is a redesign of round 2's central decision.

**Recommendation: out of scope for this arc.** Revisit as a separate project
with its own brief, after the version half is real. Nothing in §1–9 depends on
it.

---

## K. Recommend what NOT to build

In the round 21/26 style: each entry is a decision with its reason and its cost,
and each names the cheap honest substitute.

### 1. The semantic "สรุปการเปลี่ยนแปลง" bullets — **do not build**

The mockups show prose bullets: *"แก้ไขหัวข้อหลัก"*, *"เพิ่มส่วนรีวิว"*. That
is a section-tree diff rendered as natural language, and it is a feature of its
own.

**Can it be done honestly from what is stored?** From the audit log, **no**, and
not for a fixable reason: `draft.save` stores `before: { hadDraft }, after:
{ hasDraft }` — presence flags. The audit convention is explicit that
`before`/`after` never hold a document. The six `section.*` actions that carry
`sectionId` and `field` columns are precisely the six no live caller writes
(§0b). The log knows *that* a draft was saved and *who* saved it. It does not
know what a single one of those saves contained.

From snapshots, **partly, and only after B** — two consecutive `PageVersion`
rows *are* two full page documents, so a structural diff between publishes is
computable. But note what that gives: a diff between **publishes**, not between
**edits**. The mockup's bullets sit next to a draft-save timeline. And a
structural diff is not prose: turning "`sections[2].content.heading` changed"
into *"แก้ไขหัวข้อหลัก"* needs a per-section-type, per-field label map covering
27 section types across five sub-objects — which is a second
`SECTION_STYLE_CAPS`, maintained by hand, silently wrong the moment a field is
added. `docs/page-builder-status.md`'s standing rule applies directly: the
picker derives from `REGISTRY`, the panels derive from what components read. A
prose diff would derive from nothing and be restated by hand.

**Cheap honest substitute:** a **structural** summary from two snapshots, after
B — *"3 ส่วนถูกแก้ไข · 1 ส่วนถูกเพิ่ม · ชื่อหน้าเปลี่ยน"* — computed from
section `id` set arithmetic (ids are stable via `reidSection`) plus a shallow
key comparison over the nine content keys. Counts and key names are things the
data actually knows. It ships in the same slot in the dialog and it never lies.

### 2. Page snapshot thumbnails in the version dialog — **do not build**

**Can it be done honestly?** No. There is no rendering-to-image capability in
this repo at any layer: no `puppeteer`, no `playwright`, no `sharp`, no
`satori`/`resvg`, no headless browser of any kind in `package.json`. A thumbnail
of a stored version requires rendering that version's full section tree — which
means the real `SectionRenderer`, the CSS scoper and the HTML sanitizer — to a
raster, on the server, at publish time (storing an image per version, which
compounds the unbounded-history growth §0 already accepts) or on demand (a
browser per dialog open).

`docs/canvas-iframe-cost.md` already measured the adjacent problem — getting the
canvas to render at a *real viewport width* — and concluded it was worth a
dedicated brief. A thumbnail is that, plus rasterisation, plus storage, plus a
Cloudinary-ownership question that lands straight in item 5's stranded-asset
reasoning: a thumbnail is an asset owned by a snapshot row, and snapshot rows
are exactly the rows nothing may delete.

**Cheap honest substitute:** a **text identity card** per row — version number,
timestamp, publisher, and the page title *as it was in that snapshot*, which B
makes available. If something visual is required, **link to the read-only
published view (§D)**: the mockup's thumbnail exists so an author can tell two
versions apart, and a title plus a one-click full-fidelity view does that better
than a 120px raster, for a fraction of the cost.

### 3. Also not now, for reasons above

- **The JSON-LD pre-publish gate (§H)** — inert until the generator exists.
  Building the gate first is worse than building neither.
- **"Keep mine" as a merge (§G)** — no common ancestor is retained; ship it as
  an explicit overwrite or not at all.
- **§10–11 presence and locking (§J)** — its own project, and it presupposes a
  granular draft write that does not exist.
- **`label: 'pre-rollback'` snapshots** — B's restore-as-draft path overwrites
  nothing, so there is nothing to archive first. Retire the vocabulary rather
  than implement it.

---

## L. Proposed build sequence

Ordered so the structurally-blocking item is first and the riskiest is not.

| # | Item | Why here | Risk |
|---|---|---|---|
| **1** | **B — `getPageVersionSnapshot`** | The only structurally blocking item, and the cheapest. One new read action, no schema change, no existing behaviour touched. Everything below is downstream of it | **Low** — additive read |
| **2** | **Restore-as-draft UI** in `VersionHistory` | Reuses `saveDraftContent` end to end — tier sanitize, conflict token, audit row. No new write path. Proves 1 immediately rather than leaving it unread | Low |
| **3** | **E(a) — surface `draft.savedBy` / `savedAt`** | Already stored on the live document. Answers "ผู้แก้ไขล่าสุด" with **no new read path and no new write**. The best cost/benefit item in the brief | Very low |
| **4** | **A — version numbers** | Needs a schema field on two models *and* a backfill migration. Placed after 1–3 so the history UI already exists to display it, and before C/D, which both depend on numbers existing | **Medium** — touches the publish write and migrates data |
| **5** | **D — published-version read-only mode** | `?mode=published` on `/preview/[slug]` plus a narrow public metadata read. Needs A for the number. Reuses all four existing security gates | Low–medium (public route; the gate must not regress) |
| **6** | **C — Draft Backup** | Needs A (to *withhold* a number) and forces the `getPageVersions` filter/banding decision and the `MAX_VERSION_ROWS` rethink. Not hard, but it changes the meaning of the one query that reads versions | Medium |
| **7** | **E(b) — audit read path** | The action is easy; the payoff is small until the vocabulary is richer (§E). Sequence it here so its thinness is a known, accepted result rather than a surprise | Low |
| **8** | **K(1) substitute — structural change summary** | Needs two fetchable snapshots, i.e. B. Counts and key names only, never prose | Low |
| **9** | **G — non-terminal conflict**, `cancel` / `take theirs` / `view changes` only | The riskiest item that is in scope: it unpicks an invariant four call sites and `useLeaveGuard` depend on. Last, so it lands on a system whose other moving parts have settled. **`keep mine` excluded** — see §G | **High** |
| — | JSON-LD gate (§H), `keep mine` (§G), §10–11 (§J), thumbnails (§K2) | Not scheduled — see §K | — |

**Not first, deliberately:** A (a schema change plus a data migration) and G
(unpicking a terminal invariant). **First, deliberately:** B, because until a
snapshot's bytes can leave the database, every version feature in the
requirement is a UI over data it cannot reach.

---

## 10. Self-retiring assertion added this round

One, in `test/fs/pageBuilderDraftActions.test.mjs`:

> **`publishPageStatus` does not stamp `updatedBy` — the live doc's actor is
> frozen at creation.**

**Why it is warranted.** §0b is the sharpest trap this survey found, and it is
the *only* measured fact here with no existing guard. `PageVersion` behaviour is
already well covered by that file (snapshot-on-every-publish, no-draft-in-
snapshot, no-prune); `getPageVersions`' projection and `PageAuditLog`'s
write-only state are both structural facts that B and E will change by design,
and pinning them would only produce a red that says "you did the thing you
planned". `updatedBy` is different: it is a **field that exists, looks
authoritative, and answers the wrong question**, and D and E both want exactly
the question it appears to answer. A round building "ผู้แก้ไขล่าสุด" would reach
for `page.updatedBy` first and ship a UI that confidently names the page's
creator.

**How it retires.** The moment someone makes publish stamp the actor — the fix —
the assertion goes red naming the field, and its message says to delete it. It
is not a check that the behaviour is *right*; it is a check that the behaviour
is *still what §0b measured*, held until it is deliberately changed.

**What would have to be true for it to pass while the thing it guards is
broken?** It publishes as a *different, named* actor than the one that created
the page and asserts the stored name is still the creator's — so it cannot pass
by both actors being anonymous, and it cannot pass by nothing having been
written. The publish's own `ok` is asserted first, so it cannot pass by the
publish having failed.
