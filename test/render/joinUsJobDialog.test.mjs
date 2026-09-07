import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { JobDetailModal } from '@/components/join-us/OpenPositionsSection';
import { __scrollLockDepth } from '@/hooks/useBodyScrollLock';

/**
 * The /join-us job detail dialog: where it mounts, and what tier it paints in.
 *
 * ══ WHY THIS TIER MOUNTS INTO JSDOM ═════════════════════════════════════════
 * The component portals to <body>, and the server renderer throws on portals
 * ("Portals are not currently supported by the server renderer"). The claim
 * this file exists for — "the overlay's parent is <body>, not the section it
 * was written in" — is a claim about the DOM tree, which a static string cannot
 * answer at all. Same shape as test/render/imageLightbox, which portals too.
 *
 * ── WHAT WAS MEASURED IN A REAL BROWSER, AND WHAT THIS REPLACES ─────────────
 * The three reported symptoms were reproduced over CDP against `next dev` at
 * 1440x900 before any change: the header (z-60) painted over the overlay
 * (z-50), the panel's top (45px) sat above the header's bottom (81px), and
 * `elementFromPoint` over each floating-dock child returned that child rather
 * than the dim. The dialog is now on 9700 and portalled.
 *
 * That re-measurement could NOT be repeated after the change: the Atlas
 * credential this machine uses started returning `bad auth` mid-session and
 * /join-us began 500ing, so the page has no job cards to click. Everything
 * below is therefore a DOM-level check, and the report says plainly which
 * claims are still browser-unverified.
 */

const JOB = {
  _id: 'job-1',
  title: 'Data Analyst',
  department: 'Data',
  location: 'กรุงเทพฯ',
  employmentType: 'full-time',
  description: 'ทำงานกับข้อมูล',
  responsibilities: ['วิเคราะห์ข้อมูล'],
  qualifications: ['ปริญญาตรี'],
  benefits: ['ประกันสุขภาพ'],
  applyEmail: 'jobs@9expert.co.th',
};

/**
 * Drive the component against a real DOM, FULLY SYNCHRONOUSLY.
 *
 * THE GLOBAL SWAP MUST NEVER YIELD. test/run.mjs runs files with
 * `isolation: 'none'` AND `concurrency: true` — one process, many files
 * interleaved — so an `await` taken while `globalThis.document` is swapped
 * hands a foreign document to whatever else is mid-flight. The first draft of
 * test/render/imageLightbox did exactly that and took out 22 unrelated tests in
 * another file. Copied from there rather than re-derived, for that reason.
 */
function withDom(run, props = {}) {
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
  // A SECOND, INDEPENDENT ROOT — the ref-count test needs two overlays that can
  // be closed in either order, and two components in one root would unmount
  // together. It is created lazily so the tests that never use it pay nothing
  // and, more to the point, do not silently hold a second lock.
  let second = null;
  const api = {
    dom,
    doc: dom.window.document,
    calls: { close: 0 },
    render(extra = {}) {
      flushSync(() =>
        root.render(createElement(JobDetailModal, {
          job: JOB,
          onClose() { api.calls.close += 1; },
          ...props,
          ...extra,
        })),
      );
    },
    unmount() {
      flushSync(() => root.render(null));
    },
    /** A second overlay stacked over the first, in its own React root. */
    renderSecond(extra = {}) {
      const host = dom.window.document.createElement('div');
      dom.window.document.body.appendChild(host);
      second = createRoot(host);
      flushSync(() =>
        second.render(createElement(JobDetailModal, {
          job: { ...JOB, _id: 'job-2', title: 'Second Overlay' },
          onClose() {},
          ...extra,
        })),
      );
    },
    unmountSecond() {
      flushSync(() => second.render(null));
    },
  };
  try {
    return run(api);
  } finally {
    // Unmount INSIDE the swap — React touches `document` during teardown, and
    // doing it after the restore throws on a detached tree. The second root
    // goes first so the lock depth unwinds in the order it was taken.
    try { if (second) flushSync(() => second.unmount()); } catch { /* already torn down */ }
    try { flushSync(() => root.unmount()); } catch { /* already torn down */ }
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.requestAnimationFrame = prev.raf;
  }
}

/**
 * The overlay, located by ROLE ALONE.
 *
 * Not `[role="dialog"][aria-modal="true"]`, and the difference was measured
 * rather than reasoned: with the compound selector, deleting `aria-modal`
 * reddened NINE tests — the portal, the tier, the dim, the backdrop, focus —
 * because every one of them starts by finding the element. A failure list like
 * that says "the dialog is broken" when what is broken is one attribute, and it
 * would send the next reader looking at the portal.
 *
 * `aria-modal` is the SUBJECT of one assertion below, so it must not also be
 * part of how everything else finds the element. The role is the structural
 * anchor; the properties are what get tested.
 */
const overlayEl = (doc) => doc.querySelector('[role="dialog"]');

// ── the portal ──────────────────────────────────────────────────────────────
test('the dialog mounts on <body>, not inside the section it is written in', () => {
  withDom((m) => {
    m.render();
    const overlay = overlayEl(m.doc);
    assert.ok(overlay, 'no dialog rendered at all');
    assert.equal(overlay.parentElement, m.doc.body,
      `the overlay's parent is <${overlay.parentElement.tagName.toLowerCase()}>, not <body> — `
      + 'a portal is what keeps a fixed, high-z overlay out of reach of an ancestor '
      + 'stacking context');
    // …and it really did leave the React root behind, rather than <body> being
    // the root by coincidence in this fixture.
    const root = m.doc.getElementById('root');
    assert.equal(root.querySelector('[role="dialog"]'), null,
      'the dialog is still inside the mount point — createPortal did not take effect');
  });
});

test('the dialog paints in the overlay tier, above the header and the dock', () => {
  withDom((m) => {
    m.render();
    const cls = overlayEl(m.doc).getAttribute('class');
    assert.match(cls, /(^|\s)z-\[9700\](\s|$)/,
      `the overlay's z token is "${cls}". The tier is asserted against the ladder in `
      + 'test/pure/zIndexStack; this is the class the component actually ships');
    assert.ok(!/(^|\s)z-50(\s|$)/.test(cls),
      'the overlay is back on z-50: it ties with the floating dock, which is mounted '
      + 'later from the root layout and therefore wins, and it loses outright to the '
      + 'header at z-60');
    assert.match(cls, /(^|\s)fixed(\s|$)/, 'the overlay is not fixed');
    assert.match(cls, /(^|\s)inset-0(\s|$)/, 'the overlay does not cover the viewport');
  });
});

test('the dim covers the whole viewport, so the chrome underneath is dimmed too', () => {
  // The reported symptom was not only "the dock is clickable" — it was that the
  // header and both dock buttons rendered FULLY BRIGHT over the dim, which is
  // what a viewport-covering backdrop below them looks like. inset-0 plus the
  // tier is the whole of it.
  withDom((m) => {
    m.render();
    const cls = overlayEl(m.doc).getAttribute('class');
    assert.match(cls, /bg-black\/60/, 'the backdrop has no dim');
  });
});

// ── the scroll lock ─────────────────────────────────────────────────────────
test('opening the dialog locks the document, closing it releases', () => {
  withDom((m) => {
    assert.equal(m.doc.body.style.overflow, '', 'the body was locked before anything opened');
    m.render();
    assert.equal(m.doc.body.style.overflow, 'hidden', 'the page behind can still scroll');
    m.unmount();
    assert.equal(m.doc.body.style.overflow, '', 'the page is still locked after closing');
  });
});

test('the lock RESTORES what it found, rather than clearing the body outright', () => {
  // THE BUG THIS REPLACED. The dialog used to write `overflow = ""` on cleanup.
  // With any other overlay already holding the body — the chat panel, the
  // mobile drawer and the schedule sheet all lock it inline — closing this
  // dialog unlocked the page underneath the one still open, which is the
  // "page behind keeps scrolling" half of the report.
  withDom((m) => {
    m.doc.body.style.overflow = 'hidden'; // stand in for the other overlay
    m.render();
    assert.equal(m.doc.body.style.overflow, 'hidden');
    m.unmount();
    assert.equal(m.doc.body.style.overflow, 'hidden',
      'the dialog cleared a lock it did not take — the surface underneath is now scrollable');
  });
});

test('REF-COUNTED: two overlays, and closing one does not unlock the page', () => {
  // The assertion the whole rewrite is for, and the one a DOM-only test cannot
  // make: with a single overlay open, a boolean lock and a counted lock produce
  // byte-identical DOM. Two open, one closed, is where they diverge.
  //
  // Two real dialogs rather than two calls to the hook: the claim is about what
  // happens when two COMPONENTS hold the lock, and a direct hook call would not
  // exercise the effect cleanup that releases it.
  withDom((m) => {
    const before = __scrollLockDepth();
    m.render();                       // first dialog
    m.renderSecond();                 // second overlay over it
    assert.equal(__scrollLockDepth(), before + 2, 'the two locks did not both count');
    assert.equal(m.doc.body.style.overflow, 'hidden');

    m.unmountSecond();                // close the second one only
    assert.equal(__scrollLockDepth(), before + 1, 'the count did not come back down');
    assert.equal(
      m.doc.body.style.overflow, 'hidden',
      'closing the SECOND overlay unlocked the page while the first is still open — '
      + 'the lock is a boolean, not a reference count',
    );

    m.unmount();                      // now the first
    assert.equal(__scrollLockDepth(), before, 'the count did not return to where it started');
    assert.equal(m.doc.body.style.overflow, '', 'the last release did not restore');
  });
});

test('the lock is released when the component unmounts WHILE open', () => {
  // Not the same as "closing releases": a route change, a parent re-render that
  // drops the branch, or an error boundary all unmount without the close path
  // ever running. The effect cleanup is what has to carry it.
  const depthBefore = __scrollLockDepth();
  withDom((m) => {
    m.render();
    assert.equal(m.doc.body.style.overflow, 'hidden');
    // …and fall out of withDom, whose finally-block unmounts the root.
  });
  assert.equal(__scrollLockDepth(), depthBefore,
    'the dialog was torn down while open and never gave the lock back');
});

test('the gutter is compensated, and it is MEASURED rather than assumed', () => {
  // A hard-coded 15px would be wrong on every overlay-scrollbar platform — it
  // would introduce the very shift it is meant to prevent. jsdom reports
  // innerWidth === clientWidth, so the measured gutter here is 0 and the
  // padding must be left alone; the assertion is that nothing was invented.
  withDom((m) => {
    const gutter = m.dom.window.innerWidth - m.doc.documentElement.clientWidth;
    m.render();
    if (gutter > 0) {
      assert.equal(m.doc.body.style.paddingRight, `${gutter}px`);
    } else {
      assert.equal(m.doc.body.style.paddingRight, '',
        'padding was added for a scrollbar that takes no layout width');
    }
    m.unmount();
    assert.equal(m.doc.body.style.paddingRight, '', 'the padding was not restored');
  });
});

test('the scroll position survives the dialog', () => {
  // `overflow: hidden` preserves it, unlike the position:fixed body trick. The
  // hook snapshots and restores anyway so the promise does not rest on which
  // technique is in use — this asserts the promise, not the technique.
  withDom((m) => {
    m.dom.window.scrollY = 640;
    m.render();
    m.unmount();
    assert.equal(m.dom.window.scrollY, 640, 'the page moved while the dialog was open');
  });
});

// ── dialog semantics ────────────────────────────────────────────────────────
//
// role / aria-modal / aria-label, Escape and backdrop-dismiss were ALL ALREADY
// PRESENT and were verified in Chrome before anything changed — Escape closed
// the dialog, a backdrop click closed it. They are asserted here anyway,
// because this round moved the overlay into a portal and rewrote the effects
// around them, and an assertion is the only thing that says a working behaviour
// was carried across rather than lost in the move.
//
// FOCUS was the half that was missing, and that was measured too:
// `overlay.contains(document.activeElement)` was false with the dialog open —
// focus sat on the ดูรายละเอียด button behind it — and after a backdrop
// dismiss it was on <body>.

test('the container declares itself a modal dialog, with a name', () => {
  withDom((m) => {
    m.render();
    const overlay = overlayEl(m.doc);
    assert.equal(overlay.getAttribute('role'), 'dialog');
    assert.equal(overlay.getAttribute('aria-modal'), 'true');
    const label = overlay.getAttribute('aria-label');
    assert.ok(label && label.trim().length > 0, `the dialog has aria-label="${label}"`);
    assert.match(label, /Data Analyst/, 'the name does not say WHICH position');
  });
});

test('Escape closes it', () => {
  withDom((m) => {
    m.render();
    assert.equal(m.calls.close, 0);
    m.doc.dispatchEvent(new m.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(m.calls.close, 1, 'Escape did not reach the handler');
  });
});

test('a click on the backdrop closes it, and a click inside the panel does not', () => {
  // Both halves, because the second is what makes the first safe: an overlay
  // that closes on any bubbled click would shut every time someone selected
  // text in the description or pressed the apply button.
  withDom((m) => {
    m.render();
    const overlay = overlayEl(m.doc);
    const panel = overlay.firstElementChild;
    const click = (el) =>
      el.dispatchEvent(new m.dom.window.MouseEvent('click', { bubbles: true }));

    click(panel);
    assert.equal(m.calls.close, 0, 'clicking inside the dialog closed it');
    click(overlay);
    assert.equal(m.calls.close, 1, 'clicking the backdrop did not close it');
  });
});

test('focus moves INTO the dialog when it opens', () => {
  withDom((m) => {
    m.render();
    const overlay = overlayEl(m.doc);
    assert.ok(
      overlay.contains(m.doc.activeElement),
      `focus is on <${m.doc.activeElement?.tagName?.toLowerCase()}>, outside the dialog — `
      + 'a keyboard user tabs through the page underneath an aria-modal element',
    );
    // The panel, not the close button: a screen reader should hear the dialog
    // and its contents, not "ปิด".
    assert.equal(m.doc.activeElement, overlay.firstElementChild);
    assert.equal(overlay.firstElementChild.getAttribute('tabindex'), '-1',
      'the panel is focusable only because it is a tab stop, which it should not be');
  });
});

test('focus returns to the button that opened it', () => {
  withDom((m) => {
    // Stand in for the ดูรายละเอียด button the section captures at click time.
    const trigger = m.doc.createElement('button');
    trigger.textContent = 'ดูรายละเอียด';
    m.doc.body.appendChild(trigger);
    trigger.focus();
    assert.equal(m.doc.activeElement, trigger);

    m.render({ returnFocusRef: { current: trigger } });
    assert.notEqual(m.doc.activeElement, trigger, 'focus never left the trigger');
    m.unmount();
    assert.equal(m.doc.activeElement, trigger,
      'focus did not come back to the trigger — a keyboard user is returned to the '
      + 'top of the document instead of to the card they opened');
  });
});

test('a missing returnFocusRef does not throw — the dialog still closes', () => {
  // The ref is threaded from the section, so every real mount has one. This is
  // about the shape being safe rather than about a call site: an optional chain
  // that someone "simplifies" is how a cleanup starts throwing during unmount,
  // which React reports as an error in an unrelated component.
  withDom((m) => {
    m.render({ returnFocusRef: undefined });
    assert.ok(overlayEl(m.doc));
    m.unmount();
    assert.equal(overlayEl(m.doc), null);
  });
});

test('the panel is its own scroll region, and the apply button is pinned to it', () => {
  // The fit half of the fix: the dialog has to sit inside the viewport with its
  // own internal scroll, not run off either edge. dvh rather than vh because on
  // mobile `vh` is the URL-bar-hidden viewport, and 90vh of that can put the
  // pinned button under the browser chrome.
  //
  // ── THIS ASSERTION USED TO NAME THE WRONG ELEMENT ─────────────────────────
  // It read `overflow-y-auto` off the PANEL, which was true when the panel was
  // one scrolling box. The panel has since become a flex COLUMN with four
  // children — accent bar, header, body, footer — and the scrolling moved to
  // the body: the panel is `overflow-hidden` and clips, the body is
  // `min-h-0 flex-1 overflow-y-auto` and scrolls.
  //
  // That is a better structure and the test was simply pointing at the old one,
  // so the fix is to follow the behaviour rather than to argue with it. The
  // CLAIM is unchanged and is what the name still says: the dialog scrolls
  // inside itself. Only the element carrying it moved.
  withDom((m) => {
    m.render();
    const panel = overlayEl(m.doc).firstElementChild;
    const cls = panel.getAttribute('class');

    // The panel is the CAP and the clip — it must not scroll itself, or the
    // header and the pinned footer scroll away with the content.
    assert.match(cls, /max-h-\[90dvh\]/, `the panel is capped with "${cls}"`);
    assert.ok(!/max-h-\[90vh\]/.test(cls),
      'vh is the large viewport on mobile — the pinned button can land under the URL bar');
    assert.match(cls, /overflow-hidden/, `the panel no longer clips: "${cls}"`);
    assert.match(cls, /flex-col/, 'the panel is not a column, so nothing can be pinned below the scroller');

    // The BODY is the scroll region. Located as the panel's own child carrying
    // `flex-1`, not by index: a fifth child added to the column would silently
    // move an index-based selector onto the wrong element.
    const body = [...panel.children].find((el) =>
      /(^|\s)flex-1(\s|$)/.test(el.getAttribute('class') ?? ''));
    assert.ok(body, 'no growing child in the panel — nothing is the scroll region');
    const bodyCls = body.getAttribute('class');
    assert.match(bodyCls, /overflow-y-auto/, `the body does not scroll: "${bodyCls}"`);
    assert.match(bodyCls, /min-h-0/,
      'without min-h-0 a flex child refuses to shrink below its content and the panel overflows instead');

    // The apply button is pinned BECAUSE it is a sibling of the scroller rather
    // than inside it — that is what the column buys. The `sticky` class is still
    // on it and is asserted, but it is no longer what does the pinning.
    const apply = [...panel.querySelectorAll('a')].find((a) => (a.getAttribute('href') ?? '').startsWith('mailto:'));
    assert.ok(apply, 'no apply link in the dialog');
    const footer = apply.parentElement;
    assert.equal(footer.parentElement, panel,
      'the apply button moved INSIDE the scroll region — it will scroll away with the content');
    assert.match(footer.getAttribute('class'), /sticky/);
  });
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the lock depth really moves — the counter is not stuck', () => {
  // Every ref-count assertion above is relative to `before`. If
  // __scrollLockDepth() returned a constant, all of them would compare a
  // constant against a constant plus one and fail — but a version that always
  // returned the RIGHT number without the body ever changing would slip
  // through, so the DOM side is re-asserted here against the same mount.
  withDom((m) => {
    const a = __scrollLockDepth();
    m.render();
    const b = __scrollLockDepth();
    assert.equal(b, a + 1, 'mounting a dialog did not raise the depth');
    assert.equal(m.doc.body.style.overflow, 'hidden', 'the depth rose but the body did not lock');
    m.unmount();
    assert.equal(__scrollLockDepth(), a, 'unmounting did not lower the depth');
  });
});

test('CONTROL: the harness really mounts, and really reads the portalled tree', () => {
  // Every assertion above is a lookup in `m.doc`. If the render never happened,
  // `overlayEl` would return null and the first assertion would say so — but
  // the class assertions would throw a TypeError rather than fail readably, and
  // a "does not contain z-50" check would pass against nothing.
  withDom((m) => {
    assert.equal(overlayEl(m.doc), null, 'something rendered before render() was called');
    m.render();
    assert.ok(overlayEl(m.doc), 'render() produced no dialog');
    assert.match(m.doc.body.innerHTML, /Data Analyst/, 'the job did not reach the markup');
    m.unmount();
    assert.equal(overlayEl(m.doc), null, 'the dialog survived unmounting');
  });
});
