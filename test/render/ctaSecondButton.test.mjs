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
// Round C — the legacy PAIR as a stored document carries it, for the editor
// tests at the foot of this file. They need a cta that opens on two rows, and
// the pair is the only way a document written before round C can say that.
const STORED_PAIR = {
  buttonLabel: 'สอบถาม', buttonHref: '/contact',
  secondaryButtonLabel: 'ดูตาราง', secondaryButtonHref: '/schedule',
};

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

/**
 * ── ROUND C: THESE THREE MOVED WITH THEIR SUBJECT ───────────────────────
 * Round 57 gave the cta a fixed SECOND PAIR of controls, and the three tests
 * below pinned it: the pair is offered, a half-filled pair warns, an unsafe
 * href warns, and no label captures a click.
 *
 * Round C replaces both pairs with a repeater, so `ข้อความบนปุ่มที่สอง` and
 * `ลิงก์ปุ่มที่สอง` no longer exist as controls — the legacy content fields
 * behind them are now a read-compatibility path and are deliberately not
 * offered. Deleting these tests would drop four real claims; leaving them
 * would pin a UI that is gone. So each CLAIM is kept and re-pointed at the
 * repeater, and the rest of this file — every RENDER test above — is untouched,
 * because a stored second button still renders exactly as round 57 built it.
 */

test('the editor offers a SECOND button row, and warns on a half-filled one', () => {
  /**
   * "Offers a second" is now a question about the repeater rather than about a
   * named control: a stored legacy pair opens as TWO rows, which is what makes
   * round 57's second button still authorable after the pair stopped existing.
   */
  const stored = panel({ heading: 'x', ...STORED_PAIR });
  const d = doc(stored);
  const rows = [...d.querySelectorAll('[data-move="up"]')];
  assert.equal(rows.length, 2, 'a stored legacy pair did not open as two editable rows');

  const half = panel({ heading: 'x', secondaryButtonLabel: 'ดูตาราง' });
  assert.ok(half.includes('จะแสดงก็ต่อเมื่อมีทั้งข้อความและลิงก์'),
    'a half-filled row drew no warning — the author would never learn why nothing appears');

  const complete = panel({ heading: 'x', secondaryButtonLabel: 'ดูตาราง', secondaryButtonHref: '/s' });
  assert.ok(!complete.includes('จะแสดงก็ต่อเมื่อมีทั้งข้อความและลิงก์'),
    'a complete row still warned');
});

test('the editor flags an unsafe href on the row that has one', () => {
  assert.ok(panel({ heading: 'x', secondaryButtonHref: 'javascript:alert(1)' })
    .includes('ใช้ไม่ได้'), 'an unsafe href drew no warning');
  // ...and the row is SHOWN rather than hidden, or the warning would be about
  // something the author cannot see or fix.
  const d = doc(panel({ heading: 'x', secondaryButtonHref: 'javascript:alert(1)' }));
  assert.equal([...d.querySelectorAll('[data-move="up"]')].length, 1);
});

test('K — every label in this panel wraps exactly one control (round 55)', () => {
  /**
   * The fixture now carries a full pair, because the repeater renders per-row
   * controls only for rows that exist — a cta with no buttons has just the two
   * envelope fields, and a sweep over two labels proves nothing.
   *
   * The claim is unchanged and is the one that matters: `FieldBlock`, not
   * `Field`, wraps the repeater, so the row's ย้ายขึ้น button is not the
   * control for the whole field.
   */
  const d = doc(panel({ heading: 'x', ...STORED_PAIR }));
  const labels = [...d.querySelectorAll('label')];
  assert.ok(labels.length >= 6, `only ${labels.length} labels — the panel did not render`);
  for (const l of labels) {
    const n = l.querySelectorAll('button, input, select, textarea, output, meter, progress').length;
    assert.ok(n <= 1, `a label wraps ${n} controls — a stray click would activate the first`);
  }
});

test('the repeater stops at four, and says so', () => {
  /**
   * The cap is a UI bound: the ADD button disables and nothing truncates. A cap
   * that deleted rows would be a design decision eating an author's content,
   * which is why the schema carries no `.max()` either.
   */
  const four = { buttons: [1, 2, 3, 4].map((n) => ({ label: `ปุ่ม ${n}`, href: `/p${n}` })) };
  const three = { buttons: four.buttons.slice(0, 3) };
  const addButton = (content) =>
    [...doc(panel(content)).querySelectorAll('button')].find((b) => b.textContent.includes('เพิ่มปุ่ม'));

  assert.equal(addButton(three).hasAttribute('disabled'), false, 'the add button was disabled below the cap');
  assert.equal(addButton(four).hasAttribute('disabled'), true, 'the add button stayed live at the cap');
  assert.ok(panel(four).includes('เพิ่มได้สูงสุด 4 รายการ'), 'the cap is enforced silently');
  // ...and a document already over the cap keeps every row rather than losing one.
  const five = { buttons: [...four.buttons, { label: 'ปุ่ม 5', href: '/p5' }] };
  assert.equal([...doc(panel(five)).querySelectorAll('[data-move="up"]')].length, 5);
});
