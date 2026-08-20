'use client';

import { useEffect, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { anchoredMenuPosition } from '@/lib/anchoredMenu';

/**
 * THE ตัวกรอง DISCLOSURE — the date range and the course.
 *
 * ══ THE ROUND-3 CONDITION IS SATISFIED, NOT REVERSED ════════════════════════
 *
 * Round 3 deleted this button deliberately. Its reasoning, from ListPanel's own
 * header, was NOT "we do not want a filter button" — it was:
 *
 *   "The reason is that there is nothing left for it to open. The only filter it
 *    could have disclosed is the status chip row, and that row is gone: the
 *    overview cards above already ARE the status filter... A 79px control that
 *    opens nothing is a dead control."
 *
 * and it named its own condition for coming back:
 *
 *   "If a filter that is NOT a status ever arrives — a course, a custom date
 *    range — the button comes back then, attached to something."
 *
 * BOTH OF THOSE ARRIVED IN ROUND 8. The ruling is met, not overturned, and the
 * distinction matters to the next reader: nobody changed their mind about dead
 * controls, and the button is still forbidden to open onto nothing. The search
 * field gives its width back accordingly — 390 + 8 + 79 rather than the full 477.
 *
 * ══ NATIVE `<details>`, NOT A POPOVER ═══════════════════════════════════════
 *
 * The round-3 note's own proposal. `<summary>` is focusable, toggles on Enter and
 * Space, and is announced with its expanded state, all without a library and
 * without a focus trap to get wrong.
 *
 * ── WHAT IT DOES NOT GIVE FREE, AND WHAT IS DONE ABOUT IT ────────────────
 * `<details>` has NO Esc-to-close. It is added here as one line on the element
 * rather than left as a gap, because a disclosure that swallows Esc while a
 * reader expects it to close is worse than one that never looked closable.
 * It sets `.open` on the DOM node directly — the element owns that state, this
 * component does not, and that is deliberate: see the note on URL state below.
 *
 * ══ NO FILTER LIVES IN `useState` ═══════════════════════════════════════════
 *
 * Every value here is DERIVED FROM PROPS, which come from the URL, on every
 * render. This screen shipped wrong chrome over right data from exactly the other
 * shape — a `useState` seeded from a prop, which then went stale across a
 * navigation — and test/fs/urlFilterNoState enumerates the files this rule binds
 * BY PATH. This file is added to that enumeration in the same commit.
 *
 * The inputs are UNCONTROLLED with `defaultValue` + `key`, exactly as the search
 * box beside them is: in-progress typing is genuinely local, and keying on the
 * applied value is what stops the box disagreeing with the URL after a
 * navigation. `open` is the element's, not React's, so there is no filter state
 * here at all.
 *
 * ══ THE PANEL IS `position: fixed`, AND IT WAS GENUINELY BEING CLIPPED ══════
 *
 * Checked alongside the attendee row menu rather than assumed to share its
 * problem, and the two are NOT the same defect:
 *
 *   · the row menu has no `overflow-hidden` ancestor at all — it was clipped by
 *     the admin shell's scrollport, see OverflowMenu in detailShell;
 *   · THIS one has a real one. The ancestor chain, walked against the render:
 *
 *         div.space-y-[22px] > div.overflow-hidden.rounded-9e-lg   ← ListPanel
 *           > div.h-[66px] > div.w-[477px] > details > div[absolute]
 *
 *     ListPanel's card carries `overflow-hidden` so the table's corners follow
 *     the card's radius — the same reasoning as the accent bar's clip, and it
 *     is CORRECT. A 340px panel dropping out of a 66px header row is clipped
 *     at that card's bottom edge, which is invisible while the table is long
 *     and cuts the panel in half on a short or empty result set. That is the
 *     worst possible shape for it: the state where the reader most needs the
 *     filter is the state where the table has nothing in it.
 *
 * So the clip stays exactly where it is and the panel leaves, by the same
 * mechanism and through the same arithmetic — src/lib/anchoredMenu.js, so
 * there is one flip rule on this screen rather than two that must agree.
 *
 * ── STILL NO REACT STATE, AND THAT IS THE SAME RULING AS `open` ────────────
 * The coordinates are written onto the DOM node in the `toggle` handler, not
 * held in `useState`. The element already owns whether it is open; having React
 * own where it is drawn would put half of one fact on each side of the seam.
 * The no-filter-in-useState rule above is about FILTER VALUES and a pixel
 * offset is not one — but the honest reason there is no state here is that
 * none is needed, not that a loophole was found.
 */

/**
 * THE ACTIVE FILTERS, IN WORDS. Rendered on the SUMMARY, so they are visible
 * WHEN THE PANEL IS CLOSED.
 *
 * ── THE REQUIREMENT THIS MEETS, AND WHY IT IS ON THE SUMMARY ──────────────
 * A filter you cannot see is one you forget you set, and then an empty table
 * reads as lost data rather than as a narrow question. Putting the summary INSIDE
 * the disclosure would have been the obvious mistake: the one state where the
 * reader needs telling is the state where the panel is shut.
 *
 * The swapped-range case is announced HERE rather than silently corrected. The
 * resolver swaps a backwards range instead of returning nothing — see
 * `resolveDateWindow` — and a correction the reader cannot see is still the
 * screen deciding on their behalf.
 */
function activeSummary({ window, course, courseLabel }) {
  const parts = [];

  if (window.custom) {
    const d = (date) => date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    if (window.from && window.to)      parts.push(`${d(window.from)} – ${d(window.to)}`);
    else if (window.from)              parts.push(`ตั้งแต่ ${d(window.from)}`);
    else if (window.to)                parts.push(`ถึง ${d(window.to)}`);
  }
  if (course) parts.push(courseLabel || course);

  return parts;
}

export function FilterPanel({
  window,
  course = '',
  courseOptions = [],
  onApply,
  onClear,
}) {
  const active = activeSummary({
    window,
    course,
    courseLabel: courseOptions.find((o) => o.code === course)?.label,
  });
  const hasActive = active.length > 0;

  /** `YYYY-MM-DD` for a date input, or '' — never a locale string. */
  const inputValue = (date) => {
    if (!date) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  const detailsRef = useRef(null);
  const panelRef = useRef(null);

  /**
   * Put the panel where it fits, reading the summary's box and the panel's own
   * height. A no-op while shut, which is what lets the listeners below be
   * attached ONCE at mount rather than keyed on an `open` this component
   * deliberately does not hold.
   *
   * Measurable while open because `toggle` fires AFTER the element has opened,
   * so the panel is displayed by the time this runs. `scrollHeight` rather than
   * `offsetHeight` for the same reason OverflowMenu uses it: a maxHeight from a
   * previous placement must not pin the next one.
   */
  const place = () => {
    const details = detailsRef.current;
    const panel = panelRef.current;
    if (!details || !panel || !details.open) return;
    const summary = details.querySelector('summary');
    if (!summary) return;
    const next = anchoredMenuPosition({
      trigger: summary.getBoundingClientRect(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      height: panel.scrollHeight,
      // 6px: the old `top-[45px]` less the 39px summary. Measured geometry,
      // carried across rather than harmonised with the menus' 2 and 4.
      gap: 6,
    });
    if (!next) return;
    panel.style.top = next.top == null ? '' : `${next.top}px`;
    panel.style.bottom = next.bottom == null ? '' : `${next.bottom}px`;
    panel.style.right = `${next.right}px`;
    panel.style.maxHeight = `${next.maxHeight}px`;
  };

  /*
   * A fixed panel does not move with the content under it. `capture: true` on
   * the scroll listener because the scroll that moves this header happens on
   * <main>, and a non-capturing window listener never hears it.
   */
  useEffect(() => {
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <details
      ref={detailsRef}
      onToggle={place}
      // NOT `relative` any more: the panel is `fixed` and no longer positions
      // against this box, so leaving it would say the opposite of what is true.
      className="group shrink-0"
      onKeyDown={(e) => {
        // Esc closes. `<details>` does not do this natively — see the header.
        if (e.key === 'Escape' && e.currentTarget.open) {
          e.currentTarget.open = false;
          e.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        className={cn(
          'flex h-[39px] cursor-pointer list-none items-center gap-[6px] rounded-9e-md border px-[10px] text-[13px] font-medium',
          'marker:hidden [&::-webkit-details-marker]:hidden',
          hasActive
            ? 'border-9e-brand/50 text-9e-action'
            : 'border-[var(--surface-border)] text-[var(--text-secondary)] hover:text-9e-action',
        )}
      >
        <SlidersHorizontal aria-hidden="true" className="h-[15px] w-[15px] shrink-0" />
        ตัวกรอง
        {/*
          THE ACTIVE STATE, ON THE CLOSED CONTROL. `title` carries the full text
          for a pointer and the visible chip carries the count, because the
          summary sits in a 79px slot and cannot hold two dates.
        */}
        {hasActive ? (
          <span
            title={active.join(' · ')}
            className="ml-[2px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-9e-action/10 px-[5px] text-[10px] font-bold tabular-nums text-9e-action"
          >
            {active.length}
          </span>
        ) : null}
      </summary>

      {/*
        The offsets are runtime pixels and so are an inline `style`, written by
        `place` above — a class built from a measurement compiles to nothing.
        Everything that can be a literal class still is.
      */}
      <div
        ref={panelRef}
        className="fixed z-40 w-[340px] overflow-y-auto overscroll-contain rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-[14px] shadow-9e-md"
      >
        {/*
          THE SWAP, ANNOUNCED. The resolver corrects a backwards range rather
          than returning nothing; this is where it says so. Without it the panel
          silently shows the reader different dates than they typed.
        */}
        {window.swapped ? (
          <p className="mb-[10px] rounded-9e-sm bg-9e-accent/10 px-[8px] py-[6px] text-[11px] leading-[16px] text-9e-accent">
            วันที่เริ่มต้นอยู่หลังวันที่สิ้นสุด — ระบบสลับให้แล้ว
          </p>
        ) : null}

        <form onSubmit={onApply} className="space-y-[12px]">
          <fieldset className="space-y-[6px]">
            <legend className="text-[11px] font-semibold text-[var(--text-secondary)]">
              วันที่สมัคร
            </legend>
            {/*
              THE FIELD IS NAMED IN THE LEGEND. It filters `createdAt` — the date
              the first column already shows — and NOT the training round's
              dates, which are a label string this data cannot filter on. A
              control labelled วันที่สมัคร that filtered the round is the quiet
              wrongness this screen has shipped before.
            */}
            <div className="flex items-center gap-[8px]">
              <input
                type="date" name="from"
                defaultValue={inputValue(window.from)} key={`from-${inputValue(window.from)}`}
                aria-label="ตั้งแต่วันที่"
                className="h-[34px] w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-[8px] text-[12px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand"
              />
              <span className="shrink-0 text-[12px] text-[var(--text-muted)]">–</span>
              <input
                type="date" name="to"
                defaultValue={inputValue(window.to)} key={`to-${inputValue(window.to)}`}
                aria-label="ถึงวันที่"
                className="h-[34px] w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-[8px] text-[12px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand"
              />
            </div>
            {/*
              BOTH ENDS ARE OPTIONAL, and the hint says so — otherwise a reader
              with only one bound in mind types a second one they do not want.
            */}
            <p className="text-[11px] leading-[15px] text-[var(--text-muted)]">
              เว้นว่างช่องใดช่องหนึ่งได้ — จะกรองแบบเปิดปลาย
            </p>
          </fieldset>

          <div className="space-y-[6px]">
            <label htmlFor="reg-filter-course" className="block text-[11px] font-semibold text-[var(--text-secondary)]">
              หลักสูตร
            </label>
            {/*
              SINGLE-SELECT, and that is the smaller build AND the right one: the
              question this screen is asked is "which of these records are for
              course X", not "for any of these five". A multi-select would need
              its own chip list, its own clear-one control and a URL shape for a
              set, for a question nobody has asked.

              THE OPTIONS COME FROM THE REGISTRATIONS, not from the catalogue —
              see `getRegistrationCourseOptions`. Nothing in the table can hold a
              course this list cannot select.
            */}
            <select
              id="reg-filter-course" name="course"
              defaultValue={course} key={`course-${course}`}
              className="h-[34px] w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-[8px] text-[12px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand"
            >
              <option value="">ทุกหลักสูตร</option>
              {courseOptions.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-[8px] pt-[2px]">
            {/*
              CLEAR IS ONLY OFFERED WHEN THERE IS SOMETHING TO CLEAR. A live
              control that does nothing is the dead control round 3 removed, one
              size down.

              ── AND THERE IS NO SPACER ELEMENT WHEN IT IS ABSENT ────────────
              The first draft rendered `<span />` in the else branch to hold the
              layout, and the empty-element guard caught it on the very next run.
              An empty `<span>` is invisible to every text assertion, which is
              why that guard reads ELEMENTS — and it was right: `ml-auto` on the
              submit does the same job with no element at all.
            */}
            {hasActive ? (
              <button
                type="button" onClick={onClear}
                className="inline-flex items-center gap-[4px] text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-9e-accent"
              >
                <X aria-hidden="true" className="h-[12px] w-[12px]" />
                ล้างตัวกรอง
              </button>
            ) : null}
            <button
              type="submit"
              className="ml-auto inline-flex h-[30px] items-center rounded-9e-md bg-9e-navy px-[14px] text-[11px] font-semibold text-9e-ice transition-opacity hover:opacity-90"
            >
              ใช้ตัวกรอง
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}
