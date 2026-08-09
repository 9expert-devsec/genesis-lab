# Admin action history log — PHASE 0 inventory

No code written. Numbers below are derived by walking `src/lib/actions/*.js`, not
transcribed; the walker and its blind spots are described in §6.

---

## 1. The counts, and where they differ from the brief

| | brief | measured | note |
|---|---|---|---|
| exported symbols in `src/lib/actions/*.js` | 259 | **259** | agrees exactly |
| exports calling `requireAdmin` | 191 | **190** | 185 with a string-literal key, 4 with a computed key, 1 with no key |
| exports that MUTATE | — | **159** | 143 write directly, 16 only through a helper (§6) |
| mutating exports with NO `requireAdmin` | "expect `updateOwnProfile`" | **3** | §4 |

The 190 vs 191 gap is not worth chasing — the count includes read-only actions
that also guard. **The number that matters for this task is 159**: that is how
many call sites Phase 2 has to reach.

Every literal `pageKey` used by a mutating action already exists in
`ALL_PAGE_KEYS` (36 keys). There is no phantom key today; the validation asked
for in Phase 1 is a ratchet against future drift, not a repair.

**Three** page keys have no mutating action and will therefore never appear in
the log: `dashboard`, `landing_cache`, `security`. `security` is not read-only —
see §5.3.

> **CORRECTION, 2026-07-31.** This said **four** and included `profile`. It does
> not belong: `admin-accounts.js::updateOwnProfile` mutates — `await admin.save()`
> at line 250 — and §4 already assigns it menu `profile`.
>
> **The counting method is the lesson, not the number.** The walk that produced
> this list keyed each mutating export to its `requireAdmin(pageKey)` literal.
> `updateOwnProfile` calls `auth()` directly and has no guard, so it had no
> literal to be counted under and fell out of the per-menu tally — while still
> being counted, correctly, in the "mutating exports with NO `requireAdmin`" row
> of the table above. Any future census of this trail must enumerate mutating
> exports FIRST and attribute them to menus SECOND; deriving the menu list from
> the guards silently drops every action that is guarded differently or not at
> all. The same blind spot is what hides the route handlers in §5.3.
>
> Encoded as a test so it cannot drift back — `test/pure/auditContract.test.mjs`
> asserts `profile` present and the other three absent.

---

## 2. Every mutating exported action

`store` = where the write lands. `id` = the natural record identifier, i.e. what
goes in the log's record field. `via` = the helper that performs the write when
the exported function does not (these are the ones a naive scan misses).

Legend for `id`: **arg** = taken from a named parameter; **result** = only known
*after* the write, from the returned document; **many** = the action rewrites a
set of rows; **singleton** = one global document, no id.

### `about.js` — menu `about`
| action | store | id | note |
|---|---|---|---|
| `saveInstructor(formData)` | mongo | result `_id` | create |
| `updateInstructor(id, formData)` | mongo | arg `id` | |
| `deleteInstructor(id)` | mongo | arg `id` | capture `before` first |
| `updateInstructorOrder(orderedIds)` | mongo | **many** | record the ordered id list |
| `toggleInstructorActive(id, value)` | mongo | arg `id` | state change |
| `saveAboutConfig(data)` | mongo | **singleton** | record id `about-config` |

### `admin-accounts.js` — menu `accounts`
| action | store | id | note |
|---|---|---|---|
| `createAdmin({email,…})` | mongo | result `_id` | never log the password field |
| `updateAdmin(id, {…})` | mongo | arg `id` | role changes matter most here |
| `resetAdminPassword(id, newPassword)` | mongo | arg `id` | log the ACT, never the value |
| `deleteAdmin(id)` | mongo | arg `id` | |
| `updateOwnProfile({…})` | mongo | session `_id` | **no `requireAdmin`** — §4 |

### `articles.js` — menu `articles`
`createArticle` (result id) · `updateArticle` · `deleteArticle` ·
`toggleArticleActive` · `toggleArticleFeaturedOnLanding` · `repositionArticle`
(via `applyPlan`) · `moveArticleToPosition` (via `applyPlan`) ·
`setArticlePinBadge` (via `moveArticleToPosition`). All mongo, id = arg `id`
except the create. The last three renumber a **block**, so `after` should be the
returned plan, not a per-row diff — the action already returns it.

### `banners.js` — menu `banners`
`createBanner` (result id) · `updateBanner` · `deleteBanner`. mongo, arg `id`.

### `career-path-registrations.js` — menu `career_path_registrations`
| action | store | id | note |
|---|---|---|---|
| `createCareerPathRegistration(data)` | mongo | result `_id` | **visitor-facing, no guard** — §4 |
| `updateRegistrationStatus(id, status)` | mongo | arg `id` | **PII entity** — §5 |
| `deleteCareerPathRegistration(id)` | mongo | arg `id` | **PII entity** — §5 |

### `career-paths.js` — menu `career_paths`
`toggleCareerPathActive(careerPathId,…)` · `updateCareerPathOrder(orderedIds)`
(**many**) · `syncCareerPathsAction()` (**bulk**, via `syncCareerPaths`) ·
`createCareerPath` **both** (result id) · `updateCareerPath` **both** ·
`deleteCareerPath` **both** · `updateCareerPathCourses(id, payload)`.
id = arg `careerPathId` / `id`.

### `contact.js` — menu `contact`
`saveContactVideo` · `saveTransportMap`. mongo, **singleton** each — record ids
`contact-video` and `transport-map`.

### `course-extensions.js` / `course-promos.js` — menu `courses`
`saveCourseExtension(courseId,…)` · `deleteCourseExtension(courseId)` ·
`createCoursePromoLink(courseId,…)` (result `_id`, scoped by `courseId`) ·
`updateCoursePromoLink(linkId,…)` · `deleteCoursePromoLink(linkId)` ·
`reorderCoursePromoLinks(courseId, orderedIds)` (**many**) ·
`saveEarlyBird(courseId, data)`. All mongo. **Two identifiers are in play** —
the MSDB `course_id` code and a Mongo `_id`; the log should carry the
`course_id` as the record and the `_id` as a secondary, because that is the id a
human recognises.

### `courses.js` — menu `courses`
`createCourse(formData)` **MSDB** (id only from `result.item._id`; the
human-meaningful key is `course_id` from the form) · `updateCourse(id, …)` ·
`deleteCourse(id)`. **This file is the reason the hook cannot be a Mongoose
middleware.**

### `customPages.js` / `pageBuilder.js` — menu `pages`
`createCustomPage` (result id) · `updateCustomPage` · `deleteCustomPage` ·
`toggleCustomPageStatus` · `regeneratePreviewToken` ·
`createPageBuilderPage` (result id) · `updatePageBuilderPage` ·
`deletePageBuilderPage` · `duplicatePageBuilderPage` · `updatePageStatus` ·
`reorderSections` · `addSection` · `updateSection` · `deleteSection` ·
`duplicateSection` · `toggleSection` · `enablePreviewLink` ·
`regeneratePreviewPassword` · `setPreviewExpiry` · `revokePreviewAccess`.
All mongo, arg `id`. The last ten write through `saveSections` / `setPreview`.
**These already have `PageAuditLog`** — see §7.

### `faqs.js` — menu `faqs`
`toggleFaqActive(faqId,…)` · `updateFaqOrder(orderedIds)` (**many**) ·
`updateFaqCategoryOverride(faqId,…)` · `syncFaqsAction()` (**bulk**).
mongo, arg `faqId` (an upstream MSDB id, not a Mongo `_id`).

### `featured-courses.js` / `featured-online-courses.js` / `featured-reviews.js` / `nav-featured-online-courses.js`
Menus `featured_courses`, `featured_online_courses`, `featured_reviews`,
`nav_featured_online_courses`. Each: `add*(formData)` (result id) ·
`update*(id, formData)` · `delete*(id)`. mongo, arg `id`.

### `inhouse-registrations.js` — menu `registrations`
`updateInhouseStatus(id,…)` · `updateInhouseAdminNotes(id,…)` ·
`deleteInhouseRegistration(id)`. mongo, arg `id`. **PII entity** — §5.

### `instructors.js` — menu `instructors`
`createInstructor` **both** (result id) · `updateInstructor(localId,…)` **both** ·
`deleteInstructor(localId)` **both**. Writes Mongo AND MSDB.

### `local-faqs.js` — menu **computed**
`createLocalFaq({course_type, ref_id, …})` (result id) · `updateLocalFaq(id,…)` ·
`deleteLocalFaq(id)` · `reorderLocalFaqs(course_type, ref_id, orderedIds)`
(**many**). mongo. The guard is `requireAdmin(pageKeyForType(course_type))`,
which resolves to one of `courses` | `career_paths` | `masterclass` |
`local_faqs`. **The menu recorded must be the resolved key, not the literal
`local_faqs`** — otherwise a FAQ edited under a course is filed under the wrong
menu and the "who changed this course" query misses it.

### `masterclass-registrations.js` — menu `mc_registrations`
`updateMasterclassRegistrationStatus(id,…)` · `deleteMasterclassRegistration(id)` ·
`updateMasterclassRegistrationAttendees(id, rows, opts)` — **the one
`requireAdmin()` with no key**, §4. mongo, arg `id`. **PII entity** — §5.

### `masterclass.js` — menu `masterclass`
`createMasterclassCourse(data)` (result id) · `updateMasterclassCourse(id,…)` ·
`deleteMasterclassCourse(id)` · `createMasterclassBatch(courseId, data)`
(result `_id`, scoped by `courseId`) · `updateMasterclassBatch(batchId,…)` ·
`deleteMasterclassBatch(batchId)`. mongo. **Two record types in one menu** —
course and batch; the log needs an entity field, not only an id.

### `nearby-places.js` — menu `nearby_places`
`createNearbyPlace` (result id) · `updateNearbyPlace` · `toggleNearbyPlaceActive`
· `deleteNearbyPlace` · `reorderNearbyPlaces(orderedIds)` (**many**). mongo.

### `page-configs.js` — menu `page_configs`
`saveProgramConfig(programId,…)` · `deleteProgramConfig(programId)` ·
`saveSkillConfig(skillId,…)` · `deleteSkillConfig(skillId)`. mongo. id is an
**upstream MSDB id**, and again two entity types share one menu.

### `portfolio.js` — menu `portfolio`
`createClientLogo` (result id) · `updateClientLogo` · `deleteClientLogo` ·
`reorderClientLogos(orderedIds)` (**many**) · `createAtmospherePhoto` (result id)
· `updateAtmospherePhoto` · `deleteAtmospherePhoto` ·
`reorderAtmospherePhotos(orderedIds)` (**many**). mongo. Two entity types.

### `program-order.js` — menu `programs`
`syncProgramsFromAPI(apiPrograms)` (**bulk**) · `saveProgramOrder(orderedIds)`
(**many**) · `toggleProgramHidden(programId,…)` · `syncSkillsFromAPI(apiSkills)`
(**bulk**) · `saveSkillOrder(orderedIds)` (**many**) ·
`saveSkillProgramOrder(skillId, orderedProgramIds)` (**many**) ·
`toggleSkillHidden(skillId,…)`. mongo, ids are upstream MSDB ids.
Note `syncProgramsFromAPI`/`syncSkillsFromAPI` take their input **from the
client** — the admin page passes the list it rendered.

### `promotion-banner.js` — menu `promotions_banner`
`savePromotionBanner` (result id) · `updatePromotionBanner(id,…)` ·
`deletePromotionBanner(id)` · `updatePromotionBannerOrder(orderedIds)`
(**many**). mongo.

### `promotions.js` — menu `promotions`
`togglePromotionActive(promotionId,…)` · `updatePromotionOrder(orderedIds)`
(**many**) · `savePromotionConfig(promotionId, data)` ·
`deletePromotionConfig(promotionId)` · `syncPromotionsAction()` (**bulk**) ·
`setPromotionPageLink(promotionId, pageBuilderId)`. mongo, id is the upstream
`promotion_id`.

### `recruits.js` — menu `recruits`
`createRecruit(data)` (result id) · `updateRecruit(id,…)` · `deleteRecruit(id)` ·
`toggleRecruitActive(id,…)` · `reorderRecruits(orderedIds)` (**many**). mongo.
**Not a PII entity** — see §5.1.

### `registrations.js` — menu `registrations`
`updateRegistrationStatus(id, status, source)` · `updateRegistration(id, data,
source)` · `deleteRegistration(id, source)`. mongo, arg `id`. The `source`
parameter selects the collection, so it belongs in the log next to the id.
**PII entity** — §5.

### `roles.js` — menu `roles`
`createRole({key,…})` · `updateRole(key, {…})` · `deleteRole(key)`. mongo, id is
the role **key**, not an `_id`. Highest-value rows in the whole log — a role
edit silently changes what every holder of that role can reach.

### `schedule-pdf.js` — menu `schedule_pdf`
`uploadSchedulePDF(formData)` · `deleteSchedulePDF()`. mongo, **singleton** —
record id `schedule-pdf`. `deleteSchedulePDF` takes **no arguments at all**.

### `schedules.js` — menu `schedules`
`createSchedule(formData)` **MSDB** (result id) ·
`updateSchedule(idOrFormData, maybeFormData)` **MSDB** — an overloaded
signature; the id is not reliably the first argument · `deleteSchedule(id)`
**both**.

### `site-notifications.js` — menu `notifications`
`createNotification(data)` (result id) · `updateNotification(id,…)` ·
`deleteNotification(id)` · `toggleNotificationActive(id,…)` ·
`updateNotificationWeight(id,…)`. mongo.

### `tnhs-courses.js` — menu `tnhs_courses`
`createTnhsCourse(formData)` (result id) · `updateTnhsCourse(id,…)` ·
`deleteTnhsCourse(id)`. mongo.

### `webhook-logs.js` — menu `webhook_logs`
`replayWebhookEvent(logId)`. mongo, arg `logId`. Replaying a webhook re-runs a
handler that writes several collections — the log row should say "replayed
`logId`", not attempt to describe the downstream effects.

**Identifier shapes across the 159, counted:** id from an argument **112** ·
id only from the result **26** · `orderedIds` as the first argument (**many**)
**13** · singleton **5** · no arguments at all **3**
(`syncFaqsAction`, `syncPromotionsAction`, `syncCareerPathsAction`).

Three more are **many** without looking like it, because their first argument is
a scope rather than the thing being reordered:
`reorderCoursePromoLinks(courseId, orderedIds)`,
`saveSkillProgramOrder(skillId, orderedProgramIds)`, and
`reorderLocalFaqs(course_type, ref_id, orderedIds)`. So **16** actions rewrite a
set of rows, not 13 — a Phase 2 rule keyed on "first parameter is named
orderedIds" would miss three of them.

---

## 3. What "record id" means for the awkward cases

- **Creates (24).** The id exists only after the write. The audit call goes
  *after* the mutation, reading the returned document. If the write throws there
  is no row — correct, because nothing happened.
- **Deletes.** `before` must be captured *before* the delete or it is gone.
  Several delete actions currently do not read the document first; capturing it
  is a change to the action body, which is Phase 2's business, and for some it
  will mean an extra read. Recording `{ id }` with a null `before` is the
  fallback and should be an explicit decision per action, not an accident.
- **Reorders (20).** One action, many rows. Record `action: 'reorder'`,
  `recordId: ''`, and `after: { orderedIds: [...] }` capped by the writer's size
  limit. A per-row diff would be 20-500 rows per drag and is exactly what the
  size cap exists to prevent.
- **Bulk syncs (5).** `syncFaqsAction`, `syncPromotionsAction`,
  `syncCareerPathsAction`, `syncProgramsFromAPI`, `syncSkillsFromAPI` rewrite
  whole collections. Record the action, the actor, and the **result counts** the
  sync already returns (`synced`/`errors`) — never the documents.
- **Singletons (5 actions, 4 record ids).** The five actions are
  `saveAboutConfig`, `saveContactVideo`, `saveTransportMap`,
  `uploadSchedulePDF` and `deleteSchedulePDF`; the last two share one record.
  Use a stable literal record id so the history of "the about page config" is
  one queryable series:

  | record id | document | |
  |---|---|---|
  | `about-config` | `AboutConfig` | log-side literal |
  | `contact-video` | `ContactVideo` | log-side literal |
  | `transport-map` | `TransportMap` | log-side literal |
  | **`schedule_pdf`** | `SchedulePDF` | **the document's real `key` value** |

  **`schedule_pdf` has an underscore, not a hyphen.** `schedule-pdf.js:9` is
  `const KEY = 'schedule_pdf'` and the stored document carries
  `key: 'schedule_pdf'`. It is the **only** singleton here with a real `key`
  field, so the log matches the data rather than inventing a second spelling
  for the same object.

  The other three have **no key field at all** — `about.js:221`,
  `contact.js:53` and `contact.js:85` are all `findOneAndUpdate({}, …)`,
  first-document-wins. Their literals exist only in the audit trail. Nobody
  should go looking for a document that carries `about-config`; there isn't
  one, and a future session that greps for it and finds nothing must not
  conclude the row is orphaned.
- **Two entity types in one menu** (masterclass course/batch,
  portfolio logo/photo, page-configs program/skill, course-promos link/earlybird).
  The log needs an `entity` field alongside `recordId`; menu alone is too coarse
  to answer "who changed this batch".

---

## 4. Mutating actions with no `requireAdmin` — 3, not 1

| action | what it is | actor comes from |
|---|---|---|
| `admin-accounts.js::updateOwnProfile` | login-only by design — any admin may rename themselves or change their own password. It calls `auth()` directly and operates solely on `session.user`. | **`auth()`**, already in the function. No change needed; the actor is present, only the guard is absent. Menu: `profile`. |
| `career-path-registrations.js::createCareerPathRegistration` | **not an admin action** — a public visitor submitting a career-path registration form. | There is no admin actor. **Do not log it in this trail.** An admin log that contains visitor writes stops answering "who on the team did this". |
| `pageBuilder.js::verifyPreviewPassword` | **not an admin action** — an anonymous visitor entering a preview password. It writes `preview.failedAttempts` / `preview.lockedUntil`, i.e. a rate-limit counter. | No admin actor. **Out of scope**, but worth flagging separately: a brute-force counter with no trail is a security-log gap, not an admin-history gap. |

One more, not caught by "no `requireAdmin`":
`masterclass-registrations.js::updateMasterclassRegistrationAttendees` calls
**`requireAdmin()` with no page key** — any logged-in admin can edit attendee
personal data regardless of role. The actor is available (the session is
returned), but the **menu is not**, so the log has to hardcode
`mc_registrations` for this one. That the guard is weaker than its neighbours
(`mc_registrations` on the two actions either side of it) looks like an
oversight; it is **reported, not fixed here** — out of scope.

---

## 5. Personal data

### 5.1 Which entities actually hold PII

Four, not five. Verified against the models:

| entity | model | holds |
|---|---|---|
| public registrations | `RegisterPublic` | name, email, phone, company |
| in-house registrations | `RegisterInhouse` | contact person, email, phone, company |
| masterclass registrations | `MasterclassRegistration` | per-attendee name, email, phone, licence choice |
| career-path registrations | `CareerPathRegistration` | applicant contact details |

**`recruits` is NOT one.** `src/models/Recruit.js` has `slug, title,
department, location, employmentType, description, responsibilities,
qualifications, benefits, applyEmail, active, order` — these are job
**postings** written by admins, and `applyEmail` is a company inbox. Applications
arrive by email and never enter this system. The brief expected applicant data
here; there is none. `recruits` gets a **full diff** like any other content menu.

### 5.2 Proposal: metadata only, no field diff, for the four

Record `menu`, `entity`, `recordId`, `action`, `actor`, `createdAt`.
Set `before`/`after` to `null`. **Argue:**

- The brief's own reasoning is the strongest argument and I agree with it:
  copying a diff into `admin_audit_logs` duplicates personal data into a
  collection with different retention (this log is append-only and presently
  forever) and different access control (a future `audit_log` page key, held by
  people who may have no reason to see a customer's phone number). A subject-
  access or deletion request would then have to find and redact rows in a
  collection whose entire premise is that rows are never modified. That is a
  contradiction you do not want to design in.
- The cost is real and should be stated: for `updateRegistration(id, data)` the
  log will say *that* an admin edited registration X, not *what* they changed.
  For the disputes this trail exists to settle — "who cancelled this booking",
  "who changed this status" — that is enough, because status is the field that
  actually gets disputed.
- **So carve out the status transitions, which are not PII.**
  `updateRegistrationStatus`, `updateInhouseStatus`,
  `updateMasterclassRegistrationStatus`, and
  `career-path-registrations::updateRegistrationStatus` may record
  `before: { status }` / `after: { status }` — a short enum, no personal data,
  and precisely the field people argue about. `updateInhouseAdminNotes` records
  the act only: admin notes are free text that will contain customer details.
  `updateMasterclassRegistrationAttendees` records the act plus the **count** of
  attendees, never the rows.
- Deletes of these four record the act and the id only. If someone needs to know
  what was in a deleted registration, the answer must be a database backup, not
  a shadow copy in an audit collection.

### 5.3 A scope gap in the brief

`security` has no mutating action in `src/lib/actions/*.js` because 2FA is
implemented as **route handlers**: `/api/admin/2fa/setup`, `/api/admin/2fa/verify`,
`/api/admin/2fa/disable`. Same for the four admin sync endpoints
(`/api/admin/{faqs,promotions,career-paths,instructors}/sync`), which trigger the
same bulk writes as the sync actions. A hook placed only in the action layer
**will not see any of these**, and "an admin disabled their own 2FA" is exactly
the kind of event this log exists for.

### DECISION — round 6 is SEVEN endpoints: 2FA **and** the four syncs

Option 1: instrument them. "An admin disabled their own 2FA" is the single
highest-consequence event in this system — it is the step that turns a stolen
password into an account — and the action-layer hook is structurally incapable
of seeing it. A trail that covers 159 content edits and is silent on the one
event that matters most is not a trail, it is a false sense of one.

**Round 6 covers seven route handlers:**

```
/api/admin/2fa/setup            /api/admin/faqs/sync
/api/admin/2fa/verify           /api/admin/promotions/sync
/api/admin/2fa/disable          /api/admin/career-paths/sync
                                /api/admin/instructors/sync
```

**The stated reason the sync endpoints are in.** An earlier draft left them out
on the premise that they might be reachable but unused. The check below
inverted that premise: **the admin UI calls the routes, not the actions.**
`syncFaqsAction`, `syncPromotionsAction` and `syncCareerPathsAction` have zero
callers, while `syncProgramsFromAPI`/`syncSkillsFromAPI` are live.

Instrumenting only the action layer would therefore produce a log in which the
program and skill syncs appear and the FAQ, promotion and career-path syncs
**never** do. **That is apparent coverage, which is worse than a uniform gap**,
because nobody re-checks a log that looks complete — "the sync rows are
missing" reads identically to "nobody has pressed sync", and the difference is
invisible for months.

It is **not more of the same shape** and must not be swept as if it were: a
route handler carries no `requireAdmin(pageKey)`, which is the call that hands
every other site both its menu and its actor in one go. Both have to be
established some other way — the menu is a constant, the actor needs the
session read `requireAdmin` currently performs. **That problem is not solved
here.** Round 6 begins by solving it, once, for all seven.

### DECISION — the three dead sync actions are NOT instrumented

`syncFaqsAction`, `syncPromotionsAction` and `syncCareerPathsAction` get no
audit call. **Logging code nobody calls manufactures coverage** — rows that
never arrive from a path nothing takes, next to a guard that reports the file
as swept.

They are **retirement candidates**, not merely dead: in a `'use server'` module
every export is a POST endpoint, so an uncalled export is not inert, it is an
unreachable-by-the-UI but publicly-invocable mutation. This repo has already
retired `applyArticlePositionPlan`, `updateArticlePinOrder` and
`toggleArticlePinnedOnArticlePage` for exactly this reason.

Their deletion is a separate **`refactor:` commit during round 6**, not now:
round 6 touches that surface anyway, and the two changes review together — you
cannot sensibly judge "delete the action" without seeing "instrument the route"
in the same diff.

**If anything wires them up before then, they must be instrumented at that
time.** A revived export with no audit call is the escape route this whole plan
is built to close.

### DECISION — cron-triggered syncs log with a system actor

`system:cron` and `system:webhook` are **reserved actor ids**. No human account
may ever be issued one, so no row can be ambiguous about whether a person acted.

The instructor sync runs on a cron (`/api/cron/instructors-sync`) and the
webhook replay path runs on an inbound event. Both mutate data no admin
touched. **"The instructor list changed at 3am and nobody touched it" is a real
question, and "the cron did it" is the answer worth having** — so those rows
are written rather than skipped, with an actor that cannot be mistaken for a
person.

Reserved in code: `SYSTEM_ACTOR_IDS` in `src/lib/audit/auditContract.js`.

### OBSERVATION, 2026-07-31 — the sync endpoints are the LIVE path, not a spare

The check was: does the admin UI call `/api/admin/{…}/sync`, or the
corresponding `sync*Action` server action? The premise for leaving the
endpoints out was that they might be reachable but unused. **They are not.**

| menu | what the admin UI calls | the server action |
|---|---|---|
| `faqs` | `fetch('/api/admin/faqs/sync')` — `FaqsAdminClient.jsx:202` | `syncFaqsAction` — **no caller** |
| `promotions` | `fetch('/api/admin/promotions/sync')` — `PromotionsAdminClient.jsx:120` | `syncPromotionsAction` — **no caller** |
| `career_paths` | `fetch('/api/admin/career-paths/sync')` — `CareerPathsAdminClient.jsx:98` | `syncCareerPathsAction` — **no caller** |
| `instructors` | `/api/admin/instructors/sync` (+ a cron route) | **there is no sync action at all** |
| `programs` | `syncProgramsFromAPI` / `syncSkillsFromAPI` — `ProgramOrderClient.jsx:84`, `SkillOrderClient.jsx:105` | these two ARE the live path |

So three of the five "bulk sync" actions §3 counts have **zero call sites
outside their own definitions**. Instrumenting the action layer alone would
produce a log in which the FAQ, promotion and career-path syncs never appear —
not rarely, never — while the two program/skill syncs did, which is worse than
a uniform gap because it looks like coverage.

**This inverted the premise, and the ruling above is the consequence:** the four
sync endpoints join round 6. The `(menu, entity)` pairs for all five syncs exist
in `src/lib/audit/auditContract.js` regardless — the vocabulary is the same
whether the row is written from a route or an action, which is why the decision
could be deferred to round 6 without blocking rounds 1-5.

---

## 6. The three hook points

Shared premise: `requireAdmin(pageKey)` already sits at the top of the mutating
actions and already returns the session, so **both the actor and the menu are in
hand at every guarded call site**. That is a real asset and all three options
exploit it.

### Option A — per-action explicit call
Add `await recordAdminAction({...})` at the end of each mutating action.

- **Call sites changed: 159**, in 38 files.
- **Escape route for a future action:** total. Someone adds
  `export async function archiveThing(id)`, guards it, forgets the audit call,
  and nothing anywhere notices. The Phase 2 coverage guard is the only defence,
  and a guard is a test — it fails in CI, not at the keyboard.
- **In its favour:** it is the only option that can record a meaningful
  `before`/`after`, because only the action knows what it changed. It also
  handles the awkward cases (creates needing the result id, reorders wanting the
  plan) without contortion.

### Option B — a wrapper composed with `requireAdmin`
e.g. `const session = await requireAdmin('articles')` becomes
`await withAudit('articles', 'update', async (log) => { ... })`, or a
`guardedAction(pageKey, fn)` factory the module exports through.

- **Call sites changed: 159** as well — every action's body is rewritten, not
  just extended. This is the *most* invasive of the three.
- **Escape route:** small but not zero. A new action that calls `requireAdmin`
  directly instead of the wrapper is unguarded by the log; that is greppable, so
  the coverage guard becomes a much simpler and more reliable test than under A.
- **Against:** it changes the shape of every action at the same time as two
  other planned sweeps over the same bodies. And it couples the guard to the log
  — a future action that must guard but must not log (a read) then needs a
  second wrapper, and two wrappers that differ by one letter is a bug farm.

### Option C — a wrapper around the write helpers
Wrap `msdbCreate/Update/Delete`, and for Mongo either wrap a new write helper or
attach Mongoose middleware.

- **Call sites changed: ~3** (the MSDB helpers) plus per-model plumbing.
- **Escape route:** none for writes that go through the wrapped helpers.
- **Why I do not recommend it, and this is the trap the brief names:** Mongo
  writes in this repo are made directly on the models (`Article.updateOne(...)`,
  `doc.save()`, `bulkWrite`) at 143 sites with no shared helper to wrap.
  Mongoose middleware could catch some of them, but `updateOne`/`bulkWrite`
  hooks do not see the document, `bulkWrite` does not fire document middleware
  at all, and **nothing at that layer knows the actor or the menu** — the
  session is three frames up the stack. It would produce a log that is silent
  for every reorder and anonymous for everything else. Worse, it would look
  complete.

### Recommendation
**Option A**, with the coverage guard doing the work Option B would have done
structurally. Rationale: the log's value is the `before`/`after` and the record
id, and only the action body has those; A is additive, which matters when two
other sweeps are queued over the same 38 files; and the escape route A leaves
open is exactly what Phase 2's guard is specified to close. If you would rather
pay the invasiveness for a structural guarantee, B is defensible — but it is
the option that conflicts most with the sequencing you set.

**This is a recommendation, not a decision. Phase 2 waits for your pick.**

### What the Phase 2 guard will and will not see
The heuristic I used here, and would use there: an export is **mutating** if its
body matches a Mongo write call (`create|insertMany|updateOne|updateMany|
findOneAndUpdate|findByIdAndUpdate|findOneAndReplace|findOneAndDelete|
findByIdAndDelete|deleteOne|deleteMany|bulkWrite|replaceOne|save`), or an MSDB
write (`msdbCreate|msdbUpdate|msdbDelete`), **or calls a local function in the
same file that does**. That last clause is load-bearing: without it the walker
reports 143 and misses 16 real mutators —

```
articles.js::repositionArticle, moveArticleToPosition, setArticlePinBadge
pageBuilder.js::reorderSections, addSection, updateSection, deleteSection,
                duplicateSection, toggleSection, enablePreviewLink,
                regeneratePreviewPassword, setPreviewExpiry, revokePreviewAccess
career-paths.js::syncCareerPathsAction   faqs.js::syncFaqsAction
promotions.js::syncPromotionsAction
```

> **THE SECOND CLASSIFIER DIVERGED FROM THIS ONE, 2026-07-31.** The coverage
> guard in `test/fs/auditCoverage.test.mjs` grew its own copy of this heuristic
> and **omitted the MSDB half**. The consequence landed exactly where round 3
> was heading: `courses.js` writes only through `msdbCreate`/`msdbUpdate`/
> `msdbDelete` and touches Mongo nowhere, so all three of its exports were
> classified non-mutating and skipped — the guard would have reported full
> coverage over a `courses` sweep that instrumented nothing. Not a red. A
> silent false-green.
>
> **The lesson is not "add the names".** Two classifiers that must agree, written
> at different times, with nothing forcing agreement, will diverge again. The
> guard now pins the number it produces (`MUTATING_EXPORT_COUNT`), and the
> classifier is exercised over an **unswept** file so it has controls of its own
> rather than being observable only through `SWEPT_FILES` — which is precisely
> how the blind spot survived review. See §8.9.
>
> Measured after the fix: **156** = 143 direct + 13 via a local helper. This
> section's 159 stands; the gap is explained below and it is one-directional.
>
> **RECONCILED AGAIN, 2026-08-03, after the imported-helper walk: 161.**
> The arithmetic, both directions, with nothing bent to make it agree:
>
> | | count | why |
> |---|---|---|
> | guard, pre-walk | 157 | 156 + the article rework's net +1 |
> | guard, with the walk | **161** | + the four exports below |
> | §2's inventory today | 160 | its 159, + the same net +1 |
> | remaining gap | **1**, in the guard's favour | `previewAccess.js::submitPreviewPassword` |
>
> The four the walk adds:
>
> ```
> career-paths.js::syncCareerPathsAction  -> career-paths/syncCareerPaths.js#syncCareerPaths
> faqs.js::syncFaqsAction                 -> faqs/syncFaqs.js#syncFaqs
> promotions.js::syncPromotionsAction     -> promotions/syncPromotions.js#syncPromotions
> previewAccess.js::submitPreviewPassword -> actions/pageBuilder.js#verifyPreviewPassword
> ```
>
> §2 already counted the first three — but only because §6 HARDCODES those helper
> names. It never had a mechanism, so it caught the three someone happened to
> know about and **missed the fourth**. `verifyPreviewPassword` writes
> (`preview.failedAttempts` / `preview.lockedUntil`), which makes
> `submitPreviewPassword` a mutating export that appears in neither §2's table
> nor §6's list of 16.
>
> It is a **PUBLIC** action — no session, no `requireAdmin` at all — so when
> `previewAccess.js` is swept it needs a `NOT_LOGGED` entry with a reason, the
> same shape as `createCareerPathRegistration`. Recording that here so round 5 or
> 6 does not meet it cold.
>
> §6's list of 16 is also **stale in the other direction**: it names
> `articles.js::repositionArticle` and `moveArticleToPosition`, both deleted by
> the ordering rework, and omits the four exports that replaced them. The count
> reconciles; the enumeration in §6 does not, and is left as the historical
> record it is.

It still cannot see: a computed model or method name; a write performed by a
route handler (§5.3); or anything reaching the collection from outside this
repo. And per the articles-work precedent, the guard must enumerate **exports**,
not functions whose names look like writers — in a `'use server'` module every
export is a POST endpoint, and `saveEarlyBird`, `setPromotionPageLink` and
`replayWebhookEvent` are all writers whose names begin with neither create,
update nor delete.

> **THE IMPORTED-HELPER GAP IS CLOSED, 2026-08-03 — before round 5, deliberately.**
> This paragraph used to end "a write reached through an **imported** helper it
> does not know by name (the three `sync*Action` rows only count because the
> helper names are hardcoded)". That was the same class of hole as the MSDB one
> above, and it had the same fix available and the same reason not to wait: the
> MSDB gap was caught by LUCK — somebody happened to know `createCourse` calls
> `msdbCreate`. Round 5 is ~129 sites across 30-odd files. Sweeping that on luck
> is how a file gets marked done with nothing in it.
>
> `test/fs/auditCoverage.test.mjs` now **follows the import**. For each export it
> resolves the specific imported IDENTIFIER the body calls, finds that function
> in the target module, and asks whether **it** writes — directly or through a
> local helper of its own.
>
> **It resolves the SYMBOL, not the module,** and that is the whole design.
> Module-scoped would be worse than the gap: every export importing anything
> from a module that happens to contain a writer would classify as mutating, the
> guard would start demanding audit calls inside read-only exports, and the first
> person to meet that turns it off. `pageBuilder.js` is the live proof —
> `verifyPreviewPassword` writes, `getPageBuilderPageBySlugAny` does not, and
> `previewAccess.js` imports both. A control asserts both answers.
>
> **Depth: ONE hop.** Measured, not chosen: at depth 1 the walk finds four
> exports the file-local heuristic misses; at depth 2 and depth 3 it finds
> exactly the same four. A test pins that deeper is not different, so the day it
> becomes different the guard says so.
>
> **What the walk still cannot see, at any depth**, because these are not depth
> problems:
>
> - a helper that is not a top-level `function` declaration in its own module —
>   an arrow const, a class, a re-export, or a binding destructured from a call.
>   **One live case:** `src/lib/actions/auth.js::adminLogin` calls `signIn`, which
>   is destructured from `NextAuth(...)` in `src/lib/auth/options.js`, whose
>   `authorize` callback runs `Admin.updateOne` for `lastLoginAt` and the failed
>   attempt counter. So `adminLogin` genuinely causes a write and classifies as
>   inert. It is a login side effect rather than an admin editing a record, and
>   `auth.js` belongs to round 6 with the rest of `security` — **written down
>   here rather than discovered there.**
> - DEFAULT and NAMESPACE imports are not followed. Measured: all 56 default
>   imports across the action modules target `@/models/*` — the objects
>   `WRITE_CALL` matches methods on, not helpers to evaluate — and there are no
>   namespace imports at all. A default-exported helper function would be a real
>   gap; there is not one today, and a control pins that.
> - the `WRITE_CALL` name list is still doing work the walk cannot: `msdbCreate`
>   writes over HTTP, and its body is a `fetch`. No amount of walking derives
>   "this is a write" from that. The two mechanisms are complementary, not
>   alternatives.
>
> **§6's hardcoded helper list is now redundant.** The three `sync*Action` exports
> are found structurally, from the import statement. Removing the hardcode is a
> follow-up, not part of the change that made it unnecessary.

---

## 7. One thing to decide before Phase 2 — RESOLVED, see §8.1

`pages` (both `customPages.js` and `pageBuilder.js`, 20 mutating actions)
**already writes `PageAuditLog`**. Instrumenting those actions again produces
two rows per action in two collections. Three ways out — dual-write and accept
it; skip `pages` in the new log and have the Phase 3 reading surface union the
two collections; or migrate `PageAuditLog` into the new one and retire it.

> **CORRECTION, 2026-07-31.** The original close of this section leaned toward
> option 2 and justified it with *"the page-history UI that reads PageAuditLog
> keeps working."* **That UI does not exist.** `page_audit_logs` has a writer
> and no reader — verified by grep, recorded in §8.1. The lean rested on
> protecting a screen that was never built, and the second half of the
> justification ("no data migration") is worth 23 rows. Both arguments are
> withdrawn.
>
> **Resolved as option 3 in its no-migration form — see §8.1.**

It does not block Phase 1: the model and writer are the same either way.

---

# 8. Decision record

Every decision about this feature was made in conversation, and until now none
of it was in the repo. That is not a bookkeeping complaint: a session reading
only §1-§7 proposed deleting a declared index because no written artifact named
the screen that needs it. This section is the artifact.

**How to read an entry.** Every entry below is tagged:

- **DECISION** — settled. Build to it. Reopening it is allowed, but it needs a
  stated reason, and the reason has to be new information rather than a fresh
  reading of the same facts.
- **OBSERVATION** — a measurement taken on a date. It goes stale by itself.
  Nothing here licenses an action; it is evidence a decision was weighed
  against. Re-measure before leaning on one.

Do not promote an OBSERVATION to a rule because it is convenient, and do not
treat a DECISION as provisional because it is inconvenient.

---

## 8.1 DECISION — §7 resolved: retire `recordAudit`, freeze `page_audit_logs`

**The decision.** Option 3, in its no-migration form:

1. Retire the `recordAudit` writer in `src/lib/pages/pageAudit.js`.
2. Point its **15** call sites at `recordAdminAction` during the `pages` sweep.
3. Leave `page_audit_logs` in place, untouched, as a frozen archive. **No
   migration.** No backfill, no dual-write, no read-time union.

**`snapshotVersion` and `PageVersion` are NOT touched.** Only `recordAudit`
retires. `snapshotVersion` happens to live in the same file, and that is the
whole of its relationship to this decision — it is the page-restore capability,
it feeds the Phase-3 rollback UI, and it has nothing to do with the admin
history trail. Anyone reading "retire the writer in pageAudit.js" and reaching
for the other export has misread this entry.

### The verification that forced the correction

`page_audit_logs` has **a writer and no reader**. Grep for `PageAuditLog`,
`pageAudit`, and `page_audit_logs` across the repo returns:

| hit | what it is |
|---|---|
| `src/models/PageAuditLog.js` | the model |
| `src/lib/pages/pageAudit.js:12,23` | the import and the single `.create()` |
| `src/lib/actions/pageBuilder.js:32` | the `recordAudit` import |
| `src/models/AdminAuditLog.js:8`, `src/models/PageVersion.js:11`, `src/lib/audit/recordAdminAction.js:16` | docstring cross-references |

No query. No `find`, no page, no component, no route handler. Nothing reads
this collection. The nearest thing to a reader is `getPageVersions` in
`pageBuilder.js:167`, and it reads `PageVersion` — the snapshots, not the log.

**Call sites: 15**, every one in `src/lib/actions/pageBuilder.js` (lines 259,
347, 397, 444, 482, 540, 568, 602, 618, 650, 671, 715, 736, 785, 806).

**`customPages.js` writes zero rows.** Its five mutating actions
(`createCustomPage`, `updateCustomPage`, `deleteCustomPage`,
`toggleCustomPageStatus`, `regeneratePreviewToken`) do not call `recordAudit`
at all — even though `PageAuditLog.pageType` carries an `advanced_html` enum
value that exists for them and nothing else. So the collection §7 described as
covering "both page collections" covers one, and the schema advertises a
coverage it has never had.

### Why not the union

The union option's cost lands **entirely on the reading surface**, and it is
not small:

- **Different field names for the same concepts.** `pageId` vs `recordId`,
  `pageType` vs `entity`. Every filter, sort and render path forks.
- **No `menu` field at all** on `PageAuditLog`. The central page's primary
  filter — and the non-superadmin permission clamp in §8.5 — have nothing to
  clamp on. The clamp would have to special-case one collection, which is how
  a permission bug gets written.
- **No home for `sectionId` / `field`.** `PageAuditLog` carries two columns
  `AdminAuditLog` does not. They either get dropped at read time or squeezed
  into `meta`, and either way the union is lossy in one direction.
- **Two damaged-row vocabularies.** `AdminAuditLog` files a bad menu under
  `UNKNOWN_MENU` with `menuRaw` preserved; `PageAuditLog` has no such concept
  and no `menu` to damage. A reader that handles both is handling two failure
  models for one screen.
- **Pagination cannot use skip/limit across two collections.** Cursor
  pagination over a union means merging two sorted streams in application code
  and holding a composite cursor. That is real work, permanently, on the hot
  path of the most-read screen in the feature.

It buys nothing, because the UI it was protecting does not exist.

### Why freeze rather than migrate — and what changed about that argument

**The doc's original "no data migration" argument is dead. Delete it from your
reasoning.** The migration it was avoiding is **23 rows / 0.11 MB** (§8.2).
That is not a cost; it is a rounding error. Anyone re-deriving this decision
from "migration is expensive" is re-deriving it from a false premise.

Freezing is chosen for a different and smaller reason: **four days of July
page-builder history is not worth a production write.** The rows describe two
pages during the builder's own construction. Nobody will query them. A
migration script is a write against production to move data nobody wants, and
"we could" is not a reason to.

If it ever matters, **23 rows can be migrated in five minutes.** Recording that
here on purpose: the door is open, the cost is known, and a future session
should not treat "frozen" as "unreachable."

---

## 8.2 OBSERVATION — storage footprint, measured 2026-07-31

Source: `scripts/audit-storage-footprint.mjs` (read-only probe), run
2026-07-31. Every figure below is **measured**, except the 512 MB budget, which
is an **assumption**: the Atlas tier cannot be read from a plain connection, and
512 MB is the M0 limit documented in `src/lib/db/connect.js`. If the cluster is
ever upgraded, every percentage here is wrong and nothing will notice.

**These are measurements on a date. They go stale. Re-run the probe before
citing them.**

| | |
|---|---|
| database | `9exp_genesis`, 48 collections |
| on disk (storageSize + indexSize) | **11.45 MB — 2.24%** of the assumed 512 MB |
| free | ~500 MB |

Largest consumers:

| collection | docs | total | note |
|---|---|---|---|
| `articles` | 485 | 3.28 MB | 7 indexes, index-to-data ratio **0.14** |
| `webhook_logs` | 357 | 1.29 MB | |
| `promotions` | 21 | 0.58 MB | 42 KB average document |

The three collections this plan is about:

- **`page_audit_logs`** — 23 rows, **317 bytes** average, spanning **4.1 days**
  (2026-07-16 → 2026-07-20).
- **`page_versions`** — **2 documents**, 1 snapshot per page. The 20-per-page
  cap in `src/models/PageVersion.js` has never been approached, because only
  two pages have ever been published. **Not a storage concern today.** At
  ~5.5 KB per snapshot, revisit past roughly **100 published pages** (~11 MB at
  the cap), not before.
- **`admin_audit_logs`** — **does not exist.** Expected: the model is defined
  and has zero call sites, and Mongo creates a collection on first write.

**The rows/day rate came back `UNRELIABLE — sample too small`.** The probe
refused to print a growth projection rather than divide 23 rows by a 4-day
window. That refusal is the finding, not a gap in the report — see §8.4.

---

## 8.3 DECISION — no TTL index; retention is not a storage question

**No TTL index. No retention policy on storage grounds.**

Invert the budget instead of projecting into it. Against ~500 MB free:

- at the writer's **2 KB** per-payload-field cap (`MAX_PAYLOAD_CHARS` in
  `src/lib/audit/recordAdminAction.js`) — roughly **250,000 rows**
- at the **317 B** measured on `page_audit_logs` — roughly **1.6 million rows**

Both numbers are far past any rate this admin can generate before the tier is
upgraded for unrelated reasons. **Storage is not the constraint, and this plan
must stop treating it as one.** Retention is a **queryability and PII**
question — §5 — not a disk question. Designing a TTL to reclaim space that is
not scarce would delete the trail's only value (its age) to solve a problem
nobody has.

Note the second-order reason this matters: §5.2 already argues that an
append-only collection is the wrong place for personal data *because rows are
never modified*. A TTL added for disk reasons would create a de-facto retention
policy that the PII argument never asked for, in a shape nobody chose.

### Reopen the retention question when — a numeric tripwire

Written the way `ADMIN_LIST_LIMIT` in `src/app/admin/articles/page.jsx` is
written: a number with its reasoning attached, so it fires by itself and the
correct response to it is stated in advance.

```
AUDIT_ROWS_TRIPWIRE  = 200_000   // rows in admin_audit_logs
DB_TOTAL_TRIPWIRE_MB = 256       // half the assumed 512 MB budget
```

Reopen when **any one** of these is true:

1. **`admin_audit_logs` exceeds 200,000 rows.** Chosen at roughly 80% of the
   pessimistic 2 KB capacity — far enough out to be a real signal, close enough
   in to leave room to act.
2. **The database total exceeds 256 MB** — half the budget. Not specific to
   this collection: at half full, everything competes, and this trail should be
   re-weighed alongside the rest.
3. **A customer data-deletion or subject-access request arrives.** **This is
   the one that will arrive first**, and it is the only one that arrives without
   warning. It is not a storage event at all — it is the PII question in §5.2
   becoming concrete, and it will not care what the row count is.

**If you are here because a tripwire fired: the correct response is to weigh a
retention policy, not to raise the number.** Raising it buys silence and hands
the next person the same decision with less room. If you raise one anyway,
re-run `scripts/audit-storage-footprint.mjs` first and update §8.2 — a budget
nobody can re-derive is a budget nobody will question.

---

## 8.4 DECISION — do not wait for a better rate sample

**The `UNRELIABLE` result blocked nothing. Ship without waiting.**

Two reasons, and the second is the one that matters:

1. **Waiting measures the wrong thing.** `page_audit_logs` instruments the
   page-builder menu and nothing else — one menu out of 36, roughly 15 of 159
   call sites. Letting it age produces a longer, more confident measurement of
   a rate that is not the rate being asked about. A 90-day sample of the wrong
   population is worse than a 4-day one, because it invites belief.
2. **The decision it was meant to inform turned out not to need making.** The
   rate was wanted for retention sizing. §8.3 settles retention without a rate,
   by inverting the budget instead of projecting into it. There is no longer a
   question waiting on the answer.

After the sweep, `admin_audit_logs` **measures itself** — the real population,
at the real rate, across all 36 menus. That is the only sample worth having,
and the only way to get it is to ship the sweep.

Recorded so no future session reads "UNRELIABLE" in §8.2 and concludes that
something is pending. Nothing is pending. The probe declining to invent a number
is the system working.

---

## 8.5 DECISION — Phase 3 reading-surface spec

This is the part that existed only in conversation. It is the reason §8.6 has
to name a consumer for every index.

### Two surfaces, one collection

The inline history widget is **a filtered view of the same collection** the
central page reads. There is never a second logging system, a second writer, or
a per-menu log. One collection, two queries.

### Permission rule: you can see the audit of what you can already see

No new permission vocabulary. Reuse `canAccess(user, pageKey)` from
`@/lib/rbac/access`, including its superadmin sentinel: `user.pages == null`
means allow-all (`src/lib/rbac/access.js:22`). If you can open the banners page,
you can read banner history. If you cannot, you cannot — and you also cannot see
that banner rows exist.

This is why `menu` is an RBAC page key rather than a fresh vocabulary: the
permission check for the audit of a thing is *the same call* as the permission
check for the thing.

### Central page `/admin/audit-log`

Gated by a **new page key `audit_log`** added to `ADMIN_PAGES` in
`src/lib/rbac/pages.js`. Two consequences, both **intended**, neither a side
effect to be discovered later:

1. It enters `MENU_ENUM` automatically, because
   `MENU_ENUM = [...ALL_PAGE_KEYS, UNKNOWN_MENU]`
   (`src/models/AdminAuditLog.js:61`). The audit log becomes auditable by the
   same machinery. That is correct.
2. It appears in **both** the sidebar and the roles checkbox UI, because both
   render from `ADMIN_PAGES`. Granting it is therefore a normal role edit, and
   revoking it is too.

*(Not added yet — that ships with Phase 3, not with this doc.)*

**One page for everyone**, differing only by a server-side clamp:

```js
// `menusForUser` DOES NOT EXIST — see the note below. Inline for now:
const allowed = isSuperadmin || user.pages == null
  ? null
  : (user.pages ?? []).filter((k) => ALL_PAGE_KEYS.includes(k))
find({ ...(allowed && { menu: { $in: allowed } }), ...filters })
```

> **CORRECTION.** Earlier drafts of this section wrote `menusForUser(user)` as
> if it were an existing helper. **It was invented in the pseudo-code and has
> never been written.** `src/lib/rbac/access.js` exports `canAccess`,
> `canAccessPath` and the tier predicates — nothing else. The real thing is
> `user.pages` narrowed to `ALL_PAGE_KEYS`, and it is a **Phase 3 addition**
> that belongs next to `canAccess` so both read the same session shape,
> including the `user.pages == null` superadmin sentinel. Corrected here so
> nobody imports a function that does not exist and concludes the module is
> broken.

`allowed` is **recomputed server-side on every request**. A value arriving from
the client is never trusted — in a `'use server'` module every export is a POST
endpoint, so a menu list in the payload is an attacker-supplied menu list. The
clamp is applied to the query, not to the rendered rows: filtering after the
fetch leaks row counts and pagination totals for menus the user cannot see.

*Note: `menusForUser` does not exist yet. It is `user.pages` narrowed to
`ALL_PAGE_KEYS`; `src/lib/rbac/access.js` currently exposes only the
`canAccess` predicate. Phase 3 adds it there, next to `canAccess`, so both read
the same session shape.*

- **Filters:** actor, menu, entity, action, date range.
- **Action values must be read from the data, never a hardcoded list.** The
  live data already contains `preview.enable`, which appears in neither model's
  docstring vocabulary (`PageAuditLog.js:23` suggests
  `create | update | delete | status | section.add`;
  `AdminAuditLog.js:72` suggests
  `create | update | delete | toggle | reorder | sync`). The field is free-form
  **by design** — `AdminAuditLog.js:73-74` says so explicitly, because an enum
  would make adding a menu action a schema migration. A hardcoded filter list
  would silently hide every action verb invented after the list was written.
- **Pagination by cursor on `createdAt`, not `skip`.** This collection only
  grows; `skip(n)` walks n documents server-side on every page and gets slower
  forever. A cursor does not.
- **Rows filed under `UNKNOWN_MENU` are visible to superadmin only.**
  Fail-closed: an unrecognised menu key cannot be permission-checked, so it
  cannot be shown to someone whose permissions are defined by menu. Superadmin
  sees them because someone has to — those rows are the signal that a caller is
  mis-keyed, and `menuRaw` is how they get found and repaired
  (`AdminAuditLog.js:47-57`).

### Inline widget `RecordHistory`

**One component, reused on every detail/edit screen.** Query
`{ menu, entity, recordId }`, render the newest 5, with a "ดูทั้งหมด" modal for
the rest.

Reuse the column shape the career-path system already uses —
**Timestamp / Log Message / Note / Edited By** — where Note carries the
`'before' → 'after'` rendering. Not a new table design: the admin already reads
history in that shape, and a second shape for the same idea is a cost paid on
every screen.

### "Who edited this last" on list pages

One query per page render, not one per row:

```js
find({ menu, entity, recordId: { $in: idsOnPage } })
  .sort({ recordId: 1, createdAt: -1 })
```

then keep the **first row per `recordId`** in application code. N ids, one
round trip.

**Why this is NOT denormalised onto the entity documents** as
`lastEditedBy` / `lastEditedAt`, which is the obvious optimisation and the
wrong one here:

**Half this admin's data has no document to denormalise onto.** Courses,
schedules, instructors and career paths live upstream in MSDB and are written
over HTTP via `src/lib/api/msdb-write.js` — the same fact that makes the audit
hook a server-action concern rather than Mongoose middleware
(`AdminAuditLog.js:19-24`). There is no local row to hang a stamp on, and
**MSDB is not ours to write** — adding two fields to someone else's schema for
our convenience is not on the table. A denormalised stamp would therefore work
on roughly half the admin and be silently absent on the other half, which is the
exact failure mode this whole design keeps rejecting: a surface that **looks**
complete.

### Deleted records

**Deleted records appear only on the central page.** The inline widget dies with
the screen it lives on — there is no detail page for a record that no longer
exists.

This is the main reason **`recordLabel` is snapshotted at write time**. Once the
record is gone, its name cannot be looked up, and `recordId` alone
(`6721f3a…`) answers nothing. *"Who deleted this, and what was it called"* is
the question people ask most, and it is only answerable if the label was
captured before the delete.

Corollary for the sweep: on delete actions, `recordLabel` must be read
**before** the mutation. §3 already flags that several delete actions do not
read the document first.

### Verify before building — a Phase 3 entry condition

The non-superadmin query is `$in` **on the index prefix** with a sort on the
**second** key:

```js
find({ menu: { $in: allowed }, ... }).sort({ createdAt: -1 })
```

An `$in` on a prefix does not automatically give a sorted result on the next
key — the planner must run **SORT_MERGE** (one sorted stream per `$in` value,
merged) for the sort to be free. If it instead chooses a collection scan or a
blocking in-memory SORT, the page degrades silently as the collection grows and
will eventually hit the 32 MB in-memory sort limit.

**Confirm with `explain()` that the plan is a SORT_MERGE, not a blocking sort,
before building on it.** `src/models/AdminAuditLog.js:92-96` already asks for
this check; it is recorded here as a **Phase 3 entry condition** — done before
the screen is written, not after it is slow.

---

## 8.6 DECISION — index → screen map; keep all four

Every declared index on `AdminAuditLog` has a named consumer. **This table
exists so that no future session proposes deleting an index for want of a
screen it cannot find written down** — which is exactly what happened once
already, to `{recordId:1, createdAt:-1}`, because §8.5 did not exist yet.

| index | serves |
|---|---|
| `{createdAt:-1}` | central page, unfiltered default view (§8.5) |
| `{menu:1, createdAt:-1}` | the menu filter **and** the non-superadmin `$in` clamp |
| `{'actor.id':1, createdAt:-1}` | "what did this admin change" |
| `{recordId:1, createdAt:-1}` | the inline `RecordHistory` widget **and** the list-page `$in` last-edit query |

Two of the four serve **two** consumers each. Neither of those second consumers
is visible from the model file alone, which is the whole point of writing this
down.

### A fifth index was considered and rejected

`{menu:1, entity:1, recordId:1, createdAt:-1}` — the "perfect" covering index
for the inline widget's exact query shape.

**Rejected.** `recordId` is selective enough on its own: one record holds a few
dozen rows at most, so the `{recordId, createdAt}` index narrows to a handful of
documents and `menu`/`entity` are cheap to filter in application code. On a
shared tier, a fifth index on an **append-only** collection is not worth its
bytes — every insert pays for it forever, and §8.2 shows indexes already
costing more than documents on small-row collections (`page_builder_pages`:
8 index bytes per data byte).

Reopen only if `explain()` on real data shows the widget query examining
materially more documents than it returns.

---

## 8.7 DECISION — the `recordId` contract

**This table must exist before the sweep begins.** `recordId` is the join key
the entire reading surface in §8.5 depends on — the inline widget, the
list-page last-edit query, and every "history of this record" link. The sweep
sets it at 159 call sites across 38 files.

If each file picks its own convention, the failure is silent and expensive: the
list page holds one identifier, the log holds another, the `$in` join returns
nothing, the widget renders "no history" for a record with a full history, and
nobody notices because an empty history looks exactly like a new record. The
repair at that point is 159 already-committed edits.

Derived by walking `src/lib/actions/*.js` the way §1 and §6 describe. Rows
marked ⚠ diverge from the contract as first drafted; the divergence notes below
the table are the substance, not footnotes.

| menu | entity | recordId | recordLabel | diff |
|---|---|---|---|---|
| featured_courses / featured_online_courses / nav_featured_online_courses | — | Mongo `_id` | name/title | full |
| courses | course | MSDB `_id` | `course_id` + name | full |
| courses ⚠ | extension / early_bird | `courseId` = the **`course_id` code** | (same value) | full |
| courses | promo_link | Mongo `_id` | link label | full |
| schedules | — | MSDB `_id` | `course_id` + dates | full |
| instructors ⚠ | — | Mongo `_id` (arg `localId`) | name | full |
| programs | program / skill | upstream id | name | full |
| programs | program_order / skill_order | `''` | — | `orderedIds` |
| career_paths ⚠ | — | `career_path_id` = the **MSDB `_id`** | name | full |
| masterclass | course / batch | Mongo `_id` | title | full |
| mc_registrations | — | Mongo `_id` | — | status / count only |
| tnhs_courses | — | Mongo `_id` | title | full |
| page_configs | program_config / skill_config | upstream id | slug | full |
| banners / promotions_banner / notifications | — | Mongo `_id` | title | full |
| promotions | — | upstream `promotion_id` | name | full |
| promotions ⚠ | page_link | `promotion_id` | page slug | full — **plus a second row, see ruling (h)** |
| pages ⚠ | builder | the LINKED page's Mongo `_id` | page slug | full — the second row from `setPromotionPageLink` |
| about | instructor | Mongo `_id` | name | full |
| about | config | `'about-config'` (log-side literal) | — | full |
| contact | video / map | `'contact-video'` / `'transport-map'` (log-side literals) | — | full |
| portfolio | client_logo / atmosphere_photo | Mongo `_id` | client / caption | full |
| nearby_places | — | Mongo `_id` | place name | full |
| featured_reviews | — | Mongo `_id` | reviewer | full |
| articles | — | Mongo `_id` | title | full + plan |
| pages | custom / builder / section / preview | Mongo `_id` | slug | full |
| faqs | — | upstream `faq_id` | question | full |
| local_faqs ⚠ | — | Mongo `_id` | question | full — **menu is computed, see note 8** |
| schedule_pdf ⚠ | — | `'schedule_pdf'` (**underscore** — the real key) | filename | full |
| registrations | public / inhouse | Mongo `_id` | `''` — **the reference number IS the `_id`, ruling (a)** | status only |
| career_path_registrations | — | Mongo `_id` | — | status only |
| recruits | — | Mongo `_id` | title | full (not PII) |
| webhook_logs | — | `logId` = Mongo `_id` | event type | act only |
| roles ⚠ | — | role **key** (slugified) | role label | full |
| accounts | — | Mongo `_id` | email | full, never the password value |
| profile ⚠ | — | `admin._id` | email | act only |
| *any menu* | *any* | `''` | — | **reorder** — `after: {orderedIds}`, 16 actions |
| *any menu* | *any* | `''` | — | **bulk sync** — `meta: {synced, errors}`, 5 actions |

### Ruling on every divergence — DECISION

Fifteen divergences were reported against the first draft of this table. Every
one is settled below. **The `entity` column above shows `—` where a menu holds
a single record kind; the contract module does NOT.** `src/lib/audit/auditContract.js`
names an entity for every menu, including single-entity ones, because
`entity: ''` is the shape that makes a row unfilterable by the inline widget.
Read the module for the legal `(menu, entity)` pairs; read this table for what
`recordId` and `recordLabel` must hold. Those two facts live in different
places on purpose — see the module's docstring.

**(a) `registrations` — DECISION: there is nothing to decide. `recordId`
already carries the reference number.**

The `เลขอ้างอิง` the admin reads is not stored anywhere. It is a display
transform of `_id`:

```js
function refNo(id) { return String(id).slice(-8).toUpperCase(); }
```

declared identically in four places — `RegistrationsClient.jsx:53` (the list
column at line 277), `RegistrationDetailClient.jsx:32`,
`InhouseDetailClient.jsx:95` — inlined again in both `[id]/page.jsx`
`generateMetadata` functions, and computed the same way server-side for the
receipt emails (`send-receipt.js:18`).

So the log's `recordId` (the Mongo `_id`) and the admin's `เลขอ้างอิง` are the
same value at different lengths, and the reading surface can render one from
the other with the same one-line transform. **`recordLabel` is `''` for both
registration entities.** The earlier proposal of `courseCode + classDate` is
withdrawn: it would have added a non-unique, redundant label to a PII entity
for no gain, and §5.2's whole posture is to put less in these rows, not more.

*(Noted in passing, not acted on: `refNo` is copy-pasted five times. That is a
pre-existing duplication in the admin UI and out of scope here — but the
Phase 3 reading surface will need it a sixth time, and that is the moment to
extract it rather than add a fifth copy.)*

**(b)/(c) singletons — DECISION: `schedule_pdf` with an underscore; the other
three are log-side literals.** §3 is corrected in place. `schedule_pdf` is the
only one of the four with a real `key` field in its document
(`schedule-pdf.js:9`); `about-config`, `contact-video` and `transport-map` are
`findOneAndUpdate({}, …)` first-document-wins and carry no key at all, so
those literals exist only in the audit trail.

**(d) `createInstructor` — DECISION: `recordId` is the local `_id` for every
instructor row, create included.** The create row must join with everything
that follows it, and it cannot if it keys on the upstream id while
`updateInstructor`/`deleteInstructor` key on the Mongo `_id`.

The action must therefore return that value. **ADD a field to the returned
object; do not repurpose or remove the existing `id`.** Callers already read
`id` as the upstream MSDB id, and silently changing what it means is a
client-side break with no error — the worst kind. Mechanically:
`instructors.js:143` currently discards the upsert result
(`await Instructor.findOneAndUpdate(…)`); capture it and return the extra
field alongside `id`. That edit belongs to the sweep, not to this doc.

**(e) `courses` two key spaces — DECISION: ACCEPTED, not normalised.**
Resolving `course_id → _id` on every write buys tidiness at the price of an
extra read on every mutation, forever, on a shared tier. The cost is paid once
at read time instead, by a screen that already holds both values:

```js
{ menu: 'courses', recordId: { $in: [msdbId, courseId] } }
```

The existing `{recordId:1, createdAt:-1}` index serves that `$in` — no new
index, and §8.6's rejection of a fifth one stands.

**This is why the reading surface has to know which menus are dual-key**, and
why that flag is one of the four things `auditContract.js` holds:
`dualKeySpace: true` on `courses` and nowhere else, with a test asserting the
"and nowhere else". A second dual-key menu is a design change, not a data edit.

**(f) `updateCareerPathCourses` — DECISION: always log `career_path_id`.**
`buildIdFilter` (`career-paths.js:454`) accepts either key space, but the
document it resolved is already in hand — `findOneAndUpdate(…, {new: true})`
returns it — so read `career_path_id` off the result. **No extra query.** Its
five siblings all key on the upstream id and this one must not be the
exception.

**(g) `roles` — DECISION: log `slugifyKey(key)`, the stored value, never the
raw argument.** `createRole` slugifies before storing (`roles.js:73`), so the
raw argument can differ from the row it created. Only `createRole` diverges;
`updateRole` and `deleteRole` receive the already-clean key.

**(h) `setPromotionPageLink` — DECISION: TWO rows.** One under `promotions`
(the user's intent — "linked promotion X to a page"), one under `pages` for
the page that RECEIVES the link, because that page is what changed and "what
happened to this page" must answer.

Pages **unlinked** by the same call — `PageBuilder.updateMany({promotionId: …},
{$set: {promotionId: ''}})` at `promotions.js:182` — are recorded as a **count
in `meta`**, not one row each. Same rule as a reorder, same reason: an action
that touches a set of rows records the set, not the rows.

**(i) reorders — DECISION: 16, not 1.** One shape covering all of them:
`action: 'reorder'`, `recordId: ''`, `after: { orderedIds }`, capped by the
writer. They span `about`, `career_paths`, `courses`, `faqs`, `local_faqs`,
`nearby_places`, `portfolio` (×2), `programs` (×3), `promotions`,
`promotions_banner` and `recruits` — and three of them
(`reorderCoursePromoLinks`, `saveSkillProgramOrder`, `reorderLocalFaqs`) hide
the shape behind a scope argument in first position, so a Phase 2 rule keyed
on "first parameter is named `orderedIds`" misses them.

**(j) bulk syncs — DECISION: five rows, absent from the first table
entirely.** `recordId: ''`, `action: 'sync'`, `meta: { synced, errors }` — the
counts the sync already returns — and **never the documents**. See the §5.3
observation before implementing these: three of the five have no live
action-layer call site at all.

**(k) `profile` — DECISION: `admin._id`, resolved by email.**
`updateOwnProfile` looks its target up with
`Admin.findOne({ email: session.user.email })` and never reads
`session.user.id`. Log the `_id` off the document it found. This is also the
action that corrects §1 — see the correction there.

**(l) `webhook_logs` — DECISION: `logId` is a Mongo `_id`; label it as such.**
`replayWebhookEvent` calls `WebhookLog.findById(logId)`. The name reads like a
domain key next to rows that say "Mongo `_id`", and the sweep should not have
to guess.

**(m) `pages | custom` — DECISION: these are first-ever rows, not a
migration.** `customPages.js` has five mutating actions and has never written
an audit row (§8.1) despite `PageAuditLog.pageType` carrying an
`advanced_html` enum value that exists for it and nothing else. After the
sweep, `custom` becomes a live entity for the first time.

**(n) `courses` menu, remaining open items — DECISION deferred to the sweep,
per action.** Two were reported and neither is settled by a table entry:

- `deleteCourse(id)` (`courses.js:251`) receives only the MSDB `_id` and calls
  `msdbDelete` immediately; `course_id` and `course_name` are never in scope,
  so a human-readable label needs a read-before-delete. Per §8.5, deletes are
  the rows where the label matters most, so shipping `recordLabel: ''` here is
  a **deliberate loss to be recorded**, not a default to fall into.
- The same applies to every other delete that does not currently read the
  document first (§3).

**(o) `menusForUser` — DECISION: it does not exist; the pseudo-code was
wrong.** Corrected in §8.5. It is `user.pages` narrowed to `ALL_PAGE_KEYS`, and
it is a Phase 3 addition next to `canAccess` in `src/lib/rbac/access.js`.
Recorded here as well because an invented helper name in a spec is exactly the
class of error this whole section exists to stop: it reads as a citation.

---

### The three open classifications, now ruled — DECISION

Three pairs were flagged as unclassifiable without guessing. All three are
settled, and all three are now **enforced by tests** in
`test/pure/auditContract.test.mjs` rather than left as prose.

**(p) `pages | preview` SPLITS into two pairs.**

| pair | diff | covers |
|---|---|---|
| `pages \| preview` | **`act_only`** | `enablePreviewLink`, `regeneratePreviewPassword`, `revokePreviewAccess` |
| `pages \| preview_expiry` | `full` | `setPreviewExpiry` — `{expireDate}` only, no secret |

The reason to record: **"never log the preview password" as prose is a rule
nothing enforces.** `regeneratePreviewPassword` is the single most dangerous
pair in this table to leave at `full` — it is the one function in the repo that
holds a plaintext preview password in a local variable
(`pageBuilder.js:736` returns it once, deliberately, and never stores it). At
`act_only` there is no `before`/`after` for a secret to land in, so the ceiling
is **structural** rather than a review comment someone might forget to make.

The expiry date is not a secret and is worth recording, so it gets its own pair
rather than raising the ceiling on the one that handles passwords. That
asymmetry is the whole point: if `preview_expiry` did not exist, someone
needing the date would raise `preview` to `full` and quietly undo this.

**(q) `local_faq` is a valid entity under FOUR menus** — `courses`,
`career_paths`, `masterclass` and `local_faqs`.

This follows from the already-recorded rule that `menu` is the **resolved** page
key: `pageKeyForType(course_type)` (`local-faqs.js:41-52`) returns one of those
four, and the row is filed under whichever it returned. Without all four pairs,
a perfectly correct row — a FAQ edited under a course, filed under `courses` —
would be **rejected by the pair set**, which is worse than having no contract:
a contract that refuses valid data trains people to ignore it.

**(r) The promotion-link second row stays `pages | builder`. No new entity.**

The record that changed is a **page**. The verb belongs in `action` —
`promotion.link` / `promotion.unlink` — which is precisely why `action` is
free-form in the schema and `entity` is not.

`entity` distinguishes **kinds of record**: a masterclass course and a
masterclass batch are genuinely different things, stored in different
collections, with different lifecycles. A page that gained a promotion link is
still a page. Splitting it into `pages|promotion_link` would fragment
"everything that happened to this page" across two entity values, and the
inline `RecordHistory` widget queries `{menu, entity, recordId}` — so the
fragment would be invisible from the page's own screen, which is the one place
someone would look for it.

---

### Round 3's two open decisions — OPEN, not answered

Both were surfaced by the round-2 work and neither is settled. They belong to
whoever writes round 3, and they are recorded here so that round does not
discover them at the keyboard.

> **BOTH RESOLVED IN ROUND 3 — see §8.12.** Item 1 was ruled: take the read,
> uncached. Item 2 turned out not to arise for `courses`/`schedules` — every
> `recordId` was already in scope, so no return value changed and no commit was
> needed. It remains live for `instructors.js::createInstructor` in round 4.

**1. `deleteCourse` has no label without a read-before-delete.**
`courses.js:251` receives only the MSDB `_id` and calls `msdbDelete`
immediately; `course_id` and `course_name` are never in scope. §8.5 says
deletes are the rows where `recordLabel` matters most — "who deleted this, and
what was it called" is the question people ask — and once the record is gone
the name cannot be looked up. So the choice is a read-before-delete on every
course deletion, or shipping `recordLabel: ''` **as a deliberate loss that is
written down**, not as a default nobody noticed. Not decided here.

**2. At least one create must gain a return field, and that is client-visible.**
`createSchedule` and `instructors.js::createInstructor` both discard the local
upsert result (§8.7 ruling (d)), so the local `_id` the trail needs is not in
scope at the point the audit call would be made. Fixing it means **adding** a
field to the returned object — never repurposing the existing `id`, which
callers already read as the upstream MSDB id. A silent change of meaning there
is a client-side break with no error.

Because it changes a return shape, it is **its own commit**, sequenced before
the instrumentation rather than bundled into it.

### Two follow-ups, recorded so they are not rediscovered

**`refNo` duplication — deliberately NOT extracted now.**
`String(id).slice(-8).toUpperCase()` appears at six sites
(`RegistrationsClient.jsx:53`, `RegistrationDetailClient.jsx:32`,
`InhouseDetailClient.jsx:95`, both `[id]/page.jsx` `generateMetadata`
functions, and `send-receipt.js:18`). It is one line, the copies have never
diverged, and extracting it now would be a change to six files in service of
nothing. **Extract it when Phase 3's reading surface becomes the seventh
caller**, as part of Phase 3 — that is the point at which a shared helper is
paying for itself rather than being tidiness.

**PHASE 3 TRIPWIRE — a row whose `before` deep-equals its `after`.**

The reading surface should **flag** those rows rather than render them as a
change. A row saying `paid → paid` records that nothing changed, which is not
an event; it is a symptom.

Specifically it is the symptom of the one defect no text guard in this repo can
catch. Four status actions were changed to `findByIdAndUpdate(…, { new: false })`
so `before` holds the PREVIOUS status. Flip any of them back to `new: true` and
`before` silently becomes the post-update document — every row then reads
`X → X`, the suite stays green, and the coverage guard still reports the action
as instrumented. It was verified during round 2 that reverting that flag reddens
**nothing**.

The tripwire costs nothing: a deep-equal on two objects already in hand at
render time, in a surface that is already iterating them. Same reasoning as the
`ลำดับซ้ำ` / pin-tie corruption tripwire — the guard covers the code, the
tripwire covers everything that is not the code, and this defect is squarely in
the second category.

Do not make it an error. A legitimate no-op write is possible (an admin
re-selects the same status through a stale UI), so it is a flag on the row, not
a refusal to display.

**The registrations label question is CLOSED.** `เลขอ้างอิง` is derived from
`_id`, so `recordId` already carries it and `recordLabel` is `''` for both
registration entities. The `courseCode` + `classDate` proposal is **withdrawn**:
it would have added a redundant, non-unique label to a PII entity, against
§5.2's posture of putting less in these rows rather than more. Do not reopen it
without new information — "the label column looks empty" is not new
information, it is the design.

---

## 8.8 DECISION — sweep order: pilot the hardest shapes first

**Sweep the awkward identifier shapes before the mechanical ones.**

There are six awkward shapes: create-returns-id, reorder-many, bulk sync,
singleton, two-entities-per-menu, and MSDB-side. Sweeping the ~131 mechanical
sites first feels like progress and is the expensive order: a contract error
surfaces *after* it has been copied into 131 committed edits, and the repair is
a second sweep over the same files. Doing the hard ones first means a wrong
contract costs 28 sites and is found while the contract is still soft.

| round | menus | sites | proves |
|---|---|---|---|
| 1 | `roles` | 3 | highest-value rows in the log; `recordId` is a key, not an `_id` |
| 2 | `registrations`, `mc_registrations` | 11 | the PII policy (§5.2) and the status carve-out |
| 3 | `courses`, `schedules`, `course-extensions` | 8 | the MSDB half, BOTH key spaces, an overloaded signature |
| 4 | `articles` | 8 | create needs the result id; reorder logs the plan, not the rows |
| 5 | everything else | ~131 | mechanical |
| 6 | route handlers — 2FA **and** the four syncs | 7 | **a different shape entirely — see below** |

**28 sites cover all six shapes.** If the contract is wrong, it surfaces there —
in four small rounds that are cheap to revise, before the mechanical bulk
locks it in.

### Round 5 — DECISION, SUPERSEDING the earlier exemption-list ruling

An earlier note said the computed guard key in `local-faqs.js`
(`requireAdmin(pageKeyForType(course_type))`) would need "a documented
exemption list, or the guard will report false reds and get switched off."

**That is withdrawn. Round 2 found a better instrument and it applies here.**

`COMPUTED_ENTITY` in `test/fs/auditCoverage.test.mjs` handles exactly this shape
for `registrations.js`, whose `entity` is computed from `source`. It does not
waive the check — it **declares the complete set of values the expression can
produce** and checks every one of them against the contract. The obligation
moves from "the matcher can see it" to "a human wrote down what it produces",
and a control proves the declaration cannot be an empty set or name an export
that actually uses a literal.

For `pageKeyForType` the set is closed and short — `local-faqs.js:41-52`:

```
courses | career_paths | masterclass | local_faqs
```

All four are already legal `local_faq` pairs in the contract (§8.7 ruling (q)),
so the declaration is checkable the day round 5 is written.

**Why this is strictly better than an exemption list:** an exemption removes an
assertion, and its only protection is that someone reads the reason. A declared
value set adds an assertion — four of them here — and it fails loudly if the
computation grows a fifth branch nobody declared. An exemption gets quieter as
the code changes; a declaration gets louder.

### Round 6 — DECISION on §5.3, option 1: SEVEN route handlers

`/api/admin/2fa/{setup,verify,disable}` **and**
`/api/admin/{faqs,promotions,career-paths,instructors}/sync` get instrumented.

**"An admin disabled their own 2FA" is the single highest-consequence event in
this system** — it is the step that turns a stolen password into an account —
and the action-layer hook is structurally incapable of seeing it, because 2FA
is not implemented in the action layer at all.

**The four sync endpoints are in because the admin UI calls them, not the
actions.** Three `sync*Action` exports have zero callers; two other syncs run
as live server actions. Sweeping only the action layer would produce a log
where program and skill syncs appear and FAQ, promotion and career-path syncs
never do — apparent coverage, which is worse than a uniform gap. Full evidence
in §5.3.

**Round 6 is last not because it matters least, but because it is not the same
shape.** Rounds 1-5 all instrument `'use server'` exports that open with
`requireAdmin(pageKey)`, and that one call hands over both the menu and the
actor. A route handler has neither:

- the **menu** is not passed — `security` for 2FA, and the owning menu for each
  sync — so nothing in the request establishes it and nothing validates it;
- the **actor** is not in hand — `requireAdmin` performs the session read that
  every other call site inherits for free, and these handlers do their own auth
  some other way. The instructor sync also runs from a **cron**, where there is
  no session at all: that row's actor is the reserved `system:cron`.

Solving that is where round 6 **begins**, not something it inherits from rounds
1-5. Treating it as "seven more sites" is how it ends up shipping with an empty
actor, which is the one field these particular rows exist for.

**A separate `refactor:` commit in the same round deletes the three dead sync
actions** (§5.3). It reviews with the instrumentation, not apart from it.

Sequenced after the bulk deliberately: the contract will have been proven
across 159 action-layer sites by then, so the only new variable is the hook
point.

**Open, and it belongs to the same round:** the four sync ENDPOINTS. The
§5.3 observation shows the admin UI calls those routes rather than the
`sync*Action` server actions for `faqs`, `promotions` and `career_paths`, so
the action-layer sweep will produce no rows for three of the five syncs. That
decision should be made before round 5 commits, not after.

---

## 8.9 OBSERVATION — the two classifiers diverged, and where

Measured 2026-07-31, after adding the MSDB writers to the coverage guard.

| | count |
|---|---|
| §2's walker (this document) | **159** |
| `test/fs/auditCoverage.test.mjs` (`MUTATING_EXPORT_COUNT`) | **156** |
| direct writes — both walkers | **143** (agree exactly) |
| resolved through a local helper — §2 | 16 |
| resolved through a local helper — the guard | 13 |

### The gap is 3, and it runs in ONE direction only

| export | §2 | the guard | why |
|---|---|---|---|
| `career-paths.js::syncCareerPathsAction` | counted | **missed** | writes via the IMPORTED `syncCareerPaths` |
| `faqs.js::syncFaqsAction` | counted | **missed** | writes via the IMPORTED `syncFaqs` |
| `promotions.js::syncPromotionsAction` | counted | **missed** | writes via the IMPORTED `syncPromotions` |

§2 counts these only because it **hardcodes those three helper names** — §6 says
so in its own words: *"the three `sync*Action` rows only count because the helper
names are hardcoded"*. The guard does not hardcode them, so it reports 156.

**There is NO export the guard sees that §2 misses.** The other direction is
empty. So **§2's inventory is not short and the sweep plan's 159 stands** — it
is three broader than the guard by a deliberate hardcode, which is the correct
direction for a planning number to err in.

### What the MSDB omission was actually costing

Three exports were invisible to the guard entirely, and they are round 3's:

```
courses.js::createCourse   courses.js::updateCourse   courses.js::deleteCourse
```

`courses.js` contains **no Mongo write call at all** — every mutation is an HTTP
call to MSDB — so a Mongoose-only pattern found nothing in it and the coverage
assertion skipped all three. Two more were merely misclassified rather than
missed: `schedules.js::createSchedule` and `updateSchedule` moved from
"indirect" to "direct" once the MSDB names were recognised.

### Why this is recorded rather than just fixed

The fix was three names in a regex. The finding is that **a guard component
observable only through its consumers has no controls of its own**: the
classifier was exercised solely via `SWEPT_FILES`, no swept file contained an
MSDB write, and so nothing could have gone red. It is now run over `courses.js`
— an **unswept** file, chosen precisely because it is the one the blind spot
hid — and the swept-file check calls the same `mutatingExports()` the count
uses, so there is one classifier rather than two.

The number is pinned rather than floored because a number nobody wrote down is one
nobody notices drifting. (This used to cite `EXPECTED_TESTS` in `test/run.mjs`;
that control is a `FLOOR` now, so it is no longer the precedent.)

---

## 8.10 BLOCKED — tightening `updateMasterclassRegistrationAttendees`

The recommendation to replace its bare `requireAdmin()` with
`requireAdmin('mc_registrations')` was accepted, the read-only check was run,
and **it came back affected. The change was NOT made.**

Measured 2026-07-31 (read-only; `pages == null` and `isSuperadmin` both treated
as allow-all sentinels, so superadmins are not counted as locked out):

| role | superadmin | pages | grants `mc_registrations` | admins holding it |
|---|---|---|---|---|
| `superadmin` | yes | — | allow-all | 3 (3 active) |
| `admin` | no | 34 | yes | 0 |
| `it_support_admin` | no | 17 | yes | 3 (3 active) |
| `registration_admin` | no | 6 | yes | 4 (4 active) |
| **`editor`** | no | 14 | **NO** | **1 (1 active)** |

One active admin — the holder of `editor`, a **system** role — would lose an
ability they have today. Per the standing rule that is a permissions
conversation, not a fix, so it stops here.

**Two facts that bear on the decision, neither of which resolves it:**

- The `editor` role grants **no masterclass page at all** — not `masterclass`,
  not `mc_registrations`. So that admin cannot open the screen this action
  serves. The ability is reachable only by invoking the server action directly,
  which every export in a `'use server'` module permits. That makes the
  practical loss close to zero and the security argument for tightening
  stronger, not weaker.
- Whether the ability is **used** is now answerable and was not before. Round 2
  instruments this action, so `admin_audit_logs` will show whether any
  non-`mc_registrations` actor edits attendees. Waiting for that evidence costs
  nothing except time, and it replaces a judgement call with a measurement.

Until it is decided, the `MENU_CHECK_EXEMPT` entry in
`test/fs/auditCoverage.test.mjs` stays, with its reason, and the guard asserts
that the action still has no `requireAdmin` literal — so whoever adds the page
key and forgets to delete the exemption gets a red rather than a silent gap.

---

## 8.11 OWED — click-tests the suite cannot perform

No test tier reaches a database, so the following are verified by hand or not at
all. Recorded so they are not lost between rounds.

**1. The four status actions must each be exercised once, and the resulting row
checked for a REAL transition rather than `paid → paid`.**

- `registrations::updateRegistrationStatus` (both `public` and `inhouse`)
- `inhouse-registrations::updateInhouseStatus`
- `career-path-registrations::updateRegistrationStatus`
- `masterclass-registrations::updateMasterclassRegistrationStatus`

All four depend on `findByIdAndUpdate(…, { new: false })` to obtain the previous
status. Flipping any back to `new: true` makes `before` the post-update document
— every row reads `X → X` — and **reverting that flag was verified to redden
nothing**. It is invisible to a text guard by construction. §8.7's deep-equal
tripwire is the durable answer; this click-test is the answer until Phase 3
exists.

**2. `career-path-registrations::updateRegistrationStatus` with a bad id** must
now return `{ ok: false, error: 'ไม่พบรายการ' }`. Before, a bad id updated
nothing and still returned `{ ok: true }`. Both callers already branch on
`res?.ok` and were checked — `RegistrationStatusSelect.jsx:47` reverts its
optimistic update, `CareerPathRegistrationsClient.jsx:84` simply does not apply
the row change — so neither shows a false success. Neither surfaces the error
string, which is a separate and smaller question.

---

## 8.12 DECISION — round 3 rulings (the MSDB round)

Round 3 swept `courses.js`, `schedules.js` and `course-extensions.js` — eight
exports. It is the first round where the action writes somewhere other than
Mongo, and the first to exercise the dual-key-space decision.

### Scope: eight exports, not six — `course-extensions.js` was pulled forward

`courses` is the one menu with **two key spaces** (§8.7 ruling (e)):
`courses|course` records an MSDB ObjectId, `courses|extension` records the
`course_id` **code**. `courses.js` alone exercises only the first.

Leaving the second until round 5 would mean discovering any problem with that
shape while **~129 sites are in flight**, which is the exact failure round 3
exists to prevent — the round is scheduled early *because* it carries awkward
shapes, so it must carry all of them.

`course-promos.js` (5 exports, one a reorder) stays in round 5. Reorder is its
own shape and belongs with the other fifteen, not split across rounds.

### RULING — `deleteCourse` reads before deleting

Take the read. `recordLabel` is `course_id` + name.

An MSDB ObjectId — `692d39b52ee07293c9131fd8` — identifies **nothing** to a
human. The moment `msdbDelete` returns there is nothing left anywhere to
resolve it against. "Who deleted this, and what was it called" is the question
the central page exists to answer, and after the delete the snapshotted label
is the only thing that can answer it.

**Why this is not inconsistent with round 2, where every delete logs
`recordLabel: ''`.** Same principle, opposite answer, because the situations
differ in both halves:

| | round 2 (registrations) | round 3 (courses) |
|---|---|---|
| is `recordId` human-readable? | **yes** — the admin's `เลขอ้างอิง` is literally `String(_id).slice(-8).toUpperCase()` | **no** — an opaque ObjectId |
| is the label personal data? | **yes** — every candidate was a name, email or company | **no** — a course code and title |
| result | record nothing more | take the read |

The principle in both is *record the least that answers the question*. In round
2 the id already answers it and anything further is PII; here the id answers
nothing and the label is not personal data.

**The read must be UNCACHED, and that is not incidental.** `resolveIds.js:26`
caches the course list for 300 s with **no tag**; `getPublicCourse()` is tagged
but ISR'd at 1 h. A label read through either logs the course's name from
*before* a rename — and the row would then assert the wrong thing about a
record that no longer exists to be checked against. The read goes through
`aiFetch(..., { revalidate: 0 })`, which client.js documents as the admin-page
"always fresh" signal (it becomes `cache: 'no-store'`).

It filters on `course`, **never `_id`**. Upstream silently ignores `_id` and
returns the whole list — re-verified live 2026-07-31: `?_id=<oid>` returns 77
rows, `?course=<oid>` returns exactly one. A guard now asserts both properties,
because swapping the uncached form for the cached one was silently green.

### RULING — log the value the action USED, never re-derive it

**A general rule for the remaining ~148 sites, not a note about one function.**

`updateSchedule(idOrFormData, maybeFormData)` is overloaded: the id may be the
first argument or may be inside the FormData. The action already resolves it
into a local. **The audit call reuses that local.**

Writing a second discriminator inside the audit call means two parsers of one
overload, and when they disagree the failure is silent in the worst way: the
write succeeds, a row is written, and it names a record nobody touched. Nothing
reddens, nothing warns, and the trail is confidently wrong.

Generalised: **whatever value the action acted on is the value the row records.**
If resolving it took work, extract that work into a named local and log the
local. Never recompute, never re-read the arguments, never "helpfully" derive a
nicer id at the logging site.

Enforced: no audit call in any swept file may mention a raw overload parameter.

### RULING — one human action is one row, even when it writes twice

`deleteSchedule` writes MSDB and then Mongo. That is **one row**, because it is
one thing a human did. The call sits after the last write on the success path,
keeping the established order: **mutate → revalidate → audit**. A partial
failure that returns not-ok writes no row, consistent with "if the write throws
there is no row".

**FLAGGED — `deleteSchedule` can return `ok` with its second half failed.** The
sidecar cleanup carries a pre-existing `.catch()`:

```js
await msdbDelete('schedules', id);
await ScheduleLocal.deleteOne({ msdb_schedule_id: String(id) }).catch(() => {});
return { ok: true };
```

That `.catch()` is deliberate and defensible — a stranded sidecar must not fail
a delete that already succeeded upstream — but it means **"ok" does not mean
"both halves landed"**. The audit row now records which did, in
`meta.sidecarDeleted`, so a future orphaned-sidecar hunt has somewhere to look.

**This is a pre-existing correctness question, not an audit question, and it is
not fixed here.** Recorded so it is a known state rather than a discovery. The
orphan is invisible today: nothing counts sidecars without a matching MSDB
schedule.

### Ruling 4 — no return value changed

Checked all eight. Every `recordId` was already in scope at the audit call site:
`createCourse` had `item?._id`, `createSchedule` had `newId`, `updateSchedule`
had its resolved local, and the rest take their id as an argument. **No field
was added**, because none was needed — and a speculative one would be a
client-visible change bought for nothing.

That question stays live for round 4: `instructors.js::createInstructor` still
discards its local upsert result (§8.7 ruling (d)).

### `before` on MSDB updates — deliberately skipped

`updateCourse` logs `after` and no `before`. Capturing it would mean an extra
**uncached network round-trip on every course edit** — a 10 s-timeout HTTP call,
paid on every save, to record something the trail already holds: once every
update logs its `after`, the previous row's `after` for the same `recordId`
**is** this row's before. The reading surface reconstructs it by walking the
record's history, which §8.5 already has it fetching.

Deletes are the exception because there is no next row to reconstruct from —
which is the same reason they get the label read.

`course-extensions.js` DOES capture `before`, from an explicit `findOne`: it is
Mongo, indexed, on a small collection, and the cost is not comparable. Its
`before: null` is meaningful rather than missing — the action is an upsert, so a
null before is how the trail says "this created the extension".

### Payload shape — summaries, not shaped payloads

`courseFields()` and `extensionFields()` log the scalar fields an admin would
dispute, plus **counts** for the long-form arrays.

The alternative — logging the shaped MSDB payload — carries `training_topics`,
`bullets`, four arrays of URLs and a long rich-text `title`. A single edit would
blow past `MAX_PAYLOAD_CHARS` and land in the trail as a truncation marker: 200
characters of arbitrary prefix, which is **worse than a chosen summary because
it looks like data**. "the objectives list went from 6 items to 4" is the useful
claim; the objectives themselves are on the page.
