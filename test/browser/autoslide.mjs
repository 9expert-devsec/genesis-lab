/**
 * AUTO-SLIDE: it runs, every pause condition holds, and only the viewer's own
 * gestures stop it for good.
 *
 * `data-fc-paused` names the REASON rather than leaving the harness to infer
 * one from "it did not advance" — six conditions gate the timer and a stalled
 * carousel cannot tell you which of them held, including the case where none
 * did and the harness measured the wrong element.
 */
import { launch, openPage, tape } from './cdp.mjs';

const t = tape('auto-slide');
const { browser, close } = await launch();
const page = await openPage(browser, { width: 1440, height: 900 });

const state = () => page.eval(() => {
  const el = document.querySelector('[data-fc-slider]');
  const cards = [...document.querySelectorAll('[data-fc-strip-card]')];
  return {
    autoplay: el?.getAttribute('data-fc-autoplay'),
    paused: el?.getAttribute('data-fc-paused'),
    index: cards.findIndex((c) => c.getAttribute('data-fc-strip-card') === 'active'),
    total: cards.length,
    counter: document.querySelector('[data-fc-counter]')?.textContent ?? null,
  };
});

/** Put the section fully in view so `onScreen` is true and hover is not. */
const parkOnSection = () => page.eval(() => {
  const el = document.querySelector('[data-fc-slider]');
  const r = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + r.top - 40, behavior: 'instant' });
});

try {
  await page.goto('/', { waitMs: 5000 });
  await parkOnSection();
  // The pointer sits at 0,0 by default, which is over the header, not the
  // section — so `hovering` is false without having to move it away.
  await page.wait(600);

  const s0 = await state();
  t.eq(s0.autoplay, 'on', 'auto-slide is running at rest');
  t.eq(s0.paused, 'none', 'and no pause condition is claimed');
  t.ok(s0.total > 1, 'the pool has more than one item', `${s0.total}`);
  t.eq(s0.index, 0, 'it starts on the first item');

  // ── IT ADVANCES, TWICE ────────────────────────────────────────────────────
  await page.wait(5600);
  const s1 = await state();
  t.eq(s1.index, 1, 'it advances one slide within the 5s dwell');
  t.eq(s1.counter, '02 / ' + String(s0.total).padStart(2, '0'),
    'and the counter moves with it', s1.counter);
  await page.wait(5200);
  t.eq((await state()).index, 2, 'and again — it is a timer, not a one-shot');

  // ── HOVER PAUSES, LEAVING RESUMES ─────────────────────────────────────────
  // Aim at the middle of the STAGE, not at the section's top edge. The site
  // header is fixed and 80px tall, and the section is parked 40px below the
  // viewport top — so a point 40px into the section is under the header and the
  // pointer never reaches the carousel at all. That read as "hover does not
  // pause" when what it meant was "the harness clicked the navbar".
  const over = await page.eval(() => {
    const r = document.querySelector('[data-fc-slide="active"] [data-fc-card]')
      .getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...over, button: 'none' });
  await page.wait(400);
  const hov = await state();
  t.eq(hov.paused, 'hover', 'a pointer over the section pauses it');
  t.eq(hov.autoplay, 'off', 'and autoplay reports off while it does');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' });
  await page.wait(400);
  t.eq((await state()).paused, 'none', 'and it resumes BY ITSELF when the pointer leaves');

  // ── FOCUS PAUSES TRANSIENTLY TOO ──────────────────────────────────────────
  await page.eval(() => document.querySelector('[data-fc-controls] button').focus());
  await page.wait(400);
  t.eq((await state()).paused, 'focus', 'focus inside the section pauses it');
  await page.eval(() => document.activeElement.blur());
  await page.wait(400);
  t.eq((await state()).paused, 'none', 'and blurring resumes it — focus is not a seizure');

  // ── OFF-SCREEN PAUSES ─────────────────────────────────────────────────────
  await page.eval(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await page.wait(900);
  t.eq((await state()).paused, 'offscreen', 'scrolled away, it stops burning ticks');
  await parkOnSection();
  await page.wait(900);
  t.eq((await state()).paused, 'none', 'and coming back resumes it');

  // ── STOP IS PERMANENT, PLAY IS THE ONLY WAY BACK ──────────────────────────
  await page.eval(() => document.querySelectorAll('[data-fc-controls] button')[0].click());
  await page.wait(400);
  const stopped = await state();
  t.eq(stopped.paused, 'user', 'pressing Stop takes control');
  await page.wait(5600);
  t.eq((await state()).index, stopped.index,
    'and nothing hands it back — the index does not move on its own');
  await page.eval(() => document.querySelectorAll('[data-fc-controls] button')[0].click());
  await page.wait(400);
  t.eq((await state()).paused, 'none', 'pressing Play is the one thing that resumes it');

  // ── AN ARROW IS DELIBERATE NAVIGATION, SO IT STOPS IT FOR GOOD ────────────
  await page.eval(() => document.querySelectorAll('[data-fc-controls] button')[2].click());
  await page.wait(400);
  const arrowed = await state();
  t.eq(arrowed.paused, 'user', 'pressing an arrow stops auto-slide permanently');

  // ── AND SO IS PICKING A CARD ──────────────────────────────────────────────
  await page.eval(() => document.querySelectorAll('[data-fc-strip-card]')[4].click());
  await page.wait(500);
  const picked = await state();
  t.eq(picked.index, 4, 'a strip card promotes itself into the featured slot');
  t.eq(picked.paused, 'user', 'and a strip click is no gentler than an arrow');

  // ── THE INDEX WRAPS ───────────────────────────────────────────────────────
  await page.eval((n) => {
    const next = document.querySelectorAll('[data-fc-controls] button')[2];
    for (let i = 0; i < n; i += 1) next.click();
  }, s0.total - 4);
  await page.wait(600);
  t.eq((await state()).index, 0, 'stepping past the last item wraps to the first');
} finally {
  await close();
}

const r = t.report();
process.exit(r.ok ? 0 : 1);
