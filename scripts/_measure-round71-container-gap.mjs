/**
 * ROUND 71 §I/§J — the gap between a container's children, in real pixels.
 *
 * §I asks for a measured table, not a mapping table: `gap-8` is a class name
 * and 32px is a fact about the stylesheet, and the two are only the same thing
 * if Tailwind actually emits the rule. So this compiles the real config over
 * the rendered markup and reads `getBoundingClientRect()` out of headless
 * Chrome, the same instrument rounds 69 and 70 used.
 *
 * ── WHAT IS MEASURED ──────────────────────────────────────────────────────
 *   1. a `container` with THREE children at every value of the new control,
 *      plus the ABSENT case, which must come out at the incumbent 32px
 *   2. the same for `full_width`
 *   3. BOTH RENDER MODES. The canvas passes SectionRenderer a `path` and the
 *      published page passes none — that is the one editor concession in the
 *      renderer, so "the canvas and a published page" is exactly that flag,
 *      and both are rendered here rather than assumed equivalent.
 *   4. §J NESTING: a container inside a container, each with a different
 *      value, must apply its own gap to its own children and to nobody else's.
 *
 * ── NOTHING IS WRITTEN INTO public/ ──────────────────────────────────────
 * Round 70 found that test/fs/reservedPaths DERIVES its reserved static
 * prefixes from the `public/` directory listing, so a harness writing there
 * reddens the suite for as long as the folder exists — measured, it happened.
 * The page is injected into the about:blank tab openPage already gives us. As
 * a side effect this needs no dev server.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * Five values that all measured 32px would look exactly like a working
 * absent-case. So the run asserts the five are DISTINCT, and separately that
 * absent equals `medium` and nothing else does.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round71-container-gap.mjs
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { SPACING } from '@/lib/schemas/sections/base';
import { compile } from '../test/twCompile.mjs';
import { launch, openPage } from '../test/browser/cdp.mjs';

/** A child that renders something with a predictable height. */
const child = (id, text) => ({
  id, type: 'heading', enabled: true, content: { text, level: 2 },
  settings: { spacingTop: 'none', spacingBottom: 'none', containerWidth: 'full' },
});

const box = (id, type, spacingBetween, children) => ({
  id,
  type,
  enabled: true,
  content: { children },
  settings: {
    containerWidth: 'full',
    spacingTop: 'none',
    spacingBottom: 'none',
    ...(spacingBetween === undefined ? {} : { spacingBetween }),
  },
});

/** ABSENT first, then every value of the shared SPACING vocabulary. */
const CASES = [undefined, ...SPACING];
const label = (v) => (v === undefined ? 'ABSENT' : v);

const report = {};

const { browser, close } = await launch();
const page = await openPage(browser, { width: 1280, height: 2400 });
try {
  const groups = [];
  for (const type of ['container', 'full_width']) {
    for (const v of CASES) {
      // path = null is the PUBLISHED render; a path is the canvas render.
      for (const [mode, path] of [['published', null], ['canvas', ['sections', 0]]]) {
        const section = box(`${type}-${label(v)}`, type, v, [
          child('a', 'หนึ่ง'), child('b', 'สอง'), child('c', 'สาม'),
        ]);
        groups.push([
          `${type}/${label(v)}/${mode}`,
          renderToStaticMarkup(createElement(SectionRenderer, { section, path })),
        ]);
      }
    }
  }

  // §J — nesting. Outer `none`, inner `xl`: each must keep its own.
  const nested = box('outer', 'container', 'none', [
    child('o1', 'นอกหนึ่ง'),
    box('inner', 'container', 'xl', [child('i1', 'ในหนึ่ง'), child('i2', 'ในสอง')]),
    child('o2', 'นอกสอง'),
  ]);
  groups.push(['NESTED/outer-none-inner-xl', renderToStaticMarkup(createElement(SectionRenderer, { section: nested }))]);

  const body = groups
    .map(([name, m]) => `<div data-group="${name}" style="margin-bottom:40px">${m}</div>`)
    .join('\n');
  const css = await compile([{ raw: body, extension: 'html' }]);
  const html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>*{box-sizing:border-box}body{margin:0;padding:24px;width:1280px;font-family:sans-serif}</style>',
    `<style>${css}</style>`,
    '</head><body>', body, '</body></html>',
  ].join('\n');

  await page.eval((h) => { document.open(); document.write(h); document.close(); }, html);

  const measured = await page.eval(() => {
    /** The vertical distance between two stacked siblings' border boxes. */
    const gapsOf = (flex) => {
      const kids = [...flex.children];
      const out = [];
      for (let i = 1; i < kids.length; i += 1) {
        const prev = kids[i - 1].getBoundingClientRect();
        const cur = kids[i].getBoundingClientRect();
        out.push(+(cur.top - prev.bottom).toFixed(2));
      }
      return out;
    };
    const res = {};
    for (const group of document.querySelectorAll('[data-group]')) {
      // The container component's own div is the first descendant that is a
      // flex COLUMN — read it rather than assuming a nesting depth.
      const flexes = [...group.querySelectorAll('div')].filter((d) => {
        const cs = getComputedStyle(d);
        return cs.display === 'flex' && cs.flexDirection === 'column';
      });
      res[group.dataset.group] = flexes.map((f) => ({
        classes: f.getAttribute('class'),
        computedGap: getComputedStyle(f).rowGap,
        measuredGaps: gapsOf(f),
        childCount: f.children.length,
      }));
    }
    return res;
  });

  const uniq = (xs) => [...new Set(xs)];
  const firstGap = (rows) => (rows[0]?.measuredGaps ?? [])[0] ?? null;

  report['-- I. THREE CHILDREN, EVERY VALUE, BOTH RENDER MODES --'] = '';
  const table = {};
  for (const type of ['container', 'full_width']) {
    for (const v of CASES) {
      const pub = measured[`${type}/${label(v)}/published`];
      const can = measured[`${type}/${label(v)}/canvas`];
      table[`${type} · ${label(v)}`] = {
        class: pub[0].classes,
        computed: pub[0].computedGap,
        publishedPx: pub[0].measuredGaps,
        canvasPx: can[0].measuredGaps,
        canvasMatchesPublished: JSON.stringify(pub[0].measuredGaps) === JSON.stringify(can[0].measuredGaps),
      };
    }
  }
  report.table = table;

  report['-- THE ABSENT CASE --'] = '';
  report.absent_container_px = firstGap(measured['container/ABSENT/published']);
  report.absent_full_width_px = firstGap(measured['full_width/ABSENT/published']);
  report.medium_container_px = firstGap(measured['container/medium/published']);
  report.ABSENT_IS_32 = firstGap(measured['container/ABSENT/published']) === 32
    && firstGap(measured['full_width/ABSENT/published']) === 32;
  report.absentEqualsMedium = firstGap(measured['container/ABSENT/published'])
    === firstGap(measured['container/medium/published']);

  report['-- CONTROL: the five values are DISTINCT --'] = '';
  const fiveGaps = SPACING.map((v) => firstGap(measured[`container/${v}/published`]));
  report.fiveValuesPx = Object.fromEntries(SPACING.map((v, i) => [v, fiveGaps[i]]));
  report.controlDiscriminates = uniq(fiveGaps).length === SPACING.length;

  report['-- J. NESTING --'] = '';
  const nest = measured['NESTED/outer-none-inner-xl'];
  report.nestedFlexes = nest.map((f) => ({
    classes: f.classes, computedGap: f.computedGap, measuredGaps: f.measuredGaps, childCount: f.childCount,
  }));
  const outer = nest.find((f) => /(^|\s)gap-0(\s|$)/.test(f.classes));
  const inner = nest.find((f) => /(^|\s)gap-24(\s|$)/.test(f.classes));
  report.outerGapsPx = outer?.measuredGaps ?? null;
  report.innerGapsPx = inner?.measuredGaps ?? null;
  report.NESTING_INDEPENDENT = Boolean(outer && inner)
    && outer.measuredGaps.every((g) => g === 0)
    && inner.measuredGaps.every((g) => g === 96);
} finally {
  await page.close().catch(() => {});
  await close().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
