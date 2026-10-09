import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Youtube from '@tiptap/extension-youtube';
import { articleEditorExtensions } from '@/components/admin/articleEditorExtensions';
// ADDED beside the statements above rather than folded into any — the standing
// rule in this repo.
import { YOUTUBE_EMBED_HOSTS } from '@/lib/editor/youtubeEmbed';
import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';
import { normalizeAuthoredColors } from '@/lib/articles/normalizeAuthoredColors';
import { wrapArticleTables } from '@/lib/articles/wrapArticleTables';
import { readSource } from '../sourceScan.mjs';

/**
 * LOAD → NO EDIT → SAVE, FOR EVERY EMBED SHAPE THE STORE ACTUALLY HOLDS.
 *
 * ── THE REPORTED BUG ───────────────────────────────────────────────────────
 * An admin inserts a video in /admin/articles, saves, reopens the article and
 * the video is gone from the editor — while the public page still plays it. The
 * next save writes the body without it, and then it is gone for real.
 *
 * ── WHY THIS TIER AND THIS INSTRUMENT ─────────────────────────────────────
 * The claim is about the editor's PARSE, and a parse is only observable by
 * parsing: `renderHTML` (what the extension emits) was never the broken half,
 * so a serialise-only check is green either way. So this mounts a REAL `Editor`
 * on a REAL DOM with the REAL extension list, seeds it with bytes copied out of
 * Mongo, and reads `getHTML()` back — which is literally what `submit` in
 * ArticleForm sends to the server. Same idiom and same jsdom justification as
 * test/render/imageNodeViewButton: globals installed and torn down
 * synchronously inside one helper, nothing awaited in between, so no other
 * file's module evaluation can see a `document` (see the header of
 * test/canvasFrameAttach.case.mjs for what happens when one can).
 *
 * ── THE FIXTURES ARE STORED BYTES, NOT INVENTED ONES ──────────────────────
 * Copied from a read-only census of all 499 articles (2026-10-09). 96 bodies
 * hold an `<iframe>`, 99 iframes total, EVERY src on `www.youtube-nocookie.com`
 * and no `<video>` element anywhere. Two shapes, split by whether the body was
 * saved before or after `sanitizeRichHtml` joined the save path:
 *
 *   A  37 iframes / 36 articles  `<div data-youtube-video=""><iframe …>`
 *   B  62 iframes / 60 articles  `<div><iframe …>`  ← the attribute stripped
 *
 * ── THE CONTROL IS THE POINT OF THIS FILE ─────────────────────────────────
 * `lostUnderStockYoutube` builds the same editor with the STOCK
 * `@tiptap/extension-youtube` node in place of ours, and asserts it still
 * loses shape B. Without it, every assertion below could pass for a reason
 * unrelated to the fix and nobody would know the file had stopped testing
 * anything.
 */

/** Every stored shape, verbatim from the census. */
const STORED = {
  // 6a26857728c7d8365e7a4a31 ประวัติศาสตร์-DATA — pre-sanitiser, parses today.
  wrapped:
    '<p>ก</p><div data-youtube-video=""><iframe width="640" height="360"'
    + ' allowfullscreen="true" autoplay="false" rel="1"'
    + ' src="https://www.youtube-nocookie.com/embed/euOPBynlh74?rel=1"'
    + ' start="0"></iframe></div><p>ข</p>',
  // 6a26857728c7d8365e7a4a31 DAX-Time-Intelligence — the 62-iframe shape.
  flattened:
    '<p>ก</p><div><iframe width="640" height="360" allowfullscreen="true"'
    + ' src="https://www.youtube-nocookie.com/embed/6RQ2NpRz1rs?rel=1">'
    + '</iframe></div><p>ข</p>',
  // 6a2be2c811375bd92dd83461 microsoft-ignite-ai-agent-future — same shape with
  // a start offset, which is a SECOND query parameter and the case most likely
  // to be mangled by a src rewrite on the way back out.
  flattenedWithStart:
    '<p>ก</p><div><iframe width="640" height="360" allowfullscreen="true"'
    + ' src="https://www.youtube-nocookie.com/embed/2U4lxHVIbRU?start=329&amp;rel=1">'
    + '</iframe></div>',
  // 6a2bd6e0dfc2ba785fcc7e0a รู้จักกับ-4-โหมดของ-power-bi — two in one body.
  twoFlattened:
    '<div><iframe width="640" height="360" allowfullscreen="true"'
    + ' src="https://www.youtube-nocookie.com/embed/jFJlNgOPnXM?rel=1"></iframe></div>'
    + '<p>คั่น</p>'
    + '<div><iframe width="640" height="360" allowfullscreen="true"'
    + ' src="https://www.youtube-nocookie.com/embed/p7nEwekj6M0?rel=1"></iframe></div>',
  // Not in the corpus today, but the shape left behind if a wrapper is ever
  // unwrapped rather than flattened — and the one a source-view paste produces.
  bare:
    '<p>ก</p><iframe width="640" height="360"'
    + ' src="https://www.youtube-nocookie.com/embed/6RQ2NpRz1rs?rel=1"></iframe>',
};

/**
 * Seed a real editor with `html`, change nothing, and return what a save would
 * send. Synchronous start to finish; the globals never outlive the call.
 */
function roundTrip(html, { extensions } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  const element = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: extensions ?? articleEditorExtensions(),
    content: html,
  });
  try {
    // Exactly what ArticleForm's `submit` reads out of the editor.
    return editor.getHTML();
  } finally {
    editor.destroy();
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.requestAnimationFrame = prev.raf;
  }
}

/** The same round trip with STOCK Youtube — the broken editor, for contrast. */
function lostUnderStockYoutube(html) {
  return roundTrip(html, {
    extensions: [
      StarterKit,
      Youtube.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
    ],
  });
}

/** Every `src` in the markup, in document order. */
const srcs = (html) => [...String(html).matchAll(/<iframe\b[^>]*\bsrc="([^"]*)"/gi)]
  .map((m) => m[1].replace(/&amp;/g, '&'));

// ── 1. EVERY STORED SHAPE SURVIVES, WITH ITS OWN src ───────────────────────

test('the WRAPPED shape survives a load → save round trip (37 stored iframes)', () => {
  const out = roundTrip(STORED.wrapped);
  assert.match(out, /<iframe/i, 'the video is gone from what a save would store');
  assert.deepEqual(srcs(out), ['https://www.youtube-nocookie.com/embed/euOPBynlh74?rel=1']);
  // The surrounding prose is still there — a parse fix that ate the paragraphs
  // would be a different data loss passing this file's headline assertion.
  assert.match(out, /ก/);
  assert.match(out, /ข/);
});

test('the FLATTENED shape survives — the 62 iframes the editor used to DROP', () => {
  const out = roundTrip(STORED.flattened);
  assert.match(out, /<iframe/i, 'the reported bug: the video is dropped on load');
  assert.deepEqual(srcs(out), ['https://www.youtube-nocookie.com/embed/6RQ2NpRz1rs?rel=1']);
  assert.match(out, /ก/);
  assert.match(out, /ข/);
});

test('a flattened embed keeps its ?start= offset, byte for byte', () => {
  /**
   * `renderHTML` recomputes the src through `getEmbedUrlFromYoutubeUrl`, which
   * returns its input untouched only because the url already contains
   * `/embed/`. If that short-circuit ever stops applying, every stored start
   * offset silently resets to 0 — a video that opens 5½ minutes early rather
   * than a video that is missing, which is the kind of regression nobody
   * reports.
   */
  const out = roundTrip(STORED.flattenedWithStart);
  assert.deepEqual(srcs(out), ['https://www.youtube-nocookie.com/embed/2U4lxHVIbRU?start=329&rel=1']);
});

test('TWO flattened embeds in one body both survive, in order', () => {
  const out = roundTrip(STORED.twoFlattened);
  assert.deepEqual(srcs(out), [
    'https://www.youtube-nocookie.com/embed/jFJlNgOPnXM?rel=1',
    'https://www.youtube-nocookie.com/embed/p7nEwekj6M0?rel=1',
  ]);
});

test('a BARE youtube iframe, with no wrapper at all, survives', () => {
  const out = roundTrip(STORED.bare);
  assert.deepEqual(srcs(out), ['https://www.youtube-nocookie.com/embed/6RQ2NpRz1rs?rel=1']);
});

// ── 2. THE CONTROL: the stock node still loses exactly these ───────────────

test('CONTROL — stock @tiptap/extension-youtube DROPS every flattened shape', () => {
  /**
   * If this test ever goes green-by-passing (i.e. the stock node starts keeping
   * them), the assertions above have stopped being evidence of anything this
   * repo did, and this file needs rewriting rather than trusting.
   */
  assert.doesNotMatch(
    lostUnderStockYoutube(STORED.flattened), /<iframe/i,
    'stock Youtube kept a flattened embed — the fix above is no longer what is being measured',
  );
  assert.doesNotMatch(lostUnderStockYoutube(STORED.flattenedWithStart), /<iframe/i);
  assert.doesNotMatch(lostUnderStockYoutube(STORED.bare), /<iframe/i);
  // And the control's own control: the wrapped shape was never the problem.
  assert.match(lostUnderStockYoutube(STORED.wrapped), /<iframe/i);
});

// ── 3. THE WIDENING DID NOT BECOME A GENERIC IFRAME NODE ──────────────────

test('a NON-youtube iframe is still not admitted by the article editor', () => {
  /**
   * The second parse rule matches the `iframe` TAG and rejects in `getAttrs`,
   * so the thing that keeps it narrow is a predicate rather than a selector. A
   * predicate that stopped rejecting would turn this editor into one that can
   * author any iframe — past `sanitizeRichHtml`'s host allow-list, which is the
   * boundary that decides what renders.
   */
  const out = roundTrip('<p>ก</p><div><iframe src="https://docs.google.com/forms/d/e/x/viewform"></iframe></div>');
  assert.doesNotMatch(out, /<iframe/i);
  assert.doesNotMatch(out, /google\.com/i);
});

test('a look-alike host is not admitted either', () => {
  for (const src of [
    'https://evilyoutube.com/embed/abc',
    'https://www.youtube.com.attacker.test/embed/abc',
    'https://youtube-nocookie.com.attacker.test/embed/abc',
  ]) {
    assert.doesNotMatch(
      roundTrip(`<div><iframe src="${src}"></iframe></div>`), /<iframe/i,
      `${src} was admitted`,
    );
  }
});

test('the host list matches the sanitiser allow-list it mirrors', () => {
  /**
   * `sanitizeRichHtml` decides which iframes can be in a stored body at all. A
   * host it admits that this list omits is an iframe the editor still silently
   * drops — the exact failure being fixed, reintroduced from the other side. The
   * sanitiser's list is read out of its own source rather than retyped, so this
   * compares two real sets.
   */
  const sanitiserHosts = [...readSource('src/lib/sanitizeRichHtml.js').code
    .matchAll(/^\s*'([a-z0-9.-]*youtube[a-z0-9.-]*)',?$/gim)].map((m) => m[1]);
  assert.ok(sanitiserHosts.length >= 4, 'could not read the sanitiser host list');
  assert.deepEqual(
    [...YOUTUBE_EMBED_HOSTS].sort(),
    [...new Set(sanitiserHosts)].sort(),
    'the editor and the sanitiser disagree about which hosts a stored embed may use',
  );
});

// ── 4. THE PUBLIC RENDER PATH IS UNTOUCHED ────────────────────────────────

test('the public renderer output is UNCHANGED for a real stored article body', () => {
  /**
   * The fix is entirely on the editor's read side, and this is the claim that
   * says so: `articles/[slug]/page.jsx` composes
   * `wrapArticleTables(normalizeAuthoredColors(sanitizeRichHtml(content)))`,
   * and for both stored shapes that composition must produce what it produces
   * today — including the fact that it STRIPS `data-youtube-video`, which is a
   * separate finding this round deliberately did not act on (see the `div`
   * entry in lib/sanitizeRichHtml.js).
   */
  const render = (html) => wrapArticleTables(normalizeAuthoredColors(sanitizeRichHtml(html)));

  const wrapped = render(STORED.wrapped);
  assert.match(wrapped, /<iframe/i, 'the public page lost the video');
  assert.deepEqual(srcs(wrapped), ['https://www.youtube-nocookie.com/embed/euOPBynlh74?rel=1']);
  assert.doesNotMatch(
    wrapped, /data-youtube-video/,
    'the render path now KEEPS the attribute — 36 published articles just changed',
  );

  const flattened = render(STORED.flattened);
  assert.match(flattened, /<iframe/i);
  assert.deepEqual(srcs(flattened), ['https://www.youtube-nocookie.com/embed/6RQ2NpRz1rs?rel=1']);
});

test('what the fixed editor saves still passes the sanitiser with the video intact', () => {
  /**
   * THE WHOLE CYCLE, which is where the loss actually happened: load the stored
   * bytes, save them back through `sanitizeRichHtml` exactly as
   * `buildModelData` does, then load THAT and save again. Two generations,
   * because a one-generation check cannot see a shape that survives the first
   * pass and dies on the second.
   */
  let body = STORED.flattened;
  for (let generation = 1; generation <= 2; generation += 1) {
    body = sanitizeRichHtml(roundTrip(body));
    assert.match(body, /<iframe/i, `the video was lost in generation ${generation}`);
    assert.deepEqual(
      srcs(body), ['https://www.youtube-nocookie.com/embed/6RQ2NpRz1rs?rel=1'],
      `the src changed in generation ${generation}`,
    );
  }
});
