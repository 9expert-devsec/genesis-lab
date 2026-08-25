import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { StructurePanel } from '@/components/pageBuilder/editor/StructurePanel';
import { ALL_SECTION_TYPES } from '@/lib/schemas/pageBuilder';
import { iconOf, SECTION_ICONS } from '@/lib/pageBuilder/sectionIcons';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSource } from '../sourceScan.mjs';
import { compile, declarationsFor, require_ } from '../twCompile.mjs';

/**
 * Round 17, commit 2 — the panels' polish, and the two ways it can rot.
 *
 * ── WHAT IS WORTH A GUARD HERE AND WHAT IS NOT ─────────────────────────────
 * Most of this commit is padding and corner radii, and a test that reads back
 * the number a component was just given proves nothing — it is the source
 * quoted twice. Two claims are different, because both are about a RELATIONSHIP
 * between this code and something outside it, and both fail silently:
 *
 *   1. the row's leading icon is the SAME lookup the section picker uses.
 *      A second mapping would look right for weeks and then disagree on the
 *      one type somebody added to only one of them.
 *
 *   2. the sizes and radii come off the shared scales. An off-scale value is
 *      invisible in review — it renders fine — and is exactly how a panel ends
 *      up styled with numbers nothing else in the app shares.
 *
 * The row's own measurements are NOT asserted here. They were taken in a real
 * browser (scripts/_probe-panel-width.mjs) because JSDOM has no layout engine
 * and would return zero for every box; a number this file could produce would
 * be a fiction. What it can pin is that the polish did not ADD anything to the
 * row, which is the constraint the measurement produced.
 */

const CONFIG = path.resolve(fileURLToPath(new URL('../..', import.meta.url)), 'tailwind.config.js');

const SRC = 'src/components/pageBuilder/editor/StructurePanel.jsx';
const SETTINGS = 'src/components/pageBuilder/editor/SettingsPanel.jsx';
const FIELDS = 'src/components/pageBuilder/editor/fields.jsx';

const PAGE = {
  slug: 's', title: 'T', pageType: 'general', status: 'draft', theme: 'default',
  showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', seo: {}, jsonLd: {}, slugHistory: [], sections: [],
};
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };
const sec = (id, type) => ({
  id, type, content: {}, settings: {}, style: {}, layout: {}, advanced: {},
  enabled: true, sortOrder: 0, name: '',
});

function panelDoc(sections) {
  const markup = renderToStaticMarkup(
    createElement(EditorProvider, { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
      createElement(StructurePanel, {})),
  );
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

/**
 * The SHAPE of an icon, independent of the props it was handed: lucide renders
 * one <svg> whose children are the drawing. Comparing innerHTML compares the
 * drawing and ignores class names, which is what "is this the same icon" means.
 */
const drawingOf = (svg) => svg?.innerHTML.replace(/\s+/g, ' ').trim() ?? null;
const drawingOfComponent = (Comp) => {
  const doc = new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(Comp, {}))}</body>`).window.document;
  return drawingOf(doc.querySelector('svg'));
};
/** The row's LEADING icon — the first svg inside the row div. */
const leadIconsIn = (doc) => [...doc.querySelectorAll('li > div')]
  .map((row) => drawingOf(row.querySelector(':scope > svg')))
  .filter((d) => d !== null);

// ── 1. the icon on the row is iconOf()'s answer, for every type ────────────

test('every section type renders the icon iconOf() returns for it', () => {
  /**
   * Exhaustive over the union, not a sample. A second mapping that agreed on
   * the six types someone thought to check is the exact failure this is for.
   */
  const doc = panelDoc(ALL_SECTION_TYPES.map((t, i) => sec(`s${i}`, t)));
  const got = leadIconsIn(doc);
  const want = ALL_SECTION_TYPES.map((t) => drawingOfComponent(iconOf(t)));

  assert.equal(got.length, ALL_SECTION_TYPES.length, 'one row per type did not render');
  const wrong = ALL_SECTION_TYPES.filter((t, i) => got[i] !== want[i]);
  assert.deepEqual(wrong, [], 'these rows drew something other than iconOf()\'s icon');
});

test('CONTROL: the comparison discriminates — different types draw different icons', () => {
  /**
   * Without this, "every row matched" would read the same as "every icon is
   * identical and the comparison is vacuous".
   */
  const distinct = new Set(ALL_SECTION_TYPES.map((t) => drawingOfComponent(iconOf(t))));
  assert.ok(distinct.size > 20, `only ${distinct.size} distinct drawings across 27 types`);
  assert.notEqual(drawingOfComponent(iconOf('heading')), drawingOfComponent(iconOf('cta')));
});

test('CONTROL: a row paired with the WRONG type\'s icon fails the same check', () => {
  // The assertion above, run against a deliberately shifted pairing.
  const doc = panelDoc([sec('a', 'heading'), sec('b', 'cta')]);
  const got = leadIconsIn(doc);
  const shifted = [drawingOfComponent(iconOf('cta')), drawingOfComponent(iconOf('heading'))];
  assert.throws(() => assert.deepEqual(got, shifted),
    'a mismatched pairing must fail — otherwise the sweep above proves nothing');
});

test('the panel imports iconOf and declares NO icon mapping of its own', () => {
  /**
   * The behavioural sweep above catches a second map that DISAGREES. A second
   * map that currently agrees is still the drift risk, and only the source can
   * show it: the panel must not name any lucide symbol that sectionIcons.js
   * uses, because that is what building a parallel table starts with.
   */
  const { withImports } = readSource(SRC);
  assert.match(withImports, /import \{ iconOf \} from '@\/lib\/pageBuilder\/sectionIcons'/,
    'the row no longer reads the shared lookup');

  const iconNames = new Set([
    ...Object.values(SECTION_ICONS).map((C) => C.displayName ?? C.name),
    'Square', // iconOf's fallback, imported by sectionIcons.js and by nothing else
  ]);
  const imported = importedLucideNames(withImports);
  const overlap = imported.filter((n) => iconNames.has(n)).sort();
  assert.deepEqual(overlap, [],
    'the panel imports a section-type icon directly. That is a second mapping starting: '
    + 'the picker and the tree would then answer "what does this type look like" separately.');
});

test('CONTROL: the disjointness check fires on an import list that DOES overlap', () => {
  /**
   * The same scanner, over the source a parallel mapping actually produces.
   *
   * The overlapping import is the SECOND lucide statement, behind the innocent
   * one the panel already has, because that is how it arrives under this repo's
   * add-an-import rule — and because that is precisely what an earlier version
   * of this scanner failed to see while reporting no overlap.
   */
  const parallel = [
    "import { Eye, EyeOff, ChevronUp } from 'lucide-react';",
    "import { cn } from '@/lib/utils';",
    "import { Heading, AlignLeft } from 'lucide-react';",
    'const ROW_ICONS = { heading: Heading, rich_text: AlignLeft };',
  ].join('\n');
  const iconNames = new Set(Object.values(SECTION_ICONS).map((C) => C.displayName ?? C.name));
  const overlap = importedLucideNames(parallel).filter((n) => iconNames.has(n)).sort();
  assert.deepEqual(overlap, ['AlignLeft', 'Heading'],
    'the scanner does not reach a lucide import behind another one, so the emptiness above means nothing');

  // …and the innocent names really were in range, so the filter is what
  // rejected them rather than the scanner having stopped early.
  assert.deepEqual(importedLucideNames(parallel),
    ['Eye', 'EyeOff', 'ChevronUp', 'Heading', 'AlignLeft']);
});

/**
 * Identifiers imported from lucide-react — across EVERY import statement, not
 * the first one.
 *
 * This read the first match only, and a deliberate break walked straight past
 * it: the standing rule in this repo is to ADD an import rather than edit an
 * existing one, so a second mapping arrives as a SECOND `import … from
 * 'lucide-react'` line and the file's existing one hides it completely.
 */
function importedLucideNames(source) {
  const stmts = source.match(/import\s*\{[^}]*\}\s*from\s*'lucide-react'/g) ?? [];
  return stmts.flatMap((s) => s.match(/\{([^}]*)\}/)[1].split(',').map((n) => n.trim()).filter(Boolean));
}

// ── 2. sizes and radii come off the shared scales ──────────────────────────

/**
 * Only FONT SIZE and RADIUS are scanned, deliberately.
 *
 * Arbitrary values are not banned in this repo and should not be: the panels
 * legitimately carry colour and length escapes that no token expresses — a dark
 * surface hex, a var() border, and the delete dialog's clamped width. Scanning
 * those would force a growing exception list, which is a guard that has stopped
 * meaning anything. Font size and radius are the two the polish is ABOUT, and
 * both have a scale to be on.
 */
const arbitraryFontSizes = (code) => [...new Set(code.match(/text-\[[0-9.]+(px|rem)\]/g) ?? [])].sort();
const arbitraryRadii = (code) => [...new Set(code.match(/rounded(-[a-z]+)?-\[[^\]]+\]/g) ?? [])].sort();

test('the settings panel and its field primitives carry NO off-scale type size', () => {
  /**
   * Exact empty sets. These two files are full-width forms in a 320px column —
   * nothing competes for horizontal space, so there was no reason for any of
   * them to sit below the shared scale's smallest step.
   */
  assert.deepEqual(arbitraryFontSizes(readSource(SETTINGS).code), []);
  assert.deepEqual(arbitraryFontSizes(readSource(FIELDS).code), []);
});

test('the structure panel keeps exactly one off-scale size, and only where width forbids growing', () => {
  /**
   * ── THE MEASUREMENT IS THE REASON, AND IT IS NOT ARITHMETIC ──────────────
   * Chrome, at the panel's real 260px column: the row label gets 85px at top
   * level and 33px on a nested row carrying a badge. The four survivors are all
   * INSIDE that budget — the position number, line 2, and the two badges — so
   * growing them to the scale's smallest step takes width the label measurably
   * does not have.
   *
   * Asserted as an exact SET and an exact COUNT. A set alone would let a fifth
   * one appear at the same size; a count alone would let one move to a
   * full-width element where the reason does not apply.
   */
  const { code } = readSource(SRC);
  assert.deepEqual(arbitraryFontSizes(code), ['text-[10px]']);
  assert.equal((code.match(/text-\[10px\]/g) ?? []).length, 4);
});

test('CONTROL: the size scanner sees an off-scale value that IS there', () => {
  assert.deepEqual(arbitraryFontSizes('const a = "text-[13px] font-bold";'), ['text-[13px]']);
  assert.deepEqual(arbitraryFontSizes('const a = "text-xs font-bold";'), [],
    'the scanner matches an on-scale size — it would flag everything');
});

test('no panel invents a corner radius', () => {
  for (const f of [SRC, SETTINGS, FIELDS]) {
    assert.deepEqual(arbitraryRadii(readSource(f).code), [], `${f} sets a radius by hand`);
  }
});

test('every radius the panels compile to is a declared token', async () => {
  /**
   * ── THE STYLESHEET, NOT THE MARKUP ───────────────────────────────────────
   * The check above reads class NAMES; this one reads what Tailwind actually
   * emits, so a token that were renamed or dropped from the config would fail
   * here rather than compiling to nothing and rounding no corners.
   *
   * `rounded-full` is admitted alongside the 9e- family: it is Tailwind's own
   * pill, it is what the two row badges are, and it is not a number anybody
   * chose.
   */
  const tokens = require_(CONFIG).theme.extend.borderRadius;
  const allowed = new Set([...Object.values(tokens), '9999px']);
  assert.deepEqual([...allowed].sort(), ['12px', '16px', '24px', '8px', '9999px']);

  for (const f of [SRC, SETTINGS, FIELDS]) {
    const { code } = readSource(f);
    const css = await compile([{ raw: code, extension: 'js' }]);
    const used = [...new Set(code.match(/\brounded(-[a-z0-9-]+)?\b/g) ?? [])];
    assert.ok(used.length > 0, `${f} sets no radius at all — this scan found nothing to check`);

    for (const cls of used) {
      const decls = declarationsFor(css, cls);
      assert.ok(decls.length > 0, `${f}: "${cls}" compiled to nothing`);
      for (const d of decls) {
        if (!d.startsWith('border-radius:')) continue;
        const value = d.slice('border-radius:'.length).trim();
        assert.ok(allowed.has(value),
          `${f}: "${cls}" compiles to border-radius ${value}, which is not one of the declared tokens`);
      }
    }
  }
});

test('CONTROL: the compiled-radius check rejects a value that is off the token scale', async () => {
  const tokens = require_(CONFIG).theme.extend.borderRadius;
  const allowed = new Set([...Object.values(tokens), '9999px']);
  const css = await compile([{ raw: 'const a = "rounded-[7px]";', extension: 'js' }]);
  const decls = declarationsFor(css, 'rounded-[7px]');
  assert.ok(decls.length > 0, 'the compiler produced no rule, so this control tests nothing');
  const value = decls.find((d) => d.startsWith('border-radius:')).slice('border-radius:'.length).trim();
  assert.equal(value, '7px');
  assert.equal(allowed.has(value), false, 'the token set would have admitted an invented radius');
});

// ── 3. the polish added nothing to the row's horizontal budget ─────────────

test('the row still holds one leading icon, the label, and the same six controls', () => {
  /**
   * The constraint the browser measurement produced, as a structural claim:
   * the type icon REPLACED the grip glyph rather than joining it, and no
   * control was added, removed, or made smaller to pay for it.
   */
  const doc = panelDoc([{ ...sec('a', 'heading'), content: { text: 'มีข้อความ' } }]);
  const row = doc.querySelector('li > div');
  const kinds = [...row.children].map((el) => el.tagName.toLowerCase());
  assert.deepEqual(kinds, ['svg', 'button', 'span', 'button'],
    'the row gained or lost a child — its 85px label budget was measured against exactly this shape');

  // The BADGED shape, which is the one that matters: the browser measurement
  // put a nested row carrying a badge at 33px of label. A badge is one more
  // span, and it is the last thing this row can afford.
  const badged = panelDoc([sec('b', 'heading')]).querySelector('li > div');
  assert.deepEqual([...badged.children].map((el) => el.tagName.toLowerCase()),
    ['svg', 'button', 'span', 'span', 'button'],
    'an empty section no longer renders exactly one badge between the label and the actions');

  const actions = [...row.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label'));
  assert.deepEqual(actions, ['ขึ้น', 'ลง', 'ทำซ้ำ', 'ลบ', 'ซ่อน section นี้']);

  // Every action keeps the padding that IS its hit area. Measured at 22px square;
  // the fix for that is width this panel does not have, not a smaller target.
  for (const b of row.querySelectorAll('button[aria-label]')) {
    assert.match(b.className, /(^|\s)p-1(\s|$)/, `"${b.getAttribute('aria-label')}" no longer carries its own padding`);
  }
});

test('CONTROL: the row-shape assertion notices an added child', () => {
  const doc = panelDoc([sec('a', 'heading')]);
  const row = doc.querySelector('li > div');
  const kinds = [...row.children].map((el) => el.tagName.toLowerCase());
  assert.throws(() => assert.deepEqual([...kinds, 'svg'], kinds),
    'an extra child must break the comparison — otherwise it is not a budget guard');
});
