import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { renderTiptap } from '@/components/pageBuilder/richText/tiptapToReact';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { COLOR_INPUT_FALLBACK } from '@/lib/pageBuilder/customColor';

/**
 * ── ROUND B COMMIT 2: PER-RUN TEXT COLOUR ───────────────────────────────
 *
 * An author's colour on PART of a sentence. That is a mark, which is why it
 * lives here and not on the `heading` section: `heading.content.text` is a
 * plain string and can only ever be one colour.
 *
 * ── hexOrNull IS THE WHOLE SAFETY STORY, AND THIS FILE IS ITS TEST ──────
 * The document is untrusted input — a directly-seeded Mongo document can carry
 * anything, which presets.js has warned about since Phase 2 — and this is the
 * one path in the walker that reaches a `style` attribute. `HEX_COLOR_RE` is
 * anchored over a six-character alphabet, so a value containing a `;`, a `)`,
 * a quote or a space cannot be expressed at all; a style injection is not
 * blocked by a blocklist here, it is UNSAYABLE.
 *
 * When `hexOrNull` returns null the MARK IS DROPPED and the text survives —
 * the same degradation every unknown mark already gets. Not a fallback colour,
 * not an empty `style`: the run renders as if the author had never coloured it.
 *
 * ── ONE VOCABULARY, NOT TWO ─────────────────────────────────────────────
 * `rgb()`, three-digit shorthand, eight-digit alpha and named colours are each
 * rejected FOR A STATED REASON in customColor.js. Accepting one here would give
 * the system two spellings for one value and contradict the module that owns
 * the question, so each is asserted individually below rather than as a blanket
 * "invalid input is dropped".
 *
 * ── DARK MODE: VERBATIM, IN BOTH THEMES ─────────────────────────────────
 * No dark counterpart is derived and none is asserted, because there is none.
 * Round 79's derivation exists for a SURFACE, where the theme owns the text
 * sitting on top of it. This is the author's INK, and deriving it would repaint
 * the exact thing they chose. Stated in the walker's doc block and in the
 * control's Thai hint, so the author meets it at the point of choosing.
 */

const draw = (doc) => renderToStaticMarkup(renderTiptap(doc));

/** One paragraph whose single run carries a textStyle mark with `color`. */
const coloured = (color) => ({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'ข้อความ', marks: [{ type: 'textStyle', attrs: { color } }] }],
  }],
});

const spanOf = (html) =>
  new JSDOM(`<!doctype html><body>${html}</body>`).window.document.querySelector('span');

// ── a valid hex reaches style.color ────────────────────────────────────────

test('a valid hex reaches style.color', () => {
  const span = spanOf(draw(coloured('#1ba3f5')));
  assert.ok(span, 'no span was emitted for a valid colour');
  assert.equal(span.style.color, 'rgb(27, 163, 245)');
  assert.equal(span.textContent, 'ข้อความ');
});

test('an UPPERCASE hex is accepted and not rewritten', () => {
  /**
   * customColor.js accepts both cases and normalises neither: `<input
   * type="color">` emits lowercase and a pasted brand value is often upper,
   * both are valid CSS, and rewriting the author's value would make the stored
   * string differ from what they typed for no gain.
   */
  assert.ok(draw(coloured('#1BA3F5')).includes('#1BA3F5'), 'the author\'s casing was rewritten or dropped');
});

test('the fallback the picker opens on is itself a valid colour', () => {
  /**
   * Not a tautology: `COLOR_INPUT_FALLBACK` is DERIVED by arithmetic from the
   * navy channel triple rather than typed, so an arithmetic change could
   * produce a string the walker then refuses — a picker whose starting position
   * renders nothing.
   */
  const span = spanOf(draw(coloured(COLOR_INPUT_FALLBACK)));
  assert.ok(span, `the picker's own starting value (${COLOR_INPUT_FALLBACK}) does not render`);
});

// ── every invalid value: the text survives with NO colour and NO style ─────

/** One case per value, each with the reason customColor.js rejects it. */
const REFUSED = [
  ['red', 'a named colour — a second vocabulary for the same thing'],
  ['#abc', 'three-digit shorthand — a second spelling of one colour'],
  ['#00000080', 'eight-digit alpha — a colour over an unknown surface nobody can predict'],
  ['rgb(0,0,0)', 'a second vocabulary, and one <input type="color"> never emits'],
  ['#123456;background:url(x)', 'a semicolon — the injection the anchored alphabet makes unsayable'],
];

for (const [value, why] of REFUSED) {
  test(`REFUSED: ${JSON.stringify(value)} — ${why}`, () => {
    const html = draw(coloured(value));
    assert.equal(html, '<p>ข้อความ</p>',
      'the run did not degrade to plain text — the mark, or an empty span, survived');
    assert.equal(spanOf(html), null, 'a span was emitted for a colour that was refused');
    assert.ok(!html.includes('style'), 'a style attribute reached the markup');
  });
}

test('a missing, null or non-string colour drops the mark too', () => {
  /**
   * The absent case, which is what `unsetColor` leaves behind: TextStyle's
   * `removeEmptyTextStyle` clears the mark when every attribute is falsy, but a
   * document seeded outside the editor can still carry `{ type: 'textStyle' }`
   * with nothing on it, and it must render as unmarked text rather than as an
   * empty span.
   */
  for (const value of [undefined, null, '', 0, {}, ['#1ba3f5']]) {
    assert.equal(draw(coloured(value)), '<p>ข้อความ</p>',
      `colour ${JSON.stringify(value)} produced markup of its own`);
  }
  assert.equal(
    draw({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ข้อความ', marks: [{ type: 'textStyle' }] }] }] }),
    '<p>ข้อความ</p>',
    'a textStyle mark with no attrs at all emitted a span',
  );
});

// ── the mark composes with the ones already in the contract ───────────────

test('colour composes with bold and with a link, and does not displace either', () => {
  /**
   * `applyMarks` builds inline formatting inside-out and puts the link
   * OUTERMOST so the whole run links. A new wrapper inserted in the wrong place
   * would break that ordering silently — the page still renders, the link just
   * stops covering the coloured half.
   */
  const html = draw({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'ข้อความ',
        marks: [
          { type: 'textStyle', attrs: { color: '#1ba3f5' } },
          { type: 'bold' },
          { type: 'link', attrs: { href: 'https://9expert.co.th' } },
        ],
      }],
    }],
  });
  const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  const a = doc.querySelector('a');
  assert.ok(a, 'the link mark was lost');
  assert.ok(a.querySelector('strong'), 'the bold mark was lost');
  assert.ok(a.querySelector('span'), 'the colour did not survive inside the link');
  assert.equal(a.querySelector('span').style.color, 'rgb(27, 163, 245)');
});

// ── the control ───────────────────────────────────────────────────────────

test('CONTROL — the valid-hex assertion can fail', () => {
  /**
   * The same fixture asserted against a DIFFERENT hex. Without this, an
   * assertion that read the colour off the wrong place — or off nothing —
   * would be green for every value including the right one, and the whole file
   * above would be checking that a paragraph exists.
   */
  const span = spanOf(draw(coloured('#1ba3f5')));
  assert.throws(
    () => assert.equal(span.style.color, 'rgb(255, 0, 0)'),
    /AssertionError/,
    'the rendered colour is indistinguishable from a different one',
  );
  assert.throws(
    () => assert.equal(draw(coloured('#1ba3f5')), '<p>ข้อความ</p>'),
    /AssertionError/,
    'a coloured run is indistinguishable from a refused one — the REFUSED cases prove nothing',
  );
});
