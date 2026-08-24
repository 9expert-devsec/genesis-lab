/**
 * ROUND 75 §B/§C/§D/§E/§F — what the published Page Builder page actually
 * paints in dark mode, measured.
 *
 * ── WHY A REAL BROWSER, AND WHY THIS IS NOT NEGOTIABLE ────────────────────
 * Round 74's lesson: jsdom compiles no Tailwind, so `getComputedStyle` returns
 * "" for every colour and a jsdom "measurement" of contrast is a FALSE NEGATIVE
 * every time. Everything below is read out of headless Chrome, from a document
 * that has the REAL globals.css (tokens, the `.dark` block, the base body rule)
 * and a Tailwind build compiled over the REAL markup — including the typography
 * plugin, because `dark:prose-invert` turns out to be one of the answers.
 *
 * ── NOTHING IS WRITTEN INTO public/ ──────────────────────────────────────
 * test/fs/reservedPaths derives its reserved prefixes from the `public/`
 * listing. The document is injected into the about:blank tab openPage already
 * gives us. No files, no dev server.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * A harness whose `.dark` class never landed would report light values twice
 * and every row would read "unchanged" — indistinguishable from the real
 * finding. So the run asserts, and DIES on failure:
 *   · `--page-bg` differs between the two documents (the `.dark` block loaded);
 *   · `html.dark` is actually on the element;
 *   · at least one measured cell's colour differs between modes;
 *   · every measured background resolves to an OPAQUE colour — a transparent
 *     read means the ancestor walk failed, not that the element is clear.
 *
 * Reads scripts/_round75-pages.json, written by _probe-round75-real-page.mjs
 * out of `page_builder_pages` (NOT `pagebuilders`) — round 50's first false zero.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round75-dark.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage } from '../test/browser/cdp.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require_ = createRequire(path.join(ROOT, 'noop.js'));

function die(msg) { console.error('X ' + msg); process.exit(1); }

/**
 * The REAL stylesheet, compiled. `test/twCompile.mjs` processes only
 * `@tailwind utilities;` — enough for a geometry probe, useless for a colour
 * one, because every token and the whole `.dark` block live in globals.css.
 */
async function compileGlobals(content) {
  const src = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
  const config = { presets: [require_(path.join(ROOT, 'tailwind.config.js'))], content };
  const res = await postcss([tailwindcss(config)]).process(src, { from: undefined });
  return res.css;
}

const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');
const { themeSurface, themeStyle } = await import('@/lib/pageBuilder/presets');
const { PAGE_THEMES } = await import('@/lib/schemas/pageBuilder');
const { CARD_STYLES } = await import('@/lib/schemas/sections/base');

const pages = JSON.parse(readFileSync(path.join(ROOT, 'scripts/_round75-pages.json'), 'utf8'));

/** The PageBuilderView wrapper, reproduced — its own body is an async RSC. */
function renderPage(page, themeOverride) {
  const theme = themeOverride ?? page.theme ?? 'default';
  const { pageClass } = themeSurface(theme);
  const style = themeStyle(theme);
  const styleAttr = Object.entries(style).map(([k, v]) => k + ':' + v).join(';');
  const sections = [...(page.sections ?? [])].sort(
    (a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0));
  const inner = sections.map((s, i) => renderToStaticMarkup(
    createElement(SectionRenderer, { section: s, depth: 0, resolvedData: {}, key: s?.id ?? i }),
  )).join('');
  /**
   * THE ROUTE WRAPPER IS PART OF THE MEASUREMENT, and leaving it out is how
   * this probe would have missed the author's first symptom.
   * src/app/(public)/promotions/[slug]/page.jsx wraps PageBuilderView in
   * `bg-[#F8FAFD] dark:bg-[#0D1B2A]` — the ONE element on this path that DOES
   * answer `.dark`. The page shell then paints an opaque light surface on top
   * of it. That pairing is the "slab", and it is invisible to any probe that
   * renders PageBuilderView alone.
   */
  return '<div data-pb-route="' + page.slug + '" class="bg-[#F8FAFD] dark:bg-[#0D1B2A] pt-10">'
    + '<div data-pb-page="' + page.slug + ':' + theme + '" class="' + pageClass
    + ' [overflow-wrap:anywhere]" style="' + styleAttr + '">' + inner + '</div></div>';
}

const authorPage = pages.find((p) => p.slug === 'early-bird-claude-code');
if (!authorPage) die('author page early-bird-claude-code missing from the dump');

const blocks = [];
for (const p of pages) blocks.push(renderPage(p));

/**
 * §E — every theme, on the SAME page, so a per-theme verdict is a comparison
 * and not seven separate anecdotes. PAGE_THEMES is READ rather than listed, so
 * a theme added later cannot be silently unmeasured.
 */
for (const t of PAGE_THEMES) blocks.push(renderPage({ ...authorPage, slug: 'THEME-' + t }, t));

/**
 * §D — every cardStyle value on a bare card, on a light page theme and a dark
 * one. Round 59 recorded `filled` at 1.00 on `corporate_navy`; this re-asks
 * after rounds 57-74 moved several renderers.
 */
const cardProbe = (cs, theme) => renderPage({
  slug: 'CARD-' + cs,
  sections: [{
    id: 'c', type: 'stat_card', enabled: true,
    content: { value: '1,234', label: 'ผู้เรียนสะสม' },
    style: { cardStyle: cs },
    settings: { spacingTop: 'none', spacingBottom: 'none' },
  }],
}, theme);
for (const cs of CARD_STYLES) for (const t of ['default', 'corporate_navy']) blocks.push(cardProbe(cs, t));

const body = blocks.join('\n');
const css = await compileGlobals([{ raw: body, extension: 'html' }]);

const doc = (dark) => [
  '<!doctype html><html class="' + (dark ? 'dark' : '') + '"><head><meta charset="utf-8">',
  '<style>' + css + '</style>',
  '<style>body{margin:0;width:1200px}</style>',
  '</head><body>', body, '</body></html>',
].join('\n');

/**
 * The reader. Two things it does that a naive one would not:
 *   · EFFECTIVE BACKGROUND — walks ancestors until an opaque colour, because
 *     almost every element in this tree paints `transparent`, and reading that
 *     literally is exactly what a broken measurement looks like.
 *   · A GRADIENT IS NOT A COLOUR — where `background-image` is a gradient the
 *     first stop is taken as the surface and the row is FLAGGED, because
 *     contrast against "none" is not a number.
 */
const READER = () => {
  const px = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const la = lum(a); const lb = lum(b);
    const hi = la >= lb ? la : lb; const lo = la >= lb ? lb : la;
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('') : null);
  const gradStop = (img) => {
    const m = String(img).match(/rgba?\([^)]*\)/g);
    return m && m.length ? px(m[0]) : null;
  };

  /**
   * ── TRANSLUCENT LAYERS ARE COMPOSITED, NOT SKIPPED ──────────────────────
   * The first version of this walker took the first ancestor with alpha > 0.5
   * and ignored everything above it. That is wrong, and it hid the author's
   * loudest symptom: `highlight_grid` paints `bg-9e-ice/50 dark:bg-[#0D1B2A]/40`
   * — a 40%-opacity NAVY over a page shell that stayed white, which composites
   * to a mid GREY. Skipping it reported the white shell and the grid looked
   * fine. So the stack is collected top-down and composited with the real
   * source-over formula; what comes back is the colour a reader's eye receives.
   */
  function effectiveBg(el) {
    const stack = [];
    let n = el;
    let gradient = false;
    while (n) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      if (img && img !== 'none' && img.indexOf('gradient') >= 0) {
        const s = gradStop(img);
        if (s) { stack.push(s); gradient = true; if (s.a >= 0.999) break; }
      }
      const c = px(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break; }
      n = n.parentElement;
    }
    if (!stack.length) return null;
    // Bottom-most opaque layer first, then composite each layer over it.
    let out = stack[stack.length - 1];
    if (out.a < 0.999) out = { r: 255, g: 255, b: 255, a: 1 }; // the canvas
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const L = stack[i];
      if (L === out) continue;
      const a = L.a;
      out = {
        r: Math.round(L.r * a + out.r * (1 - a)),
        g: Math.round(L.g * a + out.g * (1 - a)),
        b: Math.round(L.b * a + out.b * (1 - a)),
        a: 1,
      };
    }
    return { colour: out, gradient, from: 'composited(' + stack.length + ')', layers: stack.length };
  }

  const rows = {};
  for (const scope of document.querySelectorAll('[data-pb-page]')) {
    const key = scope.dataset.pbPage;
    const picks = [];
    picks.push(['page shell', scope]);
    // SectionRenderer's outer element is a bare <section> — no data attribute
    // identifies it on the PUBLISHED path (`data-pb-path` is stamped only when
    // the canvas passes a path), so the wrappers are addressed structurally.
    let i = 0;
    for (const sec of scope.querySelectorAll(':scope > section')) {
      if (i < 8) picks.push(['section wrapper[' + i + ']', sec]);
      i += 1;
    }
    let j = 0;
    for (const sec of scope.querySelectorAll('section section')) {
      if (j < 4) picks.push(['nested section[' + j + ']', sec]);
      j += 1;
    }
    const first = (sel, name) => { const e = scope.querySelector(sel); if (e) picks.push([name, e]); };
    // The route wrapper — the one element on this path that answers `.dark`.
    if (scope.parentElement && scope.parentElement.dataset.pbRoute) {
      picks.unshift(['route wrapper', scope.parentElement]);
    }
    first('h1,h2,h3', 'heading');
    first('.prose p', 'body text (prose p)');
    first('.prose a', 'link (in prose)');
    first('a', 'link');
    // `div[…shadow-9e-md]` deliberately: the CTA's anchor also carries a
    // shadow class and sorts first in document order, so a looser selector
    // reports the BUTTON's colours in the card row — which is how this table
    // would have quietly lied about card separation.
    first('div[class*="shadow-9e-md"]', 'card surface (shadow)');
    first('[class*="bg-9e-ice"]', 'card surface (filled/ice)');
    first('[class*="gradient-subtle"]', 'card surface (gradient)');
    first('[class*="bg-[var(--surface)]"]', 'card surface (promo/--surface)');
    // highlight_grid's per-child box: `bg-9e-ice/50 dark:bg-[#0D1B2A]/40` — the
    // ONE public surface that answers `.dark`, and it does so at 40% alpha over
    // a shell that does not move. This row is the "grey slab".
    first('[class*="border-l-4"]', 'highlight_grid child box');
    // The muted body text that carries `dark:text-[#94a3b8]` — the same axis
    // split as the prose paragraph, in eight non-prose components.
    first('[class*="dark:text-[#94a3b8]"]', 'muted body text (dark:text-#94a3b8)');
    // The same muted text INSIDE the highlight_grid box — the grey-on-grey pair
    // the author reported, both halves of which move on the site axis while the
    // page shell under them does not.
    first('[class*="border-l-4"] [class*="dark:text-[#94a3b8]"]', 'muted text ON the grey box');
    // A card that paints no surface of its own, inside that box.
    first('[class*="border-l-4"] div[class*="shadow-9e-md"]', 'shadow card ON the grey box');

    rows[key] = picks.map((pair) => {
      const name = pair[0]; const el = pair[1];
      const cs = getComputedStyle(el);
      const fg = px(cs.color);
      const bgi = effectiveBg(el);
      // Does this box SEPARATE from what is behind it? Three ways it can:
      // its own opaque fill differing from the parent's, a border, a shadow.
      const own = px(cs.backgroundColor);
      const ownOpaque = own && own.a > 0.5;
      const parentBg = el.parentElement ? effectiveBg(el.parentElement) : null;
      return {
        el: name,
        fg: hex(fg),
        bg: bgi ? hex(bgi.colour) : null,
        gradient: bgi ? bgi.gradient : null,
        contrast: (fg && bgi) ? ratio(fg, bgi.colour) : null,
        ownFill: ownOpaque ? hex(own) : null,
        vsParent: (ownOpaque && parentBg) ? ratio(own, parentBg.colour) : null,
        borderColor: cs.borderTopWidth !== '0px' ? cs.borderTopColor : null,
        boxShadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 220),
        cls: String(el.className || '').slice(0, 150),
      };
    });
  }
  return rows;
};

const { browser, close } = await launch();
let light = null; let dark = null;
try {
  const modes = [['light', false], ['dark', true]];
  for (const m of modes) {
    const page = await openPage(browser, { width: 1200, height: 3000 });
    try {
      await page.eval((h) => { document.open(); document.write(h); document.close(); }, doc(m[1]));
      const tokens = await page.eval(() => {
        const cs = getComputedStyle(document.documentElement);
        return {
          pageBg: cs.getPropertyValue('--page-bg').trim(),
          surface: cs.getPropertyValue('--surface').trim(),
          textPrimary: cs.getPropertyValue('--text-primary').trim(),
          textSecondary: cs.getPropertyValue('--text-secondary').trim(),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          bodyColor: getComputedStyle(document.body).color,
          htmlClass: document.documentElement.className,
        };
      });
      const rows = await page.eval(READER);
      if (m[0] === 'light') light = { tokens, rows }; else dark = { tokens, rows };
    } finally { await page.close().catch(() => {}); }
  }
} finally { await close().catch(() => {}); }

// ── CONTROLS ──────────────────────────────────────────────────────────────
if (light.tokens.pageBg === dark.tokens.pageBg) {
  die('--page-bg identical in both modes (' + light.tokens.pageBg + ') — the .dark block never loaded');
}
if (dark.tokens.htmlClass !== 'dark') die('html.dark class did not land');
let moved = 0; let nullBg = 0; let cells = 0;
for (const k of Object.keys(light.rows)) {
  const L = light.rows[k]; const D = dark.rows[k] || [];
  for (let i = 0; i < L.length; i += 1) {
    cells += 1;
    if (!L[i].bg || !(D[i] && D[i].bg)) nullBg += 1;
    if (D[i] && (L[i].fg !== D[i].fg || L[i].bg !== D[i].bg)) moved += 1;
  }
}
if (moved === 0) die('no measured cell changed between modes — the harness is not switching themes');
if (nullBg > 0) die(nullBg + ' of ' + cells + ' cells resolved no opaque background — the ancestor walk failed');

console.log(JSON.stringify({
  control: { cells, movedBetweenModes: moved, lightTokens: light.tokens, darkTokens: dark.tokens },
  light: light.rows,
  dark: dark.rows,
}, null, 2));
