import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import * as Tabs from '@radix-ui/react-tabs';

import {
  ContentTab, StyleTab, AdvancedGroup, hasAdvancedTab,
} from '@/components/pageBuilder/editor/SettingsPanel';
import { VISIBILITY } from '@/lib/schemas/pageBuilder';
import { VISIBILITY_LABELS } from '@/lib/pageBuilder/presetLabels';
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
