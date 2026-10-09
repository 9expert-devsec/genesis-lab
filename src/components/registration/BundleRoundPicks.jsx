'use client';

import { roundChoices, prunePicks } from '@/lib/pageBuilder/bundleRoundChoice';
import { offeredRoundsOf } from '@/lib/pageBuilder/chosenRounds';
import { PICK_REASON_TEXT } from '@/lib/pageBuilder/bundleRegistration';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The ONE label for an offered round: live dates, then the
// stored snapshot, then a Thai sentence — never a raw id.
import { bundleRoundLabel } from '@/lib/pageBuilder/bundleRegistration';
// ADDED beside the statement above rather than folded into it. THE SHARED
// PICKER — the career-path registration's course card and round chip, which
// this block used to answer with a <select>.
import { RoundPickCourseCard, RoundPickChip } from '@/components/registration/RoundPickCard';
import { formatThaiDate } from '@/lib/promotions/promotionDateLabel';

/**
 * ── ONE ROUND PER COURSE, PICKED BY THE APPLICANT ──────────────────────────
 *
 * ── IT IS CHIPS NOW, AND THE DROPDOWNS ARE NOT COMING BACK ────────────────
 * This was a `<select>` per course with every offered round as an `<option>`,
 * each disabled option carrying its Thai reason inside its own label
 * (`12-13 พ.ย. 69 — เต็ม`). Three things were wrong with it and only the third
 * is cosmetic:
 *
 *   · THE CHOICES WERE HIDDEN. A closed dropdown shows one line, so an
 *     applicant could not see what dates a package offered without opening a
 *     control per course — on the one screen whose whole purpose is comparing
 *     them.
 *   · THE REASON WAS IN THE LABEL. An option's text is the only place a
 *     `<select>` can carry anything, so the refusal had to be appended to the
 *     date, and a row then reads as two facts joined by an em dash with
 *     nothing saying which is which.
 *   · IT WAS A SECOND CONTROL FOR A DECISION THIS SITE ALREADY HAS ONE FOR.
 *     The career-path registration picks rounds with chips. Two screens, two
 *     controls, no way to compare them.
 *
 * So it reads `components/registration/RoundPickCard` — the career-path card
 * and chip, moved there unchanged — and the reason moves off the label: a
 * non-pickable chip is greyed, is not selectable, and carries its Thai reason
 * as `sr-only` text and a tooltip. No visible status word, which is the rule
 * the public bundle card already follows.
 *
 * ── IT RECOMPUTES WHAT THE SERVER WILL, RATHER THAN BEING TOLD ────────────
 * The options and their disabled reasons come from `roundChoices` called HERE,
 * in the browser, over the same stored items and the same live status map the
 * server will use. The alternative — having the server precompute a flat list
 * of options and ship it — looks tidier and is worse: the sequence rules make
 * pickability depend on the picks MADE SO FAR, so a precomputed list goes stale
 * the moment the applicant chooses anything, and the component would need the
 * rules anyway to know what to grey out next.
 *
 * This is only safe because the core is pure. `bundleRoundChoice` and
 * `chosenRounds` have no I/O, no clock and no `next/*` — `today` arrives as a
 * prop from `siteTodayKey()` on the server, which is also what keeps the two
 * sides agreeing about what day it is in Bangkok rather than trusting the
 * visitor's device clock.
 *
 * The server still re-validates every pick at submit. This component's job is
 * to stop an applicant reaching a refusal, not to be trusted.
 *
 * ── WHY `liveStatusById` CROSSES TO THE CLIENT ───────────────────────────
 * It is `{ roundId: { status, dates } }` for the rounds this one bundle offers
 * — a handful of entries. All of it is already on the page: the dates are
 * rendered as the chip labels and the status decides what is greyed out. So
 * nothing is disclosed that the markup does not already say, and shipping it is
 * what lets the sequence rules re-run without a round trip per pick.
 */

/**
 * The human label for one offered round.
 *
 * This had its own copy of the fallback chain and ended it at
 * `String(round.id)` — so an applicant could be offered a raw ObjectId as a
 * date, the same defect the editor had. It now calls the shared helper,
 * which ends at a Thai sentence instead.
 */
const roundLabel = (round, live) => bundleRoundLabel(round, live).text;

/** The delivery type of an offered round: live first, then the snapshot. */
const roundType = (round, live) =>
  String(live?.type ?? round?.snapshot?.type ?? round?.type ?? '').trim();

export function BundleRoundPicks({
  items,
  sequential = false,
  liveStatusById,
  today,
  picks,
  onChange,
  cleared = [],
  /** Per-item reasons the SERVER refused, keyed by itemId. From a 409. */
  serverErrors = null,
  courseTitleByItemId = null,
}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  const choices = roundChoices({ items: list, sequential, liveStatusById, picks, today });

  /** The name a course is called on screen, falling back to its code. */
  const titleOf = (item) => {
    const itemId = String(item?.id ?? '').trim();
    return courseTitleByItemId?.[itemId] || String(item?.courseId ?? '').trim();
  };

  /**
   * Choosing a round can invalidate a LATER one (a sequential chain whose
   * middle moved). `prunePicks` decides which, so the applicant is told rather
   * than finding a pick silently gone — and the pruning runs over the picks as
   * they would be AFTER this change, never over what is on screen now.
   *
   * CHOOSING THE ROUND ALREADY CHOSEN CLEARS IT. A chip is a toggle and a
   * `<select>` was not: with no placeholder row left to return to, an applicant
   * who picked the wrong course's round would otherwise have no way to undo it.
   */
  const choose = (itemId, roundId) => {
    const next = { ...picks, [itemId]: roundId };
    if (!roundId || String(picks?.[itemId] ?? '') === String(roundId)) delete next[itemId];
    const pruned = prunePicks({ items: list, sequential, liveStatusById, picks: next, today });
    onChange(pruned.picks, pruned.cleared);
  };

  return (
    <div data-testid="bundle-picks" className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-9e-navy dark:text-white">เลือกรอบอบรมของแต่ละหลักสูตร</h3>
        {sequential && (
          <p data-testid="bundle-picks-sequential-note" className="mt-1 text-xs text-9e-slate-dp-50">
            เลือกรอบตามลำดับ — รอบของหลักสูตรถัดไปต้องเริ่มหลังหลักสูตรก่อนหน้าจบ
          </p>
        )}
      </div>

      {list.map((item, i) => {
        const itemId = String(item?.id ?? '').trim();
        const row = choices[i];
        const offered = offeredRoundsOf(item);
        const picked = String(picks?.[itemId] ?? '');
        const title = titleOf(item);
        const wasCleared = cleared.includes(itemId);
        const serverReason = serverErrors?.[itemId] ?? null;
        const locked = row?.locked === true;

        /**
         * ── THE LOCK LINE NAMES THE COURSE, NOT "THE PREVIOUS ONE" ─────────
         * `PICK_REASON_TEXT.previous_not_picked` is the shared vocabulary and
         * says ต้องเลือกรอบของหลักสูตรก่อนหน้าก่อน — true, and on a card that
         * already carries a number it is the one sentence an applicant has to
         * count backwards to act on. The career-path picker names the course
         * instead, and this follows it: `กรุณาเลือก <course> ก่อน`.
         *
         * The shared reason word is NOT dropped — it still reaches the greyed
         * chips as their tooltip, and it is still what the SERVER's 409 is
         * worded with, so the vocabulary has a reader either way.
         *
         * Under `sequential` the course before this one is the previous ITEM in
         * the author's order, which is the whole of the rule — there is no
         * prerequisite graph here as there is in a career path.
         */
        const prevTitle = i > 0 ? titleOf(list[i - 1]) : '';
        const lockReason = locked
          ? (prevTitle ? `กรุณาเลือก ${prevTitle} ก่อน` : PICK_REASON_TEXT.previous_not_picked)
          : '';

        return (
          <RoundPickCourseCard
            key={itemId || `item-${i}`}
            testId="bundle-pick-row"
            dataAttrs={{ 'data-item-id': itemId }}
            name={sequential ? `${i + 1}. ${title}` : title}
            code={String(item?.courseId ?? '').trim()}
            lockReason={lockReason}
            hasRounds={offered.length > 0}
            emptyLabel="ยังไม่มีรอบเปิดรับสมัคร"
            invalid={Boolean(serverReason)}
            notices={
              <>
                {/*
                  The deadline of the round actually PICKED. Shown after the
                  choice rather than per chip, because a chip carrying both its
                  date and its deadline reads as two dates and the applicant
                  cannot tell which one they are choosing.
                */}
                {picked && (() => {
                  const opt = row?.options?.find((o) => o.roundId === picked);
                  return opt?.pickable && opt.deadline ? (
                    <p data-testid="bundle-pick-deadline" className="mt-2 text-xs text-9e-slate-dp-50">
                      ยืนยันรอบนี้ได้ถึง {formatThaiDate(opt.deadline) ?? opt.deadline}
                    </p>
                  ) : null;
                })()}

                {/*
                  NO SECOND LOCK LINE. The `<p data-testid="bundle-pick-locked">`
                  that used to sit here said the shared reason word under a
                  disabled <select>; the card above now carries the lock line
                  itself, naming the course to pick first, and a screen reader
                  reading both would hear the same refusal twice in narrower and
                  then broader terms. The card still reports `data-locked="yes"`,
                  so the state is pinnable without an element drawn for a test.
                */}
                {wasCleared && (
                  <p data-testid="bundle-pick-cleared" className="mt-2 text-xs font-bold text-amber-700">
                    รอบที่เลือกไว้ใช้ร่วมกับหลักสูตรก่อนหน้าไม่ได้ — กรุณาเลือกรอบใหม่
                  </p>
                )}

                {serverReason && (
                  <p data-testid="bundle-pick-server-error" className="mt-2 text-xs font-bold text-red-600">
                    {PICK_REASON_TEXT[serverReason] ?? 'เลือกรอบนี้ไม่ได้แล้ว — กรุณาเลือกรอบใหม่'}
                  </p>
                )}
              </>
            }
          >
            {/*
              EVERY OFFERED ROUND IS A CHIP, pickable or not. Removing the ones
              that cannot be chosen would leave an applicant wondering whether
              the date they remember from the card still exists — the card lists
              every round, so this step has to account for every round.
            */}
            {offered.map((round) => {
              const id = String(round?.id ?? '');
              const opt = row?.options?.find((o) => o.roundId === id) ?? null;
              const live = liveStatusById?.[id] ?? null;
              const pickable = opt?.pickable === true;
              const reason = opt?.reason ?? 'closed';
              const reasonText = PICK_REASON_TEXT[reason] ?? PICK_REASON_TEXT.closed;
              return (
                <RoundPickChip
                  key={id}
                  roundId={id}
                  dateLabel={roundLabel(round, live)}
                  type={roundType(round, live)}
                  selected={picked === id}
                  enabled={pickable}
                  /*
                    A LOCKED COURSE'S CHIPS SAY THE LOCK, not each round's own
                    reason: the card's lock line is already on screen naming the
                    course to pick first, and a chip repeating the round-level
                    word under it would be a second, narrower answer to a
                    question the applicant cannot act on yet. Every other
                    refusal is the CHIP's own fact and travels with the chip.
                  */
                  title={locked ? lockReason : pickable ? undefined : reasonText}
                  srReason={locked || pickable ? '' : reasonText}
                  onClick={() => choose(itemId, id)}
                />
              );
            })}
          </RoundPickCourseCard>
        );
      })}
    </div>
  );
}

/**
 * The picks a bundle starts with: a course offering exactly ONE pickable round
 * is preselected.
 *
 * ── PRESELECTED, NOT HIDDEN ──────────────────────────────────────────────
 * The chips stay visible for such a course. Hiding them would mean the review
 * step showed a round the applicant was never shown choosing, and a
 * single-round course is also the case where a stale page is most likely to be
 * wrong — if that one round has filled, the applicant must see it greyed out
 * rather than find the choice already made for them.
 *
 * ── THE CAREER-PATH PICKER DOES NOT DO THIS, AND THE BUNDLE STILL DOES ────
 * Measured rather than assumed: career-path's Step1Courses has no preselection
 * of any kind, so adopting its CONTROL raised the question of whether to adopt
 * its behaviour here too. It is deliberately NOT adopted, because the two
 * flows differ in the fact the rule turns on — the bundle's server DERIVES a
 * missing pick for a single-round course (see the route's
 * `if (offered.length === 1)` branch, pinned by bundlePicksContract), so a
 * bundle whose every course offers one round is submittable with no picks at
 * all. Dropping the preselection would leave the chips blank on a step whose
 * ถัดไป was already enabled, which is the worst of both: nothing chosen on
 * screen and a round chosen on the wire. Career-path has no such derivation.
 *
 * Runs under `sequential` too: it is applied item by item in order, so a
 * preselection for course 2 is only made once course 1 has one, which is the
 * same rule a human picking in order would follow. The result is then pruned,
 * so a preselection that does not fit the chain is dropped rather than left to
 * fail at submit.
 */
export function initialBundlePicks({ items, sequential = false, liveStatusById, today }) {
  const list = Array.isArray(items) ? items : [];
  let picks = {};
  for (let i = 0; i < list.length; i += 1) {
    const itemId = String(list[i]?.id ?? '').trim();
    if (!itemId) continue;
    const row = roundChoices({ items: list, sequential, liveStatusById, picks, today })[i];
    const pickable = (row?.options ?? []).filter((o) => o.pickable);
    if (pickable.length === 1) picks = { ...picks, [itemId]: pickable[0].roundId };
  }
  return prunePicks({ items: list, sequential, liveStatusById, picks, today }).picks;
}
