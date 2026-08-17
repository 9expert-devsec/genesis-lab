/**
 * THE PAGE DOES NOT MOVE WHILE THE CAROUSEL DOES.
 *
 * The strip keeps the active card in view by assigning `scrollLeft` on the
 * strip. The obvious alternative, `scrollIntoView`, walks EVERY scrollable
 * ancestor up to the document and scrolls each one — so on a home page it yanks
 * the reader vertically every five seconds. `block: 'nearest'` bounds how far
 * the page moves; it does not stop it.
 *
 * ── THE SECTION IS DELIBERATELY LEFT PART-VISIBLE ───────────────────────────
 * With the strip fully on screen `nearest` moves nothing, which is why a
 * careless check passes it. The carousel resumes the moment ANY sliver of the
 * section intersects the viewport (IntersectionObserver at threshold 0), so
 * "partly cut off" is the state it spends most of its ticks in — and that is
 * where the page movement was measured at up to 224px. This parks the section
 * with roughly a fifth of it showing and samples scrollY across a FULL cycle.
 */
import { launch, openPage, tape } from './cdp.mjs';

const t = tape('scrollY');
const { browser, close } = await launch();

async function run(width, height, mobile) {
  const page = await openPage(browser, { width, height, mobile });
  await page.goto('/', { waitMs: 5500 });

  const total = await page.eval(() => document.querySelectorAll('[data-fc-strip-card]').length);

  // Park so the section's TOP is near the viewport bottom: a sliver visible,
  // the rest below the fold.
  await page.eval(() => {
    const r = document.querySelector('[data-fc-slider]').getBoundingClientRect();
    window.scrollTo({ top: Math.round(window.scrollY + r.top - innerHeight * 0.8),
      behavior: 'instant' });
  });
  await page.wait(800);

  const start = await page.eval(() => ({
    y: window.scrollY,
    paused: document.querySelector('[data-fc-slider]').getAttribute('data-fc-paused'),
    index: [...document.querySelectorAll('[data-fc-strip-card]')]
      .findIndex((c) => c.getAttribute('data-fc-strip-card') === 'active'),
  }));
  t.eq(start.paused, 'none', `@${width} the carousel is running while part-visible`);

  // A FULL cycle: one dwell per item, plus slack for the last advance.
  const samples = [];
  const stripLefts = [];
  const indices = new Set();
  const ticks = total * 5 + 3;
  for (let i = 0; i < ticks; i += 1) {
    await page.wait(1000);
    const s = await page.eval(() => ({
      y: window.scrollY,
      left: document.querySelector('[data-fc-strip]').scrollLeft,
      i: [...document.querySelectorAll('[data-fc-strip-card]')]
        .findIndex((c) => c.getAttribute('data-fc-strip-card') === 'active'),
    }));
    samples.push(s.y);
    stripLefts.push(s.left);
    indices.add(s.i);
  }

  const drift = Math.max(...samples.map((y) => Math.abs(y - start.y)));
  t.ok(indices.size >= total,
    `@${width} the run really covered a full cycle`,
    `${indices.size} of ${total} slides seen`);
  t.eq(drift, 0, `@${width} window.scrollY is CONSTANT across the whole cycle`,
    `max drift ${drift}px over ${samples.length} samples, from ${start.y}`);

  // And the strip DID move — otherwise scrollY being constant proves nothing.
  //
  // Sampled DURING the run, not read at the end. A full cycle wraps back to
  // slide 0, which parks the strip back at scrollLeft 0, so the closing read is
  // always zero and the control always fails — which is what it did, on a run
  // whose real result was green.
  const stripMoved = Math.max(...stripLefts);
  t.ok(stripMoved > 0,
    `@${width} CONTROL: the strip itself scrolled, so the test was not vacuous`,
    `peak scrollLeft ${Math.round(stripMoved)}`);

  await page.close();
}

try {
  await run(1440, 900, false);
  await run(375, 812, true);
} finally {
  await close();
}

const r = t.report();
process.exit(r.ok ? 0 : 1);
