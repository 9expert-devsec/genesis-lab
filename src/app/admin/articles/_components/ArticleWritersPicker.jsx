'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import { LAST_WRITER_TOOLTIP, searchableWriters } from '@/lib/writers/articleWriters';
import { WriterAvatar } from '../../writers/_components/WriterAvatar';

/**
 * The "บทความโดย" panel: an ordered list of writers, the first being the primary.
 *
 * `draggable` sits on the handle, as in the writers form's ReorderRows.
 */
export function ArticleWritersPicker({ options, initial, onChange, legacyAuthor = null }) {
  const { items, setItems, dragOverIndex, getDragProps } = useDragReorder(initial, (next) => onChange(next));
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  function commit(next) {
    setItems(next);
    onChange(next);
  }

  const lastOne = items.length <= 1;
  const matches = searchableWriters(options, items, query);

  return (
    <div data-testid="writer-picker">
      <p className="-mt-2 mb-3 text-xs text-[var(--text-muted)]">
        เลือกได้หลายคน · ลากเพื่อเรียงลำดับ — คนแรกเป็นผู้เขียนหลัก
      </p>

      {legacyAuthor !== null && (
        <p className="mb-3 rounded-9e-md bg-9e-ice px-3 py-2 text-xs text-[var(--text-secondary)] dark:bg-[#0D1B2A]" data-testid="writer-legacy-note">
          ยังไม่ได้ผูกผู้เขียน — ข้อมูลเดิม: &quot;{legacyAuthor}&quot;
        </p>
      )}

      <ul className="space-y-1.5">
        {items.map((writer, index) => {
          const { draggable, onDragStart, onDragEnd, onDragOver, onDrop } = getDragProps(index);
          return (
            <li
              key={writer._id}
              onDragOver={onDragOver}
              onDrop={onDrop}
              data-testid="writer-row"
              className={
                'flex items-center gap-2 rounded-9e-md ' +
                (dragOverIndex === index ? 'ring-2 ring-9e-action/40' : '')
              }
            >
              <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <DragHandle />
              </div>
              <WriterAvatar publicId={writer.avatarPublicId} px={32} source={72} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-9e-navy dark:text-white">
                {writer.displayName}
              </span>
              {index === 0 && (
                <span className="shrink-0 rounded-full bg-9e-ice px-2 py-0.5 text-[11px] font-medium text-9e-action dark:bg-[#0D1B2A]">
                  หลัก
                </span>
              )}
              <button
                type="button"
                aria-label={`เอา ${writer.displayName} ออก`}
                title={lastOne ? LAST_WRITER_TOOLTIP : undefined}
                disabled={lastOne}
                onClick={() => commit(items.filter((row) => row._id !== writer._id))}
                className="shrink-0 rounded-9e-sm p-1 text-[var(--text-muted)] hover:bg-9e-ice hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)] dark:hover:bg-[#0D1B2A]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
        <input
          type="text"
          value={query}
          placeholder="ค้นหาผู้เขียน…"
          aria-label="ค้นหาผู้เขียน"
          data-testid="writer-search"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          className="w-full rounded-9e-md border border-[var(--surface-border)] py-2 pl-8 pr-3 text-sm text-9e-navy dark:bg-[#0D1B2A] dark:text-white"
        />
      </div>

      {open && (
        // In the flow, not floated: this panel sits in the form's scrolling
        // sidebar, which would clip a floating list. preventDefault keeps focus
        // in the input, so its blur cannot close the list ahead of the click.
        <ul
          onMouseDown={(e) => e.preventDefault()}
          data-testid="writer-options"
          className="mt-1 max-h-60 overflow-y-auto rounded-9e-md border border-[var(--surface-border)]"
        >
          {matches.map((writer) => (
            <li key={writer._id}>
              <button
                type="button"
                data-testid="writer-option"
                onClick={() => { commit([...items, writer]); setQuery(''); }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
              >
                <WriterAvatar publicId={writer.avatarPublicId} px={32} source={72} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-9e-navy dark:text-white">{writer.displayName}</span>
                  {writer.role && <span className="block truncate text-xs text-[var(--text-muted)]">{writer.role}</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-[var(--surface-border)]">
            <a
              href="/admin/writers/new"
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2 text-sm font-medium text-9e-action hover:underline"
            >
              + สร้างผู้เขียนใหม่
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
