# TICKET — the Early Bird round dropdown prints dates that do not exist

**Status:** open. **Severity:** live wrong data on an admin screen shipped three
commits ago. **Not** tidy-up.

## What is wrong

`src/app/admin/promotions/[id]/early-bird/_components/PromotionEarlyBirdClient.jsx`
carries its own round-date formatter:

```js
function formatRound(schedule) {
  const dates = [...(schedule?.dates ?? [])].sort();
  if (!dates.length) return schedule?._id ?? '';
  const start = new Date(dates[0]);
  const end = new Date(dates.at(-1));
  ...
  return `${s} – ${end.getDate()} ${MONTHS_TH[end.getMonth()]} ${end.getFullYear() + 543}`;
}
```

It renders **first date to last date as a range**. For a round held on 8, 10 and
12 ต.ค. — three separate days, nothing on the 9th or the 11th — it prints

> **8 ต.ค. 2569 – 12 ต.ค. 2569**

advertising **two training days that do not exist**. The admin choosing which
round to attach an Early Bird price to reads that label and nothing else; the
round's real shape is not on the screen anywhere.

Two further faults in the same twelve lines:

* its own `MONTHS_TH` array — at least the ninth copy of pure locale data in
  `src/`, and the mechanism by which the surfaces that had one drifted apart;
* `+ 543` by hand. `th-TH` renders the Buddhist era natively, so hand-adding the
  offset shifts an already-Buddhist rendering a second time — a class of bug
  that cannot be reviewed by reading the output, because both spellings produce
  the same two digits.

`src/lib/schedule/roundDateLabel.js` exists precisely to retire this. Its own
header names the five formatters it replaced and reproduces this exact `8-12`
failure as the reason. This one was written after it and did not use it.

## Why it is not fixed in the round that found it

The bundle round (promotion_bundle) needed a round picker and this was the
obvious prior art. It was examined, rejected for these reasons, and a new picker
was built on `formatRoundDays` instead — see the header of
`src/components/pageBuilder/editor/RoundPicker.jsx`, which records the decision.

Fixing this file is a **different change with a different proof**: it alters what
an existing, in-use admin screen displays, so it needs its own before/after
measurement against the real rounds that screen shows. Folding it into a round
whose subject was a new section type would have put two changes behind one set
of evidence.

**The proof that the bundle round did not touch it:** no commit in that round
modifies `PromotionEarlyBirdClient.jsx`.

## What the fix is

1. Delete the local `formatRound` and `MONTHS_TH`; call
   `formatRoundDays(dates, { showMonth: true, showYear: true })`.
2. Add the file to `SCHEDULE_SURFACES` in
   `test/fs/scheduleThaiYearSource.test.mjs`, which is the guard that refuses the
   next `+ 543` on a Thai-date surface.
3. Measure before/after over the rounds the screen actually lists. The labels
   **will change** for any round with a gap in it — that is the fix, and it
   should be reported as a changed label rather than as a no-op.
4. `formatDeadline` in the same file also carries `MONTHS_TH` and `+ 543`. It
   formats a single datetime rather than a round, so `formatRoundDays` is not its
   replacement; decide separately whether it moves to an `Intl` formatter or
   stays. Do not leave the array behind for it without saying so.

## Scope note

`RoundPicker.jsx` (the page builder's) is already correct and is not part of this
ticket. The two screens will use one formatter once this lands.
