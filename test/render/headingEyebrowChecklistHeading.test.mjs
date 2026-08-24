import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { HeadingSection } from '@/components/pageBuilder/sections/heading';
import { ChecklistSection } from '@/components/pageBuilder/sections/checklist';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 57, step 3 — `heading` gains an eyebrow, `checklist` gains a heading.
 *
 * docs/promotion-page-coverage.md §G. Page B opens its detail section with a
 * small "PROMOTION DETAILS" line (§B #25); both pages carry two titled bullet
 * boxes, เงื่อนไขโปรโมชัน and หมายเหตุ (§B #17).
 *
 * ── THIS IS THE WIDEST BLAST RADIUS IN THE ROUND ──────────────────────────
 * `heading` is the most-used type in the system — 17 stored on this clone, more
 * than any other type these three commits touch. Both components also return a
 * BARE element (a heading tag, a <ul>), and the new field needs a wrapper above
 * it. Wrapping unconditionally would change the ROOT ELEMENT of every stored
 * section of both types, so the wrapper exists only when the field is set and
 * the empty path returns exactly what it always returned.
 *
 * Both fields are strings defaulting to '' and absent renders nothing (§H) —
 * they ADD, so they are the opposite of round 50's `showPrice`, which defaults
 * ON and reads `!== false` because it REMOVES.
 */

const heading = (content) => renderToStaticMarkup(
  createElement(HeadingSection, { content, style: {}, layout: {} }));
const checklist = (content) => renderToStaticMarkup(
  createElement(ChecklistSection, { content, style: {}, layout: {} }));

const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

const STORED_HEADING = { text: 'หัวข้อจริง', level: 'h2', align: 'left' };
const STORED_LIST = { items: [{ text: 'ก', checked: true }, { text: 'ข', checked: false }] };

// ── ABSENT RENDERS NOTHING, AND THE ROOT ELEMENT IS UNCHANGED ─────────────

test('a heading with NO eyebrow renders exactly what it always did', () => {
  const withoutKey = heading(STORED_HEADING);
  const withEmptyKey = heading({ ...STORED_HEADING, eyebrow: '' });
  assert.equal(withEmptyKey, withoutKey, 'an empty eyebrow changed the render');
  // The ROOT is still the heading tag itself, not a wrapper.
  assert.equal(doc(withoutKey).body.firstElementChild.tagName, 'H2',
    'the heading gained a wrapper with no eyebrow — every stored heading just changed');
});

test('a checklist with NO heading renders exactly what it always did', () => {
  const withoutKey = checklist(STORED_LIST);
  const withEmptyKey = checklist({ ...STORED_LIST, heading: '' });
  assert.equal(withEmptyKey, withoutKey, 'an empty heading changed the render');
  assert.equal(doc(withoutKey).body.firstElementChild.tagName, 'UL',
    'the checklist gained a wrapper with no heading — every stored checklist just changed');
});

test('ABSENT eyebrow renders nothing — the case every stored heading is in', () => {
  const absent = heading(STORED_HEADING);
  // '<p' would match '<path' inside the item icons — the substring trap this
  // repo has hit three times. Query the element instead.
  assert.equal(doc(absent).querySelector('p'), null, 'an eyebrow paragraph appeared with no eyebrow set');
  const set = heading({ ...STORED_HEADING, eyebrow: 'PROMOTION DETAILS' });
  assert.notEqual(set, absent, 'the eyebrow renders nothing even when set — the field is not wired');
});

test('ABSENT checklist heading renders nothing — the case every stored list is in', () => {
  const absent = checklist(STORED_LIST);
  assert.equal(doc(absent).querySelector('p'), null, 'a heading paragraph appeared with none set');
  const set = checklist({ ...STORED_LIST, heading: 'เงื่อนไขโปรโมชัน' });
  assert.notEqual(set, absent, 'the heading renders nothing even when set');
});

test('whitespace is treated as empty on both, not as content', () => {
  assert.equal(heading({ ...STORED_HEADING, eyebrow: '   ' }), heading(STORED_HEADING));
  assert.equal(checklist({ ...STORED_LIST, heading: '\t ' }), checklist(STORED_LIST));
});

test('CONTROL — a reading that treats ABSENT as set would fail these', () => {
  /**
   * `content.eyebrow !== ''` is TRUE for an absent key (undefined !== ''), so a
   * renderer written that way would wrap every stored heading in a div with an
   * empty paragraph. This proves the two readings disagree on exactly the input
   * every stored section presents.
   */
  for (const [obj, key] of [[STORED_HEADING, 'eyebrow'], [STORED_LIST, 'heading']]) {
    assert.equal(Object.hasOwn(obj, key), false, `${key} is present in the fixture`);
    assert.equal(obj[key] !== '', true, `${key}: the wrong reading does not treat absent as set`);
    const shipped = typeof obj[key] === 'string' ? obj[key].trim() : '';
    assert.equal(Boolean(shipped), false, `${key}: the shipped reading treated absent as set`);
  }
});

// ── WHAT EACH FIELD DRAWS WHEN SET ────────────────────────────────────────

test('the eyebrow sits ABOVE the heading, inside one wrapper, aligned with it', () => {
  const d = doc(heading({ ...STORED_HEADING, align: 'center', eyebrow: 'PROMOTION DETAILS' }));
  const root = d.body.firstElementChild;
  assert.equal(root.tagName, 'DIV');
  assert.match(root.getAttribute('class') ?? '', /text-center/,
    'the alignment did not move to the wrapper — the eyebrow would sit left under a centred heading');
  assert.equal(root.children[0].tagName, 'P');
  assert.equal(root.children[0].textContent, 'PROMOTION DETAILS');
  assert.equal(root.children[1].tagName, 'H2');
});

test('the heading level and alignment still work with an eyebrow present', () => {
  const d = doc(heading({ text: 'x', level: 'h3', align: 'right', eyebrow: 'E' }));
  assert.equal(d.querySelector('h3')?.textContent, 'x');
  assert.match(d.body.firstElementChild.getAttribute('class') ?? '', /text-right/);
});

test('the checklist heading is a <p>, not an <h*>', () => {
  /**
   * The section tree has no idea what heading level would be correct at an
   * arbitrary position, and guessing one would put a wrong rung in the document
   * outline. Authors who need a real heading have the `heading` type.
   */
  const d = doc(checklist({ ...STORED_LIST, heading: 'เงื่อนไขโปรโมชัน' }));
  const root = d.body.firstElementChild;
  assert.equal(root.tagName, 'DIV');
  assert.equal(root.children[0].tagName, 'P');
  assert.equal(root.children[0].textContent, 'เงื่อนไขโปรโมชัน');
  assert.equal(root.children[1].tagName, 'UL');
  assert.equal(d.querySelectorAll('h1,h2,h3,h4,h5,h6').length, 0,
    'the checklist title emitted a heading element and guessed a level');
});

test('the fail-closed rules are unchanged — a new field alone renders nothing', () => {
  assert.equal(heading({ eyebrow: 'E' }), '', 'a heading with only an eyebrow started rendering');
  assert.equal(checklist({ heading: 'H', items: [] }), '', 'a checklist with only a title started rendering');
  assert.equal(checklist({ heading: 'H', items: [{ text: '' }] }), '',
    'a checklist whose only item is blank started rendering');
});

test('the checklist items keep their own markers and accent', () => {
  const d = doc(checklist({ ...STORED_LIST, heading: 'x' }));
  assert.equal(d.querySelectorAll('ul li').length, 2, 'the title displaced the items');
  assert.equal(d.querySelectorAll('ul li svg').length, 2, 'the item markers are gone');
});

// ── THE SCHEMA ─────────────────────────────────────────────────────────────

test('both schemas default the new field to the empty string', () => {
  const parse = (type, content) => sectionSchema.parse({
    id: 's1', type, name: '', enabled: true, sortOrder: 0,
    content, settings: {}, layout: {}, style: {}, advanced: {},
  });
  assert.equal(parse('heading', { text: 'x' }).content.eyebrow, '');
  assert.equal(parse('checklist', { items: [] }).content.heading, '');
});

test('CONTROL — a non-empty default would wrap every stored section', () => {
  const asIfDefaulted = heading({ ...STORED_HEADING, eyebrow: 'DEFAULT' });
  assert.notEqual(asIfDefaulted, heading(STORED_HEADING),
    'a non-empty default renders the same as an empty one — then the default would not matter');
  assert.equal(doc(asIfDefaulted).body.firstElementChild.tagName, 'DIV');
});

test("round 50's showPrice was NOT harmonised into this round's pattern", () => {
  const courseCard = readSource('src/components/pageBuilder/sections/course_card.jsx').code;
  assert.match(courseCard, /content\?\.showPrice\s*!==\s*false/, 'showPrice stopped reading absent as ON');
  for (const rel of [
    'src/components/pageBuilder/sections/heading.jsx',
    'src/components/pageBuilder/sections/checklist.jsx',
  ]) {
    assert.ok(!/!==\s*false/.test(readSource(rel).code.replace(/checked !== false/g, '')),
      `${rel} adopted the remove-shaped reading for an add-shaped field`);
  }
});

// ── K: THE CONTROLS ────────────────────────────────────────────────────────

const panel = (type, content) => renderToStaticMarkup(createElement(SectionContentEditor, {
  type, content, patch: () => {}, resolved: undefined, courses: [],
}));

test('the editor offers both controls, each with its own label and hint', () => {
  const h = panel('heading', { text: 'x' });
  assert.ok(h.includes('ข้อความนำ (eyebrow)'), 'the eyebrow control is missing');
  assert.ok(h.includes('บรรทัดเล็กเหนือหัวข้อ'), 'the eyebrow control lost its hint');
  // Above the heading's own control, matching where it renders.
  assert.ok(h.indexOf('ข้อความนำ (eyebrow)') < h.indexOf('ระดับหัวข้อ'),
    'the eyebrow control is not above the heading fields');

  const c = panel('checklist', { items: [{ text: 'ก' }] });
  assert.ok(c.includes('หัวข้อรายการ'), 'the checklist title control is missing');
  assert.ok(c.includes('ชื่อกล่อง'), 'the checklist title control lost its hint');
});

test('K — every label in both panels wraps exactly one control (round 55)', () => {
  for (const [type, content] of [['heading', { text: 'x' }], ['checklist', { items: [{ text: 'ก' }] }]]) {
    const labels = [...doc(panel(type, content)).querySelectorAll('label')];
    assert.ok(labels.length >= 2, `${type}: only ${labels.length} labels — the panel did not render`);
    for (const l of labels) {
      const n = l.querySelectorAll('button, input, select, textarea, output, meter, progress').length;
      assert.ok(n <= 1, `${type}: a label wraps ${n} controls — a stray click would activate the first`);
    }
  }
});
