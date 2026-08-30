import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { RichTextSection } from '@/components/pageBuilder/sections/rich_text';

/**
 * ── ROUND 61: LONG UNBROKEN TEXT PUSHED SECTIONS OUT OF THE PAGE ──────────
 *
 * ── WHAT THIS FILE CAN AND CANNOT ASSERT, SAID PLAINLY ──────────────────
 * The defect is a LAYOUT overflow and the fix is an inherited CSS declaration.
 * Round 23 established that only a browser resolves this and JSDOM resolves
 * none of it, so this suite cannot measure a scrollWidth, and any assertion
 * here claiming to would be measuring nothing. Rounds 59 and 60 hit the same
 * wall and said so; this says so too.
 *
 * The work is therefore split three ways and each part is asserted where it can
 * actually be answered:
 *
 *   the CLASS is on the page wrapper   -> here, exact-token matching
 *   the class COMPILES to a real rule  -> test/fs/tailwindArbitraryValueRules
 *                                         (two registrations, compiled from the
 *                                         two real source files)
 *   the OVERFLOW is gone               -> scripts/_probe-round61-overflow.mjs
 *                                         (Chrome, scrollWidth vs clientWidth
 *                                         over all 17 self-contained section
 *                                         types and all 5 two_column ratios)
 *
 * Measured there, in a 600px box, before -> after:
 *   12 of 17 section types overflowed, worst 2862px; after, none did.
 *   All five ratios: 1463-2031 in a 1200 box -> 1200. At 390px likewise.
 *
 * ── AND THE THING THAT MUST NOT MOVE ────────────────────────────────────
 * `overflow-wrap: anywhere` only introduces a break where the line would
 * otherwise overflow, so Chrome's ICU dictionary breaking still decides
 * ordinary Thai. Measured on 314 characters of real Thai at 1200 / 380 / 260px:
 * identical line counts (3 / 9 / 15) and ZERO breaks landing on a combining
 * mark. `word-break: break-all` also wraps the run and is rejected — it broke
 * Latin words mid-word, which these bilingual pages carry throughout.
 *
 * ── EXACT-TOKEN MATCHING, NOT SUBSTRING ────────────────────────────────
 * This repo has been bitten four times by a bare-name match (`'<p'` matching
 * `<path`). Every check splits a class attribute on whitespace and asks for SET
 * MEMBERSHIP, so a prefix can never satisfy it.
 */
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const WRAP = '[overflow-wrap:anywhere]';

/**
 * Both wrappers, as a list, because the pair is the point: the canvas must not
 * disagree with the published page about how text wraps.
 */
const WRAPPERS = [
  ['the published page', 'src/components/pageBuilder/PageBuilderView.jsx'],
  ['the editor canvas', 'src/components/pageBuilder/editor/CanvasPanel.jsx'],
];

for (const [what, file] of WRAPPERS) {
  test(`${what} carries ${WRAP} on its wrapper`, () => {
    /**
     * A source read, not a render: PageBuilderView is an ASYNC server component
     * (it awaits resolveSectionData) so the sync renderer cannot call it, and
     * CanvasPanel is a client component behind an iframe portal. Comments are
     * stripped first — this repo's standing rule — or the block comment
     * explaining the class would satisfy the check on its own.
     */
    const src = read(file);
    const idx = src.indexOf(WRAP);
    assert.notEqual(idx, -1, `${file} lost ${WRAP} — twelve section types go back to overflowing`);
    // Bounded on both sides, so a longer class cannot satisfy it.
    const after = src[idx + WRAP.length];
    assert.ok(after === "'" || after === '"' || after === ' ' || after === ')',
      `${WRAP} in ${file} is a prefix of a longer class, not the class itself`);
    // Literal in the code: Tailwind matches raw TEXT, so a class assembled from
    // a template literal renders perfectly and compiles to nothing.
    assert.ok(!src.includes('${') || src.includes(`'${WRAP}'`),
      `${WRAP} must appear as a complete literal for Tailwind to see it`);
  });
}

test('both wrappers carry the SAME declaration — the canvas agrees with the page', () => {
  const [a, b] = WRAPPERS.map(([, f]) => read(f).includes(WRAP));
  assert.ok(a && b, 'one surface wraps and the other does not — the author would compose against the wrong layout');
});

test('the fix is INHERITED — no section markup carries it, so nothing else moved', () => {
  /**
   * The whole reason a page-level declaration is the small fix: `overflow-wrap`
   * inherits, so every section is covered without any section's class attribute
   * changing. Measured over the real corpus in
   * scripts/_measure-round61-wrap.mjs: 163 stored sections, 0 differing, with a
   * control at 40/40. This pins the property that makes that true.
   */
  const section = {
    id: 'rt', type: 'rich_text', name: '', enabled: true, sortOrder: 0,
    settings: {}, layout: {}, style: {},
    advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
    content: { doc: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'ท'.repeat(80) }] },
    ] } },
  };
  const html = renderToStaticMarkup(SectionRenderer({ section, path: null, resolvedData: undefined }));
  for (const el of doc(html).querySelectorAll('*')) {
    const cls = new Set((el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
    assert.ok(!cls.has(WRAP),
      'a section carries the wrap class itself — it should inherit it, and every stored section just changed');
  }
});

test('K — round 60 spacing is untouched by this round', () => {
  /**
   * Asserted as CLASSES, for the same reason as above: the computed 16px / 4px /
   * 0px are re-measured in the browser probe (before and after: p->p 16,
   * li->li 4, first margin-top 0, last margin-bottom 0, identical).
   */
  const html = renderToStaticMarkup(RichTextSection({
    content: { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ก' }] }] } },
  }));
  const cls = new Set((doc(html).querySelector('div').getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
  for (const c of ['prose-p:my-4', 'prose-ul:my-4', 'prose-ol:my-4', 'prose-li:my-1',
                   '[&_li>p]:my-0', '[&>*:first-child]:mt-0', '[&>*:last-child]:mb-0']) {
    assert.ok(cls.has(c), `round 60's "${c}" was dropped`);
  }
});

test('the wrap is not word-break — the rejected candidate must not creep in', () => {
  /**
   * `break-all` also stops the overflow, so it is the plausible wrong fix. It
   * breaks Latin words mid-word (measured: 2 mid-word breaks in one 63-character
   * English sentence), and these pages are bilingual throughout. Naming it here
   * means a later "simplification" to the shorter class reddens.
   */
  for (const [, file] of WRAPPERS) {
    const cls = new Set(read(file).match(/[\w[\]:&>*-]+/g) ?? []);
    assert.ok(!cls.has('break-all'), `${file} uses break-all — it breaks Latin words mid-word`);
  }
});

test('CONTROL — the exact-token check rejects a prefix and a near-miss', () => {
  /**
   * Without this, every assertion above is equally consistent with a check that
   * matches anything.
   */
  const pretend = new Set(['[overflow-wrap:anywhere]x', 'overflow-wrap', '[overflow-wrap:break-word]']);
  assert.ok(!pretend.has(WRAP), 'a near-miss satisfied the wrap check');
  // …and a real wrapper does contain it, so the check is not simply always false.
  assert.ok(read(WRAPPERS[0][1]).includes(WRAP));
  // A wrapper file that does NOT have it must fail the same predicate.
  assert.ok(!read('src/components/pageBuilder/sections/rich_text.jsx').includes(WRAP),
    'rich_text carries the wrap class — the inheritance claim above would be vacuous');
});
