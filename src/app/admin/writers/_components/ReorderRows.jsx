'use client';

import { X } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';

let nextKey = 0;

/** A row with a key of its own: an array index would hand one row's input to another on a drag. */
export function withRowKey(row) {
  nextKey += 1;
  return { ...row, key: `row-${nextKey}` };
}

/**
 * An editable list with drag reorder and remove, reporting every change up.
 *
 * `draggable` sits on the handle rather than the row. On the row it would turn
 * selecting text in the row's input into a drag.
 */
export function ReorderRows({ initial, onChange, blank, renderRow, addLabel, emptyHint, testId }) {
  const { items, setItems, dragOverIndex, getDragProps } = useDragReorder(initial, (next) => onChange(next));

  function commit(next) {
    setItems(next);
    onChange(next);
  }

  return (
    <div data-testid={testId}>
      {items.length === 0 && emptyHint && (
        <p className="text-sm text-[var(--text-muted)]">{emptyHint}</p>
      )}
      <ul className="space-y-2">
        {items.map((row, index) => {
          const { draggable, onDragStart, onDragEnd, onDragOver, onDrop } = getDragProps(index);
          return (
            <li
              key={row.key}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className={
                'flex items-center gap-2 rounded-9e-md ' +
                (dragOverIndex === index ? 'ring-2 ring-9e-action/40' : '')
              }
            >
              <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <DragHandle />
              </div>
              {renderRow(row, (patch) => commit(items.map((r) => (r.key === row.key ? { ...r, ...patch } : r))))}
              <button
                type="button"
                aria-label="ลบรายการ"
                onClick={() => commit(items.filter((r) => r.key !== row.key))}
                className="shrink-0 rounded-9e-sm p-1 text-[var(--text-muted)] hover:bg-9e-ice hover:text-red-700 dark:hover:bg-[#0D1B2A]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => commit([...items, withRowKey(blank)])}
        className="mt-3 text-sm font-medium text-9e-action hover:underline"
      >
        + {addLabel}
      </button>
    </div>
  );
}
