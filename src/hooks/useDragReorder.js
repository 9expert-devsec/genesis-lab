'use client';

import { useState, useRef } from 'react';

/**
 * Native HTML5 drag-and-drop reorder for ordered lists.
 *
 * Tracks drag-source / drag-over indices in refs (so the high-frequency
 * dragover events don't re-render). Owns the items state internally;
 * pass a fresh `initialItems` and call `resetItems()` if the parent
 * needs to push new data after a save/reload.
 *
 * @param {Array}    initialItems
 * @param {Function} [onReorder]  Called with the new array after a drop.
 */
export function useDragReorder(initialItems, onReorder) {
  const [items, setItems] = useState(initialItems);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragIndexRef = useRef(null);
  const dragOverIndexRef = useRef(null);

  const handleDragStart = (e, index) => {
    dragIndexRef.current = index;
    setDraggingIndex(index);
    if (e?.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Some browsers require setData to actually start a drag.
      try {
        e.dataTransfer.setData('text/plain', String(index));
      } catch {
        // Some sandbox/test envs throw — drag still works.
      }
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (e?.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverIndexRef.current = index;
    setDragOverIndex(index);
  };

  const handleDrop = (e) => {
    e?.preventDefault?.();
    const from = dragIndexRef.current;
    const to = dragOverIndexRef.current;

    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);

    if (from === null || to === null || from === to) return;

    // Compute next outside the updater so onReorder fires exactly once
    // (StrictMode invokes setState updaters twice in dev).
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    onReorder?.(next, items);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const resetItems = (newItems) => setItems(newItems);

  const getDragProps = (index) => ({
    draggable: true,
    onDragStart: (e) => handleDragStart(e, index),
    onDragOver:  (e) => handleDragOver(e, index),
    onDrop:      (e) => handleDrop(e),
    onDragEnd:   handleDragEnd,
  });

  return {
    items,
    setItems,
    resetItems,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  };
}
