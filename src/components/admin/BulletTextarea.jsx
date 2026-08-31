'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import {
  parseBulletLines,
  formatBulletLines,
  isBulletMarkerKind,
  numberLabel,
} from '@/lib/courses/bulletLines';

/**
 * BulletTextarea — newline-separated list editor.
 *
 * One line in the textarea = one item. The component renders as a
 * `<textarea name={name}>` so it Just Works with `new FormData(form)`
 * or `FormData.get/getAll`. The server-side `linesOf()` helper in
 * `src/lib/actions/courses.js` splits the raw value back into an
 * array on submit.
 *
 * Props
 *   name        FormData key
 *   defaultValue  initial text OR array (joined with \n for display)
 *   label       visible label
 *   hint        small print under the label
 *   placeholder placeholder text
 *   rows        textarea rows (default 5)
 *   urls        true → validate each line as a URL and surface a small warning
 *
 * Note on initial values: we seed `useState` lazily AND run an effect
 * that copies a non-empty `defaultValue` into state ONCE — protects
 * against the parent passing the prop async (e.g. after a refresh)
 * while still letting the user clear the field afterwards. The
 * `hasUserEditedRef` flag stops the effect from clobbering live input.
 */
function normaliseDefault(v) {
  return formatBulletLines(v);
}

/**
 * `marker` — OPTIONAL, and opt-in on purpose.
 *
 * When set to 'number' or 'check' the component renders a small PREVIEW under
 * the textarea, showing each line the way the public page will: วัตถุประสงค์
 * numbered like CourseObjectives.jsx:12, the other three check-marked like
 * CourseTarget / CoursePrerequisites / CourseRequirements.
 *
 * THE PREVIEW IS PRESENTATION AND TOUCHES NOTHING. The <textarea> remains the
 * only named control, its value is still exactly the lines the admin typed, and
 * the payload still goes through `linesOf`. No marker is ever written into the
 * value — measured: zero of the 1118 stored items across those four fields
 * carries one, and the public page adds its own, so a stored marker would make
 * the live page read "1. 1. …".
 *
 * Defaulting to undefined keeps every other consumer byte-identical: this
 * component is shared with the career-path and masterclass forms, which pass no
 * marker and render exactly as before.
 */
/**
 * `readOnly` / `note` — OPT-IN, and both default to off so every other consumer
 * of this shared component (the career-path and masterclass forms) is
 * byte-identical.
 *
 * They exist for a field genesis can DISPLAY but cannot SAVE. `readOnly` is
 * deliberately not `disabled`: a disabled control is dropped from the form
 * entirely and greys its text past readability, while a read-only one stays
 * selectable and copyable — which is the whole remaining value of the field.
 * That it still submits its value is harmless here and checked rather than
 * assumed: the payload omits the key, so nothing reads what it posts.
 */
export function BulletTextarea({
  name,
  defaultValue = '',
  label,
  hint,
  placeholder,
  rows = 5,
  urls = false,
  onChange = null,
  marker = null,
  readOnly = false,
  note = null,
}) {
  const seed = normaliseDefault(defaultValue);
  const [value, setValueState] = useState(seed);
  const hasUserEditedRef = useRef(false);

  // Late-arriving seed (parent finished async data fetch after first
  // paint). Only honored when the user hasn't touched the field yet.
  useEffect(() => {
    if (hasUserEditedRef.current) return;
    if (!seed) return;
    setValueState((cur) => (cur ? cur : seed));
  }, [seed]);

  function setValue(next) {
    hasUserEditedRef.current = true;
    setValueState(next);
    if (typeof onChange === 'function') onChange(next);
  }

  // Exactly what `linesOf` will produce on submit — the count below and the
  // preview must describe the payload, not an approximation of it.
  const lines = parseBulletLines(value);
  const showPreview = isBulletMarkerKind(marker) && lines.length > 0;

  let invalidUrlCount = 0;
  if (urls) {
    for (const line of lines) {
      try { new URL(line); } catch { invalidUrlCount++; }
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-9e-navy dark:text-white">
          {label}
        </label>
      )}
      {hint && (
        <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {hint}
        </p>
      )}
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        readOnly={readOnly}
        placeholder={
          placeholder ||
          (urls
            ? 'วาง URL ทีละบรรทัด'
            : '1 บรรทัด = 1 รายการ (กด Enter เพื่อขึ้นบรรทัดใหม่)')
        }
        spellCheck={!urls}
        className={
          'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] px-3 py-2 text-sm focus:outline-none ' +
          (readOnly
            ? 'cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)] '
            : 'bg-white text-9e-navy focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white ') +
          (urls ? 'font-mono text-xs' : '')
        }
      />
      {note && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{note}</p>
      )}
      {showPreview && (
        <div
          aria-hidden="true"
          className="mt-2 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2"
        >
          <p className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            ตัวอย่างการแสดงผลบนหน้าเว็บ
          </p>
          {/* aria-hidden above: this duplicates the textarea's content, and a
              screen reader announcing every item twice is worse than not
              announcing the preview at all. The textarea is the control. */}
          {marker === 'number' ? (
            <ol className="space-y-1">
              {lines.map((line, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-[var(--text-primary)]">
                  <span className="shrink-0 font-bold text-9e-action dark:text-[#48B0FF]">
                    {numberLabel(i)}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="space-y-1">
              {lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-primary)]">
                  <CheckCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-9e-action dark:text-[#48B0FF]"
                    strokeWidth={2}
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-1 flex items-center justify-between text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
        <span>รวม {lines.length} รายการ</span>
        {urls && invalidUrlCount > 0 && (
          <span className="text-amber-600">
            {invalidUrlCount} บรรทัดไม่ใช่ URL ที่ถูกต้อง
          </span>
        )}
      </div>
    </div>
  );
}
