import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { CtaSection } from '@/components/pageBuilder/sections/cta';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 57, step 2 — `cta` gains a second button.
 *
 * docs/promotion-page-coverage.md §G. Both live promotion pages close with two
 * actions (สอบถาม LINE + ดูตารางอบรมอื่น ๆ) and page B's hero opens with two;
 * the type offered one pair, so §B counted the gap twice (#18 and #21).
 *
 * ── THE PAIR-GUARD IS THE POINT, AND IT IS NOT NEW ────────────────────────
 * The first button has always rendered only with a non-empty label AND a safe
 * href. The second is read the same way, so a half-filled pair draws nothing
 * rather than a dead or empty button. §F asked for that specifically.
 *
 * ── DEFAULTS: THE ADD-SHAPED RULE, NOT ROUND 50's ─────────────────────────
 * Both fields are strings defaulting to '' and absent renders nothing (§H).
 * Round 50's `showPrice` defaults ON and reads `!== false` because it REMOVES
 * something every card shows; this ADDS something no page has shown.
 */

const draw = (content) => renderToStaticMarkup(
  createElement(CtaSection, { content, style: {}, layout: {} }));

const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
const links = (markup) => [...doc(markup).querySelectorAll('a')];

/** A cta an author could already have stored. */
const STORED = { heading: 'สนใจสมัคร', description: 'ทักได้เลย', buttonLabel: 'สอบถาม', buttonHref: '/contact' };

// ── ABSENT RENDERS NOTHING ─────────────────────────────────────────────────

test('a cta with NEITHER new key renders exactly what it always did', () => {
  const withoutKeys = draw(STORED);
  const withEmptyKeys = draw({ ...STORED, secondaryButtonLabel: '', secondaryButtonHref: '' });
  assert.equal(withEmptyKeys, withoutKeys, 'an empty second-button pair changed the render');
  assert.equal(links(withoutKeys).length, 1, 'the stored cta no longer draws exactly one button');
});

test('ABSENT secondary fields render no second button — the case every stored cta is in', () => {
  const markup = draw(STORED);
  assert.equal(links(markup).length, 1);
  // …and the wrapper keeps its original single-button class, or every stored
  // cta's markup changes.
  const wrapper = links(markup)[0].parentElement;
  assert.equal(wrapper.getAttribute('class'), 'mt-6',
    'the button wrapper gained layout classes with only one button');
});

test('F — the pair-guard: a label with no href draws nothing, and the reverse', () => {
  const labelOnly = draw({ ...STORED, secondaryButtonLabel: 'ดูตาราง' });
  assert.equal(links(labelOnly).length, 1, 'a second button appeared with no href');
  assert.ok(!labelOnly.includes('ดูตาราง'), 'the orphan label leaked into the markup');

  const hrefOnly = draw({ ...STORED, secondaryButtonHref: '/schedule' });
  assert.equal(links(hrefOnly).length, 1, 'a second button appeared with no label');

  const unsafe = draw({ ...STORED, secondaryButtonLabel: 'ดูตาราง', secondaryButtonHref: 'javascript:alert(1)' });
  assert.equal(links(unsafe).length, 1, 'an unsafe href drew a second button');

  // …and the complete pair DOES draw one, or the three assertions above are vacuous.
  const both = draw({ ...STORED, secondaryButtonLabel: 'ดูตาราง', secondaryButtonHref: '/schedule' });
  assert.equal(links(both).length, 2, 'a complete pair drew no second button');
});

test('CONTROL — the same guard, on the FIRST button, still behaves identically', () => {
  // The claim is that the second reuses the first's rule. If the first ever
  // stopped behaving this way the comparison would be against nothing.
  assert.equal(links(draw({ heading: 'x', buttonLabel: 'go' })).length, 0);
  assert.equal(links(draw({ heading: 'x', buttonHref: '/a' })).length, 0);
  assert.equal(links(draw({ heading: 'x', buttonLabel: 'go', buttonHref: '/a' })).length, 1);
});

test('a second button alone — with no first — still renders, and in the plain wrapper', () => {
  const markup = draw({ heading: 'x', secondaryButtonLabel: 'ดูตาราง', secondaryButtonHref: '/schedule' });
  const a = links(markup);
  assert.equal(a.length, 1, 'the second button did not render on its own');
  assert.equal(a[0].getAttribute('href'), '/schedule');
  assert.equal(a[0].parentElement.getAttribute('class'), 'mt-6',
    'a lone button got two-button layout classes');
});

test('two buttons get the row layout; one never does', () => {
  const two = draw({ ...STORED, secondaryButtonLabel: 'ดูตาราง', secondaryButtonHref: '/schedule' });
  const wrapper = links(two)[0].parentElement;
  assert.match(wrapper.getAttribute('class') ?? '', /\bflex\b/, 'two buttons did not get a row');
  assert.equal(links(draw(STORED))[0].parentElement.getAttribute('class'), 'mt-6');
});

test('an external secondary href gets the same rel/target treatment as the first', () => {
  const markup = draw({ ...STORED, secondaryButtonLabel: 'LINE', secondaryButtonHref: 'https://line.me/x' });
  const ext = links(markup).find((a) => a.getAttribute('href') === 'https://line.me/x');
  assert.equal(ext.getAttribute('target'), '_blank');
  assert.equal(ext.getAttribute('rel'), 'noopener noreferrer');
});

// ── THE SCHEMA ─────────────────────────────────────────────────────────────

test('the schema defaults both to the empty string', () => {
  const parsed = sectionSchema.parse({
    id: 's1', type: 'cta', name: '', enabled: true, sortOrder: 0,
    content: { heading: 'x' }, settings: {}, layout: {}, style: {}, advanced: {},
  });
  assert.equal(parsed.content.secondaryButtonLabel, '');
  assert.equal(parsed.content.secondaryButtonHref, '');
});

test('CONTROL — a non-empty default would put a button on every stored cta', () => {
  const asIfDefaulted = draw({ ...STORED, secondaryButtonLabel: 'DEFAULT', secondaryButtonHref: '/x' });
  assert.equal(links(asIfDefaulted).length, 2);
  assert.notEqual(asIfDefaulted, draw(STORED),
    'a non-empty default renders the same as an empty one — then the default would not matter');
});

test("round 50's showPrice was NOT harmonised into this round's pattern", () => {
  const courseCard = readSource('src/components/pageBuilder/sections/course_card.jsx').code;
  assert.match(courseCard, /content\?\.showPrice\s*!==\s*false/,
    'showPrice stopped reading absent as ON');
  const cta = readSource('src/components/pageBuilder/sections/cta.jsx').code;
  assert.ok(!/!==\s*false/.test(cta), "cta adopted round 50's remove-shaped reading");
});

// ── K: THE CONTROLS ────────────────────────────────────────────────────────

const panel = (content) => renderToStaticMarkup(createElement(SectionContentEditor, {
  type: 'cta', content, patch: () => {}, resolved: undefined, courses: [],
}));

test('the editor offers the second pair, and warns on a half-filled one', () => {
  const markup = panel({ heading: 'x' });
  assert.ok(markup.includes('ข้อความบนปุ่มที่สอง'), 'the second label control is missing');
  assert.ok(markup.includes('ลิงก์ปุ่มที่สอง'), 'the second href control is missing');

  const half = panel({ heading: 'x', secondaryButtonLabel: 'ดูตาราง' });
  assert.ok(half.includes('ปุ่มที่สองจะแสดงก็ต่อเมื่อมีทั้งข้อความและลิงก์'),
    'a half-filled second pair drew no warning — the author would never learn why nothing appears');

  const complete = panel({ heading: 'x', secondaryButtonLabel: 'ดูตาราง', secondaryButtonHref: '/s' });
  assert.ok(!complete.includes('ปุ่มที่สองจะแสดงก็ต่อเมื่อมีทั้งข้อความและลิงก์'),
    'a complete pair still warned');
});

test('the editor flags an unsafe secondary href', () => {
  assert.ok(panel({ heading: 'x', secondaryButtonHref: 'javascript:alert(1)' })
    .includes('ลิงก์ปุ่มที่สองใช้ไม่ได้'), 'an unsafe secondary href drew no warning');
});

test('K — every label in this panel wraps exactly one control (round 55)', () => {
  const d = doc(panel({ heading: 'x' }));
  const labels = [...d.querySelectorAll('label')];
  assert.ok(labels.length >= 6, `only ${labels.length} labels — the panel did not render`);
  for (const l of labels) {
    const n = l.querySelectorAll('button, input, select, textarea, output, meter, progress').length;
    assert.ok(n <= 1, `a label wraps ${n} controls — a stray click would activate the first`);
  }
});
