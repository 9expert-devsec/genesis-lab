'use client';

import { Lock } from 'lucide-react';
import { CONTAINER_WIDTHS, SPACING, VISIBILITY, ACCENTS } from '@/lib/schemas/pageBuilder';
import { OFFERED_BACKGROUNDS } from '@/lib/pageBuilder/presets';
import { isValidSectionId } from '@/lib/pageBuilder/scopeCss';
import { labelOf } from '@/lib/pageBuilder/sectionLabels';
import {
  CONTAINER_WIDTH_LABELS, SPACING_LABELS, BACKGROUND_LABELS,
  VISIBILITY_LABELS, ACCENT_LABELS, labelFor,
} from '@/lib/pageBuilder/presetLabels';
import { Field, Group, Select, TextInput, TextArea, Warn, INPUT_CLASS } from './fields';
import { SectionContentEditor } from './SectionContentEditor';
import { SectionTypeFields } from './SectionTypeFields';
import { useEditor } from './EditorProvider';

/**
 * Settings panel (5a) — the UNIVERSAL envelope for the selected section.
 *
 * ── What is here, and what is deliberately not ───────────────────────────
 * A control that sets a value nothing reads is a lie the author can't detect:
 * it looks like it worked, the page doesn't change, and there is no error. That
 * is the same failure the picker closes by offering the renderer's registry
 * rather than the schema's type list. So this panel ships only fields whose
 * effect is universal — SectionRenderer applies them to EVERY section:
 *
 *   settings.containerWidth / spacingTop / spacingBottom / background /
 *   visibility, style.accentColor (cascades to descendants via CSS vars),
 *   and the advanced.* block.
 *
 * Deferred to 5b (SectionTypeFields), where the per-type knowledge already lives
 * — each of these is read by SOME components and ignored by the rest, so it
 * belongs next to that type's content editor, not in a panel that shows it for
 * everything:
 *   layout.ratio          → two_column only
 *   layout.columns        → card_grid, highlight_grid
 *   layout.mobileBehavior → two_column honours ONLY reverse_stack;
 *                           card_grid honours ONLY carousel
 *   style.buttonStyle     → cta, price_card
 *   style.cardStyle       → price_card, stat_card, icon_card (2C Card surfaces)
 *
 * style.cardStyle used to be read by nobody, and this panel deliberately shipped
 * no control for it. The 2C Card components read it now, so its control lives in
 * SectionTypeFields (per-type, on the card types) — still not here, because it is
 * card-only, not universal.
 *
 * Backgrounds come from presets.js's OFFERED_BACKGROUNDS, not the raw schema
 * vocabulary: `image` maps to '' behind a "needs a bg-image source field" TODO,
 * so choosing it would do nothing at all. That list lives next to the class map
 * that explains it.
 */

/**
 * advanced.* is developer-tier. The action layer STRIPS these for lower tiers
 * and restores the stored values (lib/pages/tierSanitize.js), so an editor's
 * save can never wipe a developer's work.
 *
 * A non-developer therefore sees a read-only notice rather than nothing: if a
 * section carries a developer's customCss, that is WHY it looks different from
 * its neighbours, and hiding that entirely makes the page unexplainable to the
 * person editing it. The notice also says the save is safe, because "there is
 * code here I can't see" otherwise reads as "my save might destroy it".
 */
function AdvancedGroup({ path, advanced, canUseAdvanced, dispatch }) {
  const patch = (p) => dispatch({ type: 'PATCH_SECTION_KEY', path, key: 'advanced', patch: p });

  if (!canUseAdvanced) {
    const set = ['sectionId', 'customClass', 'customCss', 'customHtml'].filter((k) => advanced?.[k]);
    if (!set.length) return null;
    return (
      <Group title="ขั้นสูง">
        <p className="flex items-start gap-1.5 rounded-9e-md bg-9e-ice px-2 py-1.5 text-[10px] text-9e-slate-dp-50 dark:bg-[#0D1B2A]">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            section นี้มีการปรับแต่งโดย developer ({set.join(', ')}) — คุณแก้ไขไม่ได้
            แต่การบันทึกของคุณจะไม่ลบทิ้ง
          </span>
        </p>
      </Group>
    );
  }

  // The renderer drops an invalid sectionId AND the customCss scoped to it —
  // it warns loudly, but only in dev, and only in a console nobody has open at
  // authoring time. Saying it here is the point: an author must learn it now,
  // not from a dead anchor link in production.
  const idValue = advanced?.sectionId ?? '';
  const idInvalid = idValue !== '' && !isValidSectionId(idValue);

  return (
    <Group title="ขั้นสูง (developer)">
      <Field label="Section ID (anchor)" hint="ใช้เป็น #anchor และเป็นขอบเขตของ CSS ด้านล่าง">
        <TextInput value={idValue} onChange={(v) => patch({ sectionId: v })} invalid={idInvalid} />
      </Field>
      {idInvalid && (
        <Warn tone="red">
          ID นี้ใช้ไม่ได้ — จะถูกทิ้งตอนแสดงผล และ CSS ด้านล่างจะไม่ทำงานด้วย
          (ใช้ a-z, 0-9, - และ _ ขึ้นต้นด้วยตัวอักษร)
        </Warn>
      )}
      <Field label="Custom class">
        <TextInput value={advanced?.customClass} onChange={(v) => patch({ customClass: v })} />
      </Field>
      <Field label="Custom CSS" hint="ถูก scope ด้วย Section ID ด้านบนโดยอัตโนมัติ">
        <TextArea value={advanced?.customCss} onChange={(v) => patch({ customCss: v })} rows={4} mono />
      </Field>
      {advanced?.customCss && !idValue && (
        <Warn>ต้องมี Section ID ก่อน CSS ถึงจะทำงาน — ตอนนี้ CSS นี้จะไม่ถูกใช้เลย</Warn>
      )}
      <Field label="Custom HTML" hint="ถูก sanitize ทุกครั้งที่แสดงผล">
        <TextArea value={advanced?.customHtml} onChange={(v) => patch({ customHtml: v })} rows={4} mono />
      </Field>
    </Group>
  );
}

export function SettingsPanel() {
  const { selected, selection, dispatch, tier, resolvedData } = useEditor();

  if (!selected || !selection) {
    return <p className="text-xs text-9e-slate-dp-50">เลือก section เพื่อแก้ไขการตั้งค่า</p>;
  }

  const settings = selected.settings ?? {};
  const style = selected.style ?? {};
  const patchKey = (key, patch) => dispatch({ type: 'PATCH_SECTION_KEY', path: selection, key, patch });

  return (
    <div>
      <p className="mb-3 text-xs font-bold text-9e-navy dark:text-white">{labelOf(selected.type)}</p>

      {/* Content first: it is what the author came here to change. The envelope
          below is a treatment applied to it. */}
      <SectionContentEditor
        type={selected.type}
        content={selected.content}
        advanced={selected.advanced}
        resolved={resolvedData?.[selected.id]}
        patch={(patch) => patchKey('content', patch)}
      />

      <SectionTypeFields
        type={selected.type}
        layout={selected.layout}
        style={style}
        patchLayout={(patch) => patchKey('layout', patch)}
        patchStyle={(patch) => patchKey('style', patch)}
      />

      <Group title="การจัดวาง">
        <Field label="ความกว้าง">
          <Select
            value={settings.containerWidth} options={CONTAINER_WIDTHS} labels={CONTAINER_WIDTH_LABELS}
            onChange={(v) => patchKey('settings', { containerWidth: v })}
          />
        </Field>
        <Field label="ระยะห่างด้านบน">
          <Select
            value={settings.spacingTop} options={SPACING} labels={SPACING_LABELS}
            onChange={(v) => patchKey('settings', { spacingTop: v })}
          />
        </Field>
        <Field label="ระยะห่างด้านล่าง">
          <Select
            value={settings.spacingBottom} options={SPACING} labels={SPACING_LABELS}
            onChange={(v) => patchKey('settings', { spacingBottom: v })}
          />
        </Field>
      </Group>

      <Group title="พื้นหลังและการแสดงผล">
        <Field label="พื้นหลัง">
          <Select
            value={settings.background} options={OFFERED_BACKGROUNDS} labels={BACKGROUND_LABELS}
            onChange={(v) => patchKey('settings', { background: v })}
          />
        </Field>
        <Field label="แสดงบน" hint={settings.visibility === 'hidden' ? 'section นี้จะไม่แสดงที่ใดเลย' : undefined}>
          <Select
            value={settings.visibility} options={VISIBILITY} labels={VISIBILITY_LABELS}
            onChange={(v) => patchKey('settings', { visibility: v })}
          />
        </Field>
      </Group>

      <Group title="สไตล์">
        <Field label="สีเน้น" hint="มีผลกับ section นี้และ section ที่ซ้อนอยู่ข้างใน">
          <select
            className={INPUT_CLASS}
            value={style.accentColor ?? ''}
            onChange={(e) => patchKey('style', { accentColor: e.target.value || undefined })}
          >
            <option value="">ตามธีมของหน้า</option>
            {ACCENTS.map((a) => (
              <option key={a} value={a}>{labelFor(ACCENT_LABELS, a)}</option>
            ))}
          </select>
        </Field>
      </Group>

      <AdvancedGroup
        path={selection}
        advanced={selected.advanced}
        canUseAdvanced={Boolean(tier?.canUseAdvanced)}
        dispatch={dispatch}
      />
    </div>
  );
}
