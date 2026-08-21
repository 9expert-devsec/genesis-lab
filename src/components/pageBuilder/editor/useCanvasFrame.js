'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The canvas's iframe: its document, its styles, and its theme.
 *
 * ── WHY A FRAME AT ALL ────────────────────────────────────────────────────
 * Tailwind's sm:/md:/lg: compile to VIEWPORT media queries, and a media query
 * asks the browser window rather than the box an element sits in. The device
 * toggle used to be an outer max-width, so it changed none of them: at 390px a
 * three-column grid still drew three columns, headings kept their desktop size,
 * and settings.visibility INVERTED — a mobile_only section vanished from
 * "มือถือ" while a desktop_only one appeared. A frame has its own viewport, so
 * the same queries resolve against the width the author chose.
 *
 * The published page is untouched by this: presets.js's class maps are the same
 * strings, rendered by the same SectionRenderer. Only the box they are measured
 * against changed.
 *
 * ── THE FRAME IS FIXED-HEIGHT AND SCROLLS ITSELF, DELIBERATELY ────────────
 * There is no ResizeObserver here and none is wanted. Sizing a frame to its
 * content is the one part of this work with an unbounded failure mode: the
 * height feeds back into the layout that produced it, and `advanced.customHtml`
 * lets an author put `100vh` inside the box whose height is being derived from
 * its contents. A frame pinned to its column cannot have that bug, because the
 * mechanism that causes it is never built.
 *
 * The cost is a second scrollbar. That is accepted — a real phone scrolls its
 * own viewport too, so the preview is more faithful for having one, not less.
 *
 * ── WHAT THIS HOOK OWNS ───────────────────────────────────────────────────
 * Everything a fresh `about:blank` document lacks and the canvas needs:
 *   1. the document itself, as state, so the portal can render once it exists
 *   2. the app's stylesheets, cloned from the parent at RUNTIME
 *   3. the root class list, mirrored — which is fonts AND theme (see below)
 *   4. a margin reset, because a fresh document has the UA's 8px body margin
 *
 * It owns no React tree. CanvasPanel portals into `frameDoc.body`, which keeps
 * ONE React root in the parent — so `useEditor()`, `dispatch` and `resolvedData`
 * stay in scope and there is no message passing anywhere in this feature.
 */

/**
 * Clone the parent's stylesheet links into the frame.
 *
 * ── BY RUNTIME HREF, NEVER A BUILD PATH ───────────────────────────────────
 * The app ships one stylesheet, and its URL is not a constant: in development
 * Next stamps a cache-busting query onto it and restamps it on every CSS edit,
 * and a production build hashes the filename. Reading `link.href` off the
 * parent gets whichever is current without this file knowing that either scheme
 * exists.
 *
 * `link.href` is the ABSOLUTE resolved URL, which matters: the frame is
 * `about:blank`, and a relative href written into it would be resolved against
 * a base URL that is not worth reasoning about.
 *
 * Marked with an attribute so a re-sync can tell its own clones from anything
 * else in the frame's head, and remove the ones that no longer exist upstream —
 * a stale sheet left behind after an HMR restamp would keep applying the old
 * rules on top of the new ones.
 */
const CLONE_MARK = 'data-pb-cloned';

/**
 * Both documents are named parameters rather than one of them being the
 * ambient global. The function's whole job is "copy from that document to this
 * one", so saying which is which at the call site is the clearer shape — and it
 * is what lets these be exercised against two constructed documents instead of
 * whatever `document` happens to be.
 */
export function syncStylesheets(frameDoc, sourceDoc) {
  const want = [...sourceDoc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
  const wanted = new Set(want);
  const mine = [...frameDoc.head.querySelectorAll(`link[${CLONE_MARK}]`)];

  for (const link of mine) {
    if (!wanted.has(link.href)) link.remove();
  }
  const have = new Set(
    [...frameDoc.head.querySelectorAll(`link[${CLONE_MARK}]`)].map((l) => l.href)
  );
  for (const href of want) {
    if (have.has(href)) continue;
    const link = frameDoc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(CLONE_MARK, '');
    frameDoc.head.appendChild(link);
  }
}

/**
 * Mirror the parent's root class list onto the frame's.
 *
 * ── THIS IS TWO THINGS AT ONCE, AND MISSING IT IS SILENT ──────────────────
 * FONTS. next/font emits its faces under generated family names and exposes
 * them ONLY through custom properties, which are defined ONLY by generated
 * classes on the parent's root element. The Tailwind stacks name a human family
 * first and reach the real face through the property second — and the human
 * name is not a face anyone has installed. Without these classes the frame
 * silently loses both self-hosted families and falls back to a system sans,
 * which changes every Thai metric in the canvas while looking merely "a bit
 * off".
 *
 * THEME. next-themes writes its class onto the same element, so mirroring the
 * whole list carries dark mode for free. The admin sidebar has a live toggle,
 * so this cannot be a mount-time copy — see the observer in the hook.
 *
 * Assigning the whole string rather than diffing: it is one attribute write,
 * and the parent's root is the only source either way.
 */
export function syncRootClass(frameDoc, sourceDoc) {
  frameDoc.documentElement.className = sourceDoc.documentElement.className;
}

/**
 * A fresh document has the user agent's body margin and no page background.
 * Injected as one element rather than an inline style so it sits with the
 * cloned sheets and is as easy to find in the frame's head.
 */
const RESET_MARK = 'data-pb-reset';
const RESET_CSS = 'html,body{margin:0;padding:0}body{min-height:100%}';

export function injectReset(frameDoc) {
  if (frameDoc.head.querySelector(`style[${RESET_MARK}]`)) return;
  const style = frameDoc.createElement('style');
  style.setAttribute(RESET_MARK, '');
  style.textContent = RESET_CSS;
  frameDoc.head.appendChild(style);
}

export function useCanvasFrame() {
  const frameRef = useRef(null);
  // State, not a ref: the portal must re-render when the document appears, and
  // a ref mutation would not schedule that.
  const [frameDoc, setFrameDoc] = useState(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    let cancelled = false;

    /**
     * A src-less iframe is `about:blank` and its document is normally readable
     * immediately — but "normally" is not a contract, and the document can be
     * replaced once after creation. So the document is taken whenever it is
     * available AND on load, and the setter is idempotent: React bails out of a
     * state update to the same object, so a second call costs nothing.
     */
    const attach = () => {
      if (cancelled) return;
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      injectReset(doc);
      syncStylesheets(doc, document);
      syncRootClass(doc, document);
      setFrameDoc(doc);
    };

    attach();
    frame.addEventListener('load', attach);

    /**
     * ── BOTH OBSERVERS ARE ALWAYS ON, NOT GATED TO DEVELOPMENT ────────────
     * The stylesheet one exists because Next replaces the sheet on every CSS
     * edit in dev, which is a development-only event — so gating it there is
     * tempting. It is not done, for two reasons:
     *
     *   the App Router can add a route's stylesheet on a client navigation in
     *   PRODUCTION too, and a frame holding only what was in the head at mount
     *   would miss it;
     *
     *   and a branch that runs only in development means the production build
     *   takes a path nobody has ever exercised. A conditional here would make
     *   the two builds differ in the one place this feature is most fragile.
     *
     * The cost of leaving them on is a MutationObserver that fires when the
     * head changes, which in production is approximately never.
     */
    const headObserver = new MutationObserver(() => {
      const doc = frame.contentDocument;
      if (doc && doc.head) syncStylesheets(doc, document);
    });
    headObserver.observe(document.head, { childList: true, subtree: true });

    // The theme toggle in the admin sidebar rewrites this attribute while the
    // editor is open, so the mirror has to be live rather than a copy taken at
    // mount — otherwise the canvas keeps whichever theme it was born in.
    const rootObserver = new MutationObserver(() => {
      const doc = frame.contentDocument;
      if (doc && doc.documentElement) syncRootClass(doc, document);
    });
    rootObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['class'],
    });

    return () => {
      cancelled = true;
      frame.removeEventListener('load', attach);
      headObserver.disconnect();
      rootObserver.disconnect();
    };
  }, []);

  return { frameRef, frameDoc };
}
