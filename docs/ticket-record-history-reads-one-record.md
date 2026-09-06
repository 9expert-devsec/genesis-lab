# A bundle request's history is N trails, and RecordHistory reads one

**Filed** 2026-09-06, alongside the round that made a bundle leg's page show the
whole request. **Deliberately not fixed there** — the round labelled the tab
instead, and this is the ticket the label points at.

## The situation

`RecordHistory` takes a single `recordId` and renders that record's audit trail.
A bundle quotation request is **N documents**, one per course, so the audit rows
for it are spread across N `recordId`s — and by ruling they must be: an audit row
keyed on the `requestId` would be filed under a record no screen queries, which
is the phantom-entry hazard `entityForSource` exists to prevent.

So on the request view, the ประวัติการดำเนินการ tab shows the trail of **one
course** while the rest of the page describes the whole request.

## What ships today, and why it is only half an answer

The tab now says whose trail it is:

> บันทึกการดำเนินการของหลักสูตร "<course>" เท่านั้น — หลักสูตรอื่นในแพ็กเกจมีประวัติของตัวเอง

That fixes the dangerous half. Without it, an admin who cannot find an entry
concludes the action never happened, when in fact it is filed against a sibling
course. With it, they know where else to look.

It does not fix the tedious half: to reconstruct what happened to a request they
must open each course in turn and read N feeds. For a status change made through
`updateBundleRequestStatus` — which files one row per leg — that means the same
event appears N times, once on each of N pages, and nowhere as one event.

## Why it was not widened in that round

`RecordHistory` is read by **four other screens**. Changing its reader to accept
several record ids to satisfy one view is how a shared component acquires a
special case, and the next reader of it has to work out which of its two modes
they are in. That is a cost paid by every caller for the benefit of one.

There is a second reason to be careful. The component is a SERVER component that
awaits `auth()` and re-checks `canAccess` before reading. Any widening has to
keep that check meaningful per record rather than per request — a reader handed
a list of ids must not become a way to ask for rows the viewer may not see.

## The shapes available

Stated, not chosen:

1. **Leave it.** The label is the whole fix; reconstructing a request's history
   is a rare enough task to do by hand. Cheapest, and it means the request view
   permanently has one panel that is about something narrower than the page.
2. **Mount N feeds** on the request view, one per course, from the page that
   already knows the legs. No change to the shared component. Costs N audit
   queries per page load and N panels of chrome for what is usually one event.
3. **Widen `RecordHistory` to take several recordIds** and merge by time. The
   honest shape for the reader, and the one that makes "the same event on three
   legs" collapse into something legible — but it touches four other callers and
   the per-record access check.

Option 3 is the one this ticket exists for; options 1 and 2 are recorded so the
decision is made against the alternatives rather than by default.

## What would make this urgent

Nothing today: a bundle request has 2–3 legs and a short history. It becomes
worth doing when a bundle request accumulates enough per-leg events that reading
them separately stops being feasible — status moves, invoice repairs, notes and
deletions all file per-leg rows — or when someone needs to answer "what happened
to this quotation" under time pressure, which is the case the label was written
for and does not solve.
