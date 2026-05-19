'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

/**
 * TrainingTopicsEditor — dynamic list of `{ topic, subtopics[] }`.
 *
 * Renders editable rows and serialises the whole list into a single
 * hidden input (`name={name}`, default "training_topics") as JSON. The
 * server-side `parseTrainingTopics()` helper in
 * `src/lib/actions/courses.js` decodes it back into structured form.
 *
 * Props
 *   name          FormData key for the hidden input (default "training_topics")
 *   defaultValue  initial array of { topic, subtopics: [] | string }
 */
export function TrainingTopicsEditor({
  name = 'training_topics',
  defaultValue = [],
}) {
  const [rows, setRows] = useState(() => {
    const seed = Array.isArray(defaultValue) ? defaultValue : [];
    if (seed.length === 0) return [{ topic: '', subtopics: '' }];
    return seed.map((row) => ({
      topic: String(row?.topic ?? ''),
      // Render subtopics as newline-joined text for the textarea.
      subtopics: Array.isArray(row?.subtopics)
        ? row.subtopics.join('\n')
        : String(row?.subtopics ?? ''),
    }));
  });

  function updateRow(idx, field, value) {
    setRows((cur) =>
      cur.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }
  function addRow() {
    setRows((cur) => [...cur, { topic: '', subtopics: '' }]);
  }
  function removeRow(idx) {
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
