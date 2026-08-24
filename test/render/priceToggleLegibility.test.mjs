import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { Toggle } from '@/components/pageBuilder/editor/fields';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 53 — the price toggle, made legible. PRESENTATION ONLY.
 *
 * From a screenshot of what round 52 shipped: a grey circle, no colour
 * difference between its two states, and a three-line hint. Reading it required
 * knowing that knob-left means off.
 *
 * Nothing about the data moves. `content?.showPrice !== false` is round 50's
 * expression byte for byte, what the toggle dispatches is round 52's, and round
 * 50's four render measurements are unmoved (asserted by ITS tests, not
 * re-asserted here).
 *
 * ── THE MATCHER PROBLEM, WHICH IS THIS FILE'S REASON FOR EXISTING ─────────
 * The state words are แสดง and ไม่แสดง, and the NEGATIVE CONTAINS THE POSITIVE
 * — Thai negates by prefix. The field's label is แสดงราคาบนการ์ด, so the
 * positive word also appears there. A substring matcher therefore CANNOT tell
 * the two states apart, and the first test below proves that rather than
 * assuming it.
 *
 * Round 52 drew the wrong conclusion from the same fact and shipped no word at
 * all. The trap is real but it is a TEST-WRITING problem: every other Thai
 * label in this repo is matched at element-text boundaries, and so is this. An
 * author does not pay for a matcher's limitation.
 *
 * ── HOW STATE IS READ HERE ────────────────────────────────────────────────
 * Element text, via JSDOM, from a testid'd node — `textContent` compared with
 * `===`, never `includes`. `data-state` is the other reading and is ASCII, so
 * it is immune; it is unchanged from round 52 and round 52's own tests still
 * read it.
 *
 * JSDOM over a MARKUP STRING, not a React root. Round 45's hazard is about a
 * React root leaking globals into the markup tests sharing this process; a
 * parsed string does none of that, and other files in this tier already do it.
 */

const CATALOGUE = [];

const panel = (content) => renderToStaticMarkup(createElement(SectionContentEditor, {
  type: 'course_card', content, patch: () => {}, resolved: undefined, courses: CATALOGUE,
}));

const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

/** The state word as an ELEMENT'S TEXT — the only honest way to read it here. */
const stateWord = (markup) =>
  doc(markup).querySelector('[data-testid="toggle-state"]')?.textContent ?? null;

// ── A. THE STATE WORD, AND THE CONTROL THAT MAKES THE MATCH MEAN SOMETHING ─

test('CONTROL — a bare-substring matcher CANNOT discriminate on from off here', () => {
  /**
   * The reason every assertion in this file reads element text. If this ever
   * starts discriminating, the copy changed and the rest of the file should be
   * re-read rather than trusted.
   */
  const on = panel({ courseId: 'MSDB', showPrice: true });
  const off = panel({ courseId: 'MSDB', showPrice: false });

  // The positive word is present in BOTH — in the off state it is inside its
  // own negation, and in both states it is inside the field's label.
  assert.ok(on.includes('แสดง'), 'the positive word is missing from the ON render');
  assert.ok(off.includes('แสดง'), 'the substring matcher would have discriminated — re-check the copy');

  // …and the element-text reading DOES tell them apart, on the same two renders.
  assert.notEqual(stateWord(on), stateWord(off),
    'element text cannot discriminate either — the state word is not wired to state');
});

test('the state word is แสดง when on, matched as element text', () => {
  assert.equal(stateWord(panel({ courseId: 'MSDB', showPrice: true })), 'แสดง');
});

test('the state word is ไม่แสดง when off, matched as element text', () => {
  assert.equal(stateWord(panel({ courseId: 'MSDB', showPrice: false })), 'ไม่แสดง');
});

test('the ABSENT case shows the ON word — the only state stored today', () => {
  /**
   * Named because it is the case that would break every published card. Every
   * card stored before round 50 reads the key back ABSENT, so this is not an
   * edge case, it is the normal one.
   */
  assert.equal(stateWord(panel({ courseId: 'MSDB' })), 'แสดง',
    'a card with no showPrice key showed the OFF word while its page shows the price');
});

test('the word and the position agree — both derive from one expression', () => {
  // Two readings of one fact, which is the point: an author who does not know
  // the convention can read the word instead. They must never disagree.
  for (const [content, word, state] of [
    [{ courseId: 'MSDB', showPrice: true }, 'แสดง', 'on'],
    [{ courseId: 'MSDB' }, 'แสดง', 'on'],
    [{ courseId: 'MSDB', showPrice: false }, 'ไม่แสดง', 'off'],
  ]) {
    const markup = panel(content);
    assert.equal(stateWord(markup), word);
    assert.equal(doc(markup).querySelector('[data-state]')?.getAttribute('data-state'), state);
  }
});

// ── D. data-state IS UNCHANGED, AND THE WORD IS ADDITIONAL ────────────────

test('data-state is still on/off, exactly as round 52 built it', () => {
  const on = doc(panel({ courseId: 'MSDB' })).querySelector('input[role="switch"]');
  const off = doc(panel({ courseId: 'MSDB', showPrice: false })).querySelector('input[role="switch"]');
  assert.equal(on.getAttribute('data-state'), 'on');
  assert.equal(off.getAttribute('data-state'), 'off');
  assert.equal(on.getAttribute('aria-checked'), 'true');
  assert.equal(off.getAttribute('aria-checked'), 'false');
});

test('the word is ADDITIONAL — the switch itself is still there', () => {
  const markup = panel({ courseId: 'MSDB' });
  assert.equal([...markup.matchAll(/role="switch"/g)].length, 1, 'the switch was replaced by a word');
  assert.match(markup, /<input[^>]*type="checkbox"/, 'the native control is gone');
});

// ── B. COLOUR ──────────────────────────────────────────────────────────────

test('the track carries the on-colour only when on', () => {
  /**
   * The defect: grey in both states. The on-colour is applied through a
   * peer variant, so it is present in the class list either way — what must be
   * true is that it is CONDITIONAL on the input's checked state rather than
   * painted unconditionally.
   */
  const track = (markup) => doc(markup).querySelector('[aria-hidden="true"]')?.getAttribute('class') ?? '';
  const cls = track(panel({ courseId: 'MSDB' }));
  assert.ok(/peer-checked:bg-9e-action/.test(cls), 'the on-colour is not applied on the checked state');
  assert.ok(!/(^|\s)bg-9e-action(\s|$)/.test(cls),
    'the track paints the on-colour unconditionally — off would look identical to on');
});

test('CONTROL — an unconditional on-colour is what the test above rejects', () => {
  // The break, expressed as the comparison that catches it. A class list with a
  // bare on-colour token must fail the guard the shipped one passes.
  const shipped = doc(panel({ courseId: 'MSDB' })).querySelector('[aria-hidden="true"]').getAttribute('class');
  const broken = `${shipped} bg-9e-action`;
  assert.ok(!/(^|\s)bg-9e-action(\s|$)/.test(shipped), 'the shipped track is already unconditional');
  assert.ok(/(^|\s)bg-9e-action(\s|$)/.test(broken), 'the guard cannot see an unconditional colour');
});

test('the off state has a visible track of its own, not the panel background', () => {
  // "Grey circle" was the report: a near-white track under a white knob. The
  // off track must name its own fill rather than inheriting the surface.
  const cls = doc(panel({ courseId: 'MSDB', showPrice: false }))
    .querySelector('[aria-hidden="true"]').getAttribute('class');
  assert.ok(/(^|\s)bg-9e-slate-lt-400(\s|$)/.test(cls), 'the off track lost its fill');
  assert.ok(!/bg-\[var\(--surface-muted\)\]/.test(cls),
    'the off track went back to the near-white surface token');
});

test('no raw hex reaches the primitive, and no off-scale type size', () => {
  /**
   * Round 30: an author's colour is DATA, a source colour is a TOKEN. Round 17:
   * this repo mints no type tokens, so new text sits on the shared scale — the
   * rule round 52's first run broke.
   *
   * Read from the SCRUBBED source, which is the same reader panelPolish uses:
   * this file's own prose discusses colour and a scanner over raw text would
   * report its explanation as a violation.
   */
  const code = readSource('src/components/pageBuilder/editor/fields.jsx').code;
  assert.deepEqual([...new Set(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])], []);
  assert.deepEqual([...new Set(code.match(/text-\[[0-9.]+(px|rem)\]/g) ?? [])], []);
});

// ── C / E. THE HINT, AND WHAT DID NOT MOVE ────────────────────────────────

test('the hint is one short sentence and still says WHEN, not what', () => {
  const markup = panel({ courseId: 'MSDB' });
  assert.ok(markup.includes('ปิดเมื่อหน้านี้มีการ์ดราคาอยู่แล้ว'), 'the hint lost its condition');
  // The three-line version is gone.
  assert.ok(!markup.includes('จะได้ไม่มีราคาสองชุดพูดคนละอย่างบนหน้าเดียวกัน'),
    'the long tail of the hint is still there');
});

test('the label still names the setting', () => {
  assert.ok(panel({ courseId: 'MSDB' }).includes('แสดงราคาบนการ์ด'), 'the field label changed');
});

test('E — the data expression and the dispatch are untouched', () => {
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  assert.match(src, /checked=\{content\?\.showPrice\s*!==\s*false\}/,
    'round 50 built this expression and this round may not move it');
  assert.match(src, /onChange=\{\(next\)\s*=>\s*patch\(\{\s*showPrice:\s*next\s*\}\)\}/,
    'the dispatch changed');
});

test('E — still exactly one control for showPrice', () => {
  // Round 52's guard, reused rather than restated: one reader, one writer.
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  assert.equal((src.match(/patch\(\{\s*showPrice/g) ?? []).length, 1);
  assert.equal((src.match(/content\?\.showPrice/g) ?? []).length, 1);
});

test('E — the shared primitive has exactly one caller, so its blast radius is this control', () => {
  /**
   * This round changed the SHARED Toggle rather than one usage, which is only
   * safe because nothing else imports it. Counted, not assumed.
   *
   * NOT the only toggle in the codebase, which round 52 claimed in error: three
   * hand-rolled ones predate it, in the masterclass forms and the FAQ manager.
   * They are bare buttons with no switch role, which is why round 52's search
   * for that role missed them, and they are deliberately left alone — three
   * admin surfaces this round has no business restyling.
   */
  const editor = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  assert.equal((editor.match(/<Toggle\b/g) ?? []).length, 1, 'a second caller of the shared Toggle appeared');

  const fields = readSource('src/components/pageBuilder/editor/fields.jsx').code;
  assert.equal((fields.match(/role="switch"/g) ?? []).length, 1, 'a second switch primitive appeared');
});

test('the state word is optional — a Toggle given no words renders none', () => {
  // Keeps the primitive usable for a boolean whose states have no natural
  // wording, and keeps this round from forcing copy on a future caller.
  const bare = renderToStaticMarkup(createElement(Toggle, { checked: true, onChange: () => {} }));
  assert.equal(doc(bare).querySelector('[data-testid="toggle-state"]'), null);
  assert.match(bare, /data-state="on"/, 'the state attribute went away with the word');
});
