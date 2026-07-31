'use client';

import { RATIOS, COLUMNS, BUTTON_STYLES, CARD_STYLES } from '@/lib/schemas/pageBuilder';
import {
  RATIO_LABELS, COLUMNS_LABELS, BUTTON_STYLE_LABELS, MOBILE_BEHAVIOR_LABELS, CARD_STYLE_LABELS,
} from '@/lib/pageBuilder/presetLabels';
import { SECTION_STYLE_CAPS } from '@/lib/pageBuilder/presets';
import { Field, Group, Select } from './fields';

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
 * `layout.ratio` → two_column · `layout.columns` → card_grid, highlight_grid.
 * These stay a hardcoded per-type map: 2C.3 folded in only the STYLE props. The
 * same single-source pattern applies here later — but only after confirming the
 * layout readers are uniform first (the precondition that made 2C.3 safe).
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

// ── style controls DERIVED from the single source (2C.3) ─────────────────
// The panel offers a style control iff SECTION_STYLE_CAPS declares the type
// supports that prop — the SAME declaration the components read from (via
// presets' capability helpers). Reading a prop and offering its control are now
// one act; they cannot drift. Adding a style prop to a type = one edit to
// SECTION_STYLE_CAPS, and both the render and this control follow.
const STYLE_CONTROL = {
  cardStyle:   CardStyleField,
  buttonStyle: ButtonStyleField,
};

/** The style-prop keys this panel will render for `type`, derived from the caps.
 *  Exported as the structural witness's target (test/render/styleCaps.test.mjs). */
export function styleControlsFor(type) {
  return (SECTION_STYLE_CAPS[type] ?? []).filter((prop) => STYLE_CONTROL[prop]);
}

// LAYOUT controls stay hardcoded per type — a SEPARATE correspondence
// (ratio/columns/mobileBehavior ↔ two_column/card_grid/highlight_grid) that 2C.3
// deliberately does NOT fold in (see the doc: apply the same pattern later, after
// checking those readers are uniform first).
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
