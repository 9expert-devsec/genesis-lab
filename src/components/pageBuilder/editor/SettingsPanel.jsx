'use client';

import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
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
import { getAt, parentSectionPath } from './pagePath';
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
const ADVANCED_KEYS = ['sectionId', 'customClass', 'customCss', 'customHtml'];

/** Which advanced keys actually carry a value. Names them, for the notice. */
function advancedKeysSet(advanced) {
  return ADVANCED_KEYS.filter((k) => advanced?.[k]);
}

/**
 * Is there an ขั้นสูง tab at all?
 *
 * ── ONE EXPRESSION, TWO READERS, ON PURPOSE ────────────────────────────────
 * The tab strip needs to know whether to offer the tab, and `AdvancedGroup`
 * needs to know whether to render anything. Those are the same question, and
 * asking it twice is how they come to disagree — which fails in both
 * directions and neither is loud:
 *
 *   a tab that opens onto nothing (the strip is more generous than the group),
 *   or a hidden tab concealing a developer's CSS from the editor who is being
 *   told, by the notice inside it, that their save will not destroy it.
 *
 * So `AdvancedGroup`'s early return IS this call. There is no second condition
 * to keep in step; changing the rule here changes both readers at once.
 */
export function hasAdvancedTab(advanced, canUseAdvanced) {
  return Boolean(canUseAdvanced) || advancedKeysSet(advanced).length > 0;
}

export function AdvancedGroup({ path, advanced, canUseAdvanced, dispatch }) {
  const patch = (p) => dispatch({ type: 'PATCH_SECTION_KEY', path, key: 'advanced', patch: p });

  // The one decision — see hasAdvancedTab. The tab strip asks the same thing.
  if (!hasAdvancedTab(advanced, canUseAdvanced)) return null;

  if (!canUseAdvanced) {
    const set = advancedKeysSet(advanced);
    return (
      <Group title="ขั้นสูง">
        <p className="flex items-start gap-1.5 rounded-9e-sm bg-9e-ice px-2 py-2 text-xs text-9e-slate-dp-50 dark:bg-[#0D1B2A]">
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

/**
 * The เนื้อหา tab. Thin by design — the per-type editor IS the content tab, and
 * wrapping it buys the tests a component that renders exactly what the tab
 * renders rather than something assembled a second way.
 */
export function ContentTab({ type, content, advanced, resolved, patch }) {
  return (
    <SectionContentEditor
      type={type}
      content={content}
      advanced={advanced}
      resolved={resolved}
      patch={patch}
    />
  );
}

/**
 * The รูปแบบ tab: the per-type layout/style fields, then the three universal
 * envelope groups.
 *
 * ── THE SPLIT FOLLOWS THE ORDER THAT WAS ALREADY HERE ──────────────────────
 * Nothing is regrouped, reordered within a group, or moved between groups.
 * This is the same JSX, in the same sequence, lifted out of the panel body so
 * that a tab can hold it — and so that a test can render one tab's fields
 * without the editor context a full panel needs.
 */
export function StyleTab({ type, layout, style, settings, patchKey }) {
  return (
    <>
      <SectionTypeFields
        type={type}
        layout={layout}
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
    </>
  );
}

/**
 * The header: what is selected, and where it sits.
 *
 * ── IT ABSORBS THE OLD TYPE LINE RATHER THAN SITTING ABOVE IT ──────────────
 * A bare `labelOf(selected.type)` used to stand here on its own. This replaces
 * it, so the type is stated exactly once — adding a header above the old line
 * would have printed the type twice, one line apart.
 *
 * ── THE SECOND LINE IS ABSENT, NOT EMPTY, AT TOP LEVEL ─────────────────────
 * `parentType` is null for a section sitting directly on the page, and the line
 * is then not rendered at all. That is why `parentSectionPath` returns null
 * rather than an empty path: an empty path resolves to the whole page object,
 * which is truthy and has no type, so a caller that did not distinguish them
 * would render "อยู่ใน " with nothing after it.
 *
 * The containing SLOT (ซ้าย / ขวา on a two_column) is deliberately not named.
 * It would add precision for exactly one type, and slot copy lives in the
 * structure panel — naming it here would put a second copy of that vocabulary
 * in a second file to serve one case.
 *
 * Takes plain strings rather than the section objects so the render tier can
 * assert it directly: the panel itself needs a selection, and only a dispatch
 * can set one (see round 15).
 */
export function SelectionHeader({ type, parentType }) {
  return (
    <div className="mb-4" data-testid="settings-header">
      <p data-testid="settings-header-type" className="text-sm font-bold text-9e-navy dark:text-white">
        {labelOf(type)}
      </p>
      {parentType && (
        <p data-testid="settings-header-parent" className="mt-1 text-xs text-9e-slate-dp-50">
          อยู่ใน {labelOf(parentType)}
        </p>
      )}
    </div>
  );
}

/**
 * The author's own name for the selected section — the one field in this panel
 * that changes NOTHING about the rendered page.
 *
 * ── WHY IT SITS ABOVE THE TAB STRIP RATHER THAN IN A TAB ───────────────────
 * All three tabs configure how this section renders: เนื้อหา is what the page
 * says, รูปแบบ is how it is treated, ขั้นสูง is the developer's escape hatches.
 * Every field in all three reaches the public page. This one does not — the
 * envelope's name is read by the structure panel and by nothing else, and no
 * renderer touches it. Filing it under เนื้อหา would put an editor-only label
 * in the tab whose whole promise is "this is what visitors read", which is the
 * same lie this panel's opening note refuses for controls nothing reads.
 *
 * So it belongs with the header, not with the configuration: SelectionHeader
 * says what is selected and where it sits, and this lets the author overrule
 * the first half of that in their own words. It also stays visible whichever
 * tab is open, which is what renaming a run of sections actually needs.
 *
 * Takes plain props for the same reason the tab bodies do — the panel itself
 * needs a selection, and only a dispatch can set one.
 */
export function SectionNameField({ name, onChange }) {
  return (
    <Field
      label="ชื่อเรียกภายใน"
      hint="ใช้เรียก section นี้ในแผงโครงสร้างเท่านั้น — ไม่แสดงบนหน้าเว็บจริง"
    >
      <TextInput
        value={name}
        onChange={onChange}
        placeholder="เว้นว่างไว้ก็ได้ — แผงโครงสร้างจะเรียกตามเนื้อหาหรือชนิดของ section"
      />
    </Field>
  );
}

/**
 * The tab strip's fixed part. ขั้นสูง is appended per section — see
 * hasAdvancedTab.
 */
const BASE_TABS = [
  { key: 'content', label: 'เนื้อหา' },
  { key: 'style', label: 'รูปแบบ' },
];

const TAB_TRIGGER_CLASS = [
  'flex-1 rounded-9e-sm px-2 py-1.5 text-xs font-medium text-9e-slate-dp-50',
  'data-[state=active]:bg-9e-action/10 data-[state=active]:text-9e-action',
  'hover:text-9e-action',
].join(' ');

export function SettingsPanel() {
  const { page, selected, selection, dispatch, tier, resolvedData } = useEditor();

  /**
   * ── WHICH TAB IS OPEN IS VIEW STATE, NOT DOCUMENT STATE ──────────────────
   * Local, deliberately not in editorReducer. The reducer's `page` is the saved
   * document, and rounds 4-8 built `contentDirty` to mean exactly "content
   * differs from what is stored". Putting a UI toggle in that tree would make
   * opening a tab read as an unsaved change — the save bar would light up
   * because someone looked at a different set of fields.
   *
   * Declared before the early return below, because hooks cannot be called
   * conditionally.
   */
  const [tab, setTab] = useState('content');

  if (!selected || !selection) {
    // No selection, no tab strip — there is nothing for it to be about.
    return <p className="text-xs text-9e-slate-dp-50">เลือก section เพื่อแก้ไขการตั้งค่า</p>;
  }

  const settings = selected.settings ?? {};
  const style = selected.style ?? {};
  const patchKey = (key, patch) => dispatch({ type: 'PATCH_SECTION_KEY', path: selection, key, patch });
  const canUseAdvanced = Boolean(tier?.canUseAdvanced);

  // Null for a top-level selection — see the header note below.
  const parentPath = parentSectionPath(selection);
  const parentSection = parentPath ? getAt(page, parentPath) : null;

  const tabs = hasAdvancedTab(selected.advanced, canUseAdvanced)
    ? [...BASE_TABS, { key: 'advanced', label: 'ขั้นสูง' }]
    : BASE_TABS;

  /**
   * ── THE OPEN TAB PERSISTS ACROSS SELECTIONS, CLAMPED AT RENDER ───────────
   * Selecting another section keeps the tab you were on. An author walking down
   * the page evening out spacing works entirely in รูปแบบ, and resetting to
   * เนื้อหา on every selection would make them re-open it for each section.
   *
   * The strip's composition changes between sections — ขั้นสูง exists for one
   * and not the next — so "persist" needs a fallback. It is computed HERE,
   * as a derived value, rather than repaired by an effect that resets the
   * state: a derived clamp cannot be stale, cannot flash the wrong tab for a
   * frame, and makes a blank panel structurally impossible, because `active` is
   * only ever a key that is in `tabs`. An effect syncing state to props is also
   * the shape this directory keeps rejecting (see useEditorSave, useTreeDrag).
   *
   * The one consequence worth naming: the remembered tab is not forgotten while
   * it is unavailable, so leaving a section that has no ขั้นสูง and landing on
   * one that does reopens ขั้นสูง. That is "the panel remembers what you chose",
   * which is the behaviour being asked for; it is not a section showing a tab
   * the author never picked.
   */
  const active = tabs.some((t) => t.key === tab) ? tab : 'content';

  return (
    <div>
      {/* ── THE HEADER: WHAT IS SELECTED, AND WHERE IT SITS ──────────────────
          This ABSORBS the bare type line that used to stand here rather than
          adding a second one — the type is stated once, on the first line.

          The second line appears only for a NESTED selection. A top-level
          section has no parent, and `parentSectionPath` returns null rather
          than an empty path precisely so this cannot render "อยู่ใน " with
          nothing after it; the line is simply absent, which is also the honest
          description of a section that sits directly on the page.

          The containing SLOT (ซ้าย / ขวา on a two_column) is deliberately not
          named. It would add precision for exactly one type, and the slot copy
          lives in the structure panel — naming it here would put a second copy
          of that vocabulary in a second file to serve one case. */}
      <SelectionHeader type={selected.type} parentType={parentSection?.type ?? null} />

      {/* ── THE ONE FIELD THAT IS NOT A TAB, AND THE ONE THAT IS NOT A KEY ───
          The name is a TOP-LEVEL key on the section, beside its type and its
          enabled flag — not a member of content/settings/style/layout/advanced.
          So it cannot go through patchKey: PATCH_SECTION_KEY merges into a
          named SUB-OBJECT, and pointed at a string it would spread the string
          and leave an object where the name should be. PATCH_SECTION is the
          reducer's existing top-level merge and is exactly this shape; it marks
          the tree dirty like every other section edit, so the name rides the
          ordinary autosave rather than a write of its own. */}
      <SectionNameField
        name={selected.name ?? ''}
        onChange={(v) => dispatch({ type: 'PATCH_SECTION', path: selection, patch: { name: v } })}
      />

      <Tabs.Root value={active} onValueChange={setTab}>
        <Tabs.List
          data-testid="settings-tabs"
          aria-label="ส่วนของการตั้งค่า"
          className="mb-4 flex gap-1 rounded-9e-sm bg-9e-ice p-1 dark:bg-[#0D1B2A]"
        >
          {tabs.map((t) => (
            <Tabs.Trigger key={t.key} value={t.key} data-tab={t.key} className={TAB_TRIGGER_CLASS}>
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Content first: it is what the author came here to change. The
            envelope in รูปแบบ is a treatment applied to it. */}
        <Tabs.Content value="content">
          <ContentTab
            type={selected.type}
            content={selected.content}
            advanced={selected.advanced}
            resolved={resolvedData?.[selected.id]}
            patch={(patch) => patchKey('content', patch)}
          />
        </Tabs.Content>

        <Tabs.Content value="style">
          <StyleTab
            type={selected.type}
            layout={selected.layout}
            style={style}
            settings={settings}
            patchKey={patchKey}
          />
        </Tabs.Content>

        {/* Rendered only when the tab exists, from the SAME call the strip made
            — AdvancedGroup would return null here anyway, so this is belt and
            braces rather than a second rule. */}
        <Tabs.Content value="advanced">
          <AdvancedGroup
            path={selection}
            advanced={selected.advanced}
            canUseAdvanced={canUseAdvanced}
            dispatch={dispatch}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
