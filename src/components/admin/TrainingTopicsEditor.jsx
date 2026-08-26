'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { TopicBulletsEditor } from '@/components/admin/TopicBulletsEditor';
import { buildTopicSavePayload } from '@/lib/courses/topicEditorSave';

/**
 * TrainingTopicsEditor — dynamic list of `{ title, bullets[] }`.
 *
 * ══ THE KEY NAMES ARE title / bullets ══════════════════════════════════════
 * This editor used to read and write `{ topic, subtopics }`, which MSDB does
 * not store. It therefore rendered blank against perfectly good data, and a
 * save wrote those blanks back under keys the upstream schema discards — see
 * src/lib/courses/trainingTopics.js for the measurement and the damage.
 *
 * ══ THE BULLETS ARE NOW RICH, THE TITLES ARE NOT ═══════════════════════════
 *
 * Each row's bullets are edited in a `TopicBulletsEditor` (Tiptap, bullet lists
 * only, three levels) and carried as HTML. Row TITLES stay plain `<input>`s and
 * stay MSDB-owned, by settled agreement: MSDB's own admin form edits them, and
 * a title that became rich here would be a field two systems format differently.
 *
 * ── THE HIDDEN INPUT STILL CARRIES `[{ title, bullets[] }]` ────────────────
 * Unchanged, deliberately. `parseTrainingTopicsValue` on the server, MSDB's
 * schema, and every consortium consumer of GET /api/ai/public-course all read
 * that shape. The rich HTML is a SECOND, genesis-side copy — it never replaces
 * the plain projection, it accompanies it.
 *
 * ── ONE FUNCTION PRODUCES BOTH HALVES ─────────────────────────────────────
 * `buildTopicSavePayload` returns the plain projection AND the per-row HTML
 * from one pass over one list, so the two are index-aligned structurally
 * rather than by two `.filter()`s agreeing. `onRowsChange` hands the rich half
 * up to CourseForm, which sends it to the extension store; the hidden input
 * carries the plain half to MSDB. Neither is derived from the other.
 *
 * ══ A TITLE-ONLY ROW IS CONTENT, AND GETS A REAL, EMPTY EDITOR ═════════════
 *
 * 125 rows across 27 courses carry a real title and no bullets — "Part 9.
 * สรุปเนื้อหา และ Q&A" and the like. They are legitimate headings, and on the
 * PAGE they render no panel element at all (measured). On the FORM they must
 * still get a working, empty editor an admin can type the first bullet into:
 * collapsing or hiding it would make those 125 rows the only ones in the
 * catalogue that cannot gain a bullet.
 *
 * The two directions of the filter are both live and both tested:
 *   · a title-only row must keep SURVIVING  (`title || bullets.length > 0`);
 *   · a row left completely empty must keep being DROPPED — an empty editor
 *     serialises to '' and not to `<ul></ul>`, so it does not start counting
 *     as content.
 *
 * Init pattern
 *   We seed `useState` with a normalisation of the prop at mount, then run an
 *   effect that re-syncs IF the prop reference changes from empty → non-empty
 *   (e.g. the parent finished an async fetch after first paint). Once the
 *   editor has rows we do not clobber them on subsequent prop changes — that
 *   would erase admin-typed input whenever the parent re-renders.
 */
function normalise(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      title: String(row?.title ?? ''),
      html: String(row?.html ?? ''),
    }))
    .filter((r) => r.title || r.html.length > 0);
}

export function TrainingTopicsEditor({
  name = 'training_topics',
  initialTopics,
  defaultValue,
  onRowsChange,
  staleWarning = '',
}) {
  const seedSource = initialTopics ?? defaultValue ?? [];
  const seedNormalised = useMemo(() => normalise(seedSource), [seedSource]);

  const [rows, setRows] = useState(() =>
    seedNormalised.length > 0 ? seedNormalised : [{ title: '', html: '' }]
  );

  // If the parent passes a non-empty seed AFTER first paint (async data arrived
  // late), populate the editor — but only when the user has not touched the
  // placeholder row yet. `hasUserEditedRef` protects against clobbering real
  // input.
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
    setRows((cur) => cur.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    markEdited();
    setRows((cur) => [...cur, { title: '', html: '' }]);
  }
  function removeRow(idx) {
    markEdited();
    setRows((cur) => cur.filter((_, i) => i !== idx));
  }

  /**
   * Both halves, from the one list, on every edit.
   *
   * Recomputed per keystroke — the sanitiser runs once per row per change. The
   * list is small (the largest live course is 28 rows) and the strings are
   * short, so this is cheaper than a cache that could hand back a stale
   * projection for a row whose HTML changed.
   */
  const payload = useMemo(() => buildTopicSavePayload(rows), [rows]);
  const serialized = useMemo(() => JSON.stringify(payload.plain), [payload]);

  /**
   * Hand the rich half up.
   *
   * In an effect rather than during render: calling the parent setter while
   * rendering is a React error, and the parent stores this in state that feeds
   * both the save and the unsaved-changes signature.
   */
  const onRowsChangeRef = useRef(onRowsChange);
  onRowsChangeRef.current = onRowsChange;
  useEffect(() => {
    onRowsChangeRef.current?.(payload.rich);
  }, [payload]);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={serialized} />

      {/* ── THE STALE WARNING ────────────────────────────────────────────
          Rendered from a non-empty string, so an empty banner is not a
          reachable state. Without this, an admin opens a course whose rich
          copy was discarded, sees plain text, assumes nobody formatted it,
          saves, and destroys the only copy of that work — MSDB never had it.
          See lib/courses/topicEditorSeed. */}
      {staleWarning ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-9e-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{staleWarning}</span>
        </div>
      ) : null}

      {rows.map((row, i) => (
        <div key={i} className="rounded-9e-md border border-[var(--surface-border)] p-3">
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
            value={row.title}
            onChange={(e) => updateRow(i, 'title', e.target.value)}
            placeholder="ชื่อหัวข้อหลัก"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
          {/* ALWAYS RENDERED, including for a row with no bullets. A title-only
              row is 125-rows-worth of real content and must be able to gain a
              first bullet. */}
          <div className="mt-2">
            <TopicBulletsEditor
              value={row.html}
              onChange={(html) => updateRow(i, 'html', html)}
            />
          </div>
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
