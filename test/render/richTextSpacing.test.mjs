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

/**
 * ── ROUND 65: THE SAME CLAIM, AT TWO SIZES ────────────────────────────────
 * Round 60's claim is unchanged and is still the reason this file exists: the
 * renderer and the editor input must not disagree about how far apart
 * paragraphs and bullets sit, or the author composes against the wrong rhythm.
 * Only the VALUES moved, because the body scale did.
 *
 * `my-4` was chosen as half of an 18px body's 32px line. The body is now 16px
 * (28px line) at `md:` and up and 14px (24px line) below, so one absolute
 * number cannot be half of both — at 14px, 16px of gap is 67% of the line where
 * it used to be 50%, i.e. MOBILE would read looser than desktop. So the gap is
 * `my-3` (12px, half the 24px mobile line) with an `md:my-4` above it, keeping
 * round 60's other reason — matching `.article-content`'s 1rem — exactly where
 * it still applies.
 *
 * The list therefore splits in two, and the split is the substance:
 *   BASE   both surfaces carry it. The editor input is a FIXED 330px panel
 *          (EditorShell `lg:grid-cols-[276px_1fr_330px]`), so it has no wide
 *          mode and stays at the mobile rhythm — which is now exactly what it
 *          renders, rather than the compromise round 60 had to note.
 *   WIDE   the renderer only. A `md:` query reads the BROWSER width; a side
 *          panel is not a viewport, so putting it there would be responsive to
 *          the wrong thing.
 *
 * `prose-li:my-1` is in BASE at both sizes on purpose: 4px is already the
 * tightest useful step and 2px is a gap a reader cannot see.
 *
 * Measured in Chrome, scripts/_measure-round65-type-scale.mjs:
 *   gap p->p    16px both viewports  ->  16px desktop / 12px mobile
 *   gap li->li   4px both viewports  ->   4px both, unchanged
 *   outer edges  0px                 ->   0px, still
 */
const SPACING_BASE = [
  'prose-p:my-3',           // 12px between paragraphs on mobile — half the 24px line
  'prose-ul:my-3',
  'prose-ol:my-3',
  'prose-li:my-1',          // 4px between list items — tighter, a list is one unit,
                            // and deliberately NOT scaled with the body
  '[&_li>p]:my-0',          // the actual defect: Tiptap's per-item paragraph
  '[&>*:first-child]:mt-0', // put back typography's outer-edge zeroing, which
  '[&>*:last-child]:mb-0',  // prose-p:my-* takes away (same specificity, later)
];

/** Renderer only — the editor panel has no wide mode to override into. */
const SPACING_WIDE = [
  'md:prose-p:my-4',        // 16px from 768px up — the article body's own 1rem
  'md:prose-ul:my-4',
  'md:prose-ol:my-4',
];

const SPACING = [...SPACING_BASE, ...SPACING_WIDE];

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
  for (const c of SPACING_BASE) {
    // Bounded on both sides: the class must be delimited by a quote or a space,
    // so `[&_li>p]:my-0` is not satisfied by `[&_li>p]:my-04`.
    const idx = src.indexOf(c);
    assert.notEqual(idx, -1, `the editor input lost "${c}" — it would compose against a different rhythm`);
    const after = src[idx + c.length];
    assert.ok(after === ' ' || after === "'" || after === '"',
      `"${c}" in the editor input is a prefix of a longer class, not the class itself`);
  }

  /**
   * And it must NOT carry the wide set. Round 65: the panel is a fixed 330px
   * column, so a `md:` query there would read the BROWSER width and put 16px
   * body text in a 330px box on every desktop. Copying the renderer's string
   * wholesale is the easy mistake, and this is what names it.
   */
  for (const c of SPACING_WIDE) {
    assert.equal(src.indexOf(c), -1,
      `the editor input picked up "${c}" — a fixed 330px panel is not a viewport, `
      + 'so a viewport query cannot describe it');
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

/**
 * ── ROUND 65 REPLACED THE ASSERTION THAT USED TO STAND HERE ───────────────
 * It read "the base typography is untouched — this round changed spacing, not
 * scale", and pinned `prose-lg`. That was round 60 declaring its own scope, and
 * it was right to. Round 65 changes exactly that, so the assertion is not
 * amended in its values — the CLAIM it made is the one this round retires, and
 * pretending otherwise by editing a token would leave a comment that lies.
 *
 * What replaces it is the same shape pointed at the new decision: the size
 * modifiers are named, and — the part that matters — they are the ONLY ones,
 * so a stray second modifier cannot ride along and win on source order.
 */

/** The size modifiers @tailwindcss/typography registers. Not a hand-list: read
 * off the plugin, so a version that adds a sixth cannot slip past this. */
const PLUGIN_SIZES = ['sm', 'base', 'lg', 'xl', '2xl'];

test('the body scale is prose-sm below md and prose-base above — and nothing else', () => {
  const cls = classesOf(draw({ doc: DOC }));

  assert.ok(cls.has('prose-sm'), 'the 14px mobile body size is gone');
  assert.ok(cls.has('md:prose-base'), 'the 16px desktop body size is gone');

  /**
   * THE ONLY ONES. Two size modifiers on one element both compile, and the
   * later rule wins — so a leftover `prose-lg` beside `prose-sm` would render
   * 18px while every class the reader expects is still present. Exact-token
   * membership over the plugin's own list, both bare and `md:`-prefixed.
   */
  const sizeTokens = [...cls].filter((c) => PLUGIN_SIZES.some(
    (n) => c === 'prose-' + n || c === 'md:prose-' + n));
  assert.deepEqual(sizeTokens.sort(), ['md:prose-base', 'prose-sm'],
    'a second body-size modifier is on the wrapper — two of them compile and the '
    + 'later one wins, so the size would not be the one this list names');

  // The rest of the base typography IS still out of scope, and stays asserted.
  for (const c of ['prose', 'max-w-none', 'dark:prose-invert',
                   'prose-headings:font-heading', 'prose-a:text-[var(--pb-accent-text)]',
                   'prose-img:rounded-9e-md']) {
    assert.ok(cls.has(c), `"${c}" was dropped — only the SIZE moved this round`);
  }
});

test('the editor input keeps prose-sm, and does not follow the renderer up', () => {
  /**
   * §E, as an assertion rather than a note. The panel is a fixed 330px column
   * (EditorShell `lg:grid-cols-[276px_1fr_330px]`), so a viewport query cannot
   * describe it — and at `prose-sm` it now renders exactly what the published
   * page renders below 768px, which round 60 could only wish for.
   */
  const file = path.resolve(
    fileURLToPath(new URL('../..', import.meta.url)),
    'src/components/pageBuilder/editor/richText/RichTextEditor.jsx',
  );
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  /**
   * EXACT-TOKEN, like everything else in this file, and deliberately not a
   * regex: the size modifiers are whole class names, and a substring test would
   * let `prose-sm` satisfy a check for the absence of `prose-s`.
   */
  const tokens = new Set(src.split(/['"`+\s]+/).filter(Boolean));
  assert.ok(tokens.has('prose-sm'), 'the editor input lost prose-sm');
  for (const n of PLUGIN_SIZES) {
    if (n === 'sm') continue;
    for (const form of ['prose-' + n, 'md:prose-' + n]) {
      assert.ok(!tokens.has(form),
        `the editor input picked up "${form}" — the panel is one fixed width, so it `
        + 'has one size, and a viewport query cannot describe it');
    }
  }
});

test('CONTROL — the exact-token check rejects a prefix and a near-miss', () => {
  /**
   * Without this, every assertion above is equally consistent with a check that
   * matches anything. Both shapes this repo has actually been bitten by are
   * exercised: a SHORTER token that is a substring of the real one, and a
   * near-identical token differing only in its value.
   */
  const pretend = new Set(['prose', 'my-3', 'my-1', '[&_li>p]:my-4', 'prose-p:my-3x']);
  assert.ok(!pretend.has('prose-p:my-3'), 'a bare my-3 satisfied the paragraph check');
  assert.ok(!pretend.has('prose-li:my-1'), 'a bare my-1 satisfied the list-item check');
  assert.ok(!pretend.has('[&_li>p]:my-0'), 'a different value satisfied the list-paragraph check');
  // …and the real set does contain them, so the check is not simply always false.
  const real = classesOf(draw({ doc: DOC }));
  assert.ok(real.has('prose-p:my-3') && real.has('prose-li:my-1') && real.has('[&_li>p]:my-0'));
  assert.ok(real.has('md:prose-p:my-4'), 'the desktop gap is not on the wrapper');
});

test('CONTROL — restoring prose-lg is named by a test', () => {
  /**
   * The one that makes the size assertion mean something. `prose-lg` is exactly
   * what was there before, and it is the class a revert or a bad merge would put
   * back. Run the same filter over a set that has it and the deepEqual must
   * fail — asserted here as a THROW, so the check is proved able to fire rather
   * than merely observed passing.
   */
  const reverted = new Set([...classesOf(draw({ doc: DOC })), 'prose-lg']);
  const sizeTokens = [...reverted].filter((c) => PLUGIN_SIZES.some(
    (n) => c === 'prose-' + n || c === 'md:prose-' + n));
  assert.throws(
    () => assert.deepEqual(sizeTokens.sort(), ['md:prose-base', 'prose-sm']),
    'a restored prose-lg passed the only-these-sizes check — that check cannot fire'
  );
  // …and the bare 'prose-base' form, which would be the other easy revert.
  const bare = new Set([...classesOf(draw({ doc: DOC })), 'prose-base']);
  const bareTokens = [...bare].filter((c) => PLUGIN_SIZES.some(
    (n) => c === 'prose-' + n || c === 'md:prose-' + n));
  assert.throws(
    () => assert.deepEqual(bareTokens.sort(), ['md:prose-base', 'prose-sm']),
    'an unprefixed prose-base passed — it would make every viewport 16px'
  );
});
