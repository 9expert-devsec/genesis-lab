'use client';

import { cn } from '@/lib/utils';
import { roundChoices, prunePicks } from '@/lib/pageBuilder/bundleRoundChoice';
import { offeredRoundsOf } from '@/lib/pageBuilder/chosenRounds';
import { PICK_REASON_TEXT } from '@/lib/pageBuilder/bundleRegistration';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The ONE label for an offered round: live dates, then the
// stored snapshot, then a Thai sentence — never a raw id.
import { bundleRoundLabel } from '@/lib/pageBuilder/bundleRegistration';
import { formatThaiDate } from '@/lib/promotions/promotionDateLabel';

/**
 * ── ONE ROUND PER COURSE, PICKED BY THE APPLICANT ──────────────────────────
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
 * rendered as the option labels and the status decides what is greyed out. So
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

  /**
   * Choosing a round can invalidate a LATER one (a sequential chain whose
   * middle moved). `prunePicks` decides which, so the applicant is told rather
   * than finding a pick silently gone — and the pruning runs over the picks as
   * they would be AFTER this change, never over what is on screen now.
   */
  const choose = (itemId, roundId) => {
    const next = { ...picks, [itemId]: roundId };
    if (!roundId) delete next[itemId];
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
        const title = courseTitleByItemId?.[itemId] || String(item?.courseId ?? '').trim();
        const wasCleared = cleared.includes(itemId);
        const serverReason = serverErrors?.[itemId] ?? null;

        return (
          <div
            key={itemId || `item-${i}`}
            data-testid="bundle-pick-row"
            data-item-id={itemId}
            data-locked={row?.locked ? 'yes' : 'no'}
            className={cn(
              'rounded-9e-md border p-4',
              serverReason ? 'border-red-300 bg-red-50' : 'border-[var(--surface-border)]',
            )}
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-9e-navy dark:text-white/90">
                {sequential ? `${i + 1}. ${title}` : title}
              </span>
              {/*
                DISABLED OPTIONS STAY IN THE LIST, each carrying its reason.
                Removing them would leave an applicant wondering whether the
                date they remember from the card still exists — the card lists
                every round, so the form has to account for every round.
              */}
              <select
                data-testid="bundle-pick-select"
                value={picked}
                disabled={row?.locked === true}
                onChange={(e) => choose(itemId, e.target.value)}
                className="w-full rounded-9e-sm border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-9e-navy disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
              >
                <option value="">— เลือกรอบ —</option>
                {offered.map((round) => {
                  const id = String(round?.id ?? '');
                  const opt = row?.options?.find((o) => o.roundId === id) ?? null;
                  const live = liveStatusById?.[id] ?? null;
                  const base = roundLabel(round, live);
                  const reason = opt?.reason ?? 'closed';
                  return (
                    <option
                      key={id}
                      value={id}
                      disabled={!opt?.pickable}
                      data-reason={opt?.pickable ? undefined : reason}
                    >
                      {opt?.pickable
                        ? base
                        : `${base} — ${PICK_REASON_TEXT[reason] ?? PICK_REASON_TEXT.closed}`}
                    </option>
                  );
                })}
              </select>
            </label>

            {/*
              The deadline of the round actually PICKED. Shown after the choice
              rather than per option, because an option line carrying both its
              date and its deadline reads as two dates and the applicant cannot
              tell which one they are choosing.
            */}
            {picked && (() => {
              const opt = row?.options?.find((o) => o.roundId === picked);
              return opt?.pickable && opt.deadline ? (
                <p data-testid="bundle-pick-deadline" className="mt-1 text-xs text-9e-slate-dp-50">
                  ยืนยันรอบนี้ได้ถึง {formatThaiDate(opt.deadline) ?? opt.deadline}
                </p>
              ) : null;
            })()}

            {row?.locked && (
              <p data-testid="bundle-pick-locked" className="mt-1 text-xs text-9e-slate-dp-50">
                {PICK_REASON_TEXT.previous_not_picked}
              </p>
            )}

            {wasCleared && (
              <p data-testid="bundle-pick-cleared" className="mt-1 text-xs font-bold text-amber-700">
                รอบที่เลือกไว้ใช้ร่วมกับหลักสูตรก่อนหน้าไม่ได้ — กรุณาเลือกรอบใหม่
              </p>
            )}

            {serverReason && (
              <p data-testid="bundle-pick-server-error" className="mt-1 text-xs font-bold text-red-600">
                {PICK_REASON_TEXT[serverReason] ?? 'เลือกรอบนี้ไม่ได้แล้ว — กรุณาเลือกรอบใหม่'}
              </p>
            )}
          </div>
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
 * The control stays visible for such a course. Hiding it would mean the review
 * step showed a round the applicant was never shown choosing, and a
 * single-round course is also the case where a stale page is most likely to be
 * wrong — if that one round has filled, the applicant must see it greyed out
 * rather than find the form pre-filled with something the server will refuse.
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
