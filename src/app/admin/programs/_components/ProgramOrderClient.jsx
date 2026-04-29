'use client';

import { useState, useTransition } from 'react';
import {
  saveProgramOrder,
  syncProgramsFromAPI,
  toggleProgramHidden,
} from '@/lib/actions/program-order';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';

function programIdOf(p) {
  return String(p.program_id ?? p._id ?? '');
}

export default function ProgramOrderClient({ initialPrograms, orderData }) {
  const merged = (initialPrograms ?? [])
    .map((p) => {
      const id = programIdOf(p);
      const stored = orderData.find((o) => o.programId === id);
      return {
        ...p,
        id,
        order: stored?.order ?? 999,
        isHidden: stored?.isHidden ?? false,
      };
    })
    .sort((a, b) => a.order - b.order);

  // Internal state lives inside the hook. We save explicitly via the
  // "บันทึกลำดับ" button, so onReorder is null here.
  const {
    items,
    setItems,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(merged, null);

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [, startTransition] = useTransition();

  const moveUp = (i) => {
    if (i === 0) return;
    const next = [...items];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setItems(next);
  };

  const moveDown = (i) => {
    if (i === items.length - 1) return;
    const next = [...items];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setItems(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveProgramOrder(items.map((p) => p.id));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncProgramsFromAPI(initialPrograms);
      window.location.reload();
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleHidden = (id, current) => {
    setItems(items.map((p) => (p.id === id ? { ...p, isHidden: !current } : p)));
    startTransition(async () => {
      await toggleProgramHidden(id, !current);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-9e-slate">
          ลากที่จุด ⋮⋮ หรือกดลูกศรเพื่อเรียงลำดับ — มีผลกับทุกหน้าที่แสดง Programs
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-9e-md border border-9e-slate px-4 py-2 text-sm text-9e-slate transition-colors hover:border-9e-primary hover:text-9e-primary disabled:opacity-50"
          >
            {syncing ? 'กำลัง Sync...' : 'Sync จาก API'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-9e-md bg-9e-primary px-4 py-2 text-sm text-white transition-colors hover:bg-[#0047CC] disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกลำดับ'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-6 text-center text-sm text-9e-slate">
            ไม่พบโปรแกรม — ลองกด &quot;Sync จาก API&quot;
          </p>
        ) : null}
        {items.map((prog, i) => {
          const iconSrc = prog.programiconurl || prog.iconUrl || '';
          const name = prog.program_name || prog.displayName || prog.name || prog.id;
          const isDragging = draggingIndex === i;
          const isDropTarget = dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
          return (
            <div
              key={prog.id}
              {...getDragProps(i)}
              className={
                'flex items-center gap-3 rounded-9e-md border p-3 transition-all duration-150 ' +
                (isDragging
                  ? 'scale-[0.98] opacity-50 shadow-9e-md ring-2 ring-9e-primary '
                  : '') +
                (isDropTarget ? 'border-t-2 border-t-9e-primary ' : '') +
                (prog.isHidden
                  ? 'border-dashed bg-gray-50 opacity-50 dark:bg-[#0a0f1a]'
                  : 'border-[var(--surface-border)] bg-white dark:bg-[#111d2c]')
              }
            >
              <DragHandle />
              <span className="w-6 text-center font-mono text-xs text-9e-slate">
                {i + 1}
              </span>
              {iconSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconSrc}
                  alt={name}
                  className="h-8 w-8 object-contain"
                  draggable={false}
                />
              ) : (
                <div className="h-8 w-8 rounded-9e-sm bg-9e-ice" />
              )}
              <span className="flex-1 truncate text-sm font-medium text-9e-navy dark:text-white">
                {name}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleToggleHidden(prog.id, prog.isHidden)}
                  className="rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-slate transition-colors hover:text-9e-primary"
                >
                  {prog.isHidden ? 'แสดง' : 'ซ่อน'}
                </button>
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  aria-label="เลื่อนขึ้น"
                  className="flex h-7 w-7 items-center justify-center rounded-9e-sm border border-[var(--surface-border)] text-sm text-9e-slate transition-colors hover:text-9e-primary disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(i)}
                  disabled={i === items.length - 1}
                  aria-label="เลื่อนลง"
                  className="flex h-7 w-7 items-center justify-center rounded-9e-sm border border-[var(--surface-border)] text-sm text-9e-slate transition-colors hover:text-9e-primary disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
