'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * A type-to-filter list for ONE choice out of a few hundred.
 *
 * Self-contained on purpose — no react-select, no downshift, no new dependency
 * — and modelled on the pattern admin/courses/_components/CourseSearchSelect
 * already established in this repo, down to the keyboard handling and the
 * "click outside closes it" effect. What is NOT copied is that component's
 * hidden-input and dirty-tracking machinery: CourseForm is uncontrolled and has
 * an unsaved-changes guard, BannerForm is neither, so the hidden inputs live in
 * the two wrappers where their names and count differ (three for a course
 * reference, one for an article slug).
 *
 * ── WHY IT IS GENERIC OVER THE ROW AND NOT OVER THE DOMAIN ─────────────────
 * The course picker and the article picker differ in what a row SHOWS, what it
 * is SEARCHED by, and what warning it can carry — and agree on everything else:
 * the box, the filtering, the keyboard model, the clear affordance, the
 * truncation notice. Two copies of that agreement is two places for the
 * keyboard model to drift, and a combobox whose Enter key works in one picker
 * and submits the form in the other is precisely the kind of bug nobody files.
 *
 * ── SEARCH IS CASE-FOLDED AND NOTHING ELSE ─────────────────────────────────
 * `toLowerCase()` and `includes`. NO `normalize()`, no accent folding, no
 * transliteration, no slugification. 265 of the 488 article slugs contain Thai,
 * which has no case and no decomposition worth folding, and any "clean up the
 * query" step would be a step that can fail to match a real stored slug. The
 * caller supplies the haystack via `searchText`, so what a row is findable BY
 * is a decision each picker makes for itself.
 *
 * ── THE TRUNCATION IS ANNOUNCED ────────────────────────────────────────────
 * The list caps at `limit` rows. A silent cap reads as "there is nothing else",
 * which is exactly how an admin concludes an article is missing. When the cap
 * bites, the count of what is not shown is rendered under the list.
 */
export function SearchPicker({
  /** All rows. Never mutated. */
  options,
  /** Row → a stable string key, also used for selection identity. */
  getKey,
  /** Row → the lower-cased haystack the query is matched against. */
  getSearchText,
  /** Row → JSX for one line in the list. */
  renderOption,
  /** The currently selected row, or null. */
  selected,
  /** Row → void, called on click / Enter. */
  onPick,
  /** () => void, called by the clear affordance. Omitted ⇒ no clear button. */
  onClear,
  placeholder = 'พิมพ์เพื่อค้นหา',
  emptyLabel = 'ไม่พบรายการที่ตรงกับคำค้น',
  /** What the closed box shows when something is selected. */
  renderSelected,
  limit = 50,
  disabled = false,
  inputClassName = '',
  ariaLabel,
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);

  const q = query.trim().toLowerCase();
  const all = Array.isArray(options) ? options : [];

  const matched = useMemo(() => {
    if (!q) return all;
    return all.filter((o) => getSearchText(o).includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, q]);

  const shown = matched.slice(0, limit);
  const hiddenCount = matched.length - shown.length;

  // Close when a click lands outside. Without it the list stays open behind the
  // next field the admin tabs into, covering it.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function commit(option) {
    onPick(option);
    close();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); setActiveIndex(0); return; }
      if (shown.length === 0) return;
      setActiveIndex((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + shown.length) % shown.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      // NEVER let Enter inside a search box submit the whole banner form. The
      // same rule CourseSearchSelect states, and for the same reason: a picker
      // that saves the record when you meant to choose a row is a data-loss
      // affordance disguised as a convenience.
      e.preventDefault();
      if (open && shown[activeIndex]) commit(shown[activeIndex]);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          disabled={disabled}
          value={open ? query : ''}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={inputClassName}
        />
        {selected && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-9e-sm border border-gray-300 px-2 py-1 text-xs
              text-9e-slate-dp-50 hover:bg-9e-ice transition-colors"
          >
            ล้าง
          </button>
        ) : null}
      </div>

      {/* The closed-state summary sits BELOW the box rather than inside it: a
          course row is two lines plus a namespace badge and a warning, which
          does not fit in an <input value>. The box above is therefore always
          the SEARCH box and never a display of the selection — one job each. */}
      {selected && !open ? (
        <div className="mt-2">{renderSelected(selected)}</div>
      ) : null}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-9e-md
            border border-gray-200 bg-white shadow-lg"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-9e-slate-dp-50">{emptyLabel}</li>
          ) : (
            shown.map((o, i) => (
              <li
                key={getKey(o)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected != null && getKey(o) === getKey(selected)}
                onMouseDown={(e) => { e.preventDefault(); commit(o); }}
                onMouseEnter={() => setActiveIndex(i)}
                className={
                  'cursor-pointer px-3 py-2 text-sm text-9e-navy border-b border-gray-100 last:border-0 '
                  + (i === activeIndex ? 'bg-9e-ice' : '')
                }
              >
                {renderOption(o)}
              </li>
            ))
          )}
          {hiddenCount > 0 && (
            <li className="px-3 py-2 text-xs text-9e-slate-dp-50 bg-9e-ice/60">
              และอีก {hiddenCount} รายการ — พิมพ์เพื่อค้นหาให้แคบลง
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
