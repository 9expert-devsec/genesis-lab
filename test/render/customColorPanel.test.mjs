import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { StyleTab } from '@/components/pageBuilder/editor/SettingsPanel';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory.
import { ColorInput } from '@/components/pageBuilder/editor/fields';
import { GRADIENT_DIRECTIONS, COLOR_INPUT_FALLBACK } from '@/lib/pageBuilder/customColor';
import { GRADIENT_DIRECTION_LABELS, CUSTOM_COLOR_OPTION } from '@/lib/pageBuilder/presetLabels';
import { OFFERED_BACKGROUNDS } from '@/lib/pageBuilder/presets';
import { ACCENTS } from '@/lib/schemas/pageBuilder';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * Round 39 commit 3 — the two colour controls.
 *
 * The panel is rendered through `StyleTab`, which takes plain props, for the
 * reason settingsPanelTabs gives: SettingsPanel reads a selection out of the
 * editor context and a static render cannot dispatch one.
 */

const noop = () => {};
const domOf = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
const tab = ({ style = {}, settings = {} } = {}, patchKey = noop) =>
  domOf(createElement(StyleTab, { type: 'heading', layout: {}, style, settings, patchKey }));

const fieldsIn = (doc) => [...doc.querySelectorAll('label > span:first-child')].map((s) => s.textContent.trim());
const groupsIn = (doc) => [...doc.querySelectorAll('legend')].map((l) => l.textContent.trim());
const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const hintFor = (doc, label) => {
  const l = [...doc.querySelectorAll('label')]
    .find((n) => text(n.querySelector(':scope > span')) === label);
  const spans = l ? [...l.querySelectorAll(':scope > span')] : [];
  return spans.length > 1 ? text(spans[1]) : null;
};
const alerts = (doc) => [...doc.querySelectorAll('[role="alert"]')].map(text);
const optionValues = (doc, label) => {
  const l = [...doc.querySelectorAll('label')]
    .find((n) => text(n.querySelector(':scope > span')) === label);
  return [...(l?.querySelectorAll('option') ?? [])].map((o) => o.getAttribute('value'));
};

const CUSTOM_BG = { backgroundMode: 'custom', backgroundCustom: { from: '#3366cc' } };
const CUSTOM_ACCENT = { accentMode: 'custom', accentCustom: '#3366cc' };

// ── G. the grouping ────────────────────────────────────────────────────────

test('the two colour controls sit together under ONE group named for them', () => {
  /**
   * The regrouping. สไตล์ held one child and read as though it might own the
   * background too; visibility was in the background group for want of anywhere
   * else. Now: colour with colour, and the device control on its own.
   */
  assert.deepEqual(groupsIn(tab()), ['การจัดวาง', 'สี', 'การแสดงผล']);
  assert.equal(groupsIn(tab()).includes('สไตล์'), false,
    'the one-child สไตล์ group is back');
  assert.equal(groupsIn(tab()).includes('พื้นหลังและการแสดงผล'), false,
    'colour and device visibility are in one group again');
});

test('the accent control is RENAMED and its scope is unchanged', () => {
  // D3. The name was wrong; the scope was not. สีปุ่มกด would be a lie about
  // eleven of the twelve consuming types, which paint something else.
  assert.equal(fieldsIn(tab()).includes('สีองค์ประกอบ'), true);
  assert.equal(fieldsIn(tab()).includes('สีเน้น'), false, 'the old name is still rendered');
  assert.equal(fieldsIn(tab()).includes('สีปุ่มกด'), false,
    'the accent was narrowed to buttons — that silently restyles every section already using it');
});

test('an untouched section renders SIX envelope fields and no colour inputs', () => {
  // The custom fields are conditional. A section nobody has recoloured must
  // look exactly as it did.
  assert.deepEqual(fieldsIn(tab()),
    ['ความกว้าง', 'ระยะห่างด้านบน', 'ระยะห่างด้านล่าง', 'พื้นหลัง', 'สีองค์ประกอบ', 'แสดงบน']);
});

// ── G. the two selects carry the mode as an option ─────────────────────────

test('the background select offers every preset plus กำหนดเอง, and nothing else', () => {
  assert.deepEqual(optionValues(tab(), 'พื้นหลัง'), [...OFFERED_BACKGROUNDS, CUSTOM_COLOR_OPTION]);
  // The sentinel is NOT in the enum, and must not become one — a mode is not a
  // value. This is what says so.
  assert.equal(OFFERED_BACKGROUNDS.includes(CUSTOM_COLOR_OPTION), false,
    'the custom sentinel leaked into the BACKGROUNDS vocabulary');
});

test('the accent select keeps its ตามธีม sentinel and gains กำหนดเอง', () => {
  assert.deepEqual(optionValues(tab(), 'สีองค์ประกอบ'), ['', ...ACCENTS, CUSTOM_COLOR_OPTION]);
  assert.equal(ACCENTS.includes(CUSTOM_COLOR_OPTION), false);
});

test('choosing กำหนดเอง reveals the colour fields, and only then', () => {
  // ROUND 79 added the pin toggle to the BACKGROUND custom block only. The
  // accent list below is unchanged, and that asymmetry is the point: only a
  // background is derived, so only a background has anything to pin.
  assert.deepEqual(fieldsIn(tab({ settings: CUSTOM_BG })), [
    'ความกว้าง', 'ระยะห่างด้านบน', 'ระยะห่างด้านล่าง',
    'พื้นหลัง', 'สีเริ่มต้น', 'สีที่สอง', 'ตรึงสีไว้ (ไม่ปรับตามโหมดมืด)',
    'สีองค์ประกอบ', 'แสดงบน',
  ]);
  assert.deepEqual(fieldsIn(tab({ style: CUSTOM_ACCENT })), [
    'ความกว้าง', 'ระยะห่างด้านบน', 'ระยะห่างด้านล่าง',
    'พื้นหลัง', 'สีองค์ประกอบ', 'สีที่กำหนดเอง', 'แสดงบน',
  ]);
});

test('the DIRECTION control appears only with a second stop', () => {
  /**
   * A direction for one colour is a control that cannot change anything, which
   * is the shape this whole panel exists to avoid — the same reason `image` is
   * excluded from OFFERED_BACKGROUNDS.
   */
  const oneStop = tab({ settings: CUSTOM_BG });
  assert.equal(fieldsIn(oneStop).includes('ทิศทางไล่สี'), false);

  const twoStops = tab({ settings: { backgroundMode: 'custom', backgroundCustom: { from: '#3366cc', to: '#cc6633' } } });
  assert.equal(fieldsIn(twoStops).includes('ทิศทางไล่สี'), true);
  assert.deepEqual(optionValues(twoStops, 'ทิศทางไล่สี'), GRADIENT_DIRECTIONS);
  assert.deepEqual(
    [...twoStops.querySelectorAll('label')]
      .find((n) => text(n.querySelector(':scope > span')) === 'ทิศทางไล่สี')
      .querySelectorAll('option').length, GRADIENT_DIRECTIONS.length);
  // Every direction has a Thai label — a raw token in this list would be a leak.
  for (const d of GRADIENT_DIRECTIONS) {
    assert.match(GRADIENT_DIRECTION_LABELS[d], /[฀-๿]/, `${d} has no Thai label`);
  }
});

test('an INVALID second stop does not offer the direction either', () => {
  // The control follows what will actually render, not what was typed.
  const half = tab({ settings: { backgroundMode: 'custom', backgroundCustom: { from: '#3366cc', to: '#cc66' } } });
  assert.equal(fieldsIn(half).includes('ทิศทางไล่สี'), false);
});

// ── H. the two strings ─────────────────────────────────────────────────────

/**
 * ── ROUND 79 CHANGED WHAT THIS SENTENCE CLAIMS ──────────────────────────
 * It used to end 'ระบบจะไม่ปรับสีนี้ตามธีมหรือโหมดมืด'. Round 79 derives a dark
 * counterpart for an author's colour, so that clause became FALSE, and round
 * 18's rule cuts both ways: a promise of stability the system no longer keeps
 * is as much a lie as a claimed effect that never happens.
 *
 * The FIRST clause is untouched and still says what round 22 measured — a
 * custom colour does not follow the PAGE THEME. Only the dark-mode half moved,
 * and it now names the opt-out in the same breath.
 */
const CUSTOM_COLOR_CAVEAT = 'สีที่กำหนดเองจะถูกใช้ตามที่ระบุในทุกธีมของหน้า — '
  + 'และจะถูกปรับให้เข้ากับโหมดมืดโดยอัตโนมัติ เว้นแต่จะเลือก "ตรึงสีไว้"';

const BACKGROUND_CONTRAST_WARNING =
  'สีนี้อาจทำให้ตัวอักษรบนพื้นหลังอ่านยาก — ค่าความต่างของสีต่ำกว่า 4.5:1 ตามเกณฑ์ WCAG';

const ACCENT_CONTRAST_WARNING =
  'สีนี้อาจอ่านยากเมื่อใช้เป็นตัวอักษรบนพื้นหลังสว่าง — ค่าความต่างของสีต่ำกว่า 4.5:1 ตามเกณฑ์ WCAG';

test('the custom-mode caveat is on BOTH colour controls, by exact text', () => {
  // Exact whole strings: Thai negates by prefix and this one carries a ไม่ that
  // a substring check would pass without.
  assert.equal(hintFor(tab({ settings: CUSTOM_BG }), 'สีเริ่มต้น'), CUSTOM_COLOR_CAVEAT);
  assert.equal(hintFor(tab({ style: CUSTOM_ACCENT }), 'สีที่กำหนดเอง'), CUSTOM_COLOR_CAVEAT);
});

test('the caveat claims nothing about what a PRESET would have done', () => {
  /**
   * MEASURED, and it is why this sentence is worded as it is. The brief asked
   * for "a custom colour does not change in dark mode", contrasted against a
   * preset that follows it. The first half is true; the contrast is not —
   * scripts/_probe-round39-colours-browser.mjs, four conditions with a live
   * `.dark` control, found that NOTHING here follows dark mode, presets
   * included. So the copy says what is true of custom mode and makes no
   * comparison an author could check and find false.
   */
  for (const word of ['ต่างจาก', 'แทนที่จะ', 'ตามธีม จะ']) {
    assert.equal(CUSTOM_COLOR_CAVEAT.includes(word), false,
      `the caveat draws a comparison ("${word}") with preset mode. Measured: presets do not `
      + 'follow dark mode either, so the comparison would be a claim nothing can verify.');
  }
  // It does say the two things that ARE true of a custom colour. The first is
  // unchanged since round 22. The second INVERTED in round 79 — the sentence
  // used to promise /ไม่ปรับ/ and now promises the adjustment plus the way out
  // of it, so both halves of the new claim are pinned rather than neither.
  assert.match(CUSTOM_COLOR_CAVEAT, /ทุกธีมของหน้า/);
  assert.match(CUSTOM_COLOR_CAVEAT, /จะถูกปรับ/,
    'the caveat no longer says the colour IS adjusted for dark mode, which is what it now does');
  assert.match(CUSTOM_COLOR_CAVEAT, /ตรึงสีไว้/,
    'the caveat no longer names the pin, so an author reading it cannot find the way out');
  assert.equal(/ไม่ปรับสีนี้ตามธีมหรือโหมดมืด/.test(CUSTOM_COLOR_CAVEAT), false,
    'the pre-round-79 promise of stability is back, and it is no longer true');
});

test('the contrast warnings fire on a bad colour and stay quiet on a good one', () => {
  // Mid grey: 4.40:1 against the dark text token, 3.78:1 against the light one
  // — under 4.5:1 both ways.
  const badBg = tab({ settings: { backgroundMode: 'custom', backgroundCustom: { from: '#808080' } } });
  assert.deepEqual(alerts(badBg), [BACKGROUND_CONTRAST_WARNING]);
  assert.deepEqual(alerts(tab({ settings: CUSTOM_BG })), [],
    'a readable background warned anyway');

  // Yellow: fine as a background, unreadable as accent text. Two questions.
  const badAccent = tab({ style: { accentMode: 'custom', accentCustom: '#ffff00' } });
  assert.deepEqual(alerts(badAccent), [ACCENT_CONTRAST_WARNING]);
  assert.deepEqual(alerts(tab({ settings: { backgroundMode: 'custom', backgroundCustom: { from: '#ffff00' } } })), [],
    'yellow warned as a BACKGROUND — it is 16.20:1 against the dark text token');
});

test('the warning WARNS — it changes no value and blocks nothing', () => {
  /**
   * D4 as an assertion. A warning that also picked a text colour would be the
   * second authority rounds 21-25 removed from container.jsx.
   */
  const calls = [];
  tab({ settings: { backgroundMode: 'custom', backgroundCustom: { from: '#808080' } } }, (...a) => calls.push(a));
  assert.deepEqual(calls, [], 'rendering the warning dispatched a patch');

  // The control is still there and still editable beside its warning.
  const doc = tab({ settings: { backgroundMode: 'custom', backgroundCustom: { from: '#808080' } } });
  assert.equal(fieldsIn(doc).includes('สีเริ่มต้น'), true);
  assert.equal(doc.querySelectorAll('input[disabled]').length, 0, 'the warning disabled the control');
});

test('an EMPTY custom colour warns about nothing', () => {
  // A control the author has opened but not filled is not a contrast failure.
  assert.deepEqual(alerts(tab({ settings: { backgroundMode: 'custom', backgroundCustom: {} } })), []);
  assert.deepEqual(alerts(tab({ style: { accentMode: 'custom' } })), []);
});

// ── I. the accent hint, after the rename ───────────────────────────────────

const ACCENT_HINT = 'ใช้กับไอคอน เส้นเน้น ปุ่ม ลิงก์ และตัวเลขสำคัญ '
  + 'ทั้งใน section นี้และ section ที่ซ้อนอยู่ข้างใน — '
  + 'section บางชนิดไม่มีส่วนที่ใช้สีองค์ประกอบ จึงจะไม่เห็นความเปลี่ยนแปลง';

test('the hint says the new name and keeps every clause round 22 wrote', () => {
  assert.equal(hintFor(tab(), 'สีองค์ประกอบ'), ACCENT_HINT);
  // The three roles, the cascade, and the types that show nothing — each still
  // present, because each is still true after this round.
  assert.match(ACCENT_HINT, /ไอคอน เส้นเน้น ปุ่ม ลิงก์ และตัวเลขสำคัญ/);
  assert.match(ACCENT_HINT, /ที่ซ้อนอยู่ข้างใน/);
  assert.match(ACCENT_HINT, /ไม่มีส่วนที่ใช้สีองค์ประกอบ/);
  // …and the old field name is gone from it.
  assert.equal(ACCENT_HINT.includes('สีเน้น'), false);
});

test('the hint is UNCHANGED in custom mode — the scope did not move', () => {
  /**
   * The clause about types showing nothing is the one a custom colour might
   * have been thought to invalidate. It does not: custom mode changes the VALUE
   * the three variables carry, not which components read them, so the fifteen
   * types with no accent surface of their own still show nothing.
   */
  assert.equal(hintFor(tab({ style: CUSTOM_ACCENT }), 'สีองค์ประกอบ'), ACCENT_HINT);
});

// ── the colour input ───────────────────────────────────────────────────────

test('the colour input is a picker AND a hex box, reading one value', () => {
  const doc = domOf(createElement(ColorInput, { value: '#3366cc', onChange: noop, placeholder: '#RRGGBB' }));
  const picker = doc.querySelector('input[type="color"]');
  const box = doc.querySelector('input[type="text"]');
  assert.equal(picker.getAttribute('value'), '#3366cc');
  assert.equal(box.getAttribute('value'), '#3366cc');
  assert.equal(box.getAttribute('placeholder'), '#RRGGBB');
});

test('an untouched picker opens on the fallback, and the box stays EMPTY', () => {
  /**
   * `<input type="color">` has no empty state. The fallback is a starting
   * position for the picker only — the text box shows nothing, so an author can
   * tell "no colour chosen" from "this colour chosen".
   */
  const doc = domOf(createElement(ColorInput, { value: '', onChange: noop }));
  assert.equal(doc.querySelector('input[type="color"]').getAttribute('value'), COLOR_INPUT_FALLBACK);
  assert.equal(doc.querySelector('input[type="text"]').getAttribute('value'), '');
});

test('a half-typed hex is marked invalid, kept as typed, and not corrected', () => {
  // Rewriting it under the cursor would fight the author mid-keystroke; the
  // schema refuses it at save and the render layer ignores it.
  const doc = domOf(createElement(ColorInput, { value: '#33', onChange: noop, invalid: true }));
  assert.equal(doc.querySelector('input[type="text"]').getAttribute('value'), '#33');
  assert.equal(doc.querySelector('input[type="text"]').getAttribute('aria-invalid'), 'true');
  // The picker falls back rather than showing a broken swatch.
  assert.equal(doc.querySelector('input[type="color"]').getAttribute('value'), COLOR_INPUT_FALLBACK);
});

test('the panel marks a bad value invalid, and leaves an empty one alone', () => {
  const bad = tab({ settings: { backgroundMode: 'custom', backgroundCustom: { from: '#33' } } });
  assert.equal(bad.querySelector('input[aria-invalid="true"]') !== null, true);
  const empty = tab({ settings: { backgroundMode: 'custom', backgroundCustom: {} } });
  assert.equal(empty.querySelector('input[aria-invalid="true"]'), null,
    'an untouched control was marked invalid');
});

// ── the raw-hex guard, on the editor surface this round widened ────────────

test('round 30\'s colour ban still holds over the whole editor surface', () => {
  /**
   * This round put author colours into the editor — the directory round 30
   * banned colour literals in. The ban is unweakened and the way to show that
   * is to run it: a hex arriving as DATA is invisible to a source scanner, and
   * a hex written into these files is still a violation.
   */
  const rawColors = (code) => [...new Set([
    ...(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
    ...(code.match(/rgba?\(\s*[\d.][^)]*\)/g) ?? []),
  ])].sort();
  const files = walkSources('src/components/pageBuilder/editor');
  assert.ok(files.length >= 20, `the walk reached only ${files.length} files`);
  for (const f of files) {
    assert.deepEqual(rawColors(f.code), [],
      `${f.rel} carries a raw colour literal. An author's colour is data that arrives at `
      + 'runtime; a colour written into source is a decision, and round 30 bans that one.');
  }
});

test('CONTROL: the ban still fires on the files this round added to', () => {
  // Without this, the sweep above could be passing because it stopped looking.
  const rawColors = (code) => [...new Set([
    ...(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
    ...(code.match(/rgba?\(\s*[\d.][^)]*\)/g) ?? []),
  ])].sort();
  for (const rel of [
    'src/components/pageBuilder/editor/SettingsPanel.jsx',
    'src/components/pageBuilder/editor/fields.jsx',
  ]) {
    const poisoned = `${readSource(rel).code}\nconst x = "bg-[#0D1B2A]";`;
    assert.deepEqual(rawColors(poisoned), ['#0D1B2A'],
      `the scanner did not see a hex spliced into ${rel}`);
  }
  // …and the placeholder this round DOES render is not a colour: R, G and B
  // are not hex digits, so it passes without the ban being loosened for it.
  assert.deepEqual(rawColors('const p = "#RRGGBB";'), []);
});
