import Youtube from '@tiptap/extension-youtube';

/**
 * The Tiptap YouTube node, widened so it can READ BACK the shape that is
 * actually stored — which is not the shape it writes.
 *
 * ══ THE DATA LOSS THIS CLOSES, MEASURED ════════════════════════════════════
 * Reported: an admin inserts a video in /admin/articles, saves, reopens the
 * article, and the video is gone from the editor — while the public page still
 * plays it. The next save from that editor writes the body WITHOUT the video
 * and the loss becomes real.
 *
 * The round trip, step by step, all four steps verified against the installed
 * sources rather than inferred:
 *
 *   1. INSERT. `setYoutubeVideo` builds a `youtube` node and stock
 *      `renderHTML` (node_modules/@tiptap/extension-youtube 2.27.2) serialises
 *      it as `['div', { 'data-youtube-video': '' }, ['iframe', …]]`.
 *
 *   2. SAVE. `buildModelData` in lib/actions/articles.js runs
 *      `sanitizeRichHtml` over the body. That profile allows `div` but its
 *      attribute list for `div` is `['style']` — so `data-youtube-video` is
 *      STRIPPED. What reaches Mongo is `<div><iframe …></iframe></div>`.
 *
 *   3. RELOAD. Stock `parseHTML` returns exactly one rule,
 *      `{ tag: 'div[data-youtube-video] iframe' }`. The stored `div` carries no
 *      such attribute, so the rule cannot match; no other extension in the
 *      article editor claims `iframe`; ProseMirror discards an element no rule
 *      matches. The video is gone from the document.
 *
 *   4. NEXT SAVE. `editor.getHTML()` now describes a body with no video, and
 *      step 2 stores it. That is the irreversible step.
 *
 * ══ THE STORED CORPUS, COUNTED NOT ASSUMED ═════════════════════════════════
 * Over all 499 articles (read-only census, 2026-10-09): 96 bodies hold an
 * `<iframe>`, 99 iframes in total, EVERY src on `www.youtube-nocookie.com`.
 * Two shapes, and the split is the sanitiser's fingerprint —
 *
 *   37 iframes in 36 articles   `<div data-youtube-video=""><iframe …>`
 *                               — authored before step 2 existed
 *                               (`fix(security): sanitise the remaining 13
 *                               unsanitised HTML render sites`, 2026-09-01).
 *                               Parses today.
 *   62 iframes in 60 articles   `<div><iframe …>` — saved since.
 *                               DROPPED today.
 *
 * No article body holds a `<video>` element (0 of 499), and `sanitizeRichHtml`
 * has no `video` tag in `RICH_TAGS`, so there is no such shape to parse.
 *
 * ══ WHY THE FIX IS A PARSE RULE AND NOT A MIGRATION ════════════════════════
 * The 62 stored bodies are correct as they stand: the public renderer
 * (`articles/[slug]/page.jsx` → `sanitizeRichHtml` → `normalizeAuthoredColors`
 * → `wrapArticleTables`) keeps the iframe, and the video plays. The defect is
 * entirely on the READ side of the editor. Teaching the node to recognise a
 * YouTube iframe wherever it sits rescues all 62 without touching a single
 * stored byte — a migration would rewrite 60 published bodies to fix a bug in
 * a parser.
 *
 * ══ WHY THE SECOND RULE IS SAFE TO ADD ═════════════════════════════════════
 * It matches `iframe` — ANY iframe — but `getAttrs` returns `false` (which is
 * ProseMirror's "this rule does not apply after all") unless the `src` names a
 * YouTube embed host. So:
 *
 *   · a non-YouTube iframe is left exactly as unmatched as it is today, and
 *     falls through to whatever else the editor registers (in CustomPageForm,
 *     `IframeNode`; in this editor, nothing — it is still discarded, which is
 *     the behaviour the article sanitiser's host allow-list already enforces);
 *   · the first rule is kept and kept FIRST, so the 37 wrapped iframes keep
 *     matching the rule they match today. Both rules build the same node, so
 *     the ordering is about not changing a working path, not about outcome.
 *
 * `getAttrs` returning a non-`false` value lets Tiptap's own attribute
 * injection run (`injectExtensionAttributesToParseRule`, @tiptap/core), so
 * `src`, `start`, `width` and `height` are read off the iframe element the
 * same way they are under the stock rule. `renderHTML` then round-trips the
 * `src` unchanged: `getEmbedUrlFromYoutubeUrl` returns its input verbatim once
 * the url contains `/embed/`, which every stored src does.
 *
 * ══ WHAT THIS DOES NOT DO ══════════════════════════════════════════════════
 * It does not stop the sanitiser from stripping `data-youtube-video`, so step 2
 * above still flattens every new insert and this module's second rule stays
 * load-bearing rather than becoming a legacy path. Admitting the attribute in
 * `sanitizeRichHtml` would be a one-token change and would also revive the
 * `.article-content [data-youtube-video] iframe` 16:9 rule in globals.css,
 * which has matched nothing for those 60 bodies since 2026-09-01 — but it
 * would change how 36 ALREADY-PUBLISHED articles render, which this round was
 * scoped not to do. That trade is written out in full at the `div` entry in
 * lib/sanitizeRichHtml.js, where the decision would be taken.
 */

/**
 * The hosts a stored YouTube embed can legitimately sit on.
 *
 * Deliberately the same set as `ALLOWED_IFRAME_HOSTS` in
 * lib/sanitizeRichHtml.js, because the sanitiser is what decides which iframes
 * can be in a stored body at all: a host this list omits but that one admits
 * would be an iframe the editor still silently drops, which is the exact class
 * of bug this module exists to end. Not imported from there — that module is
 * a sanitiser config and this is a schema definition; they are mirrored, and a
 * test compares the two sets so they cannot drift apart in silence.
 */
export const YOUTUBE_EMBED_HOSTS = Object.freeze([
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtube.com',
  'www.youtube.com',
]);

/**
 * Is this `src` a YouTube embed URL?
 *
 * Exact host match, no suffix test: `endsWith('youtube.com')` would also
 * accept `evilyoutube.com`. Relative and scheme-relative URLs are refused —
 * `sanitizeRichHtml` sets `allowIframeRelativeUrls: false` and
 * `allowProtocolRelative: false`, so neither can be in a stored body, and
 * accepting one here would only widen the editor past the sanitiser.
 */
export function isYoutubeEmbedSrc(src) {
  const value = String(src ?? '').trim();
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return YOUTUBE_EMBED_HOSTS.includes(new URL(value).host.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The node both admin rich-body editors install in place of stock `Youtube`.
 *
 * Configuration (`controls`, `nocookie`, width, height) stays at each call
 * site, unchanged — this only widens what the node can READ.
 */
export const YoutubeEmbed = Youtube.extend({
  parseHTML() {
    return [
      // The shape the extension itself emits, and the 37 stored iframes that
      // predate the save-time sanitiser. FIRST, so nothing about the path that
      // already works changes.
      { tag: 'div[data-youtube-video] iframe' },
      // The 62 stored iframes whose wrapper lost its data attribute to
      // `sanitizeRichHtml`, and a bare `<iframe>` with no wrapper at all.
      {
        tag: 'iframe',
        getAttrs: (element) =>
          (isYoutubeEmbedSrc(element.getAttribute('src')) ? null : false),
      },
    ];
  },
});
