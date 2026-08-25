'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { labelFor } from '@/lib/pageBuilder/presetLabels';

/**
 * Shared form primitives for the settings panel (5a envelope + 5b per-type
 * content). One set, so a field looks and behaves the same wherever it appears.
 *
 * ── SIZES AND SPACING COME OFF THE SHARED SCALES, NOT OUT OF THE AIR ───────
 * These primitives used to carry three off-scale type sizes. There is no 9e-
 * type token family — tailwind.config.js extends colour, radius, shadow and
 * motion, and nothing else — so the shared scale here is Tailwind's own, whose
 * smallest step is 12px. Everything below now sits on it, and hierarchy is
 * carried by weight and colour instead, which these already did.
 *
 * Blast radius, stated rather than discovered: the three builder dialogs
 * (settings / preview / publish) import these too, so they take the same
 * treatment. That is the point of a shared primitive; none of their layout,
 * copy or fields changes.
 */

export const INPUT_CLASS =
  'w-full rounded-9e-sm border border-[var(--surface-border)] bg-[var(--surface)] ' +
  'px-2 py-1.5 text-xs text-9e-navy dark:text-white';

export function Field({ label, hint, children }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-medium text-9e-navy dark:text-white/90">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-9e-slate-dp-50">{hint}</span>}
    </label>
  );
}

export function Group({ title, children }) {
  return (
    <fieldset className="mb-5 border-t border-[var(--surface-border)] pt-3">
      <legend className="pr-2 text-xs font-bold uppercase tracking-wider text-9e-slate-dp-50">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export function Select({ value, onChange, options, labels, placeholder }) {
  return (
    <select className={INPUT_CLASS} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={String(o)} value={String(o)}>{labelFor(labels, o)}</option>
      ))}
    </select>
  );
}

export function TextInput({ value, onChange, invalid, ...rest }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={cn(INPUT_CLASS, invalid && 'border-red-400')}
      {...rest}
    />
  );
}

export function TextArea({ value, onChange, rows = 3, mono, ...rest }) {
  return (
    <textarea
      rows={rows}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={cn(INPUT_CLASS, mono && 'font-mono')}
      {...rest}
    />
  );
}

/**
 * An inline warning at the point of authoring.
 *
 * The 'amber'/'red' tones exist because each describes something the RENDERER
 * does silently: drops an invalid sectionId, refuses an unsafe href, skips a
 * button with no label. The renderer warns to a dev console nobody has open while
 * authoring, so the author would learn from the live page or not at all.
 *
 * The 'info' tone (2C.2b) is DIFFERENT in kind: it does not describe a problem.
 * It is the sample label for the derived/time-varying sections (course_schedule,
 * course_list source=skill|program) — the canvas shows an edit-time SAMPLE, and
 * this says so. It gets a blue CI token + an Info icon, deliberately NOT the
 * amber/red AlertTriangle, so an author never reads "this is a sample" as "this
 * is broken" — the exact conflation the Browser-pass-#2 label exists to prevent
 * (docs/page-builder-status.md §2C.2b).
 */
export function Warn({ children, tone = 'amber' }) {
  const isInfo = tone === 'info';
  const Icon = isInfo ? Info : AlertTriangle;
  return (
    <p
      role={isInfo ? 'note' : 'alert'}
      className={cn(
        '-mt-1.5 mb-3 flex items-start gap-1 text-xs',
        tone === 'red' ? 'text-red-600'
          : isInfo ? 'text-9e-action dark:text-9e-air'
          : 'text-amber-700 dark:text-amber-400'
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
