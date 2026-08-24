'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  filterCourseOptions,
  courseOptionLabel,
  courseSelectionValue,
} from '@/lib/courses/courseOptionFilter';

/**
 * A type-to-filter picker for ONE course, replacing a 77-option <select>.
 *
 * Self-contained on purpose — no react-select, no downshift, no new dependency
 * for one field.
 *
 * ── IT MUST KEEP A REAL FORM CONTROL IN THE DOM ─────────────────────────────
 * CourseForm is UNCONTROLLED: the payload is `new FormData(form)` read off the
 * DOM at submit. A combobox that lives only in React state renders no form
 * control, so FormData carries nothing for this field and the save is a green
 * save with the value silently dropped.
 *
 * So the selection rides on a hidden `<input name>` — the same shape the
 * related-courses picker in this form already uses (CourseForm.jsx:971). The
 * visible text box is the SEARCH box and is deliberately unnamed, exactly as
 * the related picker's is, so it never reaches the payload.
 *
 * ── AND IT MUST MARK THE FORM DIRTY ─────────────────────────────────────────
 * The unsaved-changes guard needs BOTH `touchedRef` set and FormData differing
 * from the baseline. `touchedRef` is set by two paths only: the rail/gallery
 * setters via `markTouched`, and a real `input`/`change` event bubbling to the
 * <form> (CourseForm.jsx:309-320). Assigning a hidden input's value from React
 * fires NEITHER — the leave-guard would quietly stop protecting this field.
 *
 * So after the value changes, the effect below dispatches a REAL bubbling
 * `change` from the hidden input. It runs in an effect rather than in the click
 * handler because React commits the DOM before effects run: by then the hidden
 * input already carries the new value, so the form's listener recomputes the
 * snapshot against the value that will actually be submitted. Dispatching from
 * the handler would fire against the OLD DOM value and compare the wrong thing.
 *
 * The mount guard matters as much: without it every page load would dispatch a
 * change, set `touchedRef` and make an untouched form look edited — the false
 * positive that teaches admins to click through the dialog.
 *
 * ── A STORED VALUE THAT IS NOT IN THE LIST STILL SUBMITS ────────────────────
 * If the saved course is missing from `options` (unpublished, renamed, deleted)
 * the hidden input still carries the stored code and the box shows that code
 * verbatim. It is NOT blanked. Silently clearing a field because its target
 * moved is the wipe-on-unrelated-edit class this repo keeps hitting; 43 of 78
 * courses currently hold a previous_course, and all 43 resolve today — this
 * guard is for the day one of them does not.
 */
/**
 * Round 51, ADDED beside the statement above rather than folded into it — the
 * standing rule in this repo.
 *
 * `limit` BECAME A PROP, and its default is the number that was hardcoded here,
 * so THIS form's behaviour is unchanged in every respect. It is the only thing
 * the page builder's single-value picker could not reuse as it stood.
 *
 * The cap was written as a constant 50 for a list of 78. That is fine for a
 * form whose admin knows the code they want and types three characters — but
 * the page builder measured the other end of the same distribution: the worst
 * single-character query matches 78 of 79 rows, so a cap of 50 SILENTLY drops
 * 28 courses with nothing on screen saying it did. §G step 3 rejected exactly
 * that for the list control and left `limit` off; the single-value control
 * needs the same, and passes null.
 *
 * `filterCourseOptions` already reads `typeof limit === 'number'`, so null and
 * undefined both mean "no cap" there — no change was needed on that side, and
 * this file is the only one that had to move.
 */
/**
 * Tell the enclosing <form> that a value changed, the only way it listens.
 *
 * Exported so it can be tested against a real DOM node without mounting a React
 * root: this suite runs every file in ONE process, and a React root over jsdom
 * leaks its globals into the `renderToStaticMarkup` tests that share it — 28 of
 * them, measured, when this was first written that way.
 *
 * Returns true when an event was actually dispatched, so a caller (and a test)
 * can tell "notified" from "no element yet".
 */
export function notifyFormOfChange(el) {
  if (!el || typeof window === 'undefined' || typeof window.Event !== 'function') {
    return false;
  }
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
  return true;
}

export function CourseSearchSelect({
  name,
  value,
  onChange,
  options = [],
  excludeCode,
  label,
  emptyLabel = '— ไม่มี —',
  placeholder = 'พิมพ์เพื่อค้นหา course_id หรือชื่อ',
  inputClassName = '',
  limit = 50,
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const hiddenRef = useRef(null);
  const rootRef = useRef(null);
  const didMountRef = useRef(false);

  const selected = useMemo(
    () => options.find((c) => c?.course_id === value) ?? null,
    [options, value]
  );

  const matches = useMemo(
    () => filterCourseOptions(options, open ? query : '', { excludeCode, limit }),
    [options, query, open, excludeCode, limit]
  );

  /**
   * The real `change` event the dirty-tracker needs. See the header — effect,
   * not handler, and skipped on mount.
   */
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    notifyFormOfChange(hiddenRef.current);
  }, [value]);

  // Close when focus or a click leaves the widget. Without this the list stays
  // open behind the next field the admin tabs into.
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

  function commit(code) {
    onChange(courseSelectionValue(code));
    close();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      if (matches.length === 0) return;
      setActiveIndex((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + matches.length) % matches.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      // Never let Enter submit the whole course form from inside a search box.
      e.preventDefault();
      if (open && matches[activeIndex]) commit(matches[activeIndex].course_id);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  // What the visible box shows: the query while searching, otherwise the
  // selected course. A stored code with no matching option shows the code
  // itself rather than an empty box that looks like "nothing is set".
  const display = open
    ? query
    : selected
      ? courseOptionLabel(selected)
      : value || '';

  return (
    <div ref={rootRef} className="relative">
      {/* THE form control. Always rendered, always named — the field is always
          sent, and '' becomes null in shapePayload. */}
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        value={courseSelectionValue(value)}
      />

      <div className="flex items-center gap-2">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          aria-activedescendant={
            open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          value={display}
          placeholder={value ? undefined : `${emptyLabel} — ${placeholder}`}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={inputClassName}
        />
        {value ? (
          <button
            type="button"
            onClick={() => commit('')}
            aria-label={`ล้างค่า ${label ?? ''}`.trim()}
            className="shrink-0 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
          >
            ล้าง
          </button>
        ) : null}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] shadow-lg"
        >
          {/* Always first: the way back to "no previous course". A combobox
              with no clear path is how a field becomes impossible to unset. */}
          <li
            id={`${listId}-none`}
            role="option"
            aria-selected={!value}
            onMouseDown={(e) => { e.preventDefault(); commit(''); }}
            className="cursor-pointer px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
          >
            {emptyLabel}
          </li>

          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--text-muted)]">
              ไม่พบหลักสูตรที่ตรงกับคำค้น
            </li>
          ) : (
            matches.map((c, i) => (
              <li
                key={c.course_id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={c.course_id === value}
                onMouseDown={(e) => { e.preventDefault(); commit(c.course_id); }}
                onMouseEnter={() => setActiveIndex(i)}
                className={
                  'cursor-pointer px-3 py-2 text-sm text-[var(--text-primary)] '
                  + (i === activeIndex ? 'bg-[var(--surface-muted)]' : '')
                }
              >
                {courseOptionLabel(c)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
