/**
 * Feature Content screenshots — a TOOL, not a guard. It asserts nothing.
 *
 *   node test/browser/shot.mjs [tag]
 *   FC_PORT=3010 FC_SHOT_DIR=./out node test/browser/shot.mjs before
 *
 * Captures the section at 1440 and 375, on an image slide and a video slide,
 * plus the strip-and-control-row block at rest — which is the state the "four
 * cards fully visible plus a peek" claim is about.
 *
 * ── IT NEVER WRITES INTO THE REPO ───────────────────────────────────────────
 * Output goes to the OS temp directory unless FC_SHOT_DIR says otherwise. A
 * screenshot is evidence for one review, not a tracked artefact: committing
 * them would put a megabyte of PNG per round into the history for something
 * nobody diffs. run.mjs does not call this for the same reason it is not in
 * SCRIPTS — there is no count to report.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, openPage } from './cdp.mjs';

const tag = process.argv[2] ?? 'shot';
const OUT = process.env.FC_SHOT_DIR ?? path.join(tmpdir(), 'fc-shots');
mkdirSync(OUT, { recursive: true });

const { browser, close } = await launch();

/**
 * Promote the first slide of `kind` ("image" | "split") through the strip.
 *
 * ONE CLICK PER ROUND TRIP, and that is not politeness. React batches the
 * state update, so a loop that clicks and re-reads the DOM in the same tick
 * sees the PREVIOUS slide every time and reports "no such slide in the pool"
 * for a pool that has five of them — which is exactly what the first version
 * of this did.
 */
async function promote(page, kind) {
  const isActive = () => page.eval(
    (k) => Boolean(document.querySelector(`[data-fc-slide="active"] [data-fc-card="${k}"]`)),
    kind
  );
  if (await isActive()) return 'already';
  const n = await page.eval(() => document.querySelectorAll('[data-fc-strip-card]').length);
  for (let i = 0; i < n; i += 1) {
    await page.eval((j) => document.querySelectorAll('[data-fc-strip-card]')[j].click(), i);
    await page.wait(300);
    if (await isActive()) return 'promoted:' + i;
  }
  return 'missing';
}

/**
 * Clip to one element's box.
 *
 * THE VIEWPORT IS GROWN TO FIT FIRST. `captureBeyondViewport` stitches tiles
 * for anything taller than the viewport, and this page has a FIXED header — so
 * a stitched capture paints that header across the middle of the image, which
 * is what the first pass produced at 375 (a 1039px-tall section through an
 * 812px window, header stamped at ~640px in). A window taller than the subject
 * means one tile, and one tile cannot show the header twice.
 *
 * The clip is then built in PAGE coordinates (rect + scrollX/scrollY), because
 * that is the space Page.captureScreenshot's `clip` is in — see cdp.mjs.
 */
async function shoot(page, name, selector, width) {
  const first = await page.eval((sel) => {
    const el = document.querySelector(sel);
    return el ? { height: Math.round(el.getBoundingClientRect().height) } : null;
  }, selector);
  if (!first) { console.log(`  ${name}: ${selector} not found`); return null; }

  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height: first.height + 160, deviceScaleFactor: 1,
    mobile: width < 768, screenWidth: width, screenHeight: first.height + 160,
  });
  await page.wait(700);

  const box = await page.eval((sel) => {
    const el = document.querySelector(sel);
    const r0 = el.getBoundingClientRect();
    // Clear the fixed header — it is ~80px and would otherwise sit over the
    // top of the section.
    window.scrollTo({ top: window.scrollY + r0.top - 100, behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY,
             width: Math.round(r.width), height: Math.round(r.height) };
  }, selector);
  await page.wait(500);

  const file = path.join(OUT, `${tag}-${name}.png`);
  await page.screenshot(file, { clip: box });
  console.log(`  ${name}  ${box.width}×${box.height}  ${file}`);
  return box;
}

try {
  for (const [w, h, mobile] of [[1440, 900, false], [375, 812, true]]) {
    const page = await openPage(browser, { width: w, height: h, mobile });
    await page.goto('/', { waitMs: 5000 });
    console.log(`@${w}`);

    if (w === 1440) {
      // Stop auto-slide first, so the strip is at rest rather than mid-scroll.
      await page.eval(() => document.querySelectorAll('[data-fc-controls] button')[0].click());
      await page.wait(500);
      await shoot(page, `${w}-strip`, '[data-fc-strip-region]', w);
    }

    for (const [kind, label] of [['image', 'image'], ['split', 'video']]) {
      const got = await promote(page, kind);
      if (got === 'missing') { console.log(`  ${label}: no such slide in the pool`); continue; }
      await page.wait(1200);
      await shoot(page, `${w}-${label}`, '[data-fc-slider]', w);
    }
    await page.close();
  }
} finally {
  await close();
}
