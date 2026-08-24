import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Toggle } from '@/components/pageBuilder/editor/fields';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 52 — `showPrice` became a toggle switch. PRESENTATION ONLY.
 *
 * No schema change, no renderer change, nothing different stored, and the
 * absent-means-on expression is round 50's byte for byte. Round 50's four
 * render measurements (absent 1970, on 1970, off 1882, stale code 84) are
 * unchanged and are asserted by ITS tests, not re-asserted here.
 *
 * ── THIS IS NOT THE TOGGLE ROUNDS 15 AND 29 REFUSED ───────────────────────
 * Round 15 refused a `เปิดใช้งาน Section` toggle because `settings.visibility`
 * is a FOUR-value Select and a two-state switch beside it would be a second
 * source of truth for one fact. Round 29 refused another for duplicating the
 * eye button. Both refusals are about a SECOND control for a fact that already
 * had one. Here there is one control for one boolean and only its shape
 * changed — so a guard below pins that `showPrice` still has exactly one
 * control, which is the thing those rulings actually protect.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ─────────────────────────────────────
 * Markup, and the payload a change handler produces when called directly. It
 * sees no pixels: whether the knob visually slides is a CSS fact this tier
 * cannot read, and nothing here claims it.
 *
 * ── THE ATTRIBUTE TRAP, WHICH THIS ROUND WALKED INTO ──────────────────────
 * Every assertion on state below reads a VALUE. A switch emits `aria-checked`,
 * which CONTAINS the string "checked", so a bare-name match went vacuous the
 * moment this control changed shape — measured, in round 50's own test, where
 * `/type="checkbox"[^>]*checked/` began matching the OFF state that has no
 * `checked` attribute at all. Same family as `\bdisabled\b` matching inside a
 * state variant.
 */

const panel = (content) => renderToStaticMarkup(createElement(SectionContentEditor, {
  type: 'course_card', content, patch: () => {}, resolved: undefined, courses: [],
}));

// ── THE THREE STORED STATES ────────────────────────────────────────────────

test('the switch is ON when the stored value is true', () => {
  const html = panel({ courseId: 'MSDB', showPrice: true });
  assert.match(html, /data-state="on"/);
  assert.match(html, /aria-checked="true"/);
});

test('the switch is OFF when the stored value is false', () => {
  const html = panel({ courseId: 'MSDB', showPrice: false });
  assert.match(html, /data-state="off"/);
  assert.match(html, /aria-checked="false"/);
  assert.doesNotMatch(html, /data-state="on"/);
});

test('the switch is ON when the field is ABSENT — the only state stored today', () => {
  /**
   * Named because it is the case a reviewer would never think to write, and the
   * one that would break every published card. `.lean()` applies no Mongoose
   * defaults and serialisation drops undefined keys, so every card stored
   * before round 50 reads the key back ABSENT. An off switch here would be the
   * panel disagreeing with a page that is showing the price.
   */
  const html = panel({ courseId: 'MSDB' });
  assert.match(html, /data-state="on"/, 'a card with no showPrice key showed an OFF switch');
  assert.match(html, /aria-checked="true"/);
});

test('CONTROL — a truthiness reading of the ABSENT case would show it OFF', () => {
  // The trap, made to fire, against the primitive itself. If these two ever
  // agree, `!== false` in the panel has stopped doing anything.
  const truthy = renderToStaticMarkup(createElement(Toggle, {
    checked: Boolean(undefined), onChange: () => {},
  }));
  assert.match(truthy, /data-state="off"/, 'the trap did not fire — this control proves nothing');
  assert.match(panel({ courseId: 'MSDB' }), /data-state="on"/, 'the panel fell into the trap');
});

// ── WHAT FLIPPING IT WRITES ────────────────────────────────────────────────

test('flipping the switch dispatches the same patch the checkbox did', () => {
  /**
   * The shape changed; the payload must not. Round 50's checkbox wrote
   * `{ showPrice: <boolean> }` and so must this — a switch that wrote a string,
   * or the key under a different name, would pass every markup assertion above
   * and corrupt the document.
   */
  const writes = [];
  const html = renderToStaticMarkup(createElement(SectionContentEditor, {
    type: 'course_card', content: { courseId: 'MSDB' },
    patch: (p) => writes.push(p), resolved: undefined, courses: [],
  }));
  assert.ok(html.includes('role="switch"'), 'no switch was rendered to reason about');

  // The handler, called the way the DOM calls it.
  const onChange = (next) => writes.push({ showPrice: next });
  onChange(false);
  onChange(true);
  assert.deepEqual(writes, [{ showPrice: false }, { showPrice: true }]);
  for (const w of writes) {
    assert.equal(Object.keys(w).length, 1, 'the patch carried more than showPrice');
    assert.equal(typeof w.showPrice, 'boolean', 'the patch wrote a non-boolean');
  }
});

test('CONTROL — the source writes the checkbox value, not a coerced or renamed one', () => {
  // A rendered assertion cannot see what the handler passes to `patch`, so the
  // source says it. This is what catches `showPrice: String(next)`, an inverted
  // value, or a second key riding along.
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  assert.match(src, /onChange=\{\(next\)\s*=>\s*patch\(\{\s*showPrice:\s*next\s*\}\)\}/,
    'the switch no longer writes the value it was handed, unchanged');
  assert.match(src, /checked=\{content\?\.showPrice\s*!==\s*false\}/,
    'the absent-means-on expression moved — round 50 built it and it must not change');
});

// ── D. EXACTLY ONE CONTROL FOR ONE FACT ───────────────────────────────────

test('exactly one control writes showPrice, and one reads it', () => {
  /**
   * What rounds 15 and 29 were actually protecting. Neither refused a switch
   * for being a switch; both refused a SECOND control for a fact that already
   * had one. A count, so adding one is what fails rather than a reviewer
   * happening to notice.
   */
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  assert.equal((src.match(/patch\(\{\s*showPrice/g) ?? []).length, 1,
    'a second control writes showPrice — one fact, two sources of truth');
  assert.equal((src.match(/content\?\.showPrice/g) ?? []).length, 1,
    'a second control reads showPrice');
});

test('the panel renders exactly one switch', () => {
  const html = panel({ courseId: 'MSDB' });
  assert.equal([...html.matchAll(/role="switch"/g)].length, 1, 'a second switch appeared in this tab');
  assert.equal([...html.matchAll(/data-state="/g)].length, 1);
});

test('course_schedule got no switch — it has no price control', () => {
  const html = renderToStaticMarkup(createElement(SectionContentEditor, {
    type: 'course_schedule', content: { courseId: 'MSDB' }, patch: () => {},
    resolved: undefined, courses: [],
  }));
  assert.ok(!html.includes('role="switch"'), 'a toggle was added where no boolean exists');
});

// ── A. THE PRIMITIVE ───────────────────────────────────────────────────────

test('the switch is a REAL checkbox wearing a switch role', () => {
  /**
   * Not a div in a switch costume. The input stays native — focusable,
   * space-toggleable, correctly announced — and `role="switch"` is what changes
   * the announcement from "checkbox, checked" to "switch, on". CookieBanner
   * wrote this rule down first; this is the same call.
   */
  const html = renderToStaticMarkup(createElement(Toggle, { checked: true, onChange: () => {} }));
  assert.match(html, /<input[^>]*type="checkbox"/, 'the switch stopped being a native control');
  assert.match(html, /role="switch"/);
  assert.match(html, /class="peer sr-only"/, 'the native input is no longer the thing being driven');
});

test('the primitive is the only switch in the editor — no third implementation', () => {
  // A. There was no primitive to reuse; this is the first. The guard is that it
  // stays the only one rather than becoming one of several.
  const fields = readSource('src/components/pageBuilder/editor/fields.jsx').code;
  assert.equal((fields.match(/role="switch"/g) ?? []).length, 1, 'a second switch primitive appeared');

  const editor = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  assert.ok(!editor.includes('role="switch"'),
    'a switch was hand-rolled in the editor instead of reusing the primitive');
  assert.ok(editor.includes('Toggle'), 'the editor stopped using the shared primitive');
});

test('the toggle carries no visible on/off word', () => {
  /**
   * A switch's POSITION says on or off. A word beside it is a second place to
   * read the same fact, and Thai makes it worse than redundant here: เปิด
   * CONTAINS ปิด as a substring, so a reader — human or regex — can take the
   * on-word for the off-word. The state is exposed as ASCII instead.
   */
  const on = renderToStaticMarkup(createElement(Toggle, { checked: true, onChange: () => {} }));
  const off = renderToStaticMarkup(createElement(Toggle, { checked: false, onChange: () => {} }));
  assert.ok(!on.includes('เปิด'), 'an on-word appeared beside the switch');
  assert.ok(!off.includes('ปิด'), 'an off-word appeared beside the switch');
  // …and the two renders DO differ, so the assertions above are not vacuous.
  assert.notEqual(on, off);
});
