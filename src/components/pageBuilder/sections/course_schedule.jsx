import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveDerivedRoundBadge,
  resolveScheduleBadge,
} from "@/lib/scheduleStatus";
import { formatRoundDays } from "@/lib/schedule/roundDateLabel";
import { scheduleRegistrationHref } from "@/lib/schedule/scheduleRegistrationHref";
import { chooseRounds } from "@/lib/pageBuilder/chosenRounds";
import { siteTodayKey } from "@/lib/articlePublishTime";

/**
 * course_schedule — upcoming sessions for one course (2C.2b). Server component;
 * it does NOT fetch. The schedules are resolved ABOVE the renderer
 * (resolveSectionData: code→ObjectId→/schedules) and injected as `data`, so the
 * ONE SectionRenderer serves both the public page and the client canvas.
 *
 * canvas-FAKE (see docs/page-builder-status.md §2C.2b): the row set is a function
 * of RENDER time — upstream returns only upcoming, open/nearly_full sessions, so
 * what publishes depends on when the page was last rendered. NOT on when it is
 * viewed: both public surfaces are `revalidate = 3600`, so the rows can be an
 * hour old and every visitor inside that window is served the same ones (round
 * 63 §A.2). The editor's sample label said "when the visitor opens the page" and
 * was corrected in the same pass that corrected this comment. The canvas can only
 * show an edit-time SAMPLE; the editor LABELS it as such. This component just
 * draws what it is handed.
 *
 * No new client module on the public route: this is server-rendered with CI
 * tokens (§7) — deliberately NOT the `'use client'` ScheduleCard, which would add
 * a client bundle to /[...slug]. Fails closed: an empty resolved set (no course,
 * no upcoming sessions, or an unresolved code) renders nothing; the editor warns.
 */

const TYPE_TH = {
  classroom: "ในห้องเรียน",
  hybrid: "ไฮบริด",
  online: "ออนไลน์",
};

/**
 * A round's dates, adapted to this section's null-means-unknown contract.
 *
 * ── THE LOGIC IS NO LONGER LOCAL, AND THE OLD COMMENT WAS THE WARNING ───────
 * This used to be a hand-rolled range with its own `MONTH_TH` array, explaining
 * itself as "mirrors the schedule page's own label logic; kept local because
 * that one is a client component". It did not mirror it — it had drifted, and
 * both were wrong the same way: first-date-to-last-date rendered a round on
 * 8, 10 and 12 ต.ค. as `8-12 ต.ค.`, three days advertised as five.
 *
 * `lib/schedule/roundDateLabel` is a PURE module — no React, no next/*, no db —
 * so the server/client split that justified the copy does not apply to it. The
 * reason the copy existed is gone; the copy goes with it.
 *
 * `showMonth: true` and no year, which is what this section rendered before.
 * The month/year come from Intl, so the eighth `MONTH_TH` array in src/ goes
 * too.
 *
 * @returns {string|null} null when there is no usable date, so the caller's
 *   `range ?? 'ยังไม่ระบุวันที่'` fallback keeps working unchanged.
 */
function formatRange(dates) {
  const label = formatRoundDays(dates, { showMonth: true });
  return label === "-" ? null : label;
}

/**
 * ── THE LOCAL `scheduleHref` IS GONE — round 81 ─────────────────────────────
 *
 * This file used to build the wizard URL itself, in four lines byte-identical
 * to `lib/schedule/scheduleRegistrationHref` except for the one line that
 * matters: it had no `full` refusal. So a sold-out round drew the red เต็ม chip
 * INSIDE a working registration link — the chip saying "no seats" and the row
 * behaving as though there were. Round 64 saw it while building chosen-rounds
 * mode and left it for its own round, because no stored section resolves to a
 * full round and a byte-identity proof would have gone green over a real
 * behaviour change. Re-measured for round 81
 * (scripts/_measure-round81-stored.mjs): two PUBLISHED sections, on MSE-L1 and
 * VIBE-CODE-L2, plus their drafts and six version snapshots — every one of them
 * in `upcoming` mode, none naming a round. So the proof for this change had to
 * be a constructed full round, which is why it is its own round and not a line
 * inside round 64's commit 3.
 *
 * DELETED rather than patched. Copying the `full` line across would have left
 * two implementations of one rule and made this the fifth surface that has to
 * be remembered when the rule next changes — which is the shape that produced
 * this defect. The builder is a pure module (its only import is
 * `normalizeScheduleStatus`), so there was never anything to stop this server
 * component calling it; the copy predates the builder's extraction rather than
 * answering any constraint. Four call sites now, one implementation:
 * /schedule's table cell and mobile card, /search's schedule row,
 * training-course's catalog card, and this section.
 * test/fs/registrationEntryPointClassParam pins the delegation per file and
 * refuses a second copy of the template.
 *
 * WHY IT WAS NEVER SEEN IN PRODUCTION, AND WHY THAT IS NOT A REASON TO WAIT.
 * `resolveSectionData` calls `listSchedulesByCourse` with no `status`, so
 * upstream auto-filters to the registerable statuses and a `full` round does not
 * currently reach this renderer at all. Every sibling surface has ALREADY
 * widened its own fetch to PUBLIC_SCHEDULE_STATUSES so a sold-out round can be
 * shown; the day this one follows, the defect ships with it and looks like a
 * one-line fetch change. The builder makes that day safe in advance.
 *
 * The chip vocabulary is untouched: `lib/scheduleStatus` remains the single
 * source for wording and colour, and `full.action` is still 'เต็ม'. What
 * changed is only whether the row is a link. Measured over all five row states,
 * pre-change out of a worktree and post-change from the working tree, by
 * scripts/_measure-round81-five-states.mjs: `full` went anchored→not, and
 * `open` / `nearly_full` / `elapsed` / `missing` came back byte-identical,
 * chips included.
 */

/**
 * ── ROUND 64 — TWO MODES, AND WHY THE CHOICE IS MADE HERE ──────────────────
 *
 * `chooseRounds` decides which rows go on the page: every fetched round under
 * the unchanged `upcoming` mode, or exactly the ones the author named, in the
 * order they named them, under `manual`. Its header argues why the filter is in
 * a renderer rather than in `assembleResolved` where `limit` lives — the
 * editor's picker reads the same resolved map and would be blinded by a
 * narrowing applied upstream of it.
 *
 * `source` is absent on every stored section, so every stored section takes the
 * `upcoming` branch and draws exactly what it drew before. Measured, not
 * asserted: scripts/_measure-round64-byte-identical.mjs renders each stored
 * shape through the pre-change component out of git and reports zero differing,
 * with a control that makes the same comparison report a difference.
 *
 * ── A CHOSEN ROUND IS NEVER SILENTLY DROPPED ───────────────────────────────
 * A round the author picked that upstream no longer returns still gets a row.
 * The alternative — quietly shortening the page — is the failure rounds 46 §D.1
 * and 48 §A ruled against for stale course codes: an author who can SEE the dead
 * row can remove it; one whose page got shorter cannot.
 *
 * Such a row is drawn from what the site last saw, and it may say only what that
 * honestly supports: the dates and the delivery type. NOT the status, which is
 * the seats-left signal and cannot be true about a round nobody can fetch, and
 * NOT a link, because `/registration/public?class=<id>` for an id upstream does
 * not have renders a blank step 1 — the defect lib/api/schedules.js documents at
 * length. The two greys are told apart rather than merged (`จบไปแล้ว` vs
 * `ไม่พบรอบนี้`) because they are different claims; lib/scheduleStatus.js carries
 * that argument beside the words.
 *
 * The section is UNREACHABLE in `manual` mode from the editor today — the mode
 * switch and the round picker are the next step. Inert is the correct state for
 * a mechanism whose control has not shipped.
 */
export function CourseScheduleSection({ content, data }) {
  const rows = chooseRounds(data, content, siteTodayKey());
  if (!rows.length) return null;
  const code = String(content?.courseId ?? "");

  return (
    <div className="overflow-hidden rounded-9e-md border border-[var(--surface-border)]">
      <ul className="divide-y divide-[var(--surface-border)]">
        {rows.map((entry, i) => {
          const s = entry.live;
          const isLive = entry.state === "live";
          const range = formatRange(entry.dates);
          // A derived state has no upstream status to resolve, and must not be
          // handed one: `resolveScheduleBadge` is for values that CAME FROM
          // MSDB. The two functions are separate for exactly this call site.
          const status = isLive
            ? resolveScheduleBadge(s?.status)
            : resolveDerivedRoundBadge(entry.state);
          const typeLabel = TYPE_TH[entry.type] ?? null;
          // `isLive &&` still guards the two DERIVED states — they have no
          // upstream row to hand the builder, and the builder is about a round
          // that EXISTS. The builder decides the remaining question, which is
          // whether a round that exists is registerable; see the note above it.
          const href = isLive ? scheduleRegistrationHref(s, code) : null;

          const row = (
            <div className="flex items-center gap-3 px-4 py-3">
              {/*
                ORNAMENT — follows the section's accent, via --pb-accent-fill.
                It used to name the DEFAULT accent's own colour token directly,
                which is the subtlest form of the dead-control defect: the icon
                looked accented, so nothing seemed wrong, and a section whose
                author had chosen a different accent silently kept the default.
                Same swap, same variable, same reason as checklist's tick and
                stat_card's / icon_card's icons — ornament takes `fill`.

                At the default accent this repaints nothing: the token and
                --pb-accent-fill both resolve to the same colour, measured in
                Chrome rather than argued from the class string (round 23).
              */}
              <CalendarDays
                className="h-4 w-4 shrink-0 text-[var(--pb-accent-fill)]"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                {/*
                  The two negative rules the nine existing consumers hold to,
                  and why nothing else in this row moved:

                  BODY COPY IS NEVER ACCENTED. The date range is this row's
                  primary text and the type is its secondary text; both keep
                  their surface text tokens.

                  SEMANTIC COLOUR IS NEVER OVERRIDDEN. resolveScheduleBadge
                  encodes open / nearly-full. Repainting it with a chosen accent
                  would make the badge lie about how full a round is.
                */}
                <span className="block text-sm font-bold text-[var(--text-primary)]">
                  {range ?? "ยังไม่ระบุวันที่"}
                </span>
                {typeLabel && (
                  <span className="block text-xs text-[var(--text-secondary)]">
                    {typeLabel}
                  </span>
                )}
              </span>
              {/* Omitted entirely when the status is missing/blank. */}
              {status && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                    status.soft,
                  )}
                >
                  {status.action}
                </span>
              )}
            </div>
          );

          return (
            // The index rides along because an author may name the same round
            // twice — deliberately not de-duplicated, since a repeat is a
            // mistake the EDITOR should say out loud rather than one the page
            // absorbs silently. Two rows with one key is a React warning, and
            // this is the row list where that can now happen.
            <li key={`${entry.id || "row"}-${i}`}>
              {/*
                The hover tint is DELIBERATELY not accented, and it is the one
                judgement call here. It is a pale tint off the signature scale,
                not the default accent's token, so the defect above does not
                describe it — the author never had a reason to expect it to
                follow their choice. And none of the nine existing consumers
                accents a hover surface: the closest precedent, icon_card's
                chip, is a resting background, not a state. Accenting a hover
                would be a fourth role invented here rather than a pattern
                followed, so it stays for a round that argues for it on its own.
              */}
              {href ? (
                <a
                  href={href}
                  className="block transition-colors hover:bg-9e-signature-900"
                >
                  {row}
                </a>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
