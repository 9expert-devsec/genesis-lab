'use client';

/**
 * A one-verb channel from a sibling add-form to the list that owns the rows.
 *
 * THE PROBLEM IT SOLVES, narrowly. On five admin menus the add form and the
 * list are SIBLINGS rendered by a server component:
 *
 *     <AddFeaturedCourseForm .../>      <- writes
 *     <FeaturedCourseList .../>         <- owns the rows, via useDragReorder
 *
 * A server component cannot hold client state, so the two siblings have nothing
 * to share. The form therefore called `router.refresh()` and hoped; the list
 * seeds `useState` once and ignores the fresh props, so the created row never
 * appeared until a manual reload.
 *
 * WHY THIS AND NOT THE ALTERNATIVES:
 *
 *   - Making the list resync from props would fix the symptom by giving the
 *     list two masters — the server prop and its own edits — and every
 *     in-flight optimistic change would need a reconciliation rule. That is a
 *     much bigger decision than this bug requires, and it is explicitly not
 *     what is being asked for here.
 *
 *   - Lifting the rows into a client wrapper means the wrapper owns state AND
 *     useDragReorder owns state: two sources of truth for one list, which is
 *     the exact defect `recruits` already has. Avoiding it would mean making
 *     the drag hook controlled — a real refactor of a drag-and-drop component,
 *     to fix an add button.
 *
 *   - This keeps the list as the SINGLE owner and gives the form one way to
 *     reach it. The data flows one way: form → channel → list's own setter.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER, so nobody reaches for it as a
 * general-purpose bus:
 *   - edits and deletes. Both already splice locally in these components,
 *     because the row is in hand; only CREATE has the sibling problem.
 *   - optimistic updates, rollback, per-row busy state, error surfacing.
 *   - lists that do not own their rows, or pages with more than one list.
 *   - ordering. The list decides where the row goes, by passing its own
 *     comparator to its own setter — this channel only carries the document.
 *
 * If a second verb is ever needed, that is the signal to stop extending this
 * and design the thing properly.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

const Ctx = createContext(null);

/**
 * Wrap the two siblings. Rendered by the server page, which passes nothing —
 * the provider holds only a function reference, never row data.
 */
export function AddedRowChannel({ children }) {
  const sink = useRef(null);
  const value = useMemo(
    () => ({
      register: (fn) => {
        sink.current = fn;
        return () => {
          // Only clear if we are still the registered sink — under StrictMode
          // the effect runs twice and a naive clear would unregister the live one.
          if (sink.current === fn) sink.current = null;
        };
      },
      // Returns whether anything was listening, so a caller can fall back
      // rather than silently dropping the row.
      add: (doc) => {
        if (!sink.current || !doc) return false;
        sink.current(doc);
        return true;
      },
    }),
    []
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** For the FORM: `const { add } = useAddedRow(); … if (res.data) add(res.data);` */
export function useAddedRow() {
  const ctx = useContext(Ctx);
  // Not throwing on a missing provider: these components are also rendered in
  // tests and could be reused outside a channel. A no-op `add` returning false
  // is the safe degradation — the caller still has router.refresh().
  return ctx ?? { add: () => false, register: () => () => {} };
}

/**
 * For the LIST: hand it the function that accepts one created row.
 * `useAddedRowSink((doc) => setItems((cur) => insertFeaturedRow(cur, doc)))`
 */
export function useAddedRowSink(onAdded) {
  const ctx = useContext(Ctx);
  const cb = useCallback((doc) => onAdded?.(doc), [onAdded]);
  useEffect(() => {
    if (!ctx) return undefined;
    return ctx.register(cb);
  }, [ctx, cb]);
}
