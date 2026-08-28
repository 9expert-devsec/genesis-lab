'use client';

import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Lock } from 'lucide-react';
import { CONTAINER_WIDTHS, SPACING, VISIBILITY, ACCENTS } from '@/lib/schemas/pageBuilder';
import { OFFERED_BACKGROUNDS } from '@/lib/pageBuilder/presets';
import { isValidSectionId } from '@/lib/pageBuilder/scopeCss';
import { labelOf } from '@/lib/pageBuilder/sectionLabels';
import { iconOf } from '@/lib/pageBuilder/sectionIcons';
import { cn } from '@/lib/utils';
import {
  CONTAINER_WIDTH_LABELS, SPACING_LABELS, BACKGROUND_LABELS,
  VISIBILITY_LABELS, ACCENT_LABELS, labelFor,
} from '@/lib/pageBuilder/presetLabels';
import { Field, Group, Select, TextInput, TextArea, Warn, INPUT_CLASS } from './fields';
// Round 39, ADDED beside the statements above rather than folded into any —
// the standing rule in this directory.
import { ColorInput } from './fields';
import {
  CUSTOM_COLOR_OPTION, CUSTOM_COLOR_LABEL, GRADIENT_DIRECTION_LABELS,
} from '@/lib/pageBuilder/presetLabels';
import {
  isHexColor, GRADIENT_DIRECTIONS, DEFAULT_GRADIENT_DIRECTION,
  backgroundContrastOk, accentContrastOk,
} from '@/lib/pageBuilder/customColor';
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
 * ── THAT CLAIM WAS MEASURED, AND IT IS EXACT FOR THREE OF THE FIVE ─────────
 * docs/section-control-audit.md rendered all 27 types against every value of
 * every field above. spacingTop, spacingBottom, background and visibility are
 * universal as written. Two are not, and the paragraph above stood unqualified
 * for four rounds while that was known:
 *
 *   containerWidth — the class lands on every section's container div, but
 *     course_card and instructor_card each wrap themselves in a small fixed
 *     max-width, so the painted card is 384px at all four settings. That clamp
 *     is the design (a lone card renders at the width it has in a grid), so the
 *     control is not going to start working there — see FIXED_CARD_WIDTH_TYPES
 *     below, which is where the field now says so to the author.
 *   accentColor — universal as a CASCADE (the wrapper always sets the three
 *     variables, and custom_html's author CSS can read them), not as an
 *     EFFECT: only the components that name --pb-accent-* paint with it. See
 *     ACCENT_HINT below.
 *
 * ── WHAT THIS COMMENT STILL DOES NOT SAY, ON PURPOSE ───────────────────────
 * Round 18 left the whole paragraph unedited because correcting a comment while
 * the defect stood would make the code look consistent when it was not. That
 * reason expires only for the parts a fix has reached, and as of round 24 it
 * has reached all of them: NO type is left that has a surface the accent
 * belongs on and does not take it. The accent gap in the renderers is closed.
 *
 * What remains is not a backlog. Eleven types still show no effect, and each is
 * a measured decision rather than an omission — a heading is prose, an embed is
 * someone else's iframe, the four CourseCard types render a component shared
 * with non-builder routes. That is why the hint below says a type may have no
 * accent surface instead of promising every type will change.
 *
 * ── HOW THIS SENTENCE GOT CORRECTED IS ITSELF THE LESSON ──────────────────
 * It named three types, then two, then none. It was WRONG for one commit each
 * time, because the test pinning it asserted the sentence was PRESENT and a
 * presence check cannot see its subject become false. What went red both times
 * was the audit tripwire over the renderers. Since round 23 the pin also
 * cross-checks the named list against that measured set, so the prose can no
 * longer drift on its own — which is what made round 24 red it correctly.
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
        <p className="flex items-start gap-1.5 rounded-9e-sm bg-[var(--surface-hover)] px-2.5 py-2 text-xs text-9e-slate-dp-50">
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
 * ACCENT_HINT — what สีเน้น actually does, replacing a claim that was universal
 * and false.
 *
 * ── WHY ONE STATIC STRING AND NOT A PER-TYPE HINT ──────────────────────────
 * A per-type hint would be more precise, and there is NO SINGLE SOURCE it could
 * be derived from. `SECTION_STYLE_CAPS` is this codebase's one capability
 * registry — the thing that makes "reads a prop" and "offers a control for it"
 * the same act — and `accentColor` is deliberately not in it: the accent is not
 * a prop a component opts into, it is three CSS variables SectionRenderer sets
 * on EVERY section wrapper. Which components then paint with them is decided
 * inside their class literals, and the only way to read that set is a
 * source-text scan over sections/ (test/pure/sectionControlAudit does exactly
 * that). A client component cannot run one.
 *
 * So a per-type hint means a hand-written 27-entry map here, tracking class
 * strings in 27 files, with nothing able to notice it going stale — which is
 * precisely the drift round 18 found in this file's own comment. Recorded as a
 * finding in docs/section-control-audit.md rather than worked around: making
 * one source exist means declaring the accent in SECTION_STYLE_CAPS, and that
 * is a presets.js change, not a copy change.
 *
 * The two halves are what round 21 measured across the nine consumers: the
 * three roles the accent has (ornament, one key figure or link, the button
 * surface), and the fact that a type with no such surface shows nothing. The
 * cascade clause is kept from the old hint because it was the true half — four
 * container types forward the variables to their children.
 */
/**
 * ── ROUND 39: ONE WORD CHANGED, AND ONLY BECAUSE THE FIELD WAS RENAMED ─────
 * `สีเน้น` became `สีองค์ประกอบ`, so the hint that describes it says the new
 * name. Nothing else moved, and nothing else could: the SCOPE is unchanged —
 * icons, accent rules, buttons, links and key figures, in this section and in
 * the sections nested inside it, which is round 21's measured three roles.
 *
 * Narrowing the name to something like สีปุ่มกด was the alternative and it is
 * worse: eleven of the twelve consuming types paint something that is not a
 * button, so the field would then be lying about eleven of its twelve effects
 * — and any narrowing of the SCOPE to match would silently restyle every
 * section already using it.
 *
 * The final clause is still true after this round, and that matters more than
 * usual now that a custom colour makes the accent feel more powerful: fifteen
 * of the 27 types show nothing of their own — eleven have no accent surface at
 * all and four are containers that forward the variables to their children. A
 * custom accent changes the VALUE those variables carry and not which
 * components read them, so the set is exactly the set it was.
 */
const ACCENT_HINT = 'ใช้กับไอคอน เส้นเน้น ปุ่ม ลิงก์ และตัวเลขสำคัญ '
  + 'ทั้งใน section นี้และ section ที่ซ้อนอยู่ข้างใน — '
  + 'section บางชนิดไม่มีส่วนที่ใช้สีองค์ประกอบ จึงจะไม่เห็นความเปลี่ยนแปลง';

/**
 * ── THE CUSTOM-MODE CAVEAT, AND WHAT IT DELIBERATELY DOES NOT CLAIM ────────
 * The brief asked this to say "a custom colour does not change in dark mode",
 * contrasted against a preset that follows it. The first half is true. THE
 * CONTRAST IS NOT, and it was measured rather than assumed
 * (scripts/_probe-round39-colours-browser.mjs, four conditions, with a control
 * proving the dark block was live): NOTHING in this colour system follows dark
 * mode — not a preset background, not a preset accent. The brand scale tokens
 * are re-declared identically in `.dark` or not re-declared there at all, by
 * design; the 91 variables that do differ are the surface/text families the
 * presets never resolve through.
 *
 * So the sentence says what IS true of custom mode — the colour is used as
 * entered and the system adjusts it for neither the theme nor dark mode — and
 * claims nothing about what a preset would have done instead. A caveat that
 * promised a contrast an author could not observe would be the same class of
 * lie as a control nothing reads, which is what this panel exists to avoid.
 *
 * The one real thing custom mode gives up IS the theme, and it is the half of
 * the sentence that was measured to vary: a section with no accent inherits the
 * page theme's accent (#005CFF on default, #9124FF on ai_purple).
 */
const CUSTOM_COLOR_CAVEAT = 'สีที่กำหนดเองจะถูกใช้ตามที่ระบุในทุกธีมของหน้า — '
  + 'ระบบจะไม่ปรับสีนี้ตามธีมหรือโหมดมืด';

/** The hex box's placeholder. Not a colour — six letters standing for digits. */
const HEX_PLACEHOLDER = '#RRGGBB';

/**
 * ── THE CONTRAST WARNINGS: THEY WARN, THEY DO NOT ENFORCE ──────────────────
 * Neither one changes a value, blocks a save, or picks a text colour. Deriving
 * text from the author's background would put a second authority beside the
 * theme, which is what rounds 21-25 spent four rounds removing from
 * container.jsx; the warning is the whole of the intervention.
 *
 * 4.5:1 is WCAG 2.1 SC 1.4.3 (Contrast (Minimum)) for normal text — the 3:1
 * large-text allowance is not used, because the control cannot know what size
 * text will sit on the surface and a threshold assuming the generous case stays
 * quiet exactly when it matters.
 *
 * TWO warnings and not one shared threshold, because they ask different
 * questions and a single answer would be wrong about one of them. Measured:
 * yellow is 16.20:1 against the dark text token and 1.03:1 against the light
 * one, so it is a perfectly readable BACKGROUND and an unreadable ACCENT TEXT.
 */
const BACKGROUND_CONTRAST_WARNING =
  'สีนี้อาจทำให้ตัวอักษรบนพื้นหลังอ่านยาก — ค่าความต่างของสีต่ำกว่า 4.5:1 ตามเกณฑ์ WCAG';

const ACCENT_CONTRAST_WARNING =
  'สีนี้อาจอ่านยากเมื่อใช้เป็นตัวอักษรบนพื้นหลังสว่าง — ค่าความต่างของสีต่ำกว่า 4.5:1 ตามเกณฑ์ WCAG';

/**
 * The two types whose card width is fixed, so ความกว้าง cannot change what the
 * author sees. Measured in Chrome: 384px at all four settings, because each
 * wraps itself in a small fixed max-width that the envelope sits outside of.
 *
 * (This file is inside Tailwind's content globs, so the utility is described
 * rather than spelled — a class literal in a comment here is a class the JIT
 * emits. It is named exactly, once, in the test tier, which is not scanned.)
 *
 * ── THE CONTROL STAYS; ONLY THE PROMISE CHANGES ────────────────────────────
 * Withdrawing it for these two was the alternative, and it is worse in three
 * ways. It would make the universal envelope not universal — the organizing
 * idea of this panel. It would strand any stored value: a section that ever
 * carries a non-default width here would show no control to see or reset it
 * (zero such sections exist today, re-measured this round, which is a fact
 * about one database at one moment and not a property of the design). And a
 * withdrawal goes stale SILENTLY — the day the self-clamp is dropped the panel
 * would keep hiding a control that had started working, with nothing to say so.
 *
 * ── WHAT KEEPS THIS TWO-ENTRY LIST FROM DRIFTING ───────────────────────────
 * The reason this list is defensible where ACCENT_HINT's would not be: the
 * self-clamp it describes is ALREADY pinned by an exact-set tripwire
 * (test/pure/sectionControlAudit, finding 1), and test/render/settingsPanelTabs
 * asserts this list and that scan name the same two types. A third type gaining
 * the clamp, or these two losing it, reddens a test that names the fix.
 */
const FIXED_CARD_WIDTH_TYPES = ['course_card', 'instructor_card'];

const FIXED_CARD_WIDTH_HINT = 'การ์ดชนิดนี้กว้างคงที่เท่ากับตอนอยู่ในกริด จึงไม่เปลี่ยนขนาดที่เห็น';

/**
 * The รูปแบบ tab: the per-type layout/style fields, then the universal envelope
 * groups.
 *
 * ── THE SPLIT FOLLOWED THE ORDER THAT WAS ALREADY HERE ─────────────────────
 * When this tab was extracted, nothing was regrouped, reordered within a group,
 * or moved between groups — the same JSX in the same sequence, lifted out so a
 * tab could hold it and a test could render it without the editor context.
 *
 * ROUND 39 IS THE FIRST REGROUPING, and it is deliberate rather than incidental.
 * See the note above the สี group for what moved and why.
 */
export function StyleTab({ type, layout, style, settings, patchKey }) {
  /**
   * ── THE MODE IS FOLDED INTO THE VALUE SELECT, NOT BESIDE IT ──────────────
   * An author is making ONE choice — what colour is this — and splitting it
   * into "which mode" and "which value" would be two controls for one decision.
   * The accent select already carried a non-enum sentinel (`''` = ตามธีมของหน้า)
   * so this is the panel's own precedent rather than a new shape.
   *
   * The STORED shape stays two fields, because the mode and the preset are
   * genuinely different facts: switching to กำหนดเอง and back must return the
   * preset the author had, not reset it. So `background`/`accentColor` are left
   * untouched when custom is chosen, and the mode alone moves.
   */
  const backgroundIsCustom = settings.backgroundMode === 'custom';
  const accentIsCustom = style.accentMode === 'custom';
  const bgCustom = settings.backgroundCustom ?? {};

  /** Choosing in the background select: a preset value, or the custom sentinel. */
  const pickBackgroundMode = (v) => (v === CUSTOM_COLOR_OPTION
    ? { backgroundMode: 'custom' }
    // `undefined` rather than 'preset' — absence IS preset, and writing the
    // word would put a key into every section that ever opened this control.
    : { backgroundMode: undefined, background: v });

  const pickAccentMode = (v) => (v === CUSTOM_COLOR_OPTION
    ? { accentMode: 'custom' }
    : { accentMode: undefined, accentColor: v || undefined });

  /** Merge one field of the custom background, keeping the other two. */
  const patchCustomBackground = (patch) =>
    patchKey('settings', { backgroundCustom: { ...bgCustom, ...patch } });

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
        <Field label="ความกว้าง" hint={FIXED_CARD_WIDTH_TYPES.includes(type) ? FIXED_CARD_WIDTH_HINT : undefined}>
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

      {/*
        ── ROUND 39 REGROUPED, AND THE OLD GROUPING IS WHY ─────────────────
        Until now this was พื้นหลังและการแสดงผล (background + visibility) and
        สไตล์ (the accent, alone). Two problems, and this round makes both
        worse before it fixes them:

        · สไตล์ HELD ONE CHILD. A group of one is a heading with no work to do,
          and "สไตล์" is broad enough to sound like it might own the background
          too — which is exactly why the two colour controls read as
          overlapping. Adding a second colour control under it would have
          doubled that ambiguity.
        · VISIBILITY WAS IN THE BACKGROUND GROUP for want of anywhere else. It
          is not a colour, and with four more colour fields arriving it would
          have been one device-display control lost at the bottom of a paint
          box.

        So: ONE group named for what it contains — สี, holding both colours and
        nothing else — and การแสดงผล for the control that was never about
        colour. The two colour controls sitting side by side under one honest
        heading is what makes their relationship legible, rather than two
        headings whose boundary an author has to guess.
      */}
      <Group title="สี">
        <Field label="พื้นหลัง">
          <select
            className={INPUT_CLASS}
            value={backgroundIsCustom ? CUSTOM_COLOR_OPTION : (settings.background ?? 'default')}
            onChange={(e) => patchKey('settings', pickBackgroundMode(e.target.value))}
          >
            {OFFERED_BACKGROUNDS.map((b) => (
              <option key={b} value={b}>{labelFor(BACKGROUND_LABELS, b)}</option>
            ))}
            <option value={CUSTOM_COLOR_OPTION}>{CUSTOM_COLOR_LABEL}</option>
          </select>
        </Field>

        {backgroundIsCustom && (
          <>
            <Field label="สีเริ่มต้น" hint={CUSTOM_COLOR_CAVEAT}>
              <ColorInput
                value={bgCustom.from} placeholder={HEX_PLACEHOLDER}
                invalid={Boolean(bgCustom.from) && !isHexColor(bgCustom.from)}
                onChange={(v) => patchCustomBackground({ from: v })}
              />
            </Field>
            {!backgroundContrastOk(bgCustom) && <Warn>{BACKGROUND_CONTRAST_WARNING}</Warn>}

            <Field label="สีที่สอง" hint="เว้นว่างไว้ถ้าต้องการสีพื้นเรียบสีเดียว">
              <ColorInput
                value={bgCustom.to} placeholder={HEX_PLACEHOLDER}
                invalid={Boolean(bgCustom.to) && !isHexColor(bgCustom.to)}
                onChange={(v) => patchCustomBackground({ to: v })}
              />
            </Field>

            {/* Offered only with a second stop: a direction for one colour is a
                control that cannot change anything, which is the shape this
                whole panel exists to avoid. */}
            {isHexColor(bgCustom.to) && (
              <Field label="ทิศทางไล่สี">
                <Select
                  value={bgCustom.direction ?? DEFAULT_GRADIENT_DIRECTION}
                  options={GRADIENT_DIRECTIONS} labels={GRADIENT_DIRECTION_LABELS}
                  onChange={(v) => patchCustomBackground({ direction: v })}
                />
              </Field>
            )}
          </>
        )}

        <Field label="สีองค์ประกอบ" hint={ACCENT_HINT}>
          <select
            className={INPUT_CLASS}
            value={accentIsCustom ? CUSTOM_COLOR_OPTION : (style.accentColor ?? '')}
            onChange={(e) => patchKey('style', pickAccentMode(e.target.value))}
          >
            <option value="">ตามธีมของหน้า</option>
            {ACCENTS.map((a) => (
              <option key={a} value={a}>{labelFor(ACCENT_LABELS, a)}</option>
            ))}
            <option value={CUSTOM_COLOR_OPTION}>{CUSTOM_COLOR_LABEL}</option>
          </select>
        </Field>

        {accentIsCustom && (
          <>
            <Field label="สีที่กำหนดเอง" hint={CUSTOM_COLOR_CAVEAT}>
              <ColorInput
                value={style.accentCustom} placeholder={HEX_PLACEHOLDER}
                invalid={Boolean(style.accentCustom) && !isHexColor(style.accentCustom)}
                onChange={(v) => patchKey('style', { accentCustom: v })}
              />
            </Field>
            {!accentContrastOk(style.accentCustom) && <Warn>{ACCENT_CONTRAST_WARNING}</Warn>}
          </>
        )}
      </Group>

      <Group title="การแสดงผล">
        <Field label="แสดงบน" hint={settings.visibility === 'hidden' ? 'section นี้จะไม่แสดงที่ใดเลย' : undefined}>
          <Select
            value={settings.visibility} options={VISIBILITY} labels={VISIBILITY_LABELS}
            onChange={(v) => patchKey('settings', { visibility: v })}
          />
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
/**
 * ── ROUND 28: THE DESIGN'S ORDER, AND THE TWO PLACES IT CANNOT BE FOLLOWED ──
 * The Figma stacks: eyebrow → heading → type line → breadcrumb card → tabs.
 *
 *   eyebrow      is the PANEL header ("ตั้งค่า"), rendered by EditorShell's
 *                Panel one level up. It is already first, and it stays there.
 *   heading      is this component's first line, taken from 14px to the
 *                design's 22px — text-xl (20px) is the nearest step, and there
 *                is no 22px step to take.
 *   type line    is NOT a second line here, because the heading already IS the
 *                type. The design's heading is the section's author-given NAME
 *                with the type beneath it; ours prints the type once and lets
 *                the author overrule it in ชื่อเรียกภายใน below. Printing it
 *                twice is precisely what round 16 removed.
 *   breadcrumb   is the containment line, promoted from a bare line into the
 *                design's card. It is ABSENT for a top-level selection rather
 *                than empty — round 16's ruling, still pinned by a test: a
 *                card reading "อยู่ใน " with nothing after it would describe a
 *                containment that does not exist. The design always draws the
 *                card because its mock is always nested.
 */
export function SelectionHeader({ type, parentType }) {
  /**
   * The card's glyph is the PARENT's type icon, through the same `iconOf`
   * registry the structure panel and the section picker read (rounds 9-14).
   * The design draws an icon here too; taking it from the registry rather than
   * choosing one means the card names the container with the drawing the author
   * already met on that container's own row, and this file declares no icon
   * mapping of its own — the rule panelPolish pins for the structure panel.
   */
  const ParentIcon = parentType ? iconOf(parentType) : null;
  return (
    <div className="mb-4" data-testid="settings-header">
      <p data-testid="settings-header-type" className="text-xl font-bold leading-7 text-9e-navy dark:text-white">
        {labelOf(type)}
      </p>
      {parentType && (
        <p
          data-testid="settings-header-parent"
          className={cn(
            'mt-2 flex h-[50px] items-center gap-2.5 rounded-9e-sm border',
            'border-[var(--surface-border)] bg-[var(--surface-hover)] px-2.5 text-xs text-9e-slate-dp-50'
          )}
        >
          <ParentIcon className="h-[26px] w-[26px] shrink-0 text-9e-action" aria-hidden />
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

/**
 * ── ROUND 28: THE STRIP BECOMES AN UNDERLINE, PER THE FIGMA ────────────────
 * A 46px rail with a 2px rule under the active tab, replacing the filled pill
 * in a tinted tray. Two things about it are deliberate:
 *
 *   the inactive tabs carry `border-b-2 border-transparent` rather than no
 *   border, so switching tabs does not shift the row by 2px; and
 *   the underline colour is the SAME 9e-action the pill used — the design's
 *   #0056D9 is a near-miss of the CI's #005CFF, and the token wins.
 *
 * The design's tab is 100px wide; ours stay `flex-1` because the strip holds
 * two or three tabs depending on the section (see hasAdvancedTab) and a fixed
 * width would leave a ragged gap on the two-tab case.
 */
const TAB_TRIGGER_CLASS = [
  'flex-1 border-b-2 border-transparent px-2 text-xs font-medium text-9e-slate-dp-50',
  'data-[state=active]:border-9e-action data-[state=active]:font-bold data-[state=active]:text-9e-action',
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
          className="mb-4 flex h-[46px] items-stretch border-b border-[var(--surface-border)]"
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
