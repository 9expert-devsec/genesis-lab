import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as presets from '@/lib/pageBuilder/presets';
import { SECTION_STYLE_CAPS } from '@/lib/pageBuilder/presets';
import { styleControlsFor } from '@/components/pageBuilder/editor/SectionTypeFields';

/**
 * WITNESS 2 — structural: the PANEL derives its controls from the single source
 * (2C.3). If the panel offers exactly SECTION_STYLE_CAPS[type], and the
 * components read exactly SECTION_STYLE_CAPS[type] (witness 1 + the private
 * helpers), then panel == component by construction — no reader-set to keep in
 * sync by hand.
 */
test('panel derives exactly the declared caps for each type', () => {
  for (const [type, props] of Object.entries(SECTION_STYLE_CAPS)) {
    assert.deepEqual(styleControlsFor(type), props, `panel controls for ${type} must equal its caps`);
  }
});
test('every declared style prop has a panel control (no cap without a control)', () => {
  for (const [type, props] of Object.entries(SECTION_STYLE_CAPS)) {
    assert.equal(styleControlsFor(type).length, props.length, `${type} has a declared prop the panel cannot render`);
  }
});
test('a type with no caps gets no style controls', () => {
  assert.deepEqual(styleControlsFor('heading'), []);
  assert.deepEqual(styleControlsFor('course_card'), []);
});

/**
 * WITNESS 3a — the un-export, at runtime. The raw class fns MUST be private; if
 * either is exported, the panel↔component lock is open (a component could call it
 * directly, bypassing the caps). This asserts the module surface directly.
 */
test('raw cardStyleClass / buttonStyleClass are NOT exported (the lock)', () => {
  assert.equal(presets.cardStyleClass, undefined);
  assert.equal(presets.buttonStyleClass, undefined);
});
test('the sanctioned capability helpers ARE exported', () => {
  assert.equal(typeof presets.cardSurfaceClass, 'function');
  assert.equal(typeof presets.accentButtonClass, 'function');
});
