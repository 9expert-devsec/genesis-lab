import sanitizeHtml from 'sanitize-html';

/**
 * Server-safe HTML sanitizer for custom-page body.
 *
 * Custom pages exist primarily to embed third-party forms (Google Forms),
 * videos, and maps, so we relax the defaults just enough to permit <iframe>
 * — but ONLY when its `src` host is on an explicit whitelist. Everything
 * else falls back to sanitize-html's safe defaults (scripts, event handlers,
 * unknown attributes, etc. are stripped).
 *
 * We use `sanitize-html` (pure Node, no jsdom) rather than DOMPurify here
 * because this runs at RENDER time on the SERVER. isomorphic-dompurify pulls
 * in jsdom server-side, which transitively `require()`s an ESM-only module
 * (@csstools/css-calc, via cssstyle) and crashes under Next. CourseRoadmap
 * also uses DOMPurify, but loads it via a browser-only dynamic import inside
 * a useEffect so it never enters the server bundle (a top-level import in a
 * client component is still evaluated during SSR and would pull in jsdom).
 *
 * The stored body is treated as untrusted on every render: this runs at
 * RENDER time (server) and must not assume the body was cleaned at save.
 */

// Only <iframe>s whose src host matches one of these EXACTLY are kept.
const IFRAME_HOST_WHITELIST = [
  'docs.google.com',
  'forms.gle',
  'www.google.com',
  'google.com',
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.facebook.com',
  'web.facebook.com',
  'maps.google.com',
];

const SANITIZE_CONFIG = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'figure',
    'figcaption',
    'iframe',
    'span',
    'u',
    's',
    'sub',
    'sup',
    'hr',
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    // Tiptap emits inline styles + classes on many element types.
    '*': ['style', 'class'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    iframe: [
      'src',
      'width',
      'height',
      'frameborder',
      'allow',
      'allowfullscreen',
      'scrolling',
      'referrerpolicy',
      'loading',
      'title',
    ],
  },
  // First-class iframe host enforcement: any iframe whose src host isn't an
  // exact match (or whose src is relative) is dropped. Fails closed.
  allowedIframeHostnames: IFRAME_HOST_WHITELIST,
  allowIframeRelativeUrls: false,
  // Schemes that may appear in any URL-bearing attribute.
  allowedSchemes: ['http', 'https', 'mailto'],
  // Tighter per-tag scheme rules so a `javascript:` src/href can't survive.
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
    img: ['http', 'https'],
    iframe: ['http', 'https'],
  },
  // When a disallowed host (or relative/garbage src) is rejected, sanitize-html
  // strips the src but leaves a bare <iframe></iframe>. Drop those entirely so
  // a rejected iframe disappears rather than rendering an empty frame.
  exclusiveFilter: (frame) => frame.tag === 'iframe' && !frame.attribs.src,
};

/**
 * ── THE `<style>` EXEMPTION, AND WHY IT IS OPT-IN RATHER THAN THE DEFAULT ────
 *
 * `style` is NOT in `allowedTags` above, and for every caller but one it stays
 * out. This config is shared by four surfaces:
 *
 *   · CustomPageView                     — the Advanced HTML PAGE type
 *   · pageBuilder/SectionRenderer        — the advanced section's customHtml
 *   · pageBuilder/sections/custom_html
 *   · pageBuilder/sections/embed
 *
 * Only the FIRST opts in, and the other three must not, because a documented
 * security property already rests on them not doing so. The page-builder
 * preview route renders its "PREVIEW" banner and its published-by strip OUTSIDE
 * PageBuilderView specifically so that a section's authored CSS cannot reach
 * them — and its comment states the second half of that argument in as many
 * words: "customHtml cannot inject a <style> to hide it (the shared sanitizer
 * drops <style> entirely)". Turning `style` on globally would silently retire
 * that sentence and hand any section author a way to blank the banner that says
 * they are looking at unpublished content. See src/app/(public)/preview/[slug].
 *
 * ── WHAT MAKES IT ACCEPTABLE ON THE PAGE TYPE ───────────────────────────────
 * An Advanced HTML page is a deliberate escape hatch whose entire purpose is to
 * serve hand-written markup. It is authored behind `requireAdmin('pages')`, it
 * has no draft/preview banner to subvert, and its body is the whole document
 * rather than one section sharing a page with others' content — so authored CSS
 * has nothing to escape INTO. Withholding `<style>` there does not make the
 * page safer; it makes the feature not work, which is what was reported.
 *
 * ── WHAT THIS DOES NOT BUY, STATED PLAINLY ──────────────────────────────────
 * Measured against sanitize-html 2.17.5 with `style` allowed:
 *   · a `</style>`-then-`<script>` break-out IS still stripped, and so is a
 *     trailing `<img onerror=…>` — the parser closes the element correctly;
 *   · `<script>` written INSIDE the block survives as text, and is inert: the
 *     browser treats `<style>` as a raw-text element, so it is invalid CSS and
 *     never a script;
 *   · the CSS body is NOT inspected. `@import url(//host/x.css)`, remote
 *     `url()` fetches and `expression()` all pass through unread.
 * So this is a CSS-injection surface for whoever can author the page — that is
 * inherent to the escape hatch, is bounded by the `pages` permission, and is
 * the trade the page type exists to make. It is NOT a script-execution surface.
 *
 * `allowVulnerableTags` silences sanitize-html's own warning for exactly this
 * config. It is set only on the opted-in branch, so the default config still
 * carries the library's protection unweakened.
 */
const SANITIZE_CONFIG_WITH_STYLE = {
  ...SANITIZE_CONFIG,
  allowedTags: [...SANITIZE_CONFIG.allowedTags, 'style'],
  allowVulnerableTags: true,
};

/**
 * @param {string} html
 * @param {{ allowStyle?: boolean }} [options] `allowStyle` keeps `<style>`
 *   blocks. Admin-authored Advanced HTML pages only — see the note above
 *   before adding a second caller.
 */
export function sanitizePageHtml(html, { allowStyle = false } = {}) {
  if (!html) return '';
  try {
    return sanitizeHtml(
      String(html),
      allowStyle ? SANITIZE_CONFIG_WITH_STYLE : SANITIZE_CONFIG
    );
  } catch {
    // Never emit unsanitized HTML — render nothing on any failure.
    return '';
  }
}
