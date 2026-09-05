# A bundle can stop accepting registrations and nobody is told

**Filed** 2026-09-05, during the bundle-registration round (round B).
**Not built in that round**, by instruction — this is the report of a gap, not a
deferred feature.

## What happens

`resolveBundleRequest` (`src/lib/registration/bundleRequest.js`) refuses a
bundle quotation request for three reasons that all speak to the visitor as
*"ขณะนี้ยังไม่สามารถรับลงทะเบียนแพ็กเกจนี้ได้"*:

| reason | cause |
|---|---|
| `page_not_public` | the page was unpublished, expired, or is scheduled for later |
| `section_disabled` | the section was toggled off |
| `unresolved_items` | an item's course no longer resolves, or its round has elapsed / been withdrawn upstream, or the author never chose one |

The third is the one that arrives **without anybody doing anything**. Round 63
measured a 51-day median from authoring a round to its first training day, and
found 39 of 88 rounds had their dates mutated in place. A round rolls off the
upstream feed the morning its first day arrives — `excludeStartedRounds` is
unconditional — so a bundle authored in July stops being registerable in
October with no edit, no deploy and no event.

## How an author would find out today

**Partly, and only if they go looking.** The honest answer, stated as three
separate facts:

1. **The page itself shows it.** The bundle keeps drawing the item, marked amber
   — `ไม่พบคอร์สนี้แล้ว` for a dead course code, or the derived
   `จบไปแล้ว` / `ไม่พบรอบนี้` badge for a round. Anyone who opens the public
   page sees something is wrong with that row.
2. **The editor warns, at the field.** Opening the page in the builder shows
   `ไม่พบคอร์สรหัสนี้ — …` in red on the item, and the round picker says so too.
3. **Nothing connects either of those to "and therefore this bundle is refusing
   registrations".** No admin screen lists it. No count changes — a bundle that
   takes no requests simply produces no rows, and zero rows is
   indistinguishable from a promotion nobody wanted. No email, no dashboard
   tile, no publish-time refusal (`publishBlockers` gates the *price pair*, not
   item resolvability, and a bundle that was fine at publish time decays
   afterwards anyway).

So: an author who happens to open the page sees an amber row and can guess. An
author who does not, learns from the sales team asking why the leads stopped.
**That is the defect.** The signal exists; the consequence is invisible; and the
consequence is the part that costs money.

Round B narrowed the gap by one honest sentence rather than building anything:
the editor's two item warnings now name the new consequence
(`…และแพ็กเกจนี้จะไม่รับลงทะเบียน`) instead of only describing the card. That
makes fact 2 tell the truth. It does **not** address fact 3, which is what this
ticket is for.

## Why it was not built here

The round's instruction was explicit: report the gap, do not build a
notification. It is also the right call on the merits — a notification needs a
decision about **who** is told (the page's author? the marketing tier? the sales
inbox?), **when** (at publish, on a schedule, on the first refused request?),
and **how often**, and none of those follow from anything the codebase already
does. Guessing them inside a round about a public form would ship a mechanism
nobody asked for, in a repo whose standing habit is removing exactly that.

## What a fix would plausibly look like

Cheapest first; each is a separate decision:

1. **A refused-request counter.** The refusal already computes `unresolved` with
   an index and a reason per item. Nothing records it. One row per refusal, read
   by an admin screen, turns "the leads stopped" into "this bundle refused 14
   requests since Tuesday" — and it is the only option that measures the actual
   harm rather than predicting it.
2. **A promotion-page health strip** in the admin pages list: for each published
   page carrying a `promotion_bundle`, whether every bundle on it is currently
   registerable. Re-runs the same pure guard the form runs; no new rule.
3. **A publish-time blocker**, alongside the inverted-price one. Rejected on
   sight for the reason `publishBlockers`' own header gives about decay: the
   state this ticket is about arises *after* publish, so a publish gate cannot
   see it and would only annoy an author at the one moment the bundle is fine.

Option 1 is the recommendation. It is additive, it needs no judgement about
recipients, and it is the only one that can say whether this ever actually
happened.
