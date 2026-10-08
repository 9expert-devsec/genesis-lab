'use client';

import { RATIOS, COLUMNS, BUTTON_STYLES, CARD_STYLES } from '@/lib/schemas/pageBuilder';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory. Round E: card_grid's per-item box.
import { ITEM_FRAMES } from '@/lib/schemas/pageBuilder';
import {
  RATIO_LABELS, COLUMNS_LABELS, BUTTON_STYLE_LABELS, MOBILE_BEHAVIOR_LABELS, CARD_STYLE_LABELS,
} from '@/lib/pageBuilder/presetLabels';
// ADDED beside the statement above rather than folded into it. Same round.
import { ITEM_FRAME_LABELS } from '@/lib/pageBuilder/presetLabels';
// ADDED beside the statement above rather than folded into it. Same round as
// the two imports below it: the whole-card style's option labels.
import { BUNDLE_CARD_THEME_LABELS } from '@/lib/pageBuilder/presetLabels';
import { SECTION_STYLE_CAPS } from '@/lib/pageBuilder/presets';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory. The navy bundle round: the two new caps' defaults and
// width vocabulary, so the controls below open on the same values the renderer
// falls back to instead of restating them.
import {
  BUNDLE_GLOW_LEFT_DEFAULT,
  BUNDLE_GLOW_RIGHT_DEFAULT,
  BUNDLE_BORDER_COLOR_DEFAULT,
  BUNDLE_BORDER_WIDTH_DEFAULT,
  BUNDLE_BORDER_WIDTHS,
} from '@/lib/pageBuilder/presets';
import { isHexColor } from '@/lib/pageBuilder/customColor';
// ADDED beside the statement above rather than folded into it. The
// selectable-card round: the two whole-card styles, their resolved default, and
// the resolver the glow control asks whether it is live.
import { BUNDLE_CARD_THEME_DEFAULT, bundleCardThemeFor } from '@/lib/pageBuilder/presets';
import { BUNDLE_CARD_THEMES } from '@/lib/schemas/pageBuilder';
import { Field, Group, Select } from './fields';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory. `FieldBlock` is Field's non-label twin: same markup
// and classes, a <div> instead of a <label>, and it exists precisely because a
// block-level label turns a whole row into a click target. The border switch
// needs it; see CardBorderField.
import { FieldBlock } from './fields';
// ADDED beside the statement above rather than folded into it. Same round: the
// bundle's colour and on/off controls reuse the pickers round 39 already built
// rather than introducing a second picker with its own validation.
import { ColorInput, Toggle } from './fields';

/**
 * Per-type layout/style controls (5b).
 *
 * These are NOT in the universal envelope because they are not universal: each
 * is read by some components and ignored by the rest, so showing them for every
 * section would put controls in front of an author that do nothing.
 *
 * ── STYLE controls: derived from ONE source, cannot drift (2C.3) ──────────
 * `style.cardStyle` / `style.buttonStyle` controls are NOT hardcoded here — they
 * are DERIVED from `SECTION_STYLE_CAPS` (presets.js), the same declaration the
 * components read from via the capability helpers (cardSurfaceClass /
 * accentButtonClass). Reading a prop and offering its control are one act, so the
 * panel↔component reader-set drift 2C.3 existed to prevent is now structurally
 * impossible — not a check that catches it, but a shape where it can't happen.
 * As of 2C.3: cardStyle → price_card, stat_card, icon_card; buttonStyle → cta,
 * price_card (all in SECTION_STYLE_CAPS). Three witnesses guard the structure
 * (behavioral: the wire renders; structural: the panel derives; import-scan: the
 * raw class fns stay private) — see the test/ tier.
 *
 * ── LAYOUT controls: still hardcoded (a separate correspondence) ─────────
 * `layout.ratio` → two_column · `layout.columns` → card_grid, highlight_grid ·
 * `layout.itemFrame` → card_grid (round E).
 * These stay a hardcoded per-type map: 2C.3 folded in only the STYLE props. The
 * same single-source pattern applies here later — but only after confirming the
 * layout readers are uniform first (the precondition that made 2C.3 safe).
 *
 * ROUND E is evidence for that precondition rather than against it: `itemFrame`
 * is read by ONE type and would have to be declared per-type in any single
 * source too, so folding the layout map in is still a real change and still
 * needs the uniformity check it has always needed. The list above is amended,
 * because a prop read without its control listed here is exactly the silent
 * drift these notes exist to prevent.
 *
 * ── mobileBehavior is scoped per type, not offered whole ─────────────────
 * The schema vocabulary is [stack, reverse_stack, hide, carousel], but no
 * component honours more than one of them beyond the `stack` default:
 *
 *   two_column  reads ONLY `reverse_stack` (renders left with max-lg:order-2)
 *   card_grid   reads ONLY `carousel`      (applies the carousel classes)
 *   `hide`      reaches NO component at all — MOBILE_BEHAVIOR_CLASS.hide is
 *               only reachable through mobileBehaviorClass(), which only
 *               card_grid calls, and only for 'carousel'.
 *
 * Offering the full vocabulary would mean two dead options on each type and a
 * value (`hide`) that is dead everywhere. So each type offers `stack` plus the
 * one behaviour it honours. When a component learns another, this list grows —
 * and the check fails first to say so.
 */

const RATIO_HINT = 'สัดส่วนความกว้างซ้าย : ขวา (จอใหญ่)';

function MobileBehaviorField({ layout, patch, options }) {
  return (
    <Field label="บนมือถือ">
      <Select
        value={layout?.mobileBehavior ?? 'stack'} options={options} labels={MOBILE_BEHAVIOR_LABELS}
        onChange={(v) => patch({ mobileBehavior: v })}
      />
    </Field>
  );
}

function ButtonStyleField({ style, patchStyle }) {
  return (
    <Field label="สไตล์ปุ่ม" hint="สีตามสีเน้นของ section">
      <Select value={style?.buttonStyle ?? 'primary'} options={BUTTON_STYLES} labels={BUTTON_STYLE_LABELS}
        onChange={(v) => patchStyle({ buttonStyle: v })} />
    </Field>
  );
}

function CardStyleField({ style, patchStyle }) {
  return (
    <Field label="สไตล์การ์ด">
      <Select value={style?.cardStyle ?? 'plain'} options={CARD_STYLES} labels={CARD_STYLE_LABELS}
        onChange={(v) => patchStyle({ cardStyle: v })} />
    </Field>
  );
}

/**
 * ── THE NAVY BUNDLE CARD'S TWO CONTROLS ───────────────────────────────────
 *
 * They live here, beside CardStyleField and ButtonStyleField, because 2C.3 says
 * the panel's controls are DERIVED from `SECTION_STYLE_CAPS` — so a cap added
 * to that map and a control added to `STYLE_CONTROL` below are one edit, and
 * `test/render/styleCaps` fails the moment they are not.
 *
 * ── RESET WRITES `undefined`, NOT THE DEFAULT LITERAL ─────────────────────
 * The load-bearing detail of both controls. Every field here is `.optional()`
 * with no schema default, and the resolvers in presets.js supply the default at
 * render time. So "คืนค่าเริ่มต้น" must REMOVE the key rather than store the
 * default colour: storing it would pin the section to today's blue for ever,
 * and a later change to `BUNDLE_GLOW_LEFT_DEFAULT` would move every bundle
 * except the ones whose author had pressed reset. Removing it keeps the section
 * following the default, which is what the author just asked for.
 *
 * `patchStyle({ k: undefined })` is the shape that does it — the same shape
 * SettingsPanel's preset-mode switch already uses to clear `backgroundMode`.
 */
function ResetToDefault({ onReset, disabled }) {
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={disabled}
      className="shrink-0 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      คืนค่าเริ่มต้น
    </button>
  );
}

/**
 * One picker row: the shared ColorInput (which carries its own live swatch —
 * the `<input type="color">` IS the swatch, and it tracks the text box because
 * both read and write the same value) plus the reset action.
 *
 * `invalid` is passed through so a half-typed hex reddens the text box at the
 * field, synchronously. It is NOT corrected under the cursor: ColorInput's own
 * note states why, and the schema refuses the bad value at save while the
 * resolver falls back to the default at render — so a typo can never reach the
 * page as a broken style.
 */
function GlowPicker({ label, hint, value, fallback, onChange, onReset }) {
  return (
    <Field label={label} hint={hint}>
      {/*
        The `disabled` prop this took is GONE. It existed only so
        `BundleGlowField` could dim the two pickers on a สีขาว card; that control
        now renders nothing at all instead, so the parameter had no caller left
        — a control with no reader, which is what this repo removes rather than
        leave lying around for the next person to wire up by accident.
      */}
      <span className="flex items-center gap-2">
        <ColorInput
          value={value}
          onChange={onChange}
          invalid={value !== undefined && value !== '' && !isHexColor(value)}
          placeholder={fallback}
        />
        <ResetToDefault onReset={onReset} disabled={value === undefined} />
      </span>
    </Field>
  );
}

/**
 * The whole-card style. FIRST in the caps array, because it decides whether the
 * two controls after it do anything.
 *
 * `?? BUNDLE_CARD_THEME_DEFAULT` rather than a literal: the field is
 * `.optional()` with no schema default, so the control's opening position and
 * the renderer's fallback are the same constant or they are a bug.
 */
function BundleCardThemeField({ style, patchStyle }) {
  return (
    <Field label="สไตล์การ์ด" hint="สีขาวจะไล่ตามธีมของเว็บ ส่วน Navy เป็นสีเข้มทั้งสองธีม">
      <Select
        value={style?.bundleCardTheme ?? BUNDLE_CARD_THEME_DEFAULT}
        options={BUNDLE_CARD_THEMES}
        labels={BUNDLE_CARD_THEME_LABELS}
        onChange={(v) => patchStyle({ bundleCardTheme: v })}
      />
    </Field>
  );
}

/**
 * The two glow pickers — NOT RENDERED AT ALL when the card is สีขาว.
 *
 * ── THIS WAS "DISABLED WITH A HINT" LAST ROUND, AND THE REASON WAS WRONG ──
 * The argument was that `test/render/styleCaps` asserts the panel offers
 * exactly the declared caps, so a control returning null for some values of
 * another control would be "a cap the panel cannot render". That reading does
 * not survive looking at what the test actually does: it compares
 * `styleControlsFor(type)` — a pure function over `SECTION_STYLE_CAPS` and the
 * `STYLE_CONTROL` keys — to the caps array. It never mounts anything. So what
 * a control RENDERS for a given `style` is outside its claim entirely, and
 * `bundleGlow` stays a declared, offered cap whatever this function returns.
 *
 * With that premise gone, two dimmed pickers and a hint are just noise on the
 * default card: every stored section is สีขาว, so the panel's resting state was
 * two controls an author can neither use nor dismiss. They are gone instead.
 *
 * Stored colours are untouched — nothing is written here, the schema keeps the
 * keys, and the renderer's gate in `bundleGlowFor` is unchanged. Switching the
 * card back to Navy brings the pickers back with the author's pair still in
 * them, which is the behaviour the hint used to have to promise in words.
 *
 * `bundleCardThemeFor` is asked rather than `style?.bundleCardTheme` compared
 * to a literal, so the panel and the renderer resolve the theme through one
 * function. An out-of-vocabulary stored value hides the pickers in the panel
 * exactly where it renders a light card.
 */
function BundleGlowField({ style, patchStyle }) {
  if (bundleCardThemeFor('promotion_bundle', style) !== 'navy') return null;
  return (
    <>
      <GlowPicker
        label="สีแสงด้านซ้าย"
        hint={`แสงมุมล่างซ้ายของการ์ด — ค่าเริ่มต้น ${BUNDLE_GLOW_LEFT_DEFAULT}`}
        value={style?.bundleGlowLeft}
        fallback={BUNDLE_GLOW_LEFT_DEFAULT}
        onChange={(v) => patchStyle({ bundleGlowLeft: v })}
        onReset={() => patchStyle({ bundleGlowLeft: undefined })}
      />
      <GlowPicker
        label="สีแสงด้านขวา"
        hint={`แสงมุมบนขวาของการ์ด — ค่าเริ่มต้น ${BUNDLE_GLOW_RIGHT_DEFAULT}`}
        value={style?.bundleGlowRight}
        fallback={BUNDLE_GLOW_RIGHT_DEFAULT}
        onChange={(v) => patchStyle({ bundleGlowRight: v })}
        onReset={() => patchStyle({ bundleGlowRight: undefined })}
      />
    </>
  );
}

/**
 * The border: a switch, and the colour/width rows only once it is ON.
 *
 * ── THE FULL-WIDTH ROW USED TO TOGGLE IT, AND WHY ────────────────────────
 * Reported from a screenshot: clicking empty space far to the right of the
 * switch flipped it. MEASURED against the panel's other switches — this
 * control was ALREADY using the shared `Toggle`, byte-identically (same
 * `peer sr-only` input, `role="switch"`, `aria-checked`, `data-state`, same
 * track classes, same `toggle-state` text). There was no bespoke toggle to
 * replace.
 *
 * The cause is the WRAPPER. `Field` renders `<label className="mb-3 block">`,
 * and a `<label>` forwards a click on any non-interactive part of itself to the
 * first labelable control inside it — so a block-level label makes the whole
 * row a hit target. `fields.jsx` already documents this exact failure mode in
 * `FieldBlock`'s own docstring, which exists because the course-picker rows hit
 * it first ("a stray click on the padding fired 'move row 1 up'").
 *
 * So the fix is `FieldBlock` (a `<div>`, same classes, identical appearance)
 * plus an INLINE `w-fit` label around the name and the switch. The label still
 * associates the two — the input keeps an accessible name, and clicking the
 * words แสดงเส้นขอบ still works, which is the affordance a switch should have —
 * but it is now only as wide as its own content, so blank row space to its
 * right does nothing.
 *
 * ── THIS IS NOT FIXED FOR THE OTHER THREE SWITCHES, DELIBERATELY ─────────
 * All four `Toggle` call sites in the page builder use `Field` and so all four
 * have the same full-row target: `settings.backgroundPin` (SettingsPanel),
 * `registrationOpen` and one other in SectionContentEditor, and this one.
 * Changing `Field` would fix every switch and also change every other row in
 * the panel, which is a bigger blast radius than this round has measured.
 * Reported rather than fixed here.
 *
 * ── AND THE SUB-CONTROLS ARE NOW HIDDEN WHEN OFF ─────────────────────────
 * They used to stay visible, on the argument that hiding a stored colour makes
 * it look wiped. The round reverses that: an off border means three rows of
 * which two do nothing, and "looks wiped" is answered by the values actually
 * surviving — nothing here writes on hide, the schema keeps the keys, and
 * switching back on shows the author's colour and width still set.
 */
function CardBorderField({ style, patchStyle }) {
  const on = style?.cardBorderOn === true;
  return (
    <>
      {/*
        `FieldBlock` for the row, so the row is a <div> and not a label. The
        hint sits below exactly where every other panel row puts it.
      */}
      <FieldBlock hint="ค่าเริ่มต้นคือปิด">
        {/*
          `w-fit` is the whole fix: the label shrinks to its content — the name
          above, the switch and its เปิด/ปิด text below — so it is the click
          target and the rest of the row is not. The name span reuses Field's
          own classes verbatim so the row is visually identical to its
          neighbours.
        */}
        <label className="w-fit cursor-pointer" data-testid="bundle-border-toggle-label">
          <span className="mb-1.5 block text-xs font-bold text-9e-navy dark:text-white/90">
            แสดงเส้นขอบ
          </span>
          <Toggle
            checked={on}
            onChange={(v) => patchStyle({ cardBorderOn: v === true ? true : undefined })}
            onLabel="เปิด"
            offLabel="ปิด"
          />
        </label>
      </FieldBlock>
      {on && (
        <>
          <GlowPicker
            label="สีขอบ"
            hint={`ค่าเริ่มต้น ${BUNDLE_BORDER_COLOR_DEFAULT}`}
            value={style?.cardBorderColor}
            fallback={BUNDLE_BORDER_COLOR_DEFAULT}
            onChange={(v) => patchStyle({ cardBorderColor: v })}
            onReset={() => patchStyle({ cardBorderColor: undefined })}
          />
          <Field label="ความหนาขอบ" hint="1–4 พิกเซล">
            <Select
              value={String(style?.cardBorderWidth ?? BUNDLE_BORDER_WIDTH_DEFAULT)}
              options={BUNDLE_BORDER_WIDTHS.map(String)}
              labels={Object.fromEntries(BUNDLE_BORDER_WIDTHS.map((w) => [String(w), `${w}px`]))}
              /**
               * `Number(v)` is this control's JOB, not the schema's:
               * `cardBorderWidth` is a strict `z.number().int()` and a
               * `<select>` hands back a string, so a missing cast here fails
               * loudly at the save that introduced it rather than silently
               * storing "2". Same ruling as the bundle's prices.
               */
              onChange={(v) => patchStyle({ cardBorderWidth: Number(v) })}
            />
          </Field>
        </>
      )}
    </>
  );
}

// ── style controls DERIVED from the single source (2C.3) ─────────────────
// The panel offers a style control iff SECTION_STYLE_CAPS declares the type
// supports that prop — the SAME declaration the components read from (via
// presets' capability helpers). Reading a prop and offering its control are now
// one act; they cannot drift. Adding a style prop to a type = one edit to
// SECTION_STYLE_CAPS, and both the render and this control follow.
const STYLE_CONTROL = {
  cardStyle:   CardStyleField,
  buttonStyle: ButtonStyleField,
  // The navy bundle round. Declared here because the caps map declares them:
  // a cap with no entry in this object is a prop the panel cannot render, and
  // test/render/styleCaps fails on exactly that ("no cap without a control").
  bundleGlow:  BundleGlowField,
  cardBorder:  CardBorderField,
  // The selectable-card round. Listed last here and FIRST in the caps array —
  // this object is a lookup, the caps array is the order the panel renders in.
  bundleCardTheme: BundleCardThemeField,
};

/** The style-prop keys this panel will render for `type`, derived from the caps.
 *  Exported as the structural witness's target (test/render/styleCaps.test.mjs). */
export function styleControlsFor(type) {
  return (SECTION_STYLE_CAPS[type] ?? []).filter((prop) => STYLE_CONTROL[prop]);
}

// LAYOUT controls stay hardcoded per type — a SEPARATE correspondence
// (ratio/columns/mobileBehavior/itemFrame ↔ two_column/card_grid/highlight_grid)
// that 2C.3 deliberately does NOT fold in (see the doc: apply the same pattern
// later, after checking those readers are uniform first). Round E added
// `itemFrame`, on card_grid alone; highlight_grid's entry below is untouched and
// the type stays retired.
const LAYOUT_FIELDS = {
  two_column: ({ layout, patchLayout }) => (
    <Group title="เลย์เอาต์">
      <Field label="สัดส่วนคอลัมน์" hint={RATIO_HINT}>
        <Select value={layout?.ratio ?? '50-50'} options={RATIOS} labels={RATIO_LABELS}
          onChange={(v) => patchLayout({ ratio: v })} />
      </Field>
      {/* two_column honours reverse_stack only. */}
      <MobileBehaviorField layout={layout} patch={patchLayout} options={['stack', 'reverse_stack']} />
    </Group>
  ),

  card_grid: ({ layout, patchLayout }) => (
    <Group title="เลย์เอาต์">
      <Field label="จำนวนคอลัมน์">
        <Select value={layout?.columns ?? 3} options={COLUMNS} labels={COLUMNS_LABELS}
          onChange={(v) => patchLayout({ columns: v === 'auto_fit' ? v : Number(v) })} />
      </Field>
      {/* Round E — the per-item box, offered on card_grid ONLY. highlight_grid
          is retired and its entry below is untouched: giving the retired type a
          control for a prop it does not read would be the shape this map exists
          to avoid, and giving it one it DOES read would be re-opening a type the
          author closed. `??` defaults the display to 'none', which is what an
          absent value renders. */}
      <Field label="กรอบรายการ์ด">
        <Select value={layout?.itemFrame ?? 'none'} options={ITEM_FRAMES} labels={ITEM_FRAME_LABELS}
          onChange={(v) => patchLayout({ itemFrame: v })} />
      </Field>
      {/* card_grid honours carousel only. */}
      <MobileBehaviorField layout={layout} patch={patchLayout} options={['stack', 'carousel']} />
    </Group>
  ),

  highlight_grid: ({ layout, patchLayout }) => (
    <Group title="เลย์เอาต์">
      <Field label="จำนวนคอลัมน์">
        <Select value={layout?.columns ?? 3} options={COLUMNS} labels={COLUMNS_LABELS}
          onChange={(v) => patchLayout({ columns: v === 'auto_fit' ? v : Number(v) })} />
      </Field>
      {/* No mobileBehavior: highlight_grid reads none. */}
    </Group>
  ),
};

export function SectionTypeFields({ type, layout, style, patchLayout, patchStyle }) {
  const Layout = LAYOUT_FIELDS[type];
  const styleProps = styleControlsFor(type);
  if (!Layout && !styleProps.length) return null;
  return (
    <>
      {Layout && <Layout layout={layout} patchLayout={patchLayout} />}
      {styleProps.length > 0 && (
        <Group title="รูปแบบ">
          {styleProps.map((prop) => {
            const Control = STYLE_CONTROL[prop];
            return <Control key={prop} style={style} patchStyle={patchStyle} />;
          })}
        </Group>
      )}
    </>
  );
}
