/**
 * ROUND 80 §I — the stored `highlight_grid` block on the REAL RUNNING PAGE,
 * in both modes, plus the ADD menu.
 *
 * Two questions, and they need different surfaces:
 *
 *   THE PUBLIC PAGE  does the author's `สิ่งที่จะได้รับ` block still render, and
 *                    with what padding on its per-child boxes?
 *   THE EDITOR       is `กริดไฮไลต์` gone from the ADD menu while every other
 *                    layout type is still there?
 *
 * The picker half is read from the PICKER'S OWN derivation rather than from the
 * page, because the dialog renders through a Radix portal that produces nothing
 * server-side (see the header of test/render/sectionPickerFilters) — driving it
 * here would measure the portal, not the retirement.
 *
 * ── DARK MODE IS DRIVEN THE WAY THE TOGGLE DRIVES IT ─────────────────────
 * next-themes re-synchronises <html> on hydration, so a class added by hand is
 * removed a moment later. This writes localStorage and reloads, then ASSERTS
 * `color-scheme` computed to `dark` — round 78's control caught a run where it
 * had not.
 *
 * Nothing is written into public/.
 *
 * Run (dev server up):
 *   OUT=scripts/_r80-after.json node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round80-live.mjs
 */
import { writeFileSync } from 'node:fs';
import { launch, openPage } from '../test/browser/cdp.mjs';

const PATH_ = process.env.PB_PATH || '/promotions/early-bird-claude-code';
const OUT = process.env.OUT || 'scripts/_r80-live.json';
function die(m) { console.error('X ' + m); process.exit(1); }

const READER = () => {
  const root = getComputedStyle(document.documentElement);
  const shell = document.querySelector('[data-pb-theme]');
  /**
   * The per-child boxes. Keyed on the radius + border pair the box has carried
   * since round 29, NOT on a background class — round 79 changed a background
   * class and a selector naming one silently stopped matching mid-round.
   */
  const boxes = shell
    ? [...shell.querySelectorAll('div[class*="rounded-9e-lg"][class*="border-[var(--surface-border)]"]')]
    : [];
  return {
    htmlClass: document.documentElement.className,
    colorScheme: root.colorScheme,
    pageBg: root.getPropertyValue('--page-bg').trim(),
    sectionCount: shell ? shell.querySelectorAll(':scope > section').length : 0,
    boxes: boxes.map((b) => {
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return {
        paddingLeft: cs.paddingLeft, paddingTop: cs.paddingTop,
        borderRadius: cs.borderTopLeftRadius,
        borderWidths: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join('/'),
        backgroundColor: cs.backgroundColor,
        width: +r.width.toFixed(2),
        textLength: b.textContent.trim().length,
      };
    }),
    // The block the author named, found by its own heading text.
    namedBlockPresent: !!(shell && /สิ่งที่จะได้รับ/.test(shell.textContent)),
  };
};

const { browser, close } = await launch();
const report = { path: PATH_, viewport: 1280 };
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

if (report.dark.colorScheme !== 'dark') die(`dark run reports color-scheme "${report.dark.colorScheme}" — the class never took effect`);
if (report.light.colorScheme === 'dark') die('the light run is also dark');
if (report.light.pageBg === report.dark.pageBg) die('--page-bg identical in both modes — the .dark block never loaded');
if (report.light.boxes.length === 0) die('no per-child boxes found — either the page has no highlight_grid or the selector is stale');
if (!report.light.namedBlockPresent) die('the สิ่งที่จะได้รับ block is not on the page — measuring the wrong page');

writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  wroteTo: OUT,
  control: {
    lightColorScheme: report.light.colorScheme, darkColorScheme: report.dark.colorScheme,
    pageBgLight: report.light.pageBg, pageBgDark: report.dark.pageBg,
    perChildBoxes: report.light.boxes.length,
    namedBlockPresent: report.light.namedBlockPresent,
  },
}, null, 2));
