/**
 * ROUND 72 — HOW MUCH HORIZONTAL SPACE DOES A LEAF SECTION ACTUALLY LOSE?
 *
 * A survey harness. It builds nothing and changes nothing; it renders real
 * sections through the real SectionRenderer at a real viewport and reads
 * getBoundingClientRect out of headless Chrome, because "px-4 compounds" is an
 * impression and the brief asked for a number.
 *
 * ── WHAT IS MEASURED ──────────────────────────────────────────────────────
 *   §B  the compounding table: total left+right space consumed, and the
 *       content width that survives, for eight nestings at 390px
 *   §C  every `containerWidth` value on `container` and on `full_width`,
 *       at 390px AND at desktop — a value that is indistinguishable from its
 *       neighbour at mobile is a dead control at that size
 *   §D  the per-level delta, which is what says whether the compounding is
 *       linear or whether one level is disproportionate
 *   §E  the canvas render (SectionRenderer with a `path`) against the
 *       published render (no `path`), which round 20 put in an iframe at real
 *       widths precisely so the two agree
 *
 * ── NOTHING IS WRITTEN INTO public/ ──────────────────────────────────────
 * test/fs/reservedPaths DERIVES its reserved prefixes from the `public/`
 * listing, so a harness writing there reddens the suite for as long as the
 * folder exists (round 70 measured that happening). The page is injected into
 * the about:blank tab openPage already gives us, so this needs no dev server
 * and leaves no file behind.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * Every nesting reporting the same width would look exactly like a harness
 * that never varied the nesting. So the run asserts the depths are DISTINCT,
 * and prints a bare leaf at top level as the zero point.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round72-mobile-padding.mjs
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { CONTAINER_WIDTHS } from '@/lib/schemas/sections/base';
import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { compile } from '../test/twCompile.mjs';
import { launch, openPage } from '../test/browser/cdp.mjs';

const MOBILE = 390;
const DESKTOP = 1440;

/**
 * The leaf whose surviving width is the answer. `custom_html` is used rather
 * than a heading because it renders ONE div with no padding of its own, so the
 * number read off it is the box the layout handed down and nothing else.
 */
const leaf = (id = 'leaf') => ({
  id, type: 'custom_html', enabled: true,
  content: { html: '<span data-leaf="1">x</span>' },
  settings: { spacingTop: 'none', spacingBottom: 'none' },
});

const wrap = (id, type, children, settings = {}, layout = {}) => ({
  id, type, enabled: true, content: { children },
  settings: { spacingTop: 'none', spacingBottom: 'none', ...settings },
  layout,
});

const twoCol = (id, kids, settings = {}) => ({
  id, type: 'two_column', enabled: true, content: { left: kids, right: [] },
  settings: { spacingTop: 'none', spacingBottom: 'none', ...settings },
  layout: { ratio: '50-50' },
});

// ── §B: the eight nestings ────────────────────────────────────────────────
const NESTINGS = [
  ['leaf at top level', leaf()],
  ['leaf in container', wrap('c', 'container', [leaf()])],
  ['leaf in full_width', wrap('f', 'full_width', [leaf()])],
  ['leaf in two_column', twoCol('t', [leaf()])],
  ['leaf in card_grid', wrap('g', 'card_grid', [leaf()], {}, { columns: 1 })],
  ['leaf in highlight_grid', wrap('h', 'highlight_grid', [leaf()], {}, { columns: 1 })],
  [
    "THE AUTHOR'S CASE: card_grid in highlight_grid in container",
    wrap('c', 'container', [
      wrap('h', 'highlight_grid', [
        wrap('g', 'card_grid', [leaf()], {}, { columns: 1 }),
      ], {}, { columns: 1 }),
    ]),
  ],
  [
    'depth 4 (the MAX_SECTION_DEPTH cap)',
    wrap('c', 'container', [
      wrap('f', 'full_width', [
        wrap('h', 'highlight_grid', [
          wrap('g', 'card_grid', [leaf()], {}, { columns: 1 }),
        ], {}, { columns: 1 }),
      ]),
    ]),
  ],
  // The per-level delta with ONE type repeated, so §D can separate "each level
  // costs the same" from "one type is disproportionate".
  ['container x1', wrap('c1', 'container', [leaf()])],
  ['container x2', wrap('c1', 'container', [wrap('c2', 'container', [leaf()])])],
  ['container x3', wrap('c1', 'container', [wrap('c2', 'container', [wrap('c3', 'container', [leaf()])])])],
  ['highlight_grid x1', wrap('h1', 'highlight_grid', [leaf()], {}, { columns: 1 })],
  ['highlight_grid x2', wrap('h1', 'highlight_grid', [wrap('h2', 'highlight_grid', [leaf()], {}, { columns: 1 })], {}, { columns: 1 })],
];

// ── §C: every containerWidth value ────────────────────────────────────────
/**
 * TWO THINGS THE FIRST VERSION OF THIS GOT WRONG, BOTH RECORDED BECAUSE THEY
 * ARE THE EASY MISTAKES HERE:
 *
 * 1. IT MEASURED THE WRONG BOX. `containerWidth` is applied by a section's OWN
 *    wrapper, so setting it on a `container` and then measuring the LEAF
 *    inside reads the leaf's wrapper, not the container's. Each value is now
 *    set on the section being measured.
 * 2. IT BYPASSED THE SCHEMA. Round 25 moved `container`'s narrow default into
 *    the schema (settingsWithContainerWidth), so a raw fixture object never
 *    gets it — the harness reported `container` opening at 1200px, which is
 *    the RESOLVER's fallback and not the type's default. Every fixture below
 *    goes through sectionSchema.parse().
 */
const parsed = (section) => sectionSchema.parse(section);

const WIDTH_CASES = [];
for (const w of CONTAINER_WIDTHS) {
  WIDTH_CASES.push([`leaf · ${w}`, parsed({ id: `lw-${w}`, type: 'custom_html', content: { html: '<span>x</span>' }, settings: { spacingTop: 'none', spacingBottom: 'none', containerWidth: w } })]);
}
// The ABSENT case per type — this is where the per-type default shows up.
for (const type of ['container', 'full_width', 'custom_html']) {
  const base = type === 'custom_html'
    ? { id: `abs-${type}`, type, content: { html: '<span>x</span>' } }
    : { id: `abs-${type}`, type, content: { children: [leaf()] } };
  WIDTH_CASES.push([`${type} · (absent, schema-parsed)`, parsed(base)]);
}
const groups = [];
for (const [name, section] of NESTINGS) {
  // §E: BOTH render modes. `path` non-null is the canvas; null is published.
  groups.push([`B|${name}|published`, section, null]);
  groups.push([`B|${name}|canvas`, section, ['sections', 0]]);
}
for (const [name, section] of WIDTH_CASES) groups.push([`C|${name}|published`, section, null]);

const body = groups
  .map(([name, section, path]) =>
    `<div data-group="${name}">${renderToStaticMarkup(createElement(SectionRenderer, { section, path }))}</div>`)
  .join('\n');

const css = await compile([{ raw: body, extension: 'html' }]);

const pageAt = (width) => [
  '<!doctype html><html><head><meta charset="utf-8">',
  `<style>*{box-sizing:border-box}body{margin:0;width:${width}px;font-family:sans-serif}</style>`,
  `<style>${css}</style>`,
  '</head><body>', body, '</body></html>',
].join('\n');

const READER = () => {
  const out = {};
  for (const group of document.querySelectorAll('[data-group]')) {
    // custom_html renders ONE div, `.pb-custom-html`, with no padding of its
    // own — so its border box IS the box the layout handed down. (A data-*
    // marker inside it does not survive: sanitizePageHtml strips the
    // attribute, which is the sanitizer working, and cost this harness a run.)
    const contentEl = group.querySelector('.pb-custom-html');
    // The section's OWN wrapper div — what containerWidth actually sizes.
    const outer = group.getBoundingClientRect();
    const inner = contentEl ? contentEl.getBoundingClientRect() : null;
    // Every element between the group and the leaf that narrows the box, so the
    // inventory is read off the DOM rather than off the source.
    const chain = [];
    let el = contentEl;
    while (el && el !== group) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      chain.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') ?? '').slice(0, 80),
        width: +r.width.toFixed(2),
        padL: cs.paddingLeft, padR: cs.paddingRight,
        maxW: cs.maxWidth,
        marL: cs.marginLeft, marR: cs.marginRight,
      });
      el = el.parentElement;
    }
    const ownWrapper = group.querySelector('section > div');
    const ow = ownWrapper ? ownWrapper.getBoundingClientRect() : null;
    const ocs = ownWrapper ? getComputedStyle(ownWrapper) : null;
    out[group.dataset.group] = {
      viewport: document.body.getBoundingClientRect().width,
      ownWrapperWidth: ow ? +ow.width.toFixed(2) : null,
      ownWrapperInner: ow ? +(ow.width - parseFloat(ocs.paddingLeft) - parseFloat(ocs.paddingRight)).toFixed(2) : null,
      ownWrapperMaxW: ocs ? ocs.maxWidth : null,
      outerWidth: +outer.width.toFixed(2),
      contentWidth: inner ? +inner.width.toFixed(2) : null,
      consumed: inner ? +(outer.width - inner.width).toFixed(2) : null,
      chain: chain.reverse(),
    };
  }
  return out;
};

const report = {};
const { browser, close } = await launch();
try {
  for (const [label, width] of [['mobile390', MOBILE], ['desktop1440', DESKTOP]]) {
    const page = await openPage(browser, { width, height: 1600 });
    try {
      await page.eval((h) => { document.open(); document.write(h); document.close(); }, pageAt(width));
      report[label] = await page.eval(READER);
    } finally {
      await page.close().catch(() => {});
    }
  }
} finally {
  await close().catch(() => {});
}

// ── shape the output ──────────────────────────────────────────────────────
const m = report.mobile390;
const d = report.desktop1440;
const out = { viewportMobile: MOBILE, viewportDesktop: DESKTOP };

out['-- B. THE COMPOUNDING TABLE, 390px --'] = '';
out.compounding = {};
for (const [name] of NESTINGS) {
  const pub = m[`B|${name}|published`];
  out.compounding[name] = {
    consumedPx: pub.consumed,
    contentWidthPx: pub.contentWidth,
    percentOfViewport: +((pub.contentWidth / MOBILE) * 100).toFixed(1),
  };
}

out['-- D. PER-LEVEL DELTA --'] = '';
const cw = (n) => m[`B|${n}|published`].contentWidth;
out.containerLadder = { x1: cw('container x1'), x2: cw('container x2'), x3: cw('container x3') };
out.containerPerLevelLoss = [cw('leaf at top level') - cw('container x1'), cw('container x1') - cw('container x2'), cw('container x2') - cw('container x3')];
out.highlightGridLadder = { x1: cw('highlight_grid x1'), x2: cw('highlight_grid x2') };
out.highlightGridPerLevelLoss = [cw('leaf at top level') - cw('highlight_grid x1'), cw('highlight_grid x1') - cw('highlight_grid x2')];
out.CONTROL_depthsAreDistinct = new Set(NESTINGS.map(([n]) => cw(n))).size > 1;

out['-- E. CANVAS vs PUBLISHED --'] = '';
out.canvasVsPublished = {};
let anyDiff = false;
for (const [name] of NESTINGS) {
  const p = m[`B|${name}|published`].contentWidth;
  const c = m[`B|${name}|canvas`].contentWidth;
  out.canvasVsPublished[name] = { published: p, canvas: c, same: p === c };
  if (p !== c) anyDiff = true;
}
out.CANVAS_AND_PUBLISHED_AGREE = !anyDiff;

out['-- C. EVERY containerWidth VALUE --'] = '';
out.widths = {};
for (const [name] of WIDTH_CASES) {
  out.widths[name] = {
    mobile390: m[`C|${name}|published`].ownWrapperInner,
    desktop1440: d[`C|${name}|published`].ownWrapperInner,
    maxWidthApplied: m[`C|${name}|published`].ownWrapperMaxW,
  };
}
const mobileWidths = Object.values(out.widths).map((v) => v.mobile390);
out.DISTINCT_AT_MOBILE = new Set(mobileWidths).size;
out.DISTINCT_AT_DESKTOP = new Set(Object.values(out.widths).map((v) => v.desktop1440)).size;

out['-- A. THE CHAIN, READ OFF THE DOM --'] = '';
out.chainForAuthorsCase = m["B|THE AUTHOR'S CASE: card_grid in highlight_grid in container|published"].chain;
out.chainForBareLeaf = m['B|leaf at top level|published'].chain;

console.log(JSON.stringify(out, null, 2));
