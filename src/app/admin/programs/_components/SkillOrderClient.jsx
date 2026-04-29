'use client';

import { useState, useTransition } from 'react';
import {
  saveSkillOrder,
  saveSkillProgramOrder,
  syncSkillsFromAPI,
  toggleSkillHidden,
} from '@/lib/actions/program-order';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';

function skillIdOf(s) {
  return String(s.skill_id ?? s._id ?? '');
}
function programIdOf(p) {
  return String(p.program_id ?? p._id ?? '');
}

export default function SkillOrderClient({ initialSkills, orderData }) {
  const merged = (initialSkills ?? [])
    .map((s) => {
      const id = skillIdOf(s);
      const stored = orderData.find((o) => o.skillId === id);
      const nestedPrograms = Array.isArray(s.programs) ? s.programs : [];
      const storedProgramOrder = stored?.programOrder ?? [];
      const orderedPrograms = storedProgramOrder.length
        ? [
            ...storedProgramOrder
              .map((pid) => nestedPrograms.find((p) => programIdOf(p) === pid))
              .filter(Boolean),
            ...nestedPrograms.filter(
              (p) => !storedProgramOrder.includes(programIdOf(p))
            ),
          ]
        : nestedPrograms;
      return {
        ...s,
        id,
        order: stored?.order ?? 999,
        isHidden: stored?.isHidden ?? false,
        orderedPrograms,
      };
    })
    .sort((a, b) => a.order - b.order);

  const {
    items: skills,
    setItems: setSkills,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(merged, null);

  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [, startTransition] = useTransition();

  const moveUp = (i) => {
    if (i === 0) return;
    const next = [...skills];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setSkills(next);
  };
  const moveDown = (i) => {
    if (i === skills.length - 1) return;
    const next = [...skills];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setSkills(next);
  };

  const updateSkillPrograms = (skillId, newPrograms) => {
    setSkills(
      skills.map((s) =>
        s.id === skillId ? { ...s, orderedPrograms: newPrograms } : s
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSkillOrder(skills.map((s) => s.id));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncSkillsFromAPI(skills);
      window.location.reload();
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveProgramOrder = async (skill) => {
    const ids = skill.orderedPrograms.map(programIdOf);
    await saveSkillProgramOrder(skill.id, ids);
  };

  const handleToggleHidden = (id, current) => {
    setSkills(skills.map((s) => (s.id === id ? { ...s, isHidden: !current } : s)));
    startTransition(async () => {
      await toggleSkillHidden(id, !current);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-9e-slate">
          ลากที่จุด ⋮⋮ หรือกดลูกศรเพื่อเรียงลำดับ Skills และ Programs ภายใน
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
        {skills.length === 0 ? (
          <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-6 text-center text-sm text-9e-slate">
            ไม่พบ Skills — ลองกด &quot;Sync จาก API&quot;
          </p>
        ) : null}
        {skills.map((skill, i) => {
          const iconSrc = skill.skilliconurl || skill.iconUrl || '';
          const name = skill.skill_name || skill.displayName || skill.id;
          const isOpen = expanded === skill.id;
          const isDragging = draggingIndex === i;
          const isDropTarget =
            dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
          return (
            <div
              key={skill.id}
              {...getDragProps(i)}
              className={
                'rounded-9e-md border transition-all duration-150 ' +
                (isDragging
                  ? 'scale-[0.98] opacity-50 shadow-9e-md ring-2 ring-9e-primary '
                  : '') +
                (isDropTarget ? 'border-t-2 border-t-9e-primary ' : '') +
                (skill.isHidden
                  ? 'border-dashed bg-gray-50 opacity-50 dark:bg-[#0a0f1a]'
                  : 'border-[var(--surface-border)] bg-white dark:bg-[#111d2c]')
              }
            >
              <div className="flex items-center gap-3 p-3">
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
                  <span className="ml-2 text-xs text-9e-slate">
                    ({skill.orderedPrograms.length} programs)
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : skill.id)}
                    disabled={skill.orderedPrograms.length === 0}
                    className="rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-slate transition-colors hover:text-9e-primary disabled:opacity-30"
                  >
                    {isOpen ? 'ปิด' : 'เปิด'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleHidden(skill.id, skill.isHidden)}
                    className="rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-slate transition-colors hover:text-9e-primary"
                  >
                    {skill.isHidden ? 'แสดง' : 'ซ่อน'}
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
                    disabled={i === skills.length - 1}
                    aria-label="เลื่อนลง"
                    className="flex h-7 w-7 items-center justify-center rounded-9e-sm border border-[var(--surface-border)] text-sm text-9e-slate transition-colors hover:text-9e-primary disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
              </div>

              {isOpen && skill.orderedPrograms.length > 0 ? (
                <NestedProgramList
                  skill={skill}
                  onChange={(newPrograms) =>
                    updateSkillPrograms(skill.id, newPrograms)
                  }
                  onSave={() => handleSaveProgramOrder(skill)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NestedProgramList({ skill, onChange, onSave }) {
  // Each expanded skill gets its own drag controller — using a sub-
  // component keeps `useDragReorder` calls outside any loop and lets
  // the hook own its own internal state cleanly.
  const {
    items: programs,
    setItems: setPrograms,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(skill.orderedPrograms, (next) => onChange(next));

  const moveProgramUp = (i) => {
    if (i === 0) return;
    const next = [...programs];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setPrograms(next);
    onChange(next);
  };
  const moveProgramDown = (i) => {
    if (i === programs.length - 1) return;
    const next = [...programs];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setPrograms(next);
    onChange(next);
  };

  return (
    <div className="border-t border-[var(--surface-border)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-9e-slate">ลำดับ Programs ภายใน Skill นี้</p>
        <button
          type="button"
          onClick={onSave}
          className="rounded-9e-sm bg-9e-primary/10 px-3 py-1 text-xs text-9e-primary hover:bg-9e-primary/20"
        >
          บันทึกลำดับ Programs
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {programs.map((prog, pi) => {
          const pid = programIdOf(prog);
          const picon = prog.programiconurl || '';
          const pname = prog.program_name || pid;
          const isDragging = draggingIndex === pi;
          const isDropTarget =
            dragOverIndex === pi &&
            draggingIndex !== null &&
            draggingIndex !== pi;
          return (
            <div
              key={pid}
              {...getDragProps(pi)}
              className={
                'flex items-center gap-2 rounded-9e-sm border bg-9e-ice px-2 py-1.5 transition-all duration-150 dark:bg-[#0a0f1a] ' +
                (isDragging
                  ? 'opacity-50 ring-2 ring-9e-primary '
                  : 'border-[var(--surface-border)] ') +
                (isDropTarget ? 'border-t-2 border-t-9e-primary ' : '')
              }
            >
              <DragHandle className="text-9e-slate/70" />
              <span className="w-5 text-center font-mono text-[11px] text-9e-slate">
                {pi + 1}
              </span>
              {picon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={picon}
                  alt={pname}
                  className="h-6 w-6 object-contain"
                  draggable={false}
                />
              ) : (
                <div className="h-6 w-6 rounded bg-white" />
              )}
              <span className="flex-1 truncate text-xs text-9e-navy dark:text-white">
                {pname}
              </span>
              <button
                type="button"
                onClick={() => moveProgramUp(pi)}
                disabled={pi === 0}
                aria-label="เลื่อนขึ้น"
                className="flex h-6 w-6 items-center justify-center rounded border border-[var(--surface-border)] text-xs text-9e-slate hover:text-9e-primary disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveProgramDown(pi)}
                disabled={pi === programs.length - 1}
                aria-label="เลื่อนลง"
                className="flex h-6 w-6 items-center justify-center rounded border border-[var(--surface-border)] text-xs text-9e-slate hover:text-9e-primary disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
