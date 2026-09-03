import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

/**
 * The shared image lightbox: how it closes, and what it restores when it does.
 *
 * ── WHY THIS TIER MOUNTS INTO JSDOM INSTEAD OF renderToStaticMarkup ────────
 * The component portals to <body>, and the server renderer throws on portals
 * ("Portals are not currently supported by the server renderer"). Every claim
 * here is also about BEHAVIOUR — a keydown, a click, a style being restored —
 * which a static string cannot answer at all. So it runs a real React root in
 * a real DOM, the way test/render/imageNodeViewButton already does.
 *
 * ── ONE TEST PER CLOSE PATH, NOT ONE LOOP OVER THREE ───────────────────────
 * There are three ways out (button, Escape, backdrop) and each must release
 * the body scroll lock. A single looping test fails on whichever path it
 * reaches first, so a broken Escape handler and a broken backdrop handler
 * produce the same red. Named separately, the failure says which one.
 *
 * ── AND WHAT THAT SPLIT CANNOT DO, SAID PLAINLY ────────────────────────────
 * The three RELEASE assertions are not independently falsifiable. All three
 * paths unlock through the same `useBodyScrollLock(open)` cleanup, so there is
 * no edit that breaks exactly one of them — deleting the hook reddens all
 * three at once, which is what was measured. That is case (2) in test/run.mjs's
 * header ("the two claims genuinely are not separable, and the honest move is
 * to SAY SO rather than manufacture independence"), so it is recorded instead
 * of being dressed up.
 *
 * What the split still buys is real: a refactor that gave one path its own
 * teardown would break exactly one of these and the name would point at it.
 * The CLOSE tests above them ARE independently falsifiable — removing the
 * Escape handler, the image's stopPropagation and the plate wrapper's
 * stopPropagation were each verified to redden exactly one named test.
 */

const IMG = { src: 'https://res.cloudinary.com/x/roadmap.png', alt: 'Power BI Roadmap' };

/**
 * Drive the component against a real DOM, FULLY SYNCHRONOUSLY.
 *
 * ── THE GLOBAL SWAP MUST NEVER YIELD, AND THAT IS THE WHOLE DESIGN ─────────
 * React DOM needs global `window`/`document`, so this swaps them the way
 * test/render/imageNodeViewButton does. test/run.mjs:214 runs files with
 * `isolation: 'none'` AND `concurrency: true` — one process, many files
 * interleaved — so any `await` taken WHILE the globals are swapped hands a
 * foreign document to whatever else is mid-flight.
 *
 * The first draft of this file did exactly that (an `await` between render and
 * assert). It passed alone and, in the suite, took out all 16 of its own tests
 * AND 22 unrelated ones in the schedule-filter-sheet file: 23 red became 50.
 * Same defect as the `globalThis.fetch` swap fixed in e9094ec, one tier down.
 *
 * So every mount here is synchronous end to end. `flushSync` is what makes that
 * possible, verified to run the effects this component depends on before it
 * returns: the portal is in the DOM, `useBodyScrollLock` has set
 * `overflow: hidden`, and focus has moved to the close button.
 */
function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
  });
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

  const root = createRoot(dom.window.document.getElementById('root'));
  const api = {
    dom,
    doc: dom.window.document,
    /** Render (or re-render) and flush, effects included. */
    render(props = {}) {
      flushSync(() =>
        root.render(createElement(ImageLightbox, { image: IMG, onClose() {}, ...props }))
      );
    },
  };
  try {
    return run(api);
  } finally {
    // Unmount INSIDE the swap — React touches `document` during teardown, and
    // doing it after the restore throws on a detached tree.
    try { flushSync(() => root.unmount()); } catch { /* already torn down */ }
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.requestAnimationFrame = prev.raf;
  }
}

const overlay = (doc) => doc.querySelector('[role="dialog"]');
const closeButton = (doc) =>
  [...doc.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'ปิด');
const picture = (doc) => doc.querySelector(`img[src="${IMG.src}"]`);

/** A click that really bubbles, so the backdrop's handler can see it. */
const click = (el) =>
  el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));

/**
 * The plate wrapper, matched on its own element — NOT on a bare `bg-white`.
 *
 * Searched at ANY depth under the dialog rather than as a direct child: the
 * close control now has its own row and the picture sits in a centring stage,
 * so the plate is a grandchild. Anchoring on depth would have made this
 * selector a second thing to keep in step with the layout.
 */
const plateEl = (doc) =>
  [...doc.querySelectorAll('[role="dialog"] div')].find((d) =>
    /(^|\s)bg-white(\s|$)/.test(d.getAttribute('class') ?? '')
  );

// ── it opens ───────────────────────────────────────────────────────────────

test('an image opens the overlay, portalled to <body>', () => {
  withDom((m) => {
    m.render();
    const o = overlay(m.doc);
    assert.ok(o, 'overlay rendered');
    assert.equal(o.parentElement, m.doc.body, 'portalled to body, not the mount div');
    assert.equal(o.getAttribute('aria-modal'), 'true');
    assert.equal(o.getAttribute('aria-label'), IMG.alt);
  });
});

test('CONTROL: a null image renders no overlay at all', () => {
  withDom((m) => {
    m.render({ image: null });
    assert.equal(overlay(m.doc), null);
  });
});

test('focus moves to the close control on open', () => {
  withDom((m) => {
    m.render();
    assert.equal(m.doc.activeElement, closeButton(m.doc));
  });
});

// ── the three close paths ──────────────────────────────────────────────────

test('the close control closes', () => {
  /*
   * MEASURED, AND DELIBERATELY NOT ASSERTED AS EXACTLY ONE: the close button
   * sits inside the backdrop and does not stop propagation, so a click on it
   * invokes `onClose` TWICE — once from the button, once from the backdrop it
   * bubbles to. Both callers pass an idempotent `setState(null)`, so it is
   * harmless, and it is the behaviour that shipped on /articles.
   *
   * Recorded rather than fixed: the commit that moved this component promised
   * /articles behaves byte-identically, and a stopPropagation would be a
   * behaviour change smuggled into a move. This comment is where the reason
   * lives if it is ever worth tightening.
   */
  withDom((m) => {
    let closed = 0;
    m.render({ onClose: () => { closed += 1; } });
    click(closeButton(m.doc));
    assert.ok(closed >= 1, 'the close control invokes onClose');
    assert.equal(closed, 2, 'and twice, via the backdrop — see the note above');
  });
});

test('Escape closes', () => {
  withDom((m) => {
    let closed = 0;
    m.render({ onClose: () => { closed += 1; } });
    m.doc.dispatchEvent(new m.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(closed, 1);
  });
});

test('a click on the BACKDROP closes', () => {
  withDom((m) => {
    let closed = 0;
    m.render({ onClose: () => { closed += 1; } });
    click(overlay(m.doc));
    assert.equal(closed, 1);
  });
});

test('a click on the IMAGE does NOT close', () => {
  withDom((m) => {
    let closed = 0;
    m.render({ onClose: () => { closed += 1; } });
    click(picture(m.doc));
    assert.equal(closed, 0, 'the picture stops propagation');
  });
});

test('a click on the image does not close WITH the plate either', () => {
  // The plate adds a wrapper between the backdrop and the <img>; without its
  // own stopPropagation the click would reach the backdrop through it.
  withDom((m) => {
    let closed = 0;
    m.render({ plate: true, onClose: () => { closed += 1; } });
    click(picture(m.doc));
    assert.equal(closed, 0);
  });
});

test('CONTROL: a key that is not Escape does nothing', () => {
  withDom((m) => {
    let closed = 0;
    m.render({ onClose: () => { closed += 1; } });
    m.doc.dispatchEvent(new m.dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    assert.equal(closed, 0);
  });
});

// ── scroll lock, one test per release path ─────────────────────────────────

test('body scroll is LOCKED while open', () => {
  withDom((m) => {
    m.render();
    assert.equal(m.doc.body.style.overflow, 'hidden');
  });
});

test('scroll lock is released when closed via the CLOSE CONTROL', () => {
  withDom((m) => {
    m.render();
    assert.equal(m.doc.body.style.overflow, 'hidden');
    click(closeButton(m.doc));
    m.render({ image: null });
    assert.equal(m.doc.body.style.overflow, '', 'overflow restored after the button path');
  });
});

test('scroll lock is released when closed via ESCAPE', () => {
  withDom((m) => {
    m.render();
    assert.equal(m.doc.body.style.overflow, 'hidden');
    m.doc.dispatchEvent(new m.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    m.render({ image: null });
    assert.equal(m.doc.body.style.overflow, '', 'overflow restored after the Escape path');
  });
});

test('scroll lock is released when closed via the BACKDROP', () => {
  withDom((m) => {
    m.render();
    assert.equal(m.doc.body.style.overflow, 'hidden');
    click(overlay(m.doc));
    m.render({ image: null });
    assert.equal(m.doc.body.style.overflow, '', 'overflow restored after the backdrop path');
  });
});

test('CONTROL: the lock assertion is real — an open overlay does not report the released value', () => {
  withDom((m) => {
    m.render();
    assert.notEqual(
      m.doc.body.style.overflow, '',
      'if this were "" the three tests above would pass vacuously'
    );
  });
});

// ── the plate ──────────────────────────────────────────────────────────────

test('plate ON puts the image on an opaque white wrapper', () => {
  withDom((m) => {
    m.render({ plate: true });
    const p = plateEl(m.doc);
    assert.ok(p, 'plate wrapper rendered');
    assert.ok(p.contains(picture(m.doc)), 'the image sits inside it');
  });
});

test('CONTROL: plate OFF emits no plate, and the close button bg-white/10 is not mistaken for one', () => {
  withDom((m) => {
    m.render({ plate: false });
    assert.equal(plateEl(m.doc), undefined, 'no plate wrapper');
    // The trap this control exists for: a bare /bg-white/ match would hit the
    // close button and report a plate that is not there. It caught exactly that
    // in this file's first draft.
    assert.match(closeButton(m.doc).getAttribute('class'), /bg-white\/10/);
  });
});

test('the plate does NOT vary by theme, while the backdrop stays dark in both', () => {
  withDom((m) => {
    m.render({ plate: true });
    const cls = plateEl(m.doc).getAttribute('class');
    assert.ok(!/dark:/.test(cls), `the artwork's assumption does not change with the theme: ${cls}`);
    const backdrop = overlay(m.doc).getAttribute('class');
    assert.match(backdrop, /bg-black\/80/);
    assert.ok(!/dark:bg-/.test(backdrop), 'backdrop is dark unconditionally');
  });
});

test('the image is fit to the viewport and never cropped, in both plate modes', () => {
  /*
   * THE BOUND IS IN VIEWPORT UNITS, AND THAT IS THE FIX, NOT A STYLE CHOICE.
   *
   * `max-h-full` is `max-height: 100%`, which resolves against the containing
   * block's HEIGHT. The plate wrapper's height is `auto`, so the percentage
   * computed to `none` and the image was bounded on width only — it grew to
   * 1376x973 in an 800px-tall window. A bare <img> straight inside the
   * backdrop was fine, which is why /articles never showed it.
   *
   * Viewport units are definite whatever the ancestors do, so this holds in
   * both branches and cannot be broken by a future wrapper.
   */
  for (const plate of [false, true]) {
    withDom((m) => {
      m.render({ plate });
      const cls = picture(m.doc).getAttribute('class');
      assert.match(cls, /object-contain/, `plate=${plate}`);
      assert.ok(!/object-cover/.test(cls), `plate=${plate} must never crop`);
      assert.match(cls, /max-h-\[calc\(100vh-9rem\)\]/, `plate=${plate} height bound`);
      assert.match(cls, /max-w-\[calc\(100vw-6rem\)\]/, `plate=${plate} width bound`);
      assert.ok(
        !/max-h-full/.test(cls),
        `plate=${plate}: max-h-full resolves to none inside the plate — that was the bug`
      );
    });
  }
});

test('CONTROL: the fit assertion depends on the sizing classes, not on the element existing', () => {
  // Both halves against the real rendered class string: the bound that must be
  // there is there, and the bound that must NOT be there is absent. If the
  // matcher were inert, one of these two would not hold.
  withDom((m) => {
    m.render({ plate: true });
    const cls = picture(m.doc).getAttribute('class');
    assert.ok(/max-h-\[calc\(100vh-9rem\)\]/.test(cls), 'the viewport bound is present');
    assert.ok(!/max-h-full/.test(cls), 'and the percentage bound it replaced is gone');
    assert.ok(!/max-h-\[calc\(100vh-99rem\)\]/.test(cls), 'a wrong bound would not match');
  });
});

test('the close control cannot overlap the artwork: it has its own row above the stage', () => {
  /*
   * Measured in headless Chrome against the real compiled Tailwind, 5266x3724:
   *   before, 1440x800 -> picture 1376x973, overlapping the absolute ✕
   *   after,  1440x800 -> picture  928x656, no overlap, no scrollbars
   * and the same at 1920x600, 800x1200, 700x700 and 390x844.
   *
   * jsdom does no layout, so THIS tier cannot re-measure geometry. What it can
   * pin is the structure that makes the overlap impossible — the button is no
   * longer positioned over the backdrop, and it is a sibling BEFORE the stage.
   */
  withDom((m) => {
    m.render({ plate: true });
    const btn = closeButton(m.doc);
    assert.ok(!/absolute/.test(btn.getAttribute('class')), 'the button is not positioned over the picture');
    const row = btn.parentElement;
    const stage = row.nextElementSibling;
    assert.ok(stage, 'the stage follows the close row');
    assert.ok(stage.contains(picture(m.doc)), 'and the picture lives in the stage, not the close row');
    assert.match(stage.getAttribute('class'), /min-h-0/, 'the stage may shrink below its content');
  });
});
