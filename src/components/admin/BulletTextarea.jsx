'use client';

import { useEffect, useRef, useState } from 'react';

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
  return Array.isArray(v) ? v.join('\n') : String(v ?? '');
}

export function BulletTextarea({
  name,
  defaultValue = '',
  label,
  hint,
  placeholder,
  rows = 5,
  urls = false,
  onChange = null,
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

  const lines = value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

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
        placeholder={
          placeholder ||
          (urls
            ? 'วาง URL ทีละบรรทัด'
            : '1 บรรทัด = 1 รายการ (กด Enter เพื่อขึ้นบรรทัดใหม่)')
        }
        spellCheck={!urls}
        className={
          'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white ' +
          (urls ? 'font-mono text-xs' : '')
        }
      />
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
