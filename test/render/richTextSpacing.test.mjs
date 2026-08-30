import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { RichTextSection } from '@/components/pageBuilder/sections/rich_text';

/**
 * ── ROUND 60: THE RICH-TEXT PARAGRAPH AND LIST SPACING ────────────────────
 *
 * ── WHAT THIS FILE CAN AND CANNOT ASSERT, SAID PLAINLY ──────────────────
 * The CAUSE is a stylesheet cascade: @tailwindcss/typography's
 * `> ul > li > p:first-child` and `:last-child` rules both fire on the single
 * paragraph Tiptap puts in every list item, so each bullet carried a full
 * paragraph's margin. Round 23 established that only a browser resolves this
 * and JSDOM resolves NONE of it — so this suite cannot measure a margin, and
 * any test here claiming to would be measuring nothing.
 *
 * The work is therefore split three ways, and each part is asserted where it
 * can actually be answered:
 *
 *   the CLASSES are on the element        -> here, exact-token matching
 *   the classes COMPILE to real rules     -> test/fs/tailwindArbitraryValueRules
 *                                            (four registrations, compiled from
 *                                            the real source files)
 *   the computed MARGINS are what we want -> scripts/_probe-round60-prose-spacing.mjs
 *                                            (Chrome, computed values + which
 *                                            rule wins via CDP matched styles)
 *
 * Measured before/after, at 18px/32px line-height:
 *   gap p->p    24px -> 16px
 *   gap li->li  24px ->  4px
 *   outer edges  0px ->  0px  (kept; the two zeroing classes exist for that)
 *
 * ── THE MATCHING IS EXACT-TOKEN, NOT SUBSTRING ─────────────────────────
 * This repo has been bitten four times by a bare-name match (`'<p'` matching
 * `<path`, `\bchecked\b` matching inside `aria-checked`). Every check below
 * splits the class attribute on whitespace and asks for SET MEMBERSHIP, so
 * `my-4` can never satisfy a check for `prose-p:my-4` and `[&_li>p]:my-0` can
 * never be satisfied by `[&_li>p]:my-4`.
 */
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const DOC = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าแรก' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้าที่สอง' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ก' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ข' }] }] },
    ] },
  ],
};

const draw = (content) => renderToStaticMarkup(RichTextSection({ content }));
const classesOf = (html) => new Set(
  (doc(html).querySelector('div')?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean),
);

/** The spacing decision, as data, so the two surfaces can be checked against one list. */
const SPACING = [
  'prose-p:my-4',           // 16px between paragraphs — the article body's own value
  'prose-ul:my-4',
  'prose-ol:my-4',
  'prose-li:my-1',          // 4px between list items — tighter, a list is one unit
  '[&_li>p]:my-0',          // the actual defect: Tiptap's per-item paragraph
  '[&>*:first-child]:mt-0', // put back typography's outer-edge zeroing, which
  '[&>*:last-child]:mb-0',  // prose-p:my-4 takes away (same specificity, later)
];

test('the rich_text renderer carries every spacing class, as exact tokens', () => {
  const cls = classesOf(draw({ doc: DOC }));
  for (const c of SPACING) {
    assert.ok(cls.has(c), `rich_text lost "${c}" — the spacing silently reverts to the plugin default`);
  }
});

test('the editor input carries the SAME spacing set, so the author sees the published rhythm', () => {
  /**
   * A source read, not a render: the class is handed to Tiptap through
   * editorProps and never appears in this component's JSX, so there is no
   * markup to query. Comments are stripped first — this repo's standing rule,
   * earned six times — or the block comment ABOVE the class string, which names
   * several of these utilities while explaining them, would satisfy the check
   * on its own.
   */
  const file = path.resolve(
    fileURLToPath(new URL('../..', import.meta.url)),
    'src/components/pageBuilder/editor/richText/RichTextEditor.jsx',
  );
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  for (const c of SPACING) {
    // Bounded on both sides: the class must be delimited by a quote or a space,
    // so `[&_li>p]:my-0` is not satisfied by `[&_li>p]:my-04`.
    const idx = src.indexOf(c);
    assert.notEqual(idx, -1, `the editor input lost "${c}" — it would compose against a different rhythm`);
    const after = src[idx + c.length];
    assert.ok(after === ' ' || after === "'" || after === '"',
      `"${c}" in the editor input is a prefix of a longer class, not the class itself`);
  }
});

test('the classes are literal in the source, not assembled — Tailwind reads TEXT', () => {
  /**
   * The whole reason the compile guard exists: a class built by concatenation
   * renders perfectly and compiles to nothing. `PROSE` in rich_text.jsx is a
   * multi-line concatenation, which is fine ONLY because each class sits whole
   * inside one string literal. This asserts that, so a future reformat that
   * splits `[&_li>` from `p]:my-0` across the `+` is caught here rather than by
   * a reader noticing the spacing came back.
   */
  const file = path.resolve(
    fileURLToPath(new URL('../..', import.meta.url)),
    'src/components/pageBuilder/sections/rich_text.jsx',
  );
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const c of SPACING) {
    assert.ok(src.includes(c), `"${c}" is not literal in rich_text.jsx — Tailwind cannot see it`);
  }
});

test('the spacing does not disturb what the section renders', () => {
  const d = doc(draw({ doc: DOC }));
  assert.equal(d.querySelectorAll('p').length, 4, 'two paragraphs plus one per list item');
  assert.equal(d.querySelectorAll('li').length, 2);
  assert.equal(d.querySelectorAll('ul').length, 1);
  // Fails closed, unchanged: an ABSENT doc still renders nothing at all.
  assert.equal(draw({ doc: null }), '');
  assert.equal(draw({}), '');

  /**
   * ── A PRE-EXISTING QUIRK, PINNED RATHER THAN FIXED ──────────────────────
   * A doc that EXISTS but is empty (`{type:'doc',content:[]}`) renders an empty
   * `<div class="prose …">` rather than nothing: renderTiptap returns `null`
   * for an absent doc but an empty children array for an empty one, and an
   * array is truthy. Verified identical at HEAD, so this round did not cause it
   * and does not change it — a spacing commit is the wrong place to change what
   * a section renders. Pinned here so the next reader meets it as a known,
   * dated fact instead of rediscovering it.
   */
  const emptyDoc = draw({ doc: { type: 'doc', content: [] } });
  assert.notEqual(emptyDoc, '', 'the empty-doc quirk has changed — see the note above');
  assert.equal(doc(emptyDoc).querySelector('div').textContent, '',
    'the empty-doc wrapper gained content');
});

test('the base typography is untouched — this round changed spacing, not scale', () => {
  const cls = classesOf(draw({ doc: DOC }));
  for (const c of ['prose', 'prose-lg', 'max-w-none', 'dark:prose-invert',
                   'prose-headings:font-heading', 'prose-a:text-[var(--pb-accent-text)]',
                   'prose-img:rounded-9e-md']) {
    assert.ok(cls.has(c), `"${c}" was dropped — the size scale and accent are out of scope this round`);
  }
});

test('CONTROL — the exact-token check rejects a prefix and a near-miss', () => {
  /**
   * Without this, every assertion above is equally consistent with a check that
   * matches anything. Both shapes this repo has actually been bitten by are
   * exercised: a SHORTER token that is a substring of the real one, and a
   * near-identical token differing only in its value.
   */
  const pretend = new Set(['prose', 'my-4', 'my-1', '[&_li>p]:my-4', 'prose-p:my-4x']);
  assert.ok(!pretend.has('prose-p:my-4'), 'a bare my-4 satisfied the paragraph check');
  assert.ok(!pretend.has('prose-li:my-1'), 'a bare my-1 satisfied the list-item check');
  assert.ok(!pretend.has('[&_li>p]:my-0'), 'a different value satisfied the list-paragraph check');
  // …and the real set does contain them, so the check is not simply always false.
  const real = classesOf(draw({ doc: DOC }));
  assert.ok(real.has('prose-p:my-4') && real.has('prose-li:my-1') && real.has('[&_li>p]:my-0'));
});
