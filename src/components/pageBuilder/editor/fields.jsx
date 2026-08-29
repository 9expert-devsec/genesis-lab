'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { labelFor } from '@/lib/pageBuilder/presetLabels';
// Round 39, ADDED beside the statement above rather than folded into it — the
// standing rule in this directory.
import { isHexColor, COLOR_INPUT_FALLBACK } from '@/lib/pageBuilder/customColor';

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

/**
 * ── ROUND 28: THE FIGMA'S FIELD METRICS, RESOLVED ONTO THE SHARED SCALES ────
 * The design draws the input at 36.5px tall with 10px of horizontal padding and
 * a 7px radius, and the label at 11px bold. Three of those four have a nearest
 * step and take it: px-2.5 IS 10px, py-2 puts the box at 34px, and rounded-9e-sm
 * IS 8px — one off the drawn 7, and the token wins because a radius token scale
 * exists and 7 is not on it. The 11px label does NOT have a step; it goes to
 * text-xs (12px), the scale's smallest, which is round 17's standing ruling and
 * not a new decision. Only the WEIGHT moves, medium → bold, because that the
 * scale can express exactly.
 */
export const INPUT_CLASS =
  'w-full rounded-9e-sm border border-[var(--surface-border)] bg-[var(--surface)] ' +
  'px-2.5 py-2 text-xs text-9e-navy dark:text-white';

export function Field({ label, hint, children }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-bold text-9e-navy dark:text-white/90">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-9e-slate-dp-50">{hint}</span>}
    </label>
  );
}

/**
 * `Field`, for a control that is NOT a single input — added round 47/48.
 *
 * `Field` wraps its children in a `<label>`, which is right for one input and
 * wrong for a list of rows: a `<label>` forwards a click on any non-interactive
 * part of itself to the first labelable control inside it, and `<button>` is
 * labelable. Wrapping the course picker's rows in `Field` would mean a stray
 * click on the padding fired “move row 1 up”.
 *
 * Same markup and the same class strings otherwise, so the two look identical
 * in the panel — which is the point of it living here rather than being an
 * inline copy of Field's classes in one component.
 */
export function FieldBlock({ label, hint, children }) {
  return (
    <div className="mb-3 block">
      <span className="mb-1.5 block text-xs font-bold text-9e-navy dark:text-white/90">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-9e-slate-dp-50">{hint}</span>}
    </div>
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

/**
 * A colour input — round 39. The swatch picker and the hex box are ONE control.
 *
 * ── WHY BOTH HALVES ────────────────────────────────────────────────────────
 * The picker is how a colour is chosen and the text box is how a BRAND colour
 * is entered: an author with `#0d1b2a` in a style guide pastes it, and hunting
 * for it in a gradient square is not a thing anyone should have to do. They read
 * and write the same value, so neither is a second authority.
 *
 * ── THE PICKER'S STARTING POSITION IS NOT A STORED VALUE ───────────────────
 * `<input type="color">` has no empty state — handed nothing it shows black. So
 * an untouched control opens on COLOR_INPUT_FALLBACK, which is derived from the
 * pinned navy triple rather than written as a literal (round 30's ban is on a
 * colour DECIDED in source). Nothing writes it: `onChange` only fires when the
 * author actually picks, and the text box passes its value through raw so a
 * half-typed hex is stored as typed and refused by the schema rather than
 * silently corrected under the cursor.
 */
export function ColorInput({ value, onChange, invalid, placeholder }) {
  const swatch = isHexColor(value) ? value : COLOR_INPUT_FALLBACK;
  /**
   * A `div`, NOT a `span`, and it is not a style choice. `Field` renders
   * `<label><span>label</span>{children}<span>hint</span></label>`, and every
   * hint reader in the test tier takes the SECOND direct `span` child. A span
   * wrapper here becomes that second child and the hint silently reads empty —
   * which is exactly what happened, on a control whose hint is the round's
   * caveat copy. Conforming to the contract beats bending three readers.
   */
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="เลือกสี"
        value={swatch}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-9e-sm border border-[var(--surface-border)] bg-[var(--surface)] p-0.5"
      />
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className={cn(INPUT_CLASS, 'font-mono', invalid && 'border-red-400')}
      />
    </div>
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
