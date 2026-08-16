'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * THE LIST PANEL — the bordered card the table sits in, and the two rows that
 * bracket it.
 *
 * ── WHY THIS IS A SHELL AND NOT PART OF EITHER TABLE ────────────────────────
 * The public and in-house bodies are deliberately separate components (see the
 * header of InhouseTable for the reasoning: nine columns against seven, and only
 * a few meaning the same thing). What is NOT different is the frame — a 1px
 * card, a 66px header carrying the count and the search box, and a 54px footer
 * carrying the range text and the pager. Copying that frame into both tables
 * would give the screen two chances to disagree with itself about its own
 * chrome, which is the shape this whole round keeps removing.
 *
 * So: the frame is shared, the COLUMNS are not, and `children` is the only seam.
 * A table dropped in here cannot influence the header or the footer, and the
 * shell cannot render a cell.
 *
 * ── THE ตัวกรอง BUTTON FROM THE MOCKUP IS DELIBERATELY ABSENT ───────────────
 * The design's header right-group is a 390px search field, an 8px gap and a 79px
 * filter button. The button is not built and the search field takes the whole
 * 477px instead.
 *
 * The reason is that there is nothing left for it to open. The only filter it
 * could have disclosed is the status chip row, and that row is gone: the
 * overview cards above already ARE the status filter — same statuses, same
 * targets, same selected state, with ทั้งหมด as the reset — and the section's
 * own sub-line says so in words. A 79px control that opens nothing is a dead
 * control, which is precisely the defect this suite's element-level assertions
 * were written to catch after it slipped through text matching twice.
 *
 * If a filter that is NOT a status ever arrives — a course, a custom date range
 * — the button comes back then, attached to something.
 *
 * ── THE GEOMETRY IS ABSOLUTE, THE COLUMNS ARE NOT ──────────────────────────
 * Every measurement in this file is a fixed px value written out as a complete
 * Tailwind class, because vertical rhythm and component-internal padding do not
 * reflow. Only the table's COLUMN widths are proportional, and those live with
 * the tables.
 */

/**
 * "แสดง 1–20 จาก 39 รายการ".
 *
 * Derived from the page window rather than from `items.length`, EXCEPT for the
 * upper bound, which is clamped to the total. A last page holding 19 of 20 rows
 * would otherwise claim to be showing a row that is not there — and this footer
 * is the one place on the screen that states a count the reader cannot verify by
 * looking, so it is the one that has to be right.
 *
 * Returns null for an empty list: "แสดง 1–0 จาก 0" is worse than saying nothing,
 * and the table's own empty state is already on screen saying it properly.
 */
function windowLabel({ page, pageSize, total }) {
  if (!total) return null;
  const first = (Math.max(1, page) - 1) * pageSize + 1;
  const last  = Math.min(total, first + pageSize - 1);
  if (first > total) return null;
  return `แสดง ${first}–${last} จาก ${total} รายการ`;
}

export function ListPanel({
  total = 0,
  subLine = '',
  q = '',
  placeholder = '',
  onSearch,
  page = 1,
  pageSize = 20,
  pageCount = 1,
  onNavigate,
  children,
}) {
  const shown = windowLabel({ page, pageSize, total });

  return (
    <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">

      {/* ── Header row: 66px ─────────────────────────────────────────────── */}
      <div className="flex h-[66px] items-start justify-between border-b border-[var(--surface-border)]">
        {/* 18px in, 14.5px down; a 20px bold line over a 16px sub-line. */}
        <div className="pl-[18px] pt-[14.5px]">
          <p className="h-[20px] text-[15px] font-bold leading-[20px] text-[var(--text-primary)]">
            {total} รายการ
          </p>
          {/*
            RENDERED ONLY WHEN THERE IS ONE. An unconditional <p> would leave an
            empty 16px element in the DOM whenever the sub-line resolves to '' —
            invisible to any assertion that matches on TEXT, which is how the
            same defect got through rounds 1 and 2. The guard for it asserts on
            element presence, not on text.
          */}
          {subLine ? (
            <p className="h-[16px] text-[12px] leading-[16px] text-[var(--text-muted)]">
              {subLine}
            </p>
          ) : null}
        </div>

        {/*
          The right group: 477px wide, 39px tall, right-aligned. In the mockup
          this is 390 + 8 + 79 (search, gap, ตัวกรอง). The button is not built —
          see the header of this file — so the search field takes the full width.
        */}
        <form onSubmit={onSearch} className="w-[477px] shrink-0 pr-[18px] pt-[13.5px]">
          <div className="relative h-[39px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              name="q"
              /*
                UNCONTROLLED, and `key`ed on the term the list is actually
                filtered by — carried over unchanged from the toolbar this panel
                replaces. In-progress typing is the one value on this screen that
                genuinely is local, but holding it in `useState` seeded from a
                prop is what let the whole filter set go stale across a
                navigation. `defaultValue` + `key` gives the box its own text
                while keeping it unable to disagree with the URL.
              */
              defaultValue={q}
              key={q}
              placeholder={placeholder}
              className={cn(
                'h-[39px] w-full rounded-9e-md border bg-[var(--surface)] pl-9 pr-3 text-[13px]',
                'border-[var(--surface-border)] text-[var(--text-primary)]',
                'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
              )}
            />
          </div>
        </form>
      </div>

      {/* ── The table ────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">{children}</div>

      {/*
        ── Footer row: 54px, AND ABSENT WHEN IT WOULD BE BLANK ───────────────

        On an empty list there is no window to state and no page to turn, so the
        footer has nothing in it at all — and a 54px bar with a top border under
        a table already saying ไม่พบรายการที่ตรงกับเงื่อนไข is dead space that
        reads as a rendering fault.

        Found by the empty-element guard rather than by looking: it reported the
        footer `<div>` itself once both of its children had correctly declined to
        render. That is the guard working one level up from the case it was
        written for — a container whose every child is optional is itself
        optional, and nothing in the geometry says otherwise.
      */}
      {(shown || pageCount > 1) ? (
      <div className="flex h-[54px] items-start border-t border-[var(--surface-border)]">
        {/*
          17px in, 20px down. Absent rather than empty when there is nothing to
          count — see windowLabel.

          NO SPACER ELEMENT WHEN IT IS ABSENT. The first version of this used
          `justify-between` and rendered an empty `<span/>` in its place to hold
          the pager right; the empty-element guard caught it, correctly. An empty
          element used as a layout shim is the same DOM as an empty element left
          behind by a dropped line, and no guard can tell the difference — so the
          pager pushes itself right with `ml-auto` instead and nothing empty is
          emitted either way.
        */}
        {shown ? (
          <p className="pl-[17px] pt-[20px] text-[12px] leading-none text-[var(--text-muted)]">
            {shown}
          </p>
        ) : null}

        {/*
          The pager is right-aligned rather than positioned at the measured
          1326px. That number is an absolute x-coordinate at a 1440 container and
          would be wrong at every other width — the admin sidebar collapses — so
          it is expressed as the RIGHT INSET it works out to, which survives the
          reflow and lands in the same place at 1440.

          Absent, not disabled, on a single page: a pager offering one button
          that goes nowhere is the dead-control shape again.
        */}
        {pageCount > 1 ? (
          <Pager page={page} pageCount={pageCount} onNavigate={onNavigate} />
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Pager({ page, pageCount, onNavigate }) {
  const pages   = Array.from({ length: pageCount }, (_, i) => i + 1);
  const visible = pages.filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2);

  return (
    <div className="ml-auto flex items-center gap-[4px] pr-[17px] pt-[12px]">
      <PagerBtn disabled={page <= 1} onClick={() => onNavigate({ page: page - 1 })} label="ก่อนหน้า">‹</PagerBtn>
      {visible.map((p, i) => {
        const prev = visible[i - 1];
        const gap  = prev && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-[4px]">
            {gap ? <span className="px-[2px] text-[11px] text-[var(--text-muted)]">…</span> : null}
            <PagerBtn active={p === page} onClick={() => onNavigate({ page: p })}>{p}</PagerBtn>
          </span>
        );
      })}
      <PagerBtn disabled={page >= pageCount} onClick={() => onNavigate({ page: page + 1 })} label="ถัดไป">›</PagerBtn>
    </div>
  );
}

/**
 * 29×29. The arrows carry an `aria-label` because their glyph is a chevron —
 * the number buttons do not, because their label is the number.
 */
function PagerBtn({ children, onClick, disabled, active, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'flex h-[29px] w-[29px] items-center justify-center rounded-9e-md text-[12px] font-medium transition-colors',
        active
          ? 'bg-9e-navy text-9e-ice'
          : 'border border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]',
        disabled && 'opacity-40 pointer-events-none'
      )}
    >
      {children}
    </button>
  );
}
