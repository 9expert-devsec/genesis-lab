'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { pathToKey } from './pagePath';

/**
 * Drag-reorder for the Structure tree. ONE instance for the whole panel — not
 * one per sibling list.
 *
 * ── Why not useDragReorder (hooks/useDragReorder.js) ──────────────────────
 * That hook is built for a flat list that OWNS its order: it holds `items` in
 * useState and commits the reorder itself, calling onReorder after the fact.
 * Here the order lives in the editor's reducer, so a hook-local copy would be a
 * second source of truth — stale the moment a context-menu duplicate/delete
 * dispatches — and keeping it honest would mean re-seeding local state from a
 * prop on every tree change, the exact pattern the save path was designed to
 * avoid (see useEditorSave.js).
 *
 * It also has no notion of WHICH list an event belongs to: one instance per
 * sibling list means N hooks all listening to a bubbling event stream, and the
 * ancestor's handler happily claims a descendant's dragstart. StructurePanel's
 * DOM keeps rows un-nested (a row div and its children's lists are siblings
 * inside the <li>, never parent-and-child), so that cross-talk doesn't arise
 * HERE — but the safety then depends on a layout detail rather than on the
 * hook, and a later refactor that wraps children in the row would reintroduce
 * it silently. The stopPropagation calls below make it not depend on that.
 *
 * So: this hook holds NO order. It tracks the dragged path and the hovered path
 * and dispatches MOVE_SECTION; the reducer stays the only place order changes.
 *
 * ── Refusal is native, not cosmetic ───────────────────────────────────────
 * MOVE_SECTION is sibling-scoped (moveWithin, in pagePath.js) — it reorders
 * within one array and cannot reparent. So a drop across parents is a move the
 * reducer would reject.
 *
 * We never let it get that far: `preventDefault` on dragover is what MAKES an
 * element a drop target, and we call it ONLY for a legal sibling target. An
 * illegal target is therefore not a drop target at all — the browser shows the
 * no-drop cursor, no drop event fires, and no indicator renders. The refusal is
 * the platform's, so there is nothing to snap back FROM: a rejected drag simply
 * never becomes a drop.
 */

const pathKey = (p) => (p ? pathToKey(p) : null);
const parentOf = (p) => p.slice(0, -1);
const indexOf = (p) => p[p.length - 1];
const samePath = (a, b) => !!a && !!b && a.length === b.length && a.every((k, i) => b[i] === k);

/** Legal iff the two nodes are true siblings and it's an actual move. */
function isSiblingMove(from, to) {
  if (!from || !to) return false;
  if (samePath(from, to)) return false;
  return samePath(parentOf(from), parentOf(to));
}

/**
 * @param {(fromPath: number[], toIndex: number) => void} onMove
 *   Called only for a legal sibling drop. Wire straight to MOVE_SECTION.
 */
export function useTreeDrag(onMove) {
  // Paths live in refs (dragover fires at high frequency and must not re-render
  // on every tick); the KEYS are state, because the tree renders from them.
  // Keys are strings so React bails out on an unchanged value — a path array is
  // a fresh reference each render and would re-render forever.
  const fromRef = useRef(null);
  const overRef = useRef(null);
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);

  const clear = useCallback(() => {
    fromRef.current = null;
    overRef.current = null;
    setDragKey(null);
    setOverKey(null);
  }, []);

  /**
   * ── ROUND 40: THE SOURCE AND THE TARGET ARE NO LONGER ONE ELEMENT ────────
   * They were, because the row div was both. Round 40's card makes that wrong:
   * an EXPANDED container's drawer is a SIBLING of the card inside the same
   * `<li>`, so a drop indicator drawn on the card renders above a drawer that
   * can be 300px tall — pointing at a gap the drop would not land in. The
   * indicator has to span the whole subtree, which means the `<li>`.
   *
   * The SOURCE stays on the card. That is deliberate and it is not the same
   * decision: making the `<li>` draggable would make a container's entire open
   * subtree the grab area, so a drag begun on a CHILD card would be claimed by
   * the ancestor. `onDragStart`'s stopPropagation guards the child-first case
   * today only because the card is the innermost draggable; keeping the source
   * on the card is what keeps that true.
   */
  const getDragSourceProps = useCallback((path) => ({
    draggable: true,

    onDragStart: (e) => {
      // The innermost card owns the drag; without this the ancestor's handler
      // would fire next and claim it.
      e.stopPropagation();
      fromRef.current = path;
      setDragKey(pathKey(path));
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        // Some browsers won't start a drag without setData.
        try { e.dataTransfer.setData('text/plain', pathKey(path)); } catch { /* sandboxed env */ }
      }
    },

    onDragEnd: clear,
  }), [clear]);

  /**
   * The drop half — goes on the `<li>`, which is card + drawer.
   *
   * `<li>`s NEST (a child's sits inside its parent's drawer, inside the
   * parent's own `<li>`), so both handlers stopPropagation: without it a hover
   * over a child would also mark its ancestor, and two indicators would draw at
   * once. That was already true of the row div for a different reason; here it
   * is load-bearing rather than defensive.
   */
  const getDropTargetProps = useCallback((path) => ({
    onDragOver: (e) => {
      e.stopPropagation();
      if (!isSiblingMove(fromRef.current, path)) {
        // NO preventDefault → not a drop target. Browser shows no-drop.
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        if (overRef.current) { overRef.current = null; setOverKey(null); }
        return;
      }
      e.preventDefault(); // legal target only
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      overRef.current = path;
      setOverKey(pathKey(path));
    },

    onDrop: (e) => {
      e.stopPropagation();
      e.preventDefault();
      const from = fromRef.current;
      const to = overRef.current;
      clear();
      // Re-check rather than trust the hover: the only path to a move.
      if (isSiblingMove(from, to)) onMove(from, indexOf(to));
    },
  }), [clear, onMove]);

  /** The row being dragged (dim it). */
  const isDragging = useCallback((path) => dragKey === pathKey(path), [dragKey]);
  /** The row to draw the drop indicator on — only ever a legal sibling. */
  const isDropTarget = useCallback((path) => overKey === pathKey(path), [overKey]);

  // Stable identity: this is handed straight to a context provider, so a fresh
  // object each render would re-render every row on any parent render.
  return useMemo(
    () => ({ getDragSourceProps, getDropTargetProps, isDragging, isDropTarget }),
    [getDragSourceProps, getDropTargetProps, isDragging, isDropTarget]
  );
}
