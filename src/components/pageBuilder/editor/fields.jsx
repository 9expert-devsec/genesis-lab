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

/**
 * A TOGGLE SWITCH, for one boolean whose setting has a name — round 52.
 *
 * ── THERE WAS NO PRIMITIVE TO REUSE, AND THAT WAS MEASURED ────────────────
 * Nothing in this codebase renders a switch. `src/components/ui/` has
 * `checkbox.jsx` and no switch; `@radix-ui/react-switch` is not a dependency
 * (dialog, dropdown-menu, label, slot and tabs are); nothing under
 * `components/pageBuilder/` carries `role="switch"`. The settings dialog's SEO
 * indexing control is a plain checkbox and its preview section is a row of
 * buttons plus a status dot — neither is a switch. So this is the FIRST, and it
 * lives here beside Field and TextInput so it can be the only one.
 *
 * ── IT IS A REAL CHECKBOX WEARING A SWITCH ROLE ───────────────────────────
 * The input stays a native control — focusable, space-toggleable, correctly
 * announced — and the visible track is a sibling driven by `peer-checked:`.
 * That is CookieBanner's rule, whose own note earned it: “rather than a div
 * wearing a switch costume”. `role="switch"` is what changes the announcement
 * from “checkbox, checked” to “switch, on”, which is the whole difference
 * between the two shapes.
 *
 * Keeping `type="checkbox"` is also why round 50's panel-agrees-with-page test
 * survives this commit unmodified: the markup it reads is still there.
 *
 * ── STATE IS EXPOSED AS ASCII, AND ALSO IN WORDS — ROUND 53 ───────────────
 * `data-state` is "on" / "off" and is what every test reads. It is unchanged
 * from round 52 and is deliberately ASCII: a Thai state word cannot be matched
 * as a substring, because the negative CONTAINS the positive (ไม่แสดง contains
 * แสดง, exactly as เปิด contains ปิด). That is this repo's attribute-substring
 * trap wearing a different hat, and `aria-checked` is set explicitly for the
 * same reason — a value to assert on rather than a presence.
 *
 * ROUND 52 CONCLUDED FROM THAT THAT THE SWITCH SHOULD CARRY NO WORDS. That was
 * the wrong conclusion and a screenshot settled it: a bare switch is a grey
 * circle, and reading it requires knowing that knob-left means off. The trap is
 * real, but it is a TEST-WRITING problem and an author must not pay for it — so
 * the words are back, `onLabel` / `offLabel`, and the tests match ELEMENT TEXT
 * rather than substrings, which is what this repo already does for every other
 * Thai label. A control in test/render/priceToggleLegibility proves a
 * bare-substring matcher cannot tell the two states apart here.
 *
 * The state word is a SECOND reading of one fact, and that is the point of it:
 * position and word say the same thing, so an author who does not know the
 * convention can still read the control. It is not a second source of truth —
 * both derive from `checked` in this one expression.
 *
 * ── ROUND 52 ALSO SAID THIS WAS THE CODEBASE'S FIRST TOGGLE. IT WAS NOT ────
 * Three hand-rolled ones already existed and its search missed them, because it
 * looked for role="switch" and aria-checked and all three are bare <button>s
 * carrying neither: MasterclassCourseFormClient, MasterclassBatchListClient and
 * CourseFaqManager. They are NOT consolidated here — that is three admin
 * surfaces this round has no business restyling — but two things were taken
 * from them rather than invented, because a house size that already exists is
 * worth matching: the track/knob proportion and the travel.
 *
 * What was NOT taken is their colour. All three name a green and a dark blue
 * as raw hex literals in source, which is a guard violation everywhere the hex
 * scanner reaches — those files simply are not scanned. Round 30's rule
 * stands: an author's colour is DATA, a source colour is a TOKEN. The track
 * here paints with the action token, which is the page builder panel's own
 * interactive colour.
 *
 * TYPE SIZE is the shared scale's smallest step. Round 17 minted no type
 * tokens, and this file's own guard in test/render/panelPolish holds these
 * primitives to that scale — round 52's first run came back 6-failures-not-5
 * on exactly that, from a size written as an arbitrary value.
 */
export function Toggle({ checked, onChange, onLabel, offLabel }) {
  const on = checked === true;
  const word = on ? onLabel : offLabel;
  return (
    <span className="flex items-center gap-2">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        aria-checked={on}
        data-state={on ? 'on' : 'off'}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
          'border-9e-slate-lt-400 bg-9e-slate-lt-400',
          'dark:border-9e-slate-dp-50 dark:bg-9e-slate-dp-50',
          'peer-checked:border-9e-action peer-checked:bg-9e-action',
          'dark:peer-checked:border-9e-action dark:peer-checked:bg-9e-action',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-9e-brand peer-focus-visible:ring-offset-1',
          // The knob is a DESCENDANT of this span, not a sibling of the input,
          // so a bare peer variant on the knob itself would compile to a
          // sibling selector that never matches. Reach down from here, where
          // the peer relationship actually holds — CookieBanner's lesson.
          'peer-checked:[&>span]:translate-x-4',
        )}
      >
        <span className="absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform" />
      </span>
      {word && (
        <span data-testid="toggle-state" className="text-xs text-9e-navy dark:text-white/90">
          {word}
        </span>
      )}
    </span>
  );
}
