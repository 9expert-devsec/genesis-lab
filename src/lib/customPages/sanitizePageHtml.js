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
 * and crashes under Next. CourseRoadmap keeps using DOMPurify because it's a
 * client component (real browser DOM, no jsdom).
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

export function sanitizePageHtml(html) {
  if (!html) return '';
  try {
    return sanitizeHtml(String(html), SANITIZE_CONFIG);
  } catch {
    // Never emit unsanitized HTML — render nothing on any failure.
    return '';
  }
}
