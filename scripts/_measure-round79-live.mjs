/**
 * ROUND 79 §L — the three named surfaces on the REAL RUNNING PAGE, in both
 * modes, plus whether the back link and its band are still there.
 *
 * Round 78 established that measuring a component tree in `about:blank` is not
 * the same as measuring the route: it misses the route wrapper, the site
 * chrome, and the stylesheet the server actually ships. This navigates
 * headless Chrome to the dev server.
 *
 * ── DARK MODE IS DRIVEN THE WAY THE TOGGLE DRIVES IT ─────────────────────
 * next-themes re-synchronises <html> to its stored value on hydration, so a
 * class added by hand is removed a moment later — round 78's control caught
 * exactly that and every "dark" number would have been a light reading. So
 * this writes localStorage and reloads, which is the toggle's own sequence,
 * and then ASSERTS `color-scheme` computed to `dark`.
 *
 * ── THE THREE SURFACES, ADDRESSED BY WHAT THEY ARE ───────────────────────
 *   hero         the first top-level <section>
 *   closing CTA  the last top-level <section>
 *   price card   the cardStyle:filled box inside the hero
 * Addressed structurally rather than by a class that this round might change,
 * so the same selector keeps working across the change it is measuring.
 *
 * Backgrounds are COMPOSITED through translucent ancestors: a 40%-alpha layer
 * over a light shell is a grey, and reading `transparent` literally is how a
 * probe reports that nothing is wrong.
 *
 * Nothing is written into public/.
 *
 * Run (dev server up):
 *   OUT=scripts/_r79-before.json node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round79-live.mjs
 */
import { writeFileSync } from 'node:fs';
import { launch, openPage } from '../test/browser/cdp.mjs';

const PATH_ = process.env.PB_PATH || '/promotions/early-bird-claude-code';
const OUT = process.env.OUT || 'scripts/_r79-live.json';
function die(m) { console.error('X ' + m); process.exit(1); }

const READER = () => {
  const px = (c) => {
    const s = String(c).trim();
    if (s.startsWith('oklch(') || s.startsWith('oklab(') || s.startsWith('color(')) return { oklch: s, r: null, g: null, b: null, a: 1 };
    const m = s.match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
  };
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  /**
   * OKLab -> linear sRGB, so a colour Chrome serialises as `oklch(...)` still
   * yields a WCAG luminance. Without this every derived surface reported
   * contrast `null` — the measurement would have gone quiet on exactly the
   * surfaces this round changed.
   */
  const oklchToLin = (str) => {
    const [L, C, H] = str.match(/[\d.]+/g).slice(0, 3).map(Number);
    const a = C * Math.cos(H * Math.PI / 180); const b2 = C * Math.sin(H * Math.PI / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b2) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b2) ** 3;
    const s2 = (L - 0.0894841775 * a - 1.2914855480 * b2) ** 3;
    return [
      +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s2,
    ].map((c) => Math.min(1, Math.max(0, c)));
  };
  const lum = (c) => {
    if (c.oklch) { const [r, g, b] = oklchToLin(c.oklch); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a); const lb = lum(b);
    if (la === null || lb === null) return null;
    const hi = Math.max(la, lb); const lo = Math.min(la, lb);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const show = (c) => {
    if (!c) return null;
    if (c.oklch) return c.oklch;
    return '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  };
  const gradStop = (img) => {
    const m = String(img).match(/(?:rgba?|oklch|oklab)\([^)]*\)/g);
    return m && m.length ? px(m[0]) : null;
  };
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
    // An oklch layer is not composited — it is reported verbatim, because
    // averaging it into an rgb stack would invent a colour nothing paints.
    if (stack.some((s) => s.oklch)) return { colour: stack.find((s) => s.oklch), gradient, exact: true };
    let out = stack[stack.length - 1];
    if (out.a < 0.999) out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const L = stack[i];
      if (L === out) continue;
      out = { r: L.r * L.a + out.r * (1 - L.a), g: L.g * L.a + out.g * (1 - L.a), b: L.b * L.a + out.b * (1 - L.a), a: 1 };
    }
    return { colour: out, gradient, exact: false };
  }

  const root = getComputedStyle(document.documentElement);
  const shell = document.querySelector('[data-pb-theme]');
  const sections = shell ? [...shell.querySelectorAll(':scope > section')] : [];

  const surface = (label, el) => {
    if (!el) return { label, missing: true };
    const cs = getComputedStyle(el);
    const bg = effectiveBg(el);
    const t = el.querySelector('p, li, h1, h2, h3');
    const tcs = t ? getComputedStyle(t) : null;
    const tbg = t ? effectiveBg(t) : null;
    return {
      label,
      bg: bg ? show(bg.colour) : null,
      gradient: bg ? bg.gradient : false,
      ownBackgroundImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0, 120),
      ownBackgroundColor: cs.backgroundColor,
      textColour: tcs ? show(px(tcs.color)) : null,
      textContrast: (t && tbg) ? ratio(px(tcs.color), tbg.colour) : null,
    };
  };

  /**
   * The back link and the band that holds it.
   *
   * NOT `a[href="/promotions"]` — the first draft used that and matched the
   * NAVBAR's โปรโมชัน item, which comes first in document order and sits in an
   * h-20 band of its own. It reported "back link present, band 80px" on a page
   * whose back link had not been reached yet, and would have gone on reporting
   * it after the link was removed. Matched on the link's own words instead,
   * and required to be OUTSIDE the site header.
   */
  const allPromoLinks = [...document.querySelectorAll('a[href="/promotions"]')];
  const backLink = allPromoLinks.find((a) => /กลับไปหน้าโปรโมชัน/.test(a.textContent)) ?? null;
  const navPromoLinks = allPromoLinks.filter((a) => a !== backLink).length;
  let band = null;
  if (backLink) {
    const b = backLink.closest('div');
    const r = b.getBoundingClientRect();
    band = {
      cls: String(b.className).slice(0, 120),
      height: +r.height.toFixed(2),
      paddingTop: getComputedStyle(b).paddingTop,
      bg: getComputedStyle(b).backgroundColor,
      onlyChildIsTheLink: b.children.length === 1 && b.firstElementChild === backLink,
    };
  }
  const firstSectionTop = sections[0] ? +sections[0].getBoundingClientRect().top.toFixed(2) : null;
  const shellTop = shell ? +shell.getBoundingClientRect().top.toFixed(2) : null;

  return {
    htmlClass: document.documentElement.className,
    colorScheme: root.colorScheme,
    tokens: { pageBg: root.getPropertyValue('--page-bg').trim(), textPrimary: root.getPropertyValue('--text-primary').trim() },
    sectionCount: sections.length,
    backLinkPresent: !!backLink,
    backLinkText: backLink ? backLink.textContent.trim() : null,
    otherPromotionsLinksOnPage: navPromoLinks,
    band,
    shellTop,
    firstSectionTop,
    surfaces: [
      surface('hero (first section)', sections[0]),
      surface('closing CTA (last section)', sections[sections.length - 1]),
      surface('price card (cardStyle:filled in hero)',
        /**
         * The cardStyle:filled box. Keyed on the RING that price_card draws
         * around it rather than on its background class — the background class
         * is what round 79 changed, and a selector naming it silently stopped
         * matching mid-round and reported `undefined` for the one surface the
         * change was about.
         */
        sections[0] ? sections[0].querySelector('[class*="ring-2"][class*="rounded-9e-lg"]') : null),
    ],
  };
};

const { browser, close } = await launch();
const report = { path: PATH_ };
try {
  for (const mode of ['light', 'dark']) {
    const page = await openPage(browser, { width: 1280, height: 2400 });
    try {
      await page.goto(PATH_, { waitMs: 3000 });
      await page.eval((m) => { try { localStorage.setItem('theme', m); } catch { /* private mode */ } }, mode);
      await page.goto(PATH_, { waitMs: 6000 });
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      report[mode] = await page.eval(READER);
    } finally { await page.close().catch(() => {}); }
  }
} finally { await close().catch(() => {}); }

if (!report.light || !report.dark) die('a mode did not render');
if (report.dark.colorScheme !== 'dark') die(`dark run reports color-scheme "${report.dark.colorScheme}" — the class never took effect`);
if (report.light.colorScheme === 'dark') die('the light run is also dark — the class was never removed');
if (report.light.tokens.pageBg === report.dark.tokens.pageBg) die('--page-bg identical in both modes — the .dark block never loaded');
if (report.light.sectionCount === 0) die('zero sections — the builder page did not render at this URL');

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  wroteTo: OUT,
  control: {
    lightColorScheme: report.light.colorScheme, darkColorScheme: report.dark.colorScheme,
    pageBgLight: report.light.tokens.pageBg, pageBgDark: report.dark.tokens.pageBg,
    sections: report.light.sectionCount,
    backLinkPresent: report.light.backLinkPresent,
  },
}, null, 2));
