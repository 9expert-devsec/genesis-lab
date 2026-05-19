'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

/**
 * TrainingTopicsEditor — dynamic list of `{ topic, subtopics[] }`.
 *
 * Two ways to feed seed data:
 *   - `initialTopics` (preferred): the MSDB-shaped array
 *     `[{ topic: string, subtopics: string[] }]`. We map each subtopics
 *     array to a newline-joined string for the textarea representation.
 *   - `defaultValue` (legacy alias): same shape, kept so older callers
 *     don't break. Treated as a fallback when `initialTopics` is omitted.
 *
 * The whole list is serialised to a single hidden input (`name`, default
 * "training_topics") as JSON. `parseTrainingTopics()` on the server
 * (src/lib/actions/courses.js) decodes it back to the upstream shape.
 *
 * Init pattern
 *   We seed `useState` with a normalisation of the prop at mount, then
 *   run an effect that re-syncs IF the prop reference changes from
 *   empty → non-empty (e.g. the parent finished an async fetch after
 *   first paint). Once the editor has rows, we don't clobber them on
 *   subsequent prop changes — that would erase admin-typed input
 *   whenever the parent re-renders.
 */
function normalise(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      topic: String(row?.topic ?? ''),
      subtopics: Array.isArray(row?.subtopics)
        ? row.subtopics.map((s) => String(s ?? '')).join('\n')
        : String(row?.subtopics ?? ''),
    }))
    .filter((r) => r.topic || r.subtopics.length > 0);
}

export function TrainingTopicsEditor({
  name = 'training_topics',
  initialTopics,
  defaultValue,
}) {
  const seedSource = initialTopics ?? defaultValue ?? [];
  const seedNormalised = useMemo(() => normalise(seedSource), [seedSource]);

  const [rows, setRows] = useState(() =>
    seedNormalised.length > 0
      ? seedNormalised
      : [{ topic: '', subtopics: '' }]
  );

  // If the parent passes a non-empty seed AFTER first paint (async data
  // arrived late), populate the editor — but only when the user hasn't
  // touched the placeholder row yet. The `hasUserEditedRef` flag
  // protects against clobbering real input.
  const hasUserEditedRef = useRef(false);
  useEffect(() => {
    if (hasUserEditedRef.current) return;
    if (seedNormalised.length === 0) return;
    setRows(seedNormalised);
  }, [seedNormalised]);

  function markEdited() {
    hasUserEditedRef.current = true;
  }

  function updateRow(idx, field, value) {
    markEdited();
    setRows((cur) =>
      cur.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }
  function addRow() {
    markEdited();
    setRows((cur) => [...cur, { topic: '', subtopics: '' }]);
  }
  function removeRow(idx) {
    markEdited();
    setRows((cur) => cur.filter((_, i) => i !== idx));
  }

  // Serialise on every keystroke. Cheap — list is small.
  const serialized = useMemo(() => {
    const cleaned = rows
      .map((r) => ({
        topic: String(r.topic ?? '').trim(),
        subtopics: String(r.subtopics ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((r) => r.topic || r.subtopics.length > 0);
    return JSON.stringify(cleaned);
  }, [rows]);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={serialized} />
      {rows.map((row, i) => (
        <div
          key={i}
          className="rounded-9e-md border border-[var(--surface-border)] p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]">
              หัวข้อที่ {i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" /> ลบ
            </button>
          </div>
          <input
            type="text"
            value={row.topic}
            onChange={(e) => updateRow(i, 'topic', e.target.value)}
            placeholder="ชื่อหัวข้อหลัก"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
          <textarea
            value={row.subtopics}
            onChange={(e) => updateRow(i, 'subtopics', e.target.value)}
            placeholder="หัวข้อย่อย (1 บรรทัด = 1 อย่าง)"
            rows={3}
            className="mt-2 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
      >
        <Plus className="h-3.5 w-3.5" /> เพิ่มหัวข้อ
      </button>
    </div>
  );
}
