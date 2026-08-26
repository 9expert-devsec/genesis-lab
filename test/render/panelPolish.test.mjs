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
import { readFileSync } from 'node:fs';
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
const SHELL = 'src/components/pageBuilder/editor/EditorShell.jsx';
const PAGE_SETTINGS = 'src/components/pageBuilder/editor/PageSettingsDialog.jsx';
const PREVIEW = 'src/components/pageBuilder/editor/PreviewDialog.jsx';

/**
 * Every file round 28's Figma pass touched. The colour rule below applies to
 * all six; the size and radius rules keep their original, narrower list,
 * because those were measured against the two panels and their primitives and
 * widening them would be a new claim wearing an old test's name.
 */
const ROUND_28_FILES = [SRC, SETTINGS, FIELDS, SHELL, PAGE_SETTINGS, PREVIEW];

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
 * FONT SIZE, RADIUS and — as of round 28 — COLOUR are scanned. Bare LENGTHS
 * still are not.
 *
 * This note used to read "only font size and radius", and gave as its reason
 * that "the panels legitimately carry colour and length escapes that no token
 * expresses — a dark surface hex, a var() border, and the delete dialog's
 * clamped width". Two of those three are still true. THE DARK SURFACE HEX IS
 * NOT: `dark:bg-[#0D1B2A]` stood in five of these six files, and it was never a
 * colour no token expressed — #0D1B2A IS `9e-navy`, spelled out. What it
 * actually was is an opt-out of the theme system, because this repo's dark mode
 * runs through the scale CSS variables and the `--surface-*` family, and a hex
 * cannot participate in either. Every one of them is now `var(--surface-hover)`,
 * which is #F8FAFD in light and #20344C in dark from ONE class.
 *
 * So the rule is: no raw hex, anywhere in these six files. A design colour that
 * has no token is a finding to raise, not a literal to inline — round 28's
 * brief, and the same reasoning round 17 applied to type sizes in the other
 * direction. `var(--…)` is explicitly NOT a raw value; it is a token reference,
 * and it is the mechanism the ban exists to protect.
 *
 * Bare lengths stay unscanned for the original reason: a width like
 * `w-[min(30rem,calc(100vw-2rem))]` or a panel column of 276px is on no scale
 * because no scale for it exists, and banning those would force the growing
 * exception list that makes a guard stop meaning anything.
 */
const arbitraryFontSizes = (code) => [...new Set(code.match(/text-\[[0-9.]+(px|rem)\]/g) ?? [])].sort();
const arbitraryRadii = (code) => [...new Set(code.match(/rounded(-[a-z]+)?-\[[^\]]+\]/g) ?? [])].sort();

/**
 * Every hex colour literal in the code — 3, 4, 6 or 8 digits, the four lengths
 * CSS actually accepts.
 *
 * `readSource` has already removed comments, which matters here more than
 * anywhere else in this file: the note above NAMES `#0D1B2A` in prose, and a
 * scanner reading raw text would report its own explanation as a violation.
 * That is defect 1 in test/sourceScan.mjs's list, and the control below proves
 * this reader is not subject to it.
 */
const rawHexes = (code) => [...new Set(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])].sort();

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

// ── 2b. ROUND 28: no raw colour anywhere the Figma pass reached ────────────

test('no file the Figma pass touched carries a raw hex colour', () => {
  /**
   * Exact empty sets, per file, so the failure names WHICH file gained one —
   * six files sharing one count would report a number nobody can act on.
   *
   * This is the round's hard rule stated as a test: the Figma names 30-odd
   * hexes and every one of them resolved to a token that already existed. Had
   * one not, the answer was to raise it as a finding, not to inline it — so
   * a hex reappearing here is either a token that was skipped or a colour
   * decision taken without one, and both are worth stopping for.
   */
  for (const f of ROUND_28_FILES) {
    assert.deepEqual(rawHexes(readSource(f).code), [],
      `${f} carries a raw hex colour. Resolve it to a token in tailwind.config.js or a `
      + '--surface-* / --9e-* CSS variable; a hex opts the surface out of dark mode entirely.');
  }
  assert.equal(ROUND_28_FILES.length, 6);
});

test('CONTROL: the hex scanner sees a hex that IS there, and ignores a comment', () => {
  // Both halves matter. Without the first, six empty sets could be an empty
  // scanner; without the second, this file's own prose — which names #0D1B2A
  // to explain why it is gone — would be reported as a violation.
  assert.deepEqual(rawHexes('const a = "dark:bg-[#0D1B2A] text-9e-navy";'), ['#0D1B2A']);
  assert.deepEqual(rawHexes('const a = "bg-[var(--surface-hover)]";'), [],
    'a var() reference was read as a raw value — that is the mechanism the ban protects');
  assert.deepEqual(rawHexes('const a = "text-9e-action";'), []);

  // The comment half, through the real reader rather than a hand-written string.
  const { code } = readSource(SETTINGS);
  const raw = readFileSync(path.resolve(fileURLToPath(new URL('../..', import.meta.url)), SETTINGS), 'utf8');
  assert.ok(/#0056D9/.test(raw), 'the fixture is wrong: SettingsPanel no longer names that hex in prose');
  assert.equal(/#0056D9/.test(code), false, 'the reader left a comment in, so the empty sets above are luck');
});

test('the ONE surface class that replaced the dark hexes is a real, theme-aware token', () => {
  /**
   * The replacement has to be more than "not a hex": `var(--surface-hover)` is
   * only an improvement if that variable is actually DEFINED in both themes,
   * with different values. A var() pointing at nothing paints nothing, silently
   * — the same class of defect tailwindArbitraryValueRules exists for.
   */
  const css = readFileSync(
    path.resolve(fileURLToPath(new URL('../..', import.meta.url)), 'src/app/globals.css'), 'utf8'
  );
  const valueIn = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `expected a "${selector}" block in globals.css`);
    const m = /--surface-hover\s*:\s*([^;]+);/.exec(css.slice(start, css.indexOf('}', start)));
    assert.ok(m, `--surface-hover is not defined inside "${selector}"`);
    return m[1].trim();
  };
  const light = valueIn(':root');
  const dark = valueIn('.dark');
  assert.notEqual(light, dark,
    '--surface-hover has the same value in both themes, so the surfaces that now read it '
    + 'are no better off in dark mode than the hex they replaced');

  // …and every file that dropped a hex really did take this token.
  for (const f of [SRC, SETTINGS, PAGE_SETTINGS, PREVIEW]) {
    assert.match(readSource(f).code, /var\(--surface-hover\)/,
      `${f} dropped its dark surface hex without taking the theme-aware token`);
  }
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

  /**
   * Every action keeps the padding that IS its hit area.
   *
   * ── ROUND 28 CLOSES THIS, AND THE OLD NOTE HERE SAID IT COULD NOT BE ──────
   * It read: "Measured at 22px square; the fix for that is width this panel
   * does not have, not a smaller target." That was true of a 260px column. The
   * column is 276px now (EditorShell, per the Figma), and the 16px it gained is
   * what the glyph spends: 4px of padding either side plus a 16px icon is
   * exactly 24. The padding is unchanged — raising the ICON is what reaches the
   * floor, and it is the only currency that does not come out of the label.
   */
  for (const b of row.querySelectorAll('button[aria-label]')) {
    assert.match(b.className, /(^|\s)p-1(\s|$)/, `"${b.getAttribute('aria-label')}" no longer carries its own padding`);
    const glyph = b.querySelector('svg');
    assert.notEqual(glyph, null, `"${b.getAttribute('aria-label')}" renders no glyph`);
    assert.match(glyph.getAttribute('class') ?? '', /(^|\s)h-4 w-4(\s|$)/,
      `"${b.getAttribute('aria-label')}" is back under the 24px hit area: p-1 (4+4) around a `
      + '14px glyph is 22px. The panel is 276px wide now — the width to pay for this exists.');
  }
});

test('CONTROL: the hit-area check discriminates 14px from 16px', () => {
  // Without this, the class match above could be satisfied by any glyph class
  // at all, and the 22px shape it exists to reject would sail through.
  assert.match('h-4 w-4', /(^|\s)h-4 w-4(\s|$)/);
  assert.doesNotMatch('h-3.5 w-3.5', /(^|\s)h-4 w-4(\s|$)/,
    'the pre-round-28 glyph size satisfies the assertion, so it is not a hit-area guard');
});

test('CONTROL: the row-shape assertion notices an added child', () => {
  const doc = panelDoc([sec('a', 'heading')]);
  const row = doc.querySelector('li > div');
  const kinds = [...row.children].map((el) => el.tagName.toLowerCase());
  assert.throws(() => assert.deepEqual([...kinds, 'svg'], kinds),
    'an extra child must break the comparison — otherwise it is not a budget guard');
});
