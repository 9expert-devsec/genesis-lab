import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { ContainerSection } from '@/components/pageBuilder/sections/container';
import { FullWidthSection } from '@/components/pageBuilder/sections/full_width';
import { StyleTab } from '@/components/pageBuilder/editor/SettingsPanel';
import { spacingBetweenClass, SPACING_BETWEEN_TYPES } from '@/lib/pageBuilder/presets';
import { settingsSchema, SPACING } from '@/lib/schemas/sections/base';
import { ALL_SECTION_TYPES } from '@/lib/schemas/pageBuilder';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 71 — `settings.spacingBetween`: the gap between a container's children.
 *
 * ── THE PROPERTY WITH TEETH IS ABSENT-MEANS-32px ──────────────────────────
 * Round 56 §H: a field that changes something every stored section ALREADY
 * SHOWS must read ABSENT as the incumbent. `.lean()` applies no Mongoose
 * defaults and JSON serialisation drops undefined keys, so all five stored
 * containers read the key back ABSENT — not as any default the schema declares.
 * `gap-8` was hardcoded, so `gap-8` is what absent must resolve to, and a
 * default of any kind on the schema field would break that by WRITING the key
 * into sections that merely pass through a parse.
 *
 * The px behind the classes are measured in headless Chrome by
 * scripts/_measure-round71-container-gap.mjs (0/16/32/64/96, canvas and
 * published identical); that the classes COMPILE to those numbers is pinned in
 * test/fs/containerGapScale, which is a separate file because importing
 * test/twCompile into a file that renders React pulls in a second copy of React
 * and every hook throws.
 */

const KIDS = [createElement('p', { key: 'a' }, 'a'), createElement('p', { key: 'b' }, 'b')];
const classOf = (m) => (/<div class="([^"]*)"/.exec(m) ?? [])[1] ?? '';
const renderBox = (C, settings) => renderToStaticMarkup(C({ children: KIDS, settings }));

/** What the two components rendered before this round, character for character. */
const HEAD_CONTAINER = '<div class="mx-auto flex flex-col gap-8"><p>a</p><p>b</p></div>';
const HEAD_FULL_WIDTH = '<div class="flex flex-col gap-8"><p>a</p><p>b</p></div>';

// ── 1. ABSENT IS THE INCUMBENT 32px ────────────────────────────────────────

test('an absent spacingBetween renders exactly what HEAD rendered', () => {
  // The shape a stored container actually arrives in: no such key at all.
  for (const settings of [undefined, {}, { containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium' }]) {
    assert.equal(Object.hasOwn(settings ?? {}, 'spacingBetween'), false, 'the fixture must not carry the key');
    assert.equal(renderBox(ContainerSection, settings), HEAD_CONTAINER, `container, settings=${JSON.stringify(settings)}`);
    assert.equal(renderBox(FullWidthSection, settings), HEAD_FULL_WIDTH, `full_width, settings=${JSON.stringify(settings)}`);
  }
});

test('the resolver answers absent with gap-8 and never warns about it', () => {
  assert.equal(spacingBetweenClass(undefined), 'gap-8');
  assert.equal(spacingBetweenClass(null), 'gap-8');
  // An unknown value also falls back — a directly-seeded doc must not crash a
  // render — but that path is the one `resolve` warns on, and it still lands on
  // the incumbent rather than on nothing.
  assert.equal(spacingBetweenClass('enormous'), 'gap-8');
});

test('CONTROL: giving the schema field ANY default would be caught here', () => {
  /**
   * This is the failure the absent rule exists for. A `.default('medium')`
   * looks harmless — `medium` IS 32px — but it makes the schema WRITE the key
   * into every section that passes through a parse, which is a stored-document
   * change on a page nobody edited. A default of anything else would move the
   * pixels too. Both are named here.
   */
  const parsedEmpty = settingsSchema.parse(undefined);
  assert.equal(Object.hasOwn(parsedEmpty, 'spacingBetween'), false,
    'settings.spacingBetween grew a default — §H requires it to be optional with NO default, so a '
    + 'stored container gains no key when it is merely re-validated');

  const old = { containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium', background: 'dark', visibility: 'all' };
  assert.deepEqual(Object.keys(settingsSchema.parse(old)).sort(), Object.keys(old).sort(),
    'a re-validated section gained a key it did not have');

  // …and the control on the control: the field really is accepted when present.
  assert.equal(settingsSchema.parse({ spacingBetween: 'xl' }).spacingBetween, 'xl');
  assert.equal(settingsSchema.safeParse({ spacingBetween: 'enormous' }).success, false);
});

// ── 2. EVERY OFFERED VALUE RENDERS ITS OWN GAP ─────────────────────────────

const EXPECTED = { none: 'gap-0', small: 'gap-4', medium: 'gap-8', large: 'gap-16', xl: 'gap-24' };

test('each value of the shared SPACING vocabulary maps to its own gap class', () => {
  assert.deepEqual([...SPACING].sort(), Object.keys(EXPECTED).sort(),
    'the vocabulary moved — this round reuses SPACING whole and must not fork it');
  for (const v of SPACING) {
    assert.equal(spacingBetweenClass(v), EXPECTED[v], `spacingBetween=${v}`);
    assert.match(classOf(renderBox(ContainerSection, { spacingBetween: v })), new RegExp(`(^|\\s)${EXPECTED[v]}(\\s|$)`));
    assert.match(classOf(renderBox(FullWidthSection, { spacingBetween: v })), new RegExp(`(^|\\s)${EXPECTED[v]}(\\s|$)`));
  }
});

test('CONTROL: the five classes are DISTINCT, so the mapping is not five aliases', () => {
  const classes = SPACING.map((v) => spacingBetweenClass(v));
  assert.equal(new Set(classes).size, SPACING.length,
    `two values resolve to the same class (${classes.join(', ')}) — the sweep above would pass on a `
    + 'map that returned gap-8 for everything');
  // …and exactly one of them is the incumbent, which is what makes absent safe.
  assert.equal(classes.filter((c) => c === 'gap-8').length, 1);
  assert.equal(spacingBetweenClass('medium'), spacingBetweenClass(undefined));
});

// ── 3. NESTING (§J) ────────────────────────────────────────────────────────

const box = (id, type, spacingBetween, children) => ({
  id, type, enabled: true, content: { children },
  settings: { containerWidth: 'full', spacingTop: 'none', spacingBottom: 'none', ...(spacingBetween ? { spacingBetween } : {}) },
});
const leaf = (id) => ({ id, type: 'heading', enabled: true, content: { text: id, level: 2 } });

test('a container inside a container applies its own gap to its own children only', () => {
  const section = box('outer', 'container', 'none', [
    leaf('o1'),
    box('inner', 'container', 'xl', [leaf('i1'), leaf('i2')]),
    leaf('o2'),
  ]);
  const doc = new JSDOM(`<!doctype html><body>${
    renderToStaticMarkup(createElement(SectionRenderer, { section }))}</body>`).window.document;

  const stacks = [...doc.querySelectorAll('div')]
    .filter((d) => /(^|\s)flex-col(\s|$)/.test(d.getAttribute('class') ?? ''));
  assert.equal(stacks.length, 2, 'expected exactly two container stacks (outer and inner)');

  const [outer, inner] = stacks;
  assert.match(outer.getAttribute('class'), /(^|\s)gap-0(\s|$)/, 'the outer container lost its own gap');
  assert.match(inner.getAttribute('class'), /(^|\s)gap-24(\s|$)/, 'the inner container lost its own gap');
  assert.equal(/(^|\s)gap-24(\s|$)/.test(outer.getAttribute('class')), false,
    "the inner container's gap leaked onto the outer one");
  assert.equal(/(^|\s)gap-0(\s|$)/.test(inner.getAttribute('class')), false,
    "the outer container's gap leaked onto the inner one");
  assert.ok(inner.compareDocumentPosition(outer) & 8, 'the inner stack is not actually nested inside the outer one');
});

test('CONTROL: with both left absent, the nested pair is the pre-round markup', () => {
  // Otherwise the test above could be reading two independently-styled boxes
  // rather than a nesting that works.
  const section = box('outer', 'container', undefined, [
    leaf('o1'), box('inner', 'container', undefined, [leaf('i1')]),
  ]);
  const doc = new JSDOM(`<!doctype html><body>${
    renderToStaticMarkup(createElement(SectionRenderer, { section }))}</body>`).window.document;
  const stacks = [...doc.querySelectorAll('div')]
    .filter((d) => /(^|\s)flex-col(\s|$)/.test(d.getAttribute('class') ?? ''));
  assert.equal(stacks.length, 2);
  for (const s of stacks) {
    assert.equal(s.getAttribute('class'), 'mx-auto flex flex-col gap-8',
      'an untouched nested container is no longer what it was before this round');
  }
});

// ── 4. THE CONTROL IS OFFERED EXACTLY WHERE IT IS HONOURED ─────────────────

const panelDoc = (type) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(
  createElement(StyleTab, { type, settings: {}, layout: {}, style: {}, patchKey: () => {} }),
)}</body>`).window.document;

const GAP_LABEL = 'ระยะห่างระหว่างเนื้อหาข้างใน';
const labelsIn = (doc) => [...doc.querySelectorAll('span')].map((s) => s.textContent.trim());

test('the gap control appears on the two types that read it', () => {
  assert.deepEqual([...SPACING_BETWEEN_TYPES].sort(), ['container', 'full_width'],
    'SPACING_BETWEEN_TYPES moved — the panel derives from it, so this is a deliberate widening');
  for (const type of SPACING_BETWEEN_TYPES) {
    assert.ok(labelsIn(panelDoc(type)).includes(GAP_LABEL), `${type} is missing the gap control`);
  }
});

test('CONTROL: it appears on NO other type, including the ones with a gap of their own', () => {
  /**
   * §B's cost, pinned. `card_grid` / `highlight_grid` have a grid GUTTER and
   * `two_column` has TWO gaps; offering the same word there would be a control
   * whose effect an author cannot predict. This is what would go red if a later
   * round widened the set without deciding what the word means on those types.
   */
  const others = ALL_SECTION_TYPES.filter((t) => !SPACING_BETWEEN_TYPES.includes(t));
  assert.ok(others.length > 20, 'the complement is suspiciously small — ALL_SECTION_TYPES may have moved');
  for (const type of ['card_grid', 'highlight_grid', 'two_column', 'heading', 'rich_text']) {
    assert.ok(others.includes(type), `${type} is unexpectedly in SPACING_BETWEEN_TYPES`);
    assert.equal(labelsIn(panelDoc(type)).includes(GAP_LABEL), false,
      `${type} offers a gap control that nothing reads`);
  }
});

test('the two types that offer it are exactly the two that import the resolver', () => {
  // Offering and honouring are the same act (the 2C.3 rule). A source scan is
  // what stops them drifting: the panel derives from SPACING_BETWEEN_TYPES, and
  // this checks the components on the other side of that constant.
  const readers = ALL_SECTION_TYPES.filter((t) => {
    let code;
    try { ({ code } = readSource(`src/components/pageBuilder/sections/${t}.jsx`)); } catch { return false; }
    return /\bspacingBetweenClass\s*\(/.test(code);
  });
  assert.deepEqual(readers.sort(), [...SPACING_BETWEEN_TYPES].sort(),
    'the components reading spacingBetween and the types offered the control disagree');
});

test('the two neighbours it sits beside are untouched', () => {
  // §H: spacingTop/spacingBottom keep their meaning and their values.
  const { code } = readSource('src/lib/pageBuilder/presets.js');
  assert.match(code, /none: 'pt-0', small: 'pt-4', medium: 'pt-8', large: 'pt-16', xl: 'pt-24',/);
  assert.match(code, /none: 'pb-0', small: 'pb-4', medium: 'pb-8', large: 'pb-16', xl: 'pb-24',/);
  const doc = panelDoc('container');
  for (const label of ['ระยะห่างด้านบน', 'ระยะห่างด้านล่าง', 'ความกว้าง']) {
    assert.ok(labelsIn(doc).includes(label), `${label} disappeared from การจัดวาง`);
  }
});
