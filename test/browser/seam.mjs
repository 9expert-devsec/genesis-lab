/**
 * THE SEAM: scrolling out of the hero into the Feature Content band must show
 * no horizontal edge, and the band must not eat the hero's clicks.
 *
 * Three layers make the first half work (see the "FEATURE CONTENT SECTION"
 * block at the bottom of src/app/globals.css) and one rule makes the second:
 * the <section> is `pointer-events-none` and carries the tall padding, so the
 * whole overlap band is inert, while the inner wrapper turns them back on and
 * begins BELOW that band.
 *
 * ── THE BAND IS MEASURED IN PIXELS, NOT INFERRED FROM CLASS NAMES ───────────
 * A grey band along the seam is what CSS `transparent` (transparent BLACK) does
 * when a browser interpolates through it, and no amount of reading the class
 * list proves it is absent. So this screenshots a narrow column across the
 * boundary, reads it back through a canvas, and looks for a local extremum in
 * the vertical colour ramp. The last check INJECTS a band and re-scans, because
 * a detector that has never fired is not a detector.
 */
import { launch, openPage, tape } from './cdp.mjs';

const t = tape('seam');
const { browser, close } = await launch();
const page = await openPage(browser, { width: 1440, height: 900 });

/**
 * Read a 1px-wide column of the rendered page back as RGB rows.
 *
 * The screenshot comes back as base64 PNG; handing it to the page as a data:
 * URL and drawing it into a canvas is readable — a data: URL does not taint
 * the canvas the way a cross-origin image would.
 */
async function columnAt(x, y, height) {
  const { data } = await page.send('Page.captureScreenshot', {
    format: 'png', clip: { x, y, width: 3, height, scale: 1 },
  });
  return page.eval(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(1, 0, 1, img.height).data;
    const rows = [];
    for (let i = 0; i < d.length; i += 4) rows.push([d[i], d[i + 1], d[i + 2]]);
    return rows;
  }, data);
}

/**
 * A band is a LOCAL extremum in an otherwise monotonic ramp: a row darker (or
 * lighter) than the rows above AND below it by more than the ramp's own step.
 * Comparing against neighbours rather than against an absolute colour is what
 * makes this work on a gradient at all.
 */
function deviations(rows, span = 6) {
  const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  const out = new Array(rows.length).fill(0);
  for (let i = span; i < rows.length - span; i += 1) {
    const expected = (lum(rows[i - span]) + lum(rows[i + span])) / 2;
    out[i] = Math.abs(lum(rows[i]) - expected);
  }
  return out;
}

/**
 * ── ONE COLUMN IS NOT ENOUGH, AND THAT WAS MEASURED ────────────────────────
 * A single column through the seam reads a deviation of 126 at a row 37px ABOVE
 * the section — which is not a band, it is the hero's own artwork crossing the
 * sample line. At that noise floor an injected 4px band changes the answer by
 * nothing at all, so the detector reported the same number clean and dirty and
 * could not have failed either way.
 *
 * The distinction that actually separates the two: a seam band spans the FULL
 * WIDTH of the page, and hero content does not. So several columns are sampled
 * and the score for a row is the MINIMUM deviation across all of them. Content
 * in one column is cancelled by the columns that do not have it; a band, being
 * everywhere, survives the minimum.
 */
function worstBand(columns, span = 6) {
  const profiles = columns.map((rows) => deviations(rows, span));
  const height = Math.min(...profiles.map((p) => p.length));
  let worst = 0, at = -1;
  for (let i = 0; i < height; i += 1) {
    const acrossAll = Math.min(...profiles.map((p) => p[i]));
    if (acrossAll > worst) { worst = acrossAll; at = i; }
  }
  return { worst: +worst.toFixed(2), at };
}

try {
  await page.goto('/', { waitMs: 5500 });

  // ── STRUCTURE ────────────────────────────────────────────────────────────
  const s = await page.eval(() => {
    const section = document.querySelector('section.fc-surface');
    const wrap = section?.querySelector('.pointer-events-auto');
    const aurora = section?.querySelector('.fc-aurora');
    const hero = document.querySelector('[data-hero-sentinel], header ~ * section, main > section');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const root = getComputedStyle(document.documentElement);
    return {
      hasSection: Boolean(section),
      overflow: cs(section)?.overflow,
      sectionPE: cs(section)?.pointerEvents,
      wrapPE: cs(wrap)?.pointerEvents,
      sectionTop: section?.getBoundingClientRect().top,
      wrapTop: wrap?.getBoundingClientRect().top,
      auroraTop: aurora?.getBoundingClientRect().top,
      baseToken: root.getPropertyValue('--9e-fc-base-rgb').trim(),
      sectionBg: cs(section)?.backgroundImage ?? '',
      fadeBg: (() => {
        const f = document.querySelector('.fc-hero-fade');
        return f ? getComputedStyle(f).backgroundImage : '';
      })(),
      auroraBg: cs(aurora)?.backgroundImage ?? '',
      heroBottom: hero?.getBoundingClientRect().bottom,
    };
  });

  t.ok(s.hasSection, 'the Feature Content surface is on the page');
  t.ok(s.overflow !== 'hidden',
    'the section does NOT clip — the aurora is meant to spill above its top edge',
    s.overflow);
  t.eq(s.sectionPE, 'none',
    'the section is inert, so its overlap band cannot eat the hero\'s clicks');
  t.eq(s.wrapPE, 'auto', '…and the inner wrapper turns pointer events back on');
  t.ok(s.wrapTop > s.sectionTop,
    'the interactive wrapper begins BELOW the overlap band',
    `wrap ${s.wrapTop?.toFixed(0)} vs section ${s.sectionTop?.toFixed(0)}`);
  t.ok(s.auroraTop < s.sectionTop,
    'the aurora spills above the section\'s top edge, which is what softens it',
    `aurora ${s.auroraTop?.toFixed(0)} vs section ${s.sectionTop?.toFixed(0)}`);
  t.ok(s.baseToken.length > 0,
    'there is ONE token for the base colour', `--9e-fc-base-rgb: ${s.baseToken}`);

  const gradients = [s.sectionBg, s.fadeBg, s.auroraBg].join(' | ');
  t.ok(!/\btransparent\b/.test(gradients),
    'no gradient stop is CSS `transparent` — that is transparent BLACK and bands');
  const rgbBase = s.baseToken.split(/[\s,]+/).map(Number);
  const terminal = new RegExp(
    `rgba?\\(\\s*${rgbBase[0]}\\s*,\\s*${rgbBase[1]}\\s*,\\s*${rgbBase[2]}`);
  t.ok(terminal.test(s.sectionBg),
    'the section\'s own fill is computed from that one token');
  t.ok(terminal.test(s.fadeBg),
    'and so is the hero fade\'s terminal stop — they cannot drift apart');

  // ── THE HERO'S CTA IS STILL REACHABLE ────────────────────────────────────
  const cta = await page.eval(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const link = document.querySelector('main a[class*="rounded"], main a[href]');
    if (!link) return null;
    const r = link.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { reached: Boolean(hit && (link.contains(hit) || hit.contains(link))),
             blocker: hit?.className?.toString?.().slice(0, 60) ?? null };
  });
  t.ok(cta?.reached,
    'a hero link hit-tests to itself — nothing invisible is sitting over it',
    cta?.blocker ?? 'no link found');

  // ── THE BAND, IN PIXELS ──────────────────────────────────────────────────
  const seam = await page.eval(() => {
    const section = document.querySelector('section.fc-surface');
    const r = section.getBoundingClientRect();
    // Park the seam in the middle of the viewport and sample a column through
    // it, well clear of the section's own content.
    window.scrollTo({ top: Math.round(window.scrollY + r.top - innerHeight / 2),
      behavior: 'instant' });
    const after = section.getBoundingClientRect();
    // PAGE coordinates, not viewport. Page.captureScreenshot's `clip` is
    // absolute-document, so a viewport-relative y silently samples whatever is
    // that far down the DOCUMENT — which here was the middle of the hero, 3000px
    // above the seam. It produced a confident 126 "band" that was the mascot,
    // and it explained why injecting a real band changed the reading by nothing:
    // the injected band was never inside the window being read.
    return { y: Math.round(after.top + window.scrollY - 220), h: 440,
             sectionAt: 220 };
  });
  await page.wait(900);
  const XS = [6, 260, 620, 980, 1400];
  const sample = async () => {
    const cols = [];
    for (const x of XS) cols.push(await columnAt(x, seam.y, seam.h));
    return cols;
  };
  const cleanCols = await sample();
  t.eq(cleanCols.length, XS.length, 'five columns across the full width were sampled');
  t.eq(cleanCols[0].length, seam.h, 'each one is the full height', `${cleanCols[0].length} rows`);
  const clean = worstBand(cleanCols);
  t.ok(clean.worst < 6,
    'NO band across the seam — no row is a local extremum in EVERY column',
    `worst all-column deviation ${clean.worst} at row ${clean.at}, ` +
    `the section's own top edge is row ${seam.sectionAt}`);

  // ── CONTROL: THE DETECTOR CAN FIRE ───────────────────────────────────────
  await page.eval(() => {
    const section = document.querySelector('section.fc-surface');
    const band = document.createElement('div');
    band.id = 'seam-probe-band';
    band.style.cssText =
      'position:absolute;left:0;right:0;top:-2px;height:4px;background:#6b7280;z-index:99';
    section.appendChild(band);
  });
  await page.wait(400);
  const dirty = worstBand(await sample());
  t.ok(dirty.worst > clean.worst + 8,
    'CONTROL: injecting a 4px grey band DOES trip the detector',
    `${dirty.worst} against a clean ${clean.worst}`);
} finally {
  await close();
}

const r = t.report();
process.exit(r.ok ? 0 : 1);
