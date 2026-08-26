import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import * as Tabs from '@radix-ui/react-tabs';

import {
  ContentTab, StyleTab, AdvancedGroup, hasAdvancedTab, SelectionHeader,
  SectionNameField,
} from '@/components/pageBuilder/editor/SettingsPanel';
import { VISIBILITY, ALL_SECTION_TYPES } from '@/lib/schemas/pageBuilder';
import { VISIBILITY_LABELS } from '@/lib/pageBuilder/presetLabels';
import { Field } from '@/components/pageBuilder/editor/fields';
import { readSource } from '../sourceScan.mjs';

/**
 * The settings panel split into เนื้อหา / รูปแบบ / ขั้นสูง.
 *
 * ── THIS IS A PRESENTATION CHANGE, SO THE LOAD-BEARING TEST IS THE UNION ───
 * No field moved to a different data path, gained or lost a control, or changed
 * a warning. Only which fields are visible at once changed. The way that goes
 * wrong is not subtle behaviour — it is a field that ends up in NO tab and is
 * simply gone, which looks like nothing at all from inside any single tab. So
 * the union of the three tabs is asserted against the exact set the panel
 * rendered before the split, captured by rendering the pre-change components.
 *
 * ── WHY THE TABS ARE RENDERED, NOT THE PANEL ───────────────────────────────
 * SettingsPanel reads `selected`/`selection` from the editor context, and
 * selection is only ever set by dispatching SELECT_SECTION — a static render
 * cannot dispatch, so the panel with a selection is not reachable here. The tab
 * BODIES take plain props and are exported for exactly that reason (the same
 * split, and the same reason, as SectionPickerBody in rounds 9/13).
 *
 * What that does NOT prove is the strip's own wiring — that each Tabs.Content
 * holds the body this file renders separately. That is a source claim, made at
 * the bottom.
 *
 * ── WHY ELEMENT BOUNDARIES, NOT SUBSTRINGS ─────────────────────────────────
 * Thai qualifies by prefix and these labels overlap: 'ระยะห่างด้านบน' and
 * 'ระยะห่างด้านล่าง' share a stem, and 'รูปแบบ' is both a tab label and a group
 * legend inside SectionTypeFields. Every assertion reads one element's exact
 * textContent.
 */

const SRC = 'src/components/pageBuilder/editor/SettingsPanel.jsx';

const domOf = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
/** Every field LABEL rendered, in order. Field renders `<label><span>…`. */
const fieldsIn = (doc) => [...doc.querySelectorAll('label > span:first-child')].map((s) => s.textContent.trim());
const groupsIn = (doc) => [...doc.querySelectorAll('legend')].map((l) => l.textContent.trim());
/** One element's exact text, whitespace-collapsed. Added in round 16. */
const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

const noop = () => {};
const contentTab = (type, content = {}) => domOf(createElement(ContentTab, {
  type, content, advanced: {}, resolved: null, patch: noop,
}));
const styleTab = (type, { layout = {}, style = {}, settings = {} } = {}) => domOf(createElement(StyleTab, {
  type, layout, style, settings, patchKey: noop,
}));
const advancedTab = (advanced, canUseAdvanced) => domOf(createElement(AdvancedGroup, {
  path: ['sections', 0], advanced, canUseAdvanced, dispatch: noop,
}));

/**
 * The three universal envelope groups, which are what the รูปแบบ tab adds on
 * top of whatever SectionTypeFields contributes for the type.
 */
const ENVELOPE_FIELDS = ['ความกว้าง', 'ระยะห่างด้านบน', 'ระยะห่างด้านล่าง', 'พื้นหลัง', 'แสดงบน', 'สีเน้น'];
const ENVELOPE_GROUPS = ['การจัดวาง', 'พื้นหลังและการแสดงผล', 'สไตล์'];
const ADVANCED_FIELDS = ['Section ID (anchor)', 'Custom class', 'Custom CSS', 'Custom HTML'];

// ── 1. each tab renders exactly its own group's fields ─────────────────────

test('the เนื้อหา tab renders exactly the per-type content fields and nothing from รูปแบบ', () => {
  // heading: the type whose content editor has fields AND whose SectionTypeFields
  // contributes nothing, so a leak from the other tab would be unmistakable.
  const doc = contentTab('heading');
  assert.deepEqual(fieldsIn(doc), ['ข้อความ', 'ระดับหัวข้อ', 'จัดวาง']);
  for (const f of [...ENVELOPE_FIELDS, ...ADVANCED_FIELDS]) {
    assert.equal(fieldsIn(doc).includes(f), false, `"${f}" leaked into the content tab`);
  }
});

test('the รูปแบบ tab renders exactly the type fields plus the three envelope groups', () => {
  // two_column: contributes สัดส่วนคอลัมน์ + บนมือถือ from SectionTypeFields.
  const doc = styleTab('two_column');
  assert.deepEqual(fieldsIn(doc), ['สัดส่วนคอลัมน์', 'บนมือถือ', ...ENVELOPE_FIELDS]);
  assert.deepEqual(groupsIn(doc), ['เลย์เอาต์', ...ENVELOPE_GROUPS]);
  // …and none of the content tab's fields.
  for (const f of ['ข้อความ', 'ระดับหัวข้อ', 'จัดวาง', ...ADVANCED_FIELDS]) {
    assert.equal(fieldsIn(doc).includes(f), false, `"${f}" leaked into the style tab`);
  }
});

test('a type with no per-type fields still gets the whole envelope, and only it', () => {
  const doc = styleTab('heading');
  assert.deepEqual(fieldsIn(doc), ENVELOPE_FIELDS);
  assert.deepEqual(groupsIn(doc), ENVELOPE_GROUPS);
});

test('the ขั้นสูง tab renders exactly the four developer fields', () => {
  const doc = advancedTab({}, true);
  assert.deepEqual(fieldsIn(doc), ADVANCED_FIELDS);
  assert.deepEqual(groupsIn(doc), ['ขั้นสูง (developer)']);
  for (const f of [...ENVELOPE_FIELDS, 'ข้อความ']) {
    assert.equal(fieldsIn(doc).includes(f), false, `"${f}" leaked into the advanced tab`);
  }
});

// ── 2. THE UNION — nothing was dropped in the reorganization ───────────────

test('the union across all three tabs equals the exact set the panel rendered before the split', () => {
  /**
   * ── WHERE THIS EXPECTED SET COMES FROM ──────────────────────────────────
   * Captured by rendering SectionContentEditor and SectionTypeFields directly
   * at the pre-change commit, plus the three envelope groups and the advanced
   * block read off the pre-change panel body. It is written out in full rather
   * than recomputed from the tabs, because a set derived from the thing under
   * test cannot notice the thing under test losing a member.
   *
   * Exact, ordered, and per section type — a lower bound would pass while a
   * field sat in no tab at all, which is precisely this round's failure mode.
   */
  const EXPECTED = {
    heading: ['ข้อความ', 'ระดับหัวข้อ', 'จัดวาง', ...ENVELOPE_FIELDS, ...ADVANCED_FIELDS],
    two_column: ['สัดส่วนคอลัมน์', 'บนมือถือ', ...ENVELOPE_FIELDS, ...ADVANCED_FIELDS],
    card_grid: ['จำนวนคอลัมน์', 'บนมือถือ', ...ENVELOPE_FIELDS, ...ADVANCED_FIELDS],
    cta: ['หัวข้อ', 'คำอธิบาย', 'ข้อความบนปุ่ม', 'ลิงก์ปุ่ม', 'สไตล์ปุ่ม', ...ENVELOPE_FIELDS, ...ADVANCED_FIELDS],
    price_card: [
      'หัวข้อ', 'ราคา', 'ต่อรอบ', 'รายการ (บรรทัดละ 1 รายการ)', 'ข้อความบนปุ่ม', 'ลิงก์ปุ่ม',
      'สไตล์การ์ด', 'สไตล์ปุ่ม', ...ENVELOPE_FIELDS, ...ADVANCED_FIELDS,
    ],
  };

  for (const [type, expected] of Object.entries(EXPECTED)) {
    const union = [
      ...fieldsIn(contentTab(type)),
      ...fieldsIn(styleTab(type)),
      ...fieldsIn(advancedTab({}, true)),
    ];
    assert.deepEqual(union, expected,
      `${type}: the fields reachable across the tabs no longer match what the panel rendered `
      + 'before the split. A field in NO tab is invisible from inside every tab, which is why '
      + 'this is asserted as an exact set.');
  }
});

test('round 17 added a field to the panel and did NOT change the expected union', () => {
  /**
   * ── WHY THE SET ABOVE WAS LEFT ALONE, STATED AS A TEST ───────────────────
   * The union is the set of fields reachable across the three TAB BODIES. The
   * name input is not in one: it sits above the tab strip, beside
   * SelectionHeader, because it configures nothing about how the section
   * renders (see the note on SectionNameField).
   *
   * So EXPECTED was extended by nothing — and that is a claim, not an absence
   * of work. If the field had been filed under เนื้อหา the union would have
   * gained a member for every type, and extending EXPECTED by hand is the only
   * honest way to record that; REGENERATING it from the tabs would have made
   * it agree with whatever it found, which is the one thing this check must
   * never do. This test pins the reason the hand-written set still stands.
   */
  const nameDoc = domOf(createElement(SectionNameField, { name: '', onChange: noop }));
  assert.deepEqual(fieldsIn(nameDoc), ['ชื่อเรียกภายใน'], 'the name field changed its label');

  // It is in NO tab, for any type — which is what leaves EXPECTED untouched.
  for (const type of ['heading', 'two_column', 'card_grid', 'cta', 'price_card']) {
    for (const [where, doc] of [['เนื้อหา', contentTab(type)], ['รูปแบบ', styleTab(type)]]) {
      assert.equal(fieldsIn(doc).includes('ชื่อเรียกภายใน'), false,
        `the name field appeared in the ${where} tab for ${type} — the union set above is now short by one`);
    }
  }
  assert.equal(fieldsIn(advancedTab({}, true)).includes('ชื่อเรียกภายใน'), false);
});

test('CONTROL: the union WOULD have needed extending had the field gone in a tab', () => {
  /**
   * Discrimination for the test above. A field added to a tab body shows up in
   * fieldsIn, so the exact-set comparison in the union test would fail — which
   * is what makes "EXPECTED needed no change" a finding rather than an
   * oversight.
   */
  const withField = domOf(createElement('div', null,
    createElement(SectionNameField, { name: '', onChange: noop }),
    createElement(StyleTab, { type: 'heading', layout: {}, style: {}, settings: {}, patchKey: noop })));
  assert.deepEqual(fieldsIn(withField), ['ชื่อเรียกภายใน', ...ENVELOPE_FIELDS]);
  assert.throws(() => assert.deepEqual(fieldsIn(withField), ENVELOPE_FIELDS),
    'a tab that gained the field must break the exact-set comparison');
});

test('the name field says what the name is FOR, and where it does not appear', () => {
  /**
   * The hint is the whole reason an author will not expect this on the page.
   * Exact text, because Thai qualifies by prefix and a substring check would
   * pass on a hint that had lost its negation.
   */
  const doc = domOf(createElement(SectionNameField, { name: '', onChange: noop }));
  const spans = [...doc.querySelectorAll('label > span')].map((s) => text(s));
  assert.deepEqual(spans, [
    'ชื่อเรียกภายใน',
    'ใช้เรียก section นี้ในแผงโครงสร้างเท่านั้น — ไม่แสดงบนหน้าเว็บจริง',
  ]);
  assert.equal(
    doc.querySelector('input')?.getAttribute('placeholder'),
    'เว้นว่างไว้ก็ได้ — แผงโครงสร้างจะเรียกตามเนื้อหาหรือชนิดของ section',
  );
});

test('the panel dispatches the TOP-LEVEL merge for the name, not the sub-object one', () => {
  /**
   * A source claim, because the panel needs a selection to render and only a
   * dispatch can set one. The distinction is load-bearing and invisible in the
   * markup: PATCH_SECTION_KEY pointed at a string key spreads the string (see
   * test/pure/sectionName.test.mjs, which asserts that outcome directly).
   */
  const { code } = readSource(SRC);
  const call = code.slice(code.indexOf('<SectionNameField'), code.indexOf('<Tabs.Root'));
  assert.ok(call.length > 40, 'the SectionNameField call site was not located');
  assert.match(call, /type: 'PATCH_SECTION'/, 'the name no longer goes through the top-level merge');
  assert.equal(/PATCH_SECTION_KEY/.test(call), false,
    'the name is a top-level key; the sub-object merge would leave an object where the string belongs');
});

test('CONTROL: the union check is sensitive to a single missing field, by name', () => {
  /**
   * Discrimination. The comparison above, run against a set with one member
   * removed, must fail and must name it — otherwise "deepEqual passed" says
   * nothing about whether a dropped field would be caught.
   */
  const full = [...fieldsIn(styleTab('heading'))];
  assert.deepEqual(full, ENVELOPE_FIELDS);

  const missing = full.filter((f) => f !== 'แสดงบน');
  assert.notDeepEqual(missing, ENVELOPE_FIELDS);
  assert.throws(() => assert.deepEqual(missing, ENVELOPE_FIELDS));
  assert.deepEqual(ENVELOPE_FIELDS.filter((f) => !missing.includes(f)), ['แสดงบน']);
});

// ── 3. B: one expression decides the tab AND the group ─────────────────────

test('hasAdvancedTab agrees with what AdvancedGroup actually renders, in every combination', () => {
  /**
   * THE POINT OF ITEM B, checked as BEHAVIOUR rather than as a shared name.
   * The predicate the tab strip calls and the component's own decision to
   * render nothing are put side by side over every combination of tier and
   * stored values. A source guard could show they call the same function; only
   * this shows they still ANSWER the same.
   */
  const cases = [
    [{}, false], [{}, true],
    [{ sectionId: 'x' }, false], [{ sectionId: 'x' }, true],
    [{ customClass: 'c' }, false], [{ customCss: '.a{}' }, false], [{ customHtml: '<p>' }, false],
    [{ sectionId: '', customCss: '' }, false],
    [{ customCss: '.a{}' }, true],
  ];
  for (const [advanced, canUseAdvanced] of cases) {
    const predicted = hasAdvancedTab(advanced, canUseAdvanced);
    const rendered = renderToStaticMarkup(createElement(AdvancedGroup, {
      path: ['sections', 0], advanced, canUseAdvanced, dispatch: noop,
    }));
    assert.equal(predicted, rendered !== '',
      `hasAdvancedTab(${JSON.stringify(advanced)}, ${canUseAdvanced}) said ${predicted} but the `
      + `group rendered ${rendered === '' ? 'nothing' : 'something'}. The tab strip and the group `
      + 'have stopped agreeing — one of them is now offering or hiding what the other does not.');
  }
  // CONTROL: the cases really do exercise both answers.
  assert.deepEqual(
    [...new Set(cases.map(([a, c]) => hasAdvancedTab(a, c)))].sort(),
    [false, true],
  );
});

test('a non-developer with NO advanced values gets no tab and no group', () => {
  assert.equal(hasAdvancedTab({}, false), false);
  assert.equal(renderToStaticMarkup(createElement(AdvancedGroup, {
    path: ['sections', 0], advanced: {}, canUseAdvanced: false, dispatch: noop,
  })), '');
});

test('a non-developer WITH advanced values gets the tab and the unchanged lock notice', () => {
  assert.equal(hasAdvancedTab({ customCss: '.a{}' }, false), true);
  const doc = advancedTab({ customCss: '.a{}', sectionId: 'hero' }, false);
  assert.deepEqual(groupsIn(doc), ['ขั้นสูง']);
  // The notice text, exact and unchanged — it is what tells the author their
  // save will not destroy the developer's work.
  const notice = doc.querySelector('p').textContent.replace(/\s+/g, ' ').trim();
  assert.equal(notice,
    'section นี้มีการปรับแต่งโดย developer (sectionId, customCss) — คุณแก้ไขไม่ได้ แต่การบันทึกของคุณจะไม่ลบทิ้ง');
  // …and NOT the editable fields.
  assert.deepEqual(fieldsIn(doc), []);
});

test('a developer always gets the tab, with or without values set', () => {
  for (const advanced of [{}, { customCss: '.a{}' }]) {
    assert.equal(hasAdvancedTab(advanced, true), true);
    assert.deepEqual(fieldsIn(advancedTab(advanced, true)), ADVANCED_FIELDS);
  }
});

test('the tab strip does not re-implement the rule — it calls the one function', () => {
  /**
   * The structural half of B, and the only way to see a DUPLICATED condition:
   * a parallel `canUseAdvanced || advanced.customCss || …` at the strip would
   * agree with the group today and drift later, so the behavioural test above
   * cannot catch it while the two happen to match. Read from `code`, so the
   * prose explaining the rule cannot satisfy it.
   */
  const code = readSource(SRC).code;
  assert.equal(code.split('hasAdvancedTab(').length - 1, 3,
    'hasAdvancedTab is no longer called exactly three times (its definition, '
    + 'AdvancedGroup’s early return, and the tab strip). Either a caller was removed or a '
    + 'fourth reader appeared — check that nothing now decides this a second way.');
  assert.match(code, /if \(!hasAdvancedTab\(advanced, canUseAdvanced\)\) return null;/,
    'AdvancedGroup no longer returns null through hasAdvancedTab, so its decision and the '
    + 'tab strip’s are now two separate conditions');
  // The literal key list must exist exactly once — a second copy at the strip
  // is the duplication this guards against.
  assert.equal(code.split("'sectionId', 'customClass', 'customCss', 'customHtml'").length - 1, 1,
    'the advanced key list appears more than once — the tab strip has grown its own copy');
});

// ── 4. A: no visibility toggle; the 4-value Select is intact ───────────────

test('แสดงบน is still a Select over all four VISIBILITY options, not a toggle', () => {
  /**
   * Item A, pinned. A 2-state toggle beside a 4-value Select would be a second
   * source of truth for one fact — "off" while the Select reads ทุกอุปกรณ์ has
   * no meaning. Asserted as the exact option set, in order, with labels.
   */
  const doc = styleTab('heading');
  const selects = [...doc.querySelectorAll('select')];
  const visibility = selects.find((s) => [...s.options].some((o) => o.value === 'hidden'));
  assert.ok(visibility, 'no select carries the visibility vocabulary any more');
  assert.deepEqual([...visibility.options].map((o) => o.value), [...VISIBILITY]);
  assert.equal(VISIBILITY.length, 4, 'the vocabulary itself changed size — re-check this round');
  assert.deepEqual(
    [...visibility.options].map((o) => o.textContent.trim()),
    VISIBILITY.map((v) => VISIBILITY_LABELS[v]),
  );

  // And there is no checkbox anywhere in the tab — the toggle that was
  // deliberately not built.
  assert.equal(doc.querySelectorAll('input[type="checkbox"]').length, 0,
    'a checkbox appeared in the style tab — if this is a visibility toggle it is a second '
    + 'source of truth for what แสดงบน already says');
});

test('CONTROL: the visibility probe WOULD catch a two-state replacement', () => {
  // Discrimination: the real option set and a 2-state stand-in through the
  // identical comparison, coming out opposite.
  const TWO_STATE = ['all', 'hidden'];
  assert.notDeepEqual(TWO_STATE, [...VISIBILITY]);
  assert.equal(TWO_STATE.length === VISIBILITY.length, false);
  // …and the real one is what the tab renders.
  const doc = styleTab('heading');
  const visibility = [...doc.querySelectorAll('select')]
    .find((s) => [...s.options].some((o) => o.value === 'hidden'));
  assert.deepEqual([...visibility.options].map((o) => o.value), [...VISIBILITY]);
});

// ── 5. E: the open tab persists, clamped at render ─────────────────────────

test('the active tab is DERIVED by clamping to the tabs that exist, never by an effect', () => {
  /**
   * Item E, pinned at the source because the clamp is a render-time expression
   * and a static render cannot change selection to exercise it.
   *
   * The clamp is what makes a blank panel structurally impossible: `active` is
   * only ever a key present in `tabs`. Repairing it with an effect instead
   * would allow a frame on the stale tab and would be state-synced-to-props,
   * the shape this directory keeps rejecting.
   */
  const code = readSource(SRC).code;
  assert.match(code, /const active = tabs\.some\(\(t\) => t\.key === tab\) \? tab : 'content';/,
    'the active tab is no longer clamped to the tabs that exist. If the remembered tab can '
    + 'survive onto a section that does not have it, the panel shows nothing.');
  assert.equal(/useEffect/.test(code), false,
    'an effect appeared in the settings panel. If it is resetting the tab on selection change, '
    + 'that is state synced to props — the clamp above does the same job with no stale frame.');
  // The state itself is local, not in the reducer (item D).
  assert.match(code, /const \[tab, setTab\] = useState\('content'\);/,
    'the tab is no longer local state initialised to the content tab');
  assert.equal(/dispatch\(\{ type: '[A-Z_]*TAB/.test(code), false,
    'the tab is being dispatched into the reducer — that tree is the saved document, and a '
    + 'view toggle in it would read as an unsaved change');
});

test('the fallback target is a tab that always exists', () => {
  // The clamp falls back to 'content'. That is only safe because เนื้อหา and
  // รูปแบบ are unconditional — if the base list ever became conditional the
  // fallback could point at a tab that is not there.
  const code = readSource(SRC).code;
  assert.match(code, /const BASE_TABS = \[\s*\{ key: 'content', label: 'เนื้อหา' \},\s*\{ key: 'style', label: 'รูปแบบ' \},\s*\];/,
    'the unconditional tabs changed. The render-time clamp falls back to the content tab, '
    + 'which must therefore always be present.');
});

// ── 6. the strip wires each tab to the body this file renders separately ───

test('each Tabs.Content holds the body tested above, and the empty state has no strip', () => {
  /**
   * What rendering the bodies cannot show. Stated as source because the panel
   * with a selection is unreachable in this tier (see the header).
   */
  const code = readSource(SRC).code;
  for (const [value, body] of [['content', 'ContentTab'], ['style', 'StyleTab'], ['advanced', 'AdvancedGroup']]) {
    const at = code.indexOf(`<Tabs.Content value="${value}">`);
    assert.ok(at > 0, `there is no Tabs.Content for the ${value} tab`);
    const end = code.indexOf('</Tabs.Content>', at);
    assert.ok(code.slice(at, end).includes(`<${body}`), `the ${value} tab does not hold ${body}`);
  }
  // The empty state returns before the strip — no tabs when nothing is selected.
  const empty = code.indexOf('เลือก section เพื่อแก้ไขการตั้งค่า');
  assert.ok(empty > 0, 'the empty state copy changed');
  assert.ok(empty < code.indexOf('<Tabs.Root'), 'the empty state no longer returns before the tab strip');
});

test('Radix Tabs renders INLINE, not through a portal — verified, not assumed', () => {
  /**
   * Rounds 5/6/9 established that Dialog.Portal content is invisible to
   * renderToStaticMarkup. Tabs is a different primitive and the brief asked for
   * this to be checked rather than taken on faith: if Tabs.Content were
   * portalled, the strip would render to nothing on the server and the source
   * guards above would be the only coverage there could ever be.
   *
   * It is not portalled — a minimal Tabs tree renders its active panel's text.
   */
  const markup = renderToStaticMarkup(createElement(
    Tabs.Root, { value: 'a' },
    createElement(Tabs.List, null,
      createElement(Tabs.Trigger, { value: 'a' }, 'TRIGGER_A'),
      createElement(Tabs.Trigger, { value: 'b' }, 'TRIGGER_B')),
    createElement(Tabs.Content, { value: 'a' }, 'PANEL_A'),
    createElement(Tabs.Content, { value: 'b' }, 'PANEL_B'),
  ));
  assert.ok(markup.includes('TRIGGER_A'), 'Tabs.Trigger produced no server markup');
  assert.ok(markup.includes('PANEL_A'), 'the ACTIVE Tabs.Content produced no server markup');
  // CONTROL: the inactive panel is genuinely absent, so the assertion above is
  // about the active one rather than about "some text survived".
  assert.equal(markup.includes('PANEL_B'), false, 'the inactive panel also rendered');
});

// ── ROUND 16: THE SELECTION HEADER ─────────────────────────────────────────
//
// Appended to this file rather than split off: it guards the same panel, and
// the union check above is what proves round 16 did not disturb it.

test('the header names the selected type, once', () => {
  const doc = domOf(createElement(SelectionHeader, { type: 'heading', parentType: null }));
  assert.equal(text(doc.querySelector('[data-testid="settings-header-type"]')), 'หัวข้อ');
  // The type appears in exactly ONE element of the header — the old bare type
  // line was absorbed, not left standing above the new one.
  const all = [...doc.querySelectorAll('[data-testid="settings-header"] p')].map(text);
  assert.deepEqual(all, ['หัวข้อ'], 'the header renders more than the type for a top-level section');
});

test('a NESTED selection names the section it sits in', () => {
  const doc = domOf(createElement(SelectionHeader, { type: 'heading', parentType: 'two_column' }));
  assert.equal(text(doc.querySelector('[data-testid="settings-header-type"]')), 'หัวข้อ');
  assert.equal(text(doc.querySelector('[data-testid="settings-header-parent"]')), 'อยู่ใน สองคอลัมน์');
});

test('a TOP-LEVEL selection renders no parent line at all — never a dangling "อยู่ใน"', () => {
  /**
   * Item K. The line is absent rather than empty: an "อยู่ใน " with nothing
   * after it would describe a containment that does not exist.
   */
  const doc = domOf(createElement(SelectionHeader, { type: 'heading', parentType: null }));
  assert.equal(doc.querySelector('[data-testid="settings-header-parent"]'), null);
  assert.equal(text(doc.querySelector('[data-testid="settings-header"]')), 'หัวข้อ');
  assert.equal(/อยู่ใน/.test(text(doc.querySelector('[data-testid="settings-header"]'))), false,
    'the containment wording rendered with no parent to name');
});

test('CONTROL: the parent line is reachable, so its absence above means something', () => {
  // Same component, one prop apart, opposite answers.
  const withParent = domOf(createElement(SelectionHeader, { type: 'heading', parentType: 'container' }));
  const without = domOf(createElement(SelectionHeader, { type: 'heading', parentType: null }));
  assert.ok(withParent.querySelector('[data-testid="settings-header-parent"]'));
  assert.equal(without.querySelector('[data-testid="settings-header-parent"]'), null);
  // An empty string is treated as no parent too — labelOf('') would print a
  // fallback, which is exactly the dangling line this guards against.
  const blank = domOf(createElement(SelectionHeader, { type: 'heading', parentType: '' }));
  assert.equal(blank.querySelector('[data-testid="settings-header-parent"]'), null);
});

test('the type is not stated twice anywhere in the panel body', () => {
  /**
   * Item L, as source: the bare type line that used to sit above the tabs is
   * gone, and labelOf(selected.type) is reached only through the header.
   */
  const code = readSource(SRC).code;
  assert.equal(code.includes('<p className="mb-3 text-xs font-bold text-9e-navy dark:text-white">{labelOf(selected.type)}</p>'), false,
    'the old bare type line is still there alongside the new header — the type is printed twice');
  assert.equal(code.split('labelOf(selected.type)').length - 1, 0,
    'the panel body still labels the selected type directly; that belongs to SelectionHeader now');
  assert.match(code, /<SelectionHeader type=\{selected\.type\} parentType=\{parentSection\?\.type \?\? null\} \/>/,
    'the header is no longer wired to the selection and its derived parent');
});

test('the parent is derived through the shared path helper, not an inline slice', () => {
  // An inline `selection.slice(0, -3)` would be a second place that knows a
  // path's stride — see the note in parentSectionPath.
  const code = readSource(SRC).code;
  assert.match(code, /const parentPath = parentSectionPath\(selection\);/,
    'the panel no longer asks parentSectionPath for the parent');
  assert.equal(/selection\.slice\(/.test(code), false,
    'the panel slices the selection path itself — that is a second reader of the path stride');
});

test('the content tab no longer repeats the tab label as a legend', () => {
  /**
   * Item N. SectionContentEditor wrapped itself in a group legend เนื้อหา,
   * which duplicated the tab above it once round 15 added tabs. Removed.
   *
   * SectionTypeFields' legends are deliberately KEPT: เลย์เอาต์ duplicates no
   * tab, and รูปแบบ — which does match its tab's label — is what separates the
   * per-type fields from the three envelope groups beneath them. Removing that
   * one would merge them into an unlabelled block, which is grouping other
   * fields depend on.
   */
  const doc = domOf(createElement(ContentTab, {
    type: 'heading', content: { text: 'x' }, advanced: {}, resolved: null, patch: noop,
  }));
  assert.deepEqual(groupsIn(doc), [], 'the content tab still renders a legend');
  // …and its fields survived the unwrapping.
  assert.deepEqual(fieldsIn(doc), ['ข้อความ', 'ระดับหัวข้อ', 'จัดวาง']);

  // The style tab KEEPS its legends — this is a targeted removal, not a sweep.
  assert.deepEqual(groupsIn(styleTab('two_column')), ['เลย์เอาต์', ...ENVELOPE_GROUPS]);
});

test('CONTROL: the container fallback copy survived losing its legend', () => {
  // The container branch was wrapped in the same legend; unwrapping it must not
  // have taken the sentence with it.
  const doc = domOf(createElement(ContentTab, {
    type: 'container', content: {}, advanced: {}, resolved: null, patch: noop,
  }));
  assert.deepEqual(groupsIn(doc), []);
  assert.equal(text(doc.querySelector('p')),
    'section นี้เป็นตัวจัดวาง — เพิ่มหรือย้าย section ที่อยู่ข้างในได้ที่แผง “โครงสร้างหน้า”');
});

// ── 4. ROUND 22 — the panel's promises, matched to what the controls do ────

/**
 * Round 22 changed COPY ONLY: no control gained, lost or changed a value path,
 * and no renderer was touched. What changed is what two fields CLAIM.
 *
 * The hint is the SECOND span inside a Field's label (fields.jsx), so the
 * label-only reader used by the union check above cannot see it — which is why
 * adding a hint could not move a field in or out of that set, asserted below
 * rather than assumed.
 *
 * Every assertion here is on exact, whole strings. Thai qualifies by prefix and
 * both new hints carry a negation that a substring check would pass without.
 */

const SECTIONS_DIR = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
  'src/components/pageBuilder/sections',
);

/** Every field in a doc as {label, hint} — hint null when the Field has none. */
const fieldPairsIn = (doc) => [...doc.querySelectorAll('label')].map((l) => {
  const spans = [...l.querySelectorAll(':scope > span')];
  return { label: text(spans[0]), hint: spans.length > 1 ? text(spans[1]) : null };
});

const hintFor = (doc, label) => fieldPairsIn(doc).find((f) => f.label === label)?.hint ?? null;

const ROUND22_ACCENT_HINT = 'ใช้กับไอคอน เส้นเน้น ปุ่ม ลิงก์ และตัวเลขสำคัญ '
  + 'ทั้งใน section นี้และ section ที่ซ้อนอยู่ข้างใน — '
  + 'section บางชนิดไม่มีส่วนที่ใช้สีเน้น จึงจะไม่เห็นความเปลี่ยนแปลง';

const ROUND22_WIDTH_HINT = 'การ์ดชนิดนี้กว้างคงที่เท่ากับตอนอยู่ในกริด จึงไม่เปลี่ยนขนาดที่เห็น';

const OLD_UNIVERSAL_ACCENT_HINT = 'มีผลกับ section นี้และ section ที่ซ้อนอยู่ข้างใน';

test('CONTROL: the hint reader sees hints at all, and tells them from labels', () => {
  /**
   * Without this, every "the hint equals X" below could be passing on a reader
   * that returns null for everything — and "the old hint is gone" would be
   * vacuously true for a panel that still shipped it.
   */
  const withHint = domOf(createElement(Field, { label: 'ป้าย', hint: 'คำอธิบาย' }, 'x'));
  assert.deepEqual(fieldPairsIn(withHint), [{ label: 'ป้าย', hint: 'คำอธิบาย' }]);

  const withoutHint = domOf(createElement(Field, { label: 'ป้าย' }, 'x'));
  assert.deepEqual(fieldPairsIn(withoutHint), [{ label: 'ป้าย', hint: null }]);

  // The label-only reader still reads the LABEL, so a hint cannot move a field
  // in or out of the union set above.
  assert.deepEqual(fieldsIn(withHint), ['ป้าย']);

  // The old string is still MATCHABLE — so its absence below is a real finding.
  const withOld = domOf(createElement(Field, { label: 'สีเน้น', hint: OLD_UNIVERSAL_ACCENT_HINT }, 'x'));
  assert.equal(hintFor(withOld, 'สีเน้น'), OLD_UNIVERSAL_ACCENT_HINT);
});

test('A: the universal accent claim is gone, and the replacement is exactly this', () => {
  /**
   * The old hint said the accent has an effect on this section and everything
   * nested inside it — true for the 13 types that paint with it or forward it,
   * false for the other 14. That is finding 2 of docs/section-control-audit.md,
   * stated as a promise to the author. The new copy has the two halves round 21
   * measured across the nine consumers: the three roles the accent actually has
   * (ornament, one key figure or link, the button surface), and the fact that a
   * type with no such surface shows nothing.
   */
  for (const type of ['heading', 'rich_text', 'course_card', 'notice', 'tabs']) {
    assert.equal(hintFor(styleTab(type), 'สีเน้น'), ROUND22_ACCENT_HINT,
      `${type}: the สีเน้น hint is not the round-22 copy`);
  }

  // Gone from the rendered panel AND from the source — the second half matters
  // because a claim kept in a dead branch is one someone will restore.
  const rendered = renderToStaticMarkup(createElement(StyleTab, {
    type: 'heading', layout: {}, style: {}, settings: {}, patchKey: noop,
  }));
  assert.equal(rendered.includes(OLD_UNIVERSAL_ACCENT_HINT), false,
    'the panel still renders the old universal accent claim');

  // Against RAW bytes, not the comment-stripped read: the claim must be gone
  // from the file entirely, including from any prose that restates it.
  assert.equal(readSource(SRC).raw.includes(OLD_UNIVERSAL_ACCENT_HINT), false,
    'the old universal accent claim is still somewhere in SettingsPanel.jsx');
});

test('A: the accent hint is ONE string — it does not vary by type', () => {
  /**
   * The decision, asserted rather than described. A per-type accent hint would
   * need a hand-written 27-entry map with no source to derive it from — the
   * accent is not in SECTION_STYLE_CAPS, and the only reader-set that exists is
   * a source scan the browser cannot run (see ACCENT_HINT's note).
   *
   * So the hint is deliberately constant, and this pins it: a later round that
   * makes it per-type must also supply the single source and a test that the
   * two agree, exactly as the ความกว้าง hint below already does.
   */
  const hints = new Set(ALL_SECTION_TYPES.map((t) => hintFor(styleTab(t), 'สีเน้น')));
  assert.deepEqual([...hints], [ROUND22_ACCENT_HINT]);
});

test('B: ความกว้าง is still offered on every one of the 27 types', () => {
  /**
   * The alternative was to stop offering it on the two card types — an ABSENT
   * cell instead of an IGNORED one. Rejected (see FIXED_CARD_WIDTH_TYPES), so
   * this is the exact set that decision produces: a withdrawal shows up here as
   * two missing members, named.
   */
  const offering = ALL_SECTION_TYPES
    .filter((t) => fieldsIn(styleTab(t)).includes('ความกว้าง')).sort();
  assert.deepEqual(offering, [...ALL_SECTION_TYPES].sort());
  assert.equal(offering.length, 27);
});

test('B: exactly the two self-clamping types say their card width is fixed', () => {
  const hinted = ALL_SECTION_TYPES
    .filter((t) => hintFor(styleTab(t), 'ความกว้าง') === ROUND22_WIDTH_HINT).sort();
  assert.deepEqual(hinted, ['course_card', 'instructor_card']);

  // Every other type's ความกว้าง carries no hint at all — not a different one.
  const others = ALL_SECTION_TYPES.filter((t) => !hinted.includes(t));
  assert.deepEqual([...new Set(others.map((t) => hintFor(styleTab(t), 'ความกว้าง')))], [null]);
});

test('B: the hinted set and the renderers that self-clamp come from ONE source', () => {
  /**
   * ── WHY THIS TEST IS THE PRICE OF KEEPING A PER-TYPE LIST ────────────────
   * FIXED_CARD_WIDTH_TYPES is a hand-written pair in a client component, which
   * is the drift shape round 18 caught in this very file. What makes it
   * defensible where an accent map would not be: the thing it describes — a
   * max-w-sm self-clamp — IS readable off the components, and this puts the two
   * side by side.
   *
   * The scan is the same one test/pure/sectionControlAudit's finding-1 tripwire
   * uses, deliberately. A third type gaining the clamp, or these two losing it,
   * reddens BOTH: that one naming the audit row to delete, this one naming the
   * hint to move.
   */
  const clamped = readdirSync(SECTIONS_DIR)
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => /max-w-sm/.test(readSource(`src/components/pageBuilder/sections/${f}`).code))
    .map((f) => f.replace(/\.jsx$/, '')).sort();

  const hinted = ALL_SECTION_TYPES
    .filter((t) => hintFor(styleTab(t), 'ความกว้าง') === ROUND22_WIDTH_HINT).sort();

  assert.deepEqual(hinted, clamped,
    'the panel hints a fixed card width on a different set of types than the ones whose '
    + 'component actually clamps itself. If a clamp was REMOVED, delete that type from '
    + 'FIXED_CARD_WIDTH_TYPES — the control now works there and the hint has become a new '
    + 'lie. If one was ADDED, the panel is silently inert on a type it promises nothing about.');
});

test('CONTROL: the one-source check catches the two sets disagreeing', () => {
  /**
   * Discrimination for the test above, perturbed in BOTH directions — a
   * comparison that only noticed growth would miss the direction that matters
   * most, a clamp dropped with the hint left behind.
   */
  const base = ['course_card', 'instructor_card'];
  assert.throws(() => assert.deepEqual([...base, 'price_card'].sort(), base),
    'a third clamped type does not break the comparison');
  assert.throws(() => assert.deepEqual(['course_card'], base),
    'a type losing its clamp does not break the comparison');
  assert.deepEqual([...base].sort(), base, 'the unperturbed comparison must pass');
});

test('C: the panel comment corrects the two fields this round made true, and stops there', () => {
  /**
   * Round 18 left the opening comment wrong on purpose: correcting it while the
   * defect stood would have made the code look consistent when it was not.
   * Round 22 corrects only the halves it made true, and this pins BOTH sides —
   * including the clause deliberately left open, so a later round cannot
   * quietly treat it as handled.
   */
  // RAW, not `code` — readSource strips comments, and a comment is the subject.
  const { raw, code } = readSource(SRC);
  const head = raw.slice(0, raw.indexOf('const ADVANCED_KEYS'));
  assert.ok(head.length > 400, 'the opening comment block was not located');
  assert.equal(code.includes('EXACT FOR THREE OF THE FIVE'), false,
    'CONTROL: the phrases below must live in prose, not in code — if the stripped read still '
    + 'contains one, this test is matching a string literal and would pass with the comment gone');

  assert.match(head, /EXACT FOR THREE OF THE FIVE/, 'the measured qualification is gone');
  // Two single-line fragments: the block is hard-wrapped, so a phrase spanning
  // the wrap is separated by a leading `*` no whitespace class will cross.
  assert.match(head, /wrap themselves in a small fixed/,
    'the comment no longer names the clamp that limits containerWidth');
  assert.match(head, /painted card is 384px at all four settings/,
    'the comment no longer says what the clamp costs the author');
  assert.match(head, /universal as a CASCADE/, 'the comment no longer separates cascade from effect');

  /**
   * The clamp is DESCRIBED there, never spelled. SettingsPanel.jsx sits inside
   * Tailwind's content globs, and the JIT scans raw file text — a class literal
   * in a comment is a class the bundle then carries, pinned by prose that no
   * longer has a reason to exist. It is named exactly once, in this file, which
   * is not scanned.
   */
  assert.equal(/max-w-sm/.test(raw), false,
    'a Tailwind class literal is back in SettingsPanel.jsx, which Tailwind scans — describe the '
    + 'utility in prose and let the test tier name it');

  /**
   * The comment says the accent gap is CLOSED, and this is what stops that
   * sentence from being a claim nobody checks.
   *
   * ── IT NAMED THREE TYPES, THEN TWO, THEN NONE ────────────────────────────
   * Until round 23 it read `accordion, instructor_card and course_schedule`.
   * That assertion was a bare `match` and it stayed GREEN through the commit
   * that made the sentence false, because a presence check cannot see its
   * subject change underneath it — the renderer-side tripwire is what went red.
   *
   * Round 23 answered that by cross-checking the named list against the
   * measured consumer set. Round 24 is the proof it took: it went red on the
   * commit that closed the last two, instead of sitting green through it.
   *
   * The claim is now stated in the direction that survives — every type either
   * paints with the accent or is one the audit records as having no accent
   * surface, with no third category. A regression puts a type back in that
   * third category and this names it.
   */
  assert.match(head, /accent gap in the renderers is closed/,
    'the comment no longer states the accent gap as closed');
  assert.equal(/DO have a surface the accent belongs on and\s*\n\s*\*\s*do not take it/.test(head), false,
    'the comment lists open accent gaps again — if that is real, extend the exact set in '
    + 'test/pure/sectionControlAudit finding 2 in the same commit');

  /**
   * The measured set, derived from the components. `directAccentConsumers` in
   * test/pure/sectionControlAudit is the same scan; this file re-derives it
   * rather than importing across tiers, and the two are asserted equal below so
   * a divergence is loud.
   */
  const painting = readdirSync(SECTIONS_DIR)
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => /--pb-accent-/.test(readSource(`src/components/pageBuilder/sections/${f}`).code))
    .map((f) => f.replace(/\.jsx$/, '')).sort();

  assert.deepEqual(painting, [
    'accordion', 'checklist', 'course_schedule', 'highlight_grid', 'icon_card',
    'instructor_card', 'price_card', 'rich_text', 'stat_card', 'tabs', 'timeline',
  ], 'the components painting with the accent changed — the comment above claims the gap is '
  + 'closed, so any change here makes that sentence a lie until it is rewritten');

  // The three types the comment named as open across rounds 22-24 are exactly
  // the three that closed it. Stated so a revert of any ONE is caught here.
  for (const t of ['accordion', 'instructor_card', 'course_schedule']) {
    assert.equal(painting.includes(t), true,
      `${t} stopped painting with the accent — it is one of the three the comment says are no `
      + 'longer an open gap, so the gap is back and recorded nowhere');
  }
});
