# Ticket: sweep `course-promos.js` into the audit trail

**Status:** open
**Raised:** 2026-09-04, during the round that made "one course, one Early Bird" a rule
**Scope:** `src/lib/actions/course-promos.js` — the EarlyBirdConfig and
CoursePromoLink mutations

## What is missing

`course-promos.js` is not in `SWEPT_FILES` (`src/lib/audit/sweptMenus.js`) and
calls `recordAdminAction` nowhere. Every mutation it exports writes without
leaving a record of who did it or what the row held before:

| Export | Writes |
|---|---|
| `saveEarlyBird` | EarlyBirdConfig, course tab |
| `savePromotionEarlyBird` | EarlyBirdConfig, promotion screen |
| `releaseEarlyBirdFromPromotion` | EarlyBirdConfig, clears `promotion_id` |
| `deletePromotionEarlyBird` | EarlyBirdConfig, removes the row |
| `createCoursePromoLink` / `updateCoursePromoLink` / `deleteCoursePromoLink` / `reorderCoursePromoLinks` | CoursePromoLink |

## Why it matters — measured, not hypothetical

Until the commit that raised this ticket, `saveEarlyBird` was a blind upsert
filtered on `{ course_id }` alone with `promotion_id` inside the `$set`. Saving
an Early Bird for a course another promotion already held **replaced** that
promotion's row — owner, label, price, deadline and schedule — with no error and
no confirmation.

The overwrite is now impossible. But **the historic ones are unrecoverable, and
the reason is this ticket**: nothing recorded them. `timestamps: true` bumped
`updatedAt` and that is the entire residue; it does not say who wrote, what was
replaced, or that a replacement happened at all. There is no way to enumerate
which courses lost an Early Bird this way, or to which promotion.

That is the general shape of the gap: making a defect impossible and being able
to see that it happened are different properties, and only the first was in
scope for that round.

## Why it was not done then

Two reasons, both stated at the time rather than discovered later:

1. **Separate concerns.** Closing the overwrite is a change to one writer.
   Sweeping a file into the audit trail is a change to what every export in it
   must do, plus its `SWEPT_FILES` entry, plus the `(menu, entity)` contract
   each recorded row has to satisfy.
2. **That round already touched shared test infrastructure** (`test/fakeDb.mjs`,
   on which ten test files depend). Adding a second broad change on top would
   have made a regression in either hard to attribute.

## What doing it involves

- Add `src/lib/actions/course-promos.js` to `SWEPT_FILES`.
- Give every mutating export a `recordAdminAction` call. The menu is `courses`
  for the course-tab path; the promotion-side exports are the first case in this
  file where the menu is arguably `promotions`, and that needs a ruling rather
  than a guess — `test/fs/auditCoverage` checks the recorded menu against the
  `requireAdmin` literal in the same function, and those two entry points hold
  **different keys on purpose**.
- Decide the entity key space. `admin/courses/[courseId]/page.jsx` already reads
  `courses|early_bird` rows keyed by the course **code**, so that name and key
  space exist and should be reused rather than reinvented.
- Bump `MUTATING_EXPORT_COUNT` / the depth-0 pin only if the export set changes;
  sweeping alone does not move either number.

## Related

- `test/fs/auditCoverage.test.mjs` — the count ledger, and the note above
  `MUTATING_EXPORT_COUNT` recording that this file is deliberately unswept.
- `docs/admin-audit-log-plan.md` — the wider plan this belongs to.
