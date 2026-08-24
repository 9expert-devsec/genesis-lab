/**
 * ROUND 78 §K/§L — measure the REAL RUNNING PAGE, in both modes.
 *
 * Every previous round measured a component tree rendered into `about:blank`.
 * That harness is correct for geometry and it is exactly what missed two
 * defects the author could see: it never loaded the route, so it never saw the
 * route wrapper, the site chrome, or the real stylesheet the server ships.
 * This one navigates headless Chrome to the DEV SERVER and reads computed
 * styles off the page the author is actually looking at.
 *
 * ── HOW DARK MODE IS FORCED, AND WHY THIS WAY ────────────────────────────
 * next-themes with attribute="class" puts `dark` on <html>. The site toggle
 * does exactly that and nothing else. So this sets `documentElement.className`
 * the same way rather than driving the toggle widget, which would need the
 * header to be present and hydrated. `color-scheme` is READ BACK and asserted
 * to be `dark`, because globals.css sets `html.dark { color-scheme: dark }` —
 * if that computed property is not `dark`, the class did not take effect and
 * every number below would be a light-mode reading wearing a dark label.
 *
 * ── WHAT IS READ ─────────────────────────────────────────────────────────
 *   · every top-level section wrapper's computed background-color, composited
 *     through translucent ancestors (a 40%-alpha layer over a white shell is a
 *     grey, and reading `transparent` literally is how a probe reports nothing
 *     is wrong);
 *   · the contrast of the body text inside each against that background;
 *   · every `border-left-width` on a highlight_grid child box.
 *
 * Nothing is written into public/. Output goes to the path in OUT.
 *
 * Run (dev server must be up):
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round78-live-page.mjs
 *   OUT=scripts/_r78-before.json  URL=http://localhost:3000/promotions/...
 */
import { writeFileSync } from 'node:fs';
import { launch, openPage } from '../test/browser/cdp.mjs';

const PATH_ = process.env.PB_PATH || '/promotions/early-bird-claude-code';
const OUT = process.env.OUT || 'scripts/_r78-live.json';
function die(m) { console.error('X ' + m); process.exit(1); }

const READER = () => {
  const px = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
  };
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = ({ r, g, b }) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  const ratio = (a, b) => {
    const la = lum(a); const lb = lum(b);
    const hi = Math.max(la, lb); const lo = Math.min(la, lb);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('') : null);
  const gradStop = (img) => {
    const m = String(img).match(/rgba?\([^)]*\)/g);
    return m && m.length ? px(m[0]) : null;
  };
  /** Composite every translucent layer down to the opaque one beneath. */
  function effectiveBg(el) {
    const stack = []; let gradient = false; let n = el;
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
    let out = stack[stack.length - 1];
    if (out.a < 0.999) out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const L = stack[i];
      if (L === out) continue;
      out = {
        r: L.r * L.a + out.r * (1 - L.a),
        g: L.g * L.a + out.g * (1 - L.a),
        b: L.b * L.a + out.b * (1 - L.a),
        a: 1,
      };
    }
    return { colour: out, gradient };
  }

  const root = getComputedStyle(document.documentElement);
  const out = {
    htmlClass: document.documentElement.className,
    colorScheme: root.colorScheme,
    tokens: {
      pageBg: root.getPropertyValue('--page-bg').trim(),
      surface: root.getPropertyValue('--surface').trim(),
      textPrimary: root.getPropertyValue('--text-primary').trim(),
    },
    bodyBg: getComputedStyle(document.body).backgroundColor,
    sections: [],
    highlightGridBorders: [],
  };

  // The page body is PageBuilderView's wrapper: the div carrying data-pb-theme.
  const shell = document.querySelector('[data-pb-theme]');
  if (shell) {
    const cs = getComputedStyle(shell);
    const bg = effectiveBg(shell);
    out.pageShell = {
      cls: String(shell.className).slice(0, 120),
      bg: bg ? hex(bg.colour) : null, fg: hex(px(cs.color)),
      contrast: bg ? ratio(px(cs.color), bg.colour) : null,
    };
    const walk = shell.querySelectorAll(':scope > section');
    for (let i = 0; i < walk.length; i += 1) {
      const sec = walk[i];
      const scs = getComputedStyle(sec);
      const bgi = effectiveBg(sec);
      // The first real text node inside — what a reader is looking at.
      const t = sec.querySelector('p, li, h1, h2, h3');
      const tcs = t ? getComputedStyle(t) : null;
      const tbg = t ? effectiveBg(t) : null;
      out.sections.push({
        i,
        id: sec.id || null,
        bg: bgi ? hex(bgi.colour) : null,
        gradient: bgi ? bgi.gradient : false,
        ownBackgroundColor: scs.backgroundColor,
        ownBackgroundImage: scs.backgroundImage === 'none' ? null : scs.backgroundImage.slice(0, 90),
        textTag: t ? t.tagName : null,
        textColour: tcs ? hex(px(tcs.color)) : null,
        textOnBg: (t && tbg) ? hex(tbg.colour) : null,
        textContrast: (t && tbg) ? ratio(px(tcs.color), tbg.colour) : null,
      });
    }
  }
  // Every highlight_grid child box, by the class the renderer gives it.
  for (const box of document.querySelectorAll('[class*="border-l-4"], [class*="rounded-9e-lg"][class*="border"]')) {
    const cs = getComputedStyle(box);
    if (cs.borderLeftWidth === '0px' && !/border-l-4/.test(String(box.className))) continue;
    out.highlightGridBorders.push({
      cls: String(box.className).slice(0, 150),
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftColor: cs.borderLeftColor,
      borderTopWidth: cs.borderTopWidth,
      borderRightWidth: cs.borderRightWidth,
      borderBottomWidth: cs.borderBottomWidth,
      borderRadius: cs.borderTopLeftRadius,
      padding: cs.paddingLeft + ' / ' + cs.paddingTop,
    });
  }
  return out;
};

const { browser, close } = await launch();
const report = { path: PATH_ };
try {
  for (const mode of ['light', 'dark']) {
    const page = await openPage(browser, { width: 1280, height: 2400 });
    try {
      /**
       * ── WHY localStorage AND A RELOAD, AND NOT classList.add('dark') ─────
       * Setting the class directly was tried first and the control below
       * CAUGHT IT: `color-scheme` still computed to `light`. next-themes
       * re-synchronises <html> to its stored value on hydration, so a class
       * added by hand is removed again a moment later and every "dark" number
       * would have been a light reading wearing a dark label.
       *
       * The toggle's actual sequence is: write localStorage, then let the
       * provider apply the class. So that is what this does — first load to
       * establish the origin, write the key, reload. This is the site's own
       * mechanism rather than an imitation of its end state.
       */
      await page.goto(PATH_, { waitMs: 3000 });
      await page.eval((m) => { try { localStorage.setItem('theme', m); } catch { /* private mode */ } }, mode);
      await page.goto(PATH_, { waitMs: 6000 });
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      report[mode] = await page.eval(READER);
    } finally { await page.close().catch(() => {}); }
  }
} finally { await close().catch(() => {}); }

// ── CONTROLS ──────────────────────────────────────────────────────────────
if (!report.light || !report.dark) die('a mode did not render');
if (report.dark.colorScheme !== 'dark') {
  die(`dark run reports color-scheme "${report.dark.colorScheme}" — the .dark class did not take effect, so every dark number would be a light reading`);
}
if (report.light.colorScheme === 'dark') die('light run also reports color-scheme dark — the class was never removed');
if (report.light.tokens.pageBg === report.dark.tokens.pageBg) {
  die(`--page-bg identical in both modes (${report.light.tokens.pageBg}) — the stylesheet's .dark block never loaded`);
}
if (!report.light.pageShell) die('no [data-pb-theme] element — the builder page did not render at this URL');
if (report.light.sections.length === 0) die('zero section wrappers found — the reader selector is wrong');

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  path: PATH_,
  wroteTo: OUT,
  control: {
    lightColorScheme: report.light.colorScheme,
    darkColorScheme: report.dark.colorScheme,
    pageBgLight: report.light.tokens.pageBg,
    pageBgDark: report.dark.tokens.pageBg,
    sectionsFound: report.light.sections.length,
    highlightGridBoxesFound: report.light.highlightGridBorders.length,
  },
}, null, 2));
