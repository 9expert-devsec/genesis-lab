import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// ADDED beside the statement above rather than folded into it. The click-target
// and shared-component assertions are about STRUCTURE, so they need a parsed
// document rather than a string.
import { JSDOM } from 'jsdom';

import { SectionTypeFields } from '@/components/pageBuilder/editor/SectionTypeFields';
import { BUNDLE_CARD_THEME_LABELS } from '@/lib/pageBuilder/presetLabels';
import { BUNDLE_CARD_THEME_DEFAULT } from '@/lib/pageBuilder/presets';

/**
 * The bundle's four style controls AS THE PANEL RENDERS THEM.
 *
 * `test/render/styleCaps` already asserts that the panel DERIVES the right
 * control list from the caps. It cannot catch a control that is in the list and
 * throws, or one that renders but ignores the theme gate — `styleControlsFor`
 * returns component references without mounting them. This mounts them.
 *
 * ── NOTHING HERE IS PINNED BY A COLOUR CLASS ──────────────────────────────
 * Controls are found by their visible label, the shared switch by its testid,
 * and the click target by the tag and class of the element that wraps it. A
 * refactor that keeps the semantics and changes the styling should not redden
 * this file.
 *
 * An earlier version asserted the glow gate via `aria-disabled`, because the
 * pickers were dimmed rather than hidden. They are hidden now, so the gate is
 * asserted by absence instead.
 */

const panel = (style) =>
  renderToStaticMarkup(
    createElement(SectionTypeFields, {
      type: 'promotion_bundle',
      layout: {},
      style,
      patchLayout: () => {},
      patchStyle: () => {},
    }),
  );

/**
 * Labels are matched with `includes`, NOT `new RegExp(label)`. The first draft
 * of this file used the latter and the สีขาว test failed against correct
 * markup: `สีขาว (แบบเดิม)` carries parentheses, which a RegExp reads as a
 * capture group, so the pattern demanded the text WITHOUT them. Any label an
 * author can edit is data, not a pattern.
 */
const has = (html, s) => html.includes(s);

/** The same render, parsed — for the assertions that are about STRUCTURE. */
const dom = (style) => new JSDOM(`<!doctype html><body>${panel(style)}</body>`).window.document;

test('the ALWAYS-present controls render whatever the stored theme', () => {
  // Three of the four caps render unconditionally. The glow pickers and the
  // border's colour/width rows are conditional now and have their own tests.
  for (const style of [undefined, {}, { bundleCardTheme: 'light' }, { bundleCardTheme: 'navy' }]) {
    const html = panel(style);
    for (const label of ['สไตล์การ์ด', 'แสดงเส้นขอบ', 'สไตล์ปุ่ม']) {
      assert.ok(has(html, label), `${label} missing for ${JSON.stringify(style)}`);
    }
  }
});

test('the theme select offers both options, labelled, with สีขาว first', () => {
  const html = panel(undefined);
  assert.ok(has(html, BUNDLE_CARD_THEME_LABELS.light));
  assert.ok(has(html, BUNDLE_CARD_THEME_LABELS.navy));
  assert.ok(
    html.indexOf(BUNDLE_CARD_THEME_LABELS.light) < html.indexOf(BUNDLE_CARD_THEME_LABELS.navy),
    'the incumbent style must be the first option',
  );
});

test('the select opens on the resolved default when nothing is stored', () => {
  // The selected <option> is the default's VALUE, not its label — asserted
  // together so a default change cannot leave the two disagreeing.
  assert.ok(has(panel(undefined), `value="${BUNDLE_CARD_THEME_DEFAULT}" selected=""`));
});

test('the glow pickers are NOT RENDERED for a สีขาว card', () => {
  // Not disabled, not hinted — absent. Every stored section is สีขาว, so two
  // controls an author can neither use nor dismiss were the panel's resting
  // state; they are gone instead.
  for (const style of [undefined, {}, { bundleCardTheme: 'light' }]) {
    const html = panel(style);
    assert.ok(!has(html, 'สีแสงด้านซ้าย'), `the left picker should be absent for ${JSON.stringify(style)}`);
    assert.ok(!has(html, 'สีแสงด้านขวา'), 'the right picker should be absent');
    assert.ok(!has(html, 'ใช้ได้กับสไตล์ Navy เท่านั้น'), 'no leftover disabled hint');
  }
});

test('BOTH glow pickers render, live, for a Navy card', () => {
  const html = panel({ bundleCardTheme: 'navy' });
  assert.ok(has(html, 'สีแสงด้านซ้าย'));
  assert.ok(has(html, 'สีแสงด้านขวา'));
  assert.doesNotMatch(html, /aria-disabled="true"/, 'nothing should be dimmed any more');
});

test('control: an out-of-vocabulary stored theme HIDES the glows, matching the render', () => {
  // The panel resolves the theme through `bundleCardThemeFor`, the same
  // function the renderer uses — so a junk value hides the pickers in exactly
  // the case it paints a light card. Asserted because the alternative
  // (comparing `style.bundleCardTheme` to a literal in the panel) would leave
  // the two able to disagree.
  const html = panel({ bundleCardTheme: 'definitely-not-a-theme' });
  assert.ok(!has(html, 'สีแสงด้านซ้าย'));
});

test("hiding the pickers does NOT touch the author's stored colours", () => {
  // The claim the old disabled-with-a-hint version made in words. A hidden
  // picker writes nothing, so the pair is still there the moment the card goes
  // back to Navy — asserted by switching the SAME style object over.
  const stored = { bundleGlowLeft: '#112233', bundleGlowRight: '#445566' };
  const light = panel({ ...stored, bundleCardTheme: 'light' });
  assert.ok(!has(light, '#112233'), 'a hidden picker renders nothing at all');
  const navy = panel({ ...stored, bundleCardTheme: 'navy' });
  assert.ok(has(navy, '#112233'), 'the left colour came back');
  assert.ok(has(navy, '#445566'), 'the right colour came back');
});

// ── the border switch: the shared component, and a switch-sized click target ─

test('the border switch IS the shared Toggle, not a bespoke one', () => {
  // Pinned by the shared component's own markers — the sr-only peer input with
  // role="switch" and its `toggle-state` text — rather than by any colour
  // class, so restyling the switch does not redden this.
  const d = dom({});
  const inp = d.querySelector('input[role="switch"]');
  assert.ok(inp, 'no switch rendered');
  assert.ok(inp.className.includes('peer') && inp.className.includes('sr-only'),
    'the switch is not the shared Toggle (its input is the sr-only peer)');
  assert.equal(inp.getAttribute('aria-checked'), 'false');
  assert.equal(inp.getAttribute('data-state'), 'off');
  assert.ok(d.querySelector('[data-testid="toggle-state"]'), 'the shared state text is missing');
});

test('an ABSENT cardBorderOn displays as off', () => {
  for (const style of [undefined, {}, { cardBorderOn: undefined }]) {
    const inp = dom(style).querySelector('input[role="switch"]');
    assert.equal(inp.getAttribute('data-state'), 'off', `${JSON.stringify(style)} should read off`);
    assert.equal(inp.getAttribute('aria-checked'), 'false');
  }
});

test('a stored cardBorderOn:true displays as on', () => {
  const inp = dom({ cardBorderOn: true }).querySelector('input[role="switch"]');
  assert.equal(inp.getAttribute('data-state'), 'on');
  assert.equal(inp.getAttribute('aria-checked'), 'true');
});

test('THE CLICK TARGET is switch-sized, not the full row', () => {
  // The reported bug: clicking blank space far to the right of the switch
  // flipped it, because `Field` wraps its children in a block-level <label>
  // and a <label> forwards clicks to the first labelable control inside it.
  //
  // Asserted structurally, which is the only way available without a browser:
  // the <label> that contains the switch must NOT be block/full-width.
  const d = dom({});
  const inp = d.querySelector('input[role="switch"]');
  let el = inp, label = null;
  while (el && el !== d.body) { if (el.tagName === 'LABEL') { label = el; break; } el = el.parentElement; }
  assert.ok(label, 'the switch should still sit in a label — that is what keeps its accessible name');
  const cls = label.className;
  assert.ok(!/\bblock\b/.test(cls), `the switch's label is still block-level: "${cls}"`);
  assert.ok(!/\bw-full\b/.test(cls), `the switch's label is still full-width: "${cls}"`);
  assert.ok(/\bw-fit\b/.test(cls), `the switch's label should shrink to its content: "${cls}"`);
});

test('the border row is a FieldBlock — the row itself is not a label', () => {
  // The other half of the same claim: the row that carries the hint must be a
  // <div>, so no part of it outside the inline label is clickable.
  const d = dom({});
  const hint = [...d.querySelectorAll('span')].find((s) => s.textContent.trim() === 'ค่าเริ่มต้นคือปิด');
  assert.ok(hint, 'the hint moved or changed wording');
  // Walk up from the hint: the first element with the row classes must be a DIV.
  let el = hint.parentElement;
  while (el && !/\bmb-3\b/.test(el.className ?? '')) el = el.parentElement;
  assert.ok(el, 'could not find the row wrapper');
  assert.equal(el.tagName, 'DIV', `the border row is a <${el.tagName.toLowerCase()}>, so the whole row is clickable`);
});

test('the border sub-controls are HIDDEN when the switch is off', () => {
  for (const style of [undefined, {}, { cardBorderOn: false }]) {
    const html = panel(style);
    assert.ok(!has(html, 'สีขอบ'), `สีขอบ should be absent for ${JSON.stringify(style)}`);
    assert.ok(!has(html, 'ความหนาขอบ'), 'ความหนาขอบ should be absent');
  }
});

test('the border sub-controls APPEAR when the switch is on', () => {
  const html = panel({ cardBorderOn: true });
  assert.ok(has(html, 'สีขอบ'));
  assert.ok(has(html, 'ความหนาขอบ'));
});

test("hiding the sub-controls does NOT touch the author's stored border values", () => {
  const stored = { cardBorderColor: '#ABCDEF', cardBorderWidth: 3 };
  assert.ok(!has(panel({ ...stored, cardBorderOn: false }), '#ABCDEF'), 'hidden renders nothing');
  const on = panel({ ...stored, cardBorderOn: true });
  assert.ok(has(on, '#ABCDEF'), 'the colour came back');
  assert.ok(has(on, 'value="3" selected=""'), 'the width came back');
});

test('control: the two conditional groups are independent', () => {
  // A Navy card with the border off shows the glows and not the border rows;
  // a สีขาว card with the border on shows the reverse. Without this, one gate
  // accidentally driving both would pass every test above.
  const navyNoBorder = panel({ bundleCardTheme: 'navy' });
  assert.ok(has(navyNoBorder, 'สีแสงด้านซ้าย'));
  assert.ok(!has(navyNoBorder, 'ความหนาขอบ'));

  const lightWithBorder = panel({ bundleCardTheme: 'light', cardBorderOn: true });
  assert.ok(!has(lightWithBorder, 'สีแสงด้านซ้าย'));
  assert.ok(has(lightWithBorder, 'ความหนาขอบ'));
});
