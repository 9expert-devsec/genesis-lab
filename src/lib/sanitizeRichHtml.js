import sanitizeHtml from 'sanitize-html';

/**
 * Two sanitiser profiles for admin-authored (and one upstream-mirrored)
 * rich-HTML fields that render via `dangerouslySetInnerHTML` with nothing
 * standing between the stored bytes and the browser.
 *
 * ══ WHY THIS EXISTS, MEASURED NOT ASSUMED ═══════════════════════════════════
 * `docs/audit/unsanitized-html-render-sites.md` enumerated 14 such sites and
 * measured what they actually store. Two things fell out of that measurement
 * that decided this module's shape:
 *
 *   `Promotion.html_content` (upstream, MSDB-authored) already contains a
 *   live `<script>` in 2 of 21 rows and working `onmouseover`/`onerror`
 *   handlers in 3 — not a hypothetical, a stored payload that runs today.
 *
 *   `Article.content` carries 41 `<iframe>` elements, and measuring their
 *   `src` hosts (not assuming) showed every one is `www.youtube-nocookie.com`
 *   — the Tiptap Youtube extension's intended output. A sanitiser that
 *   dropped `<iframe>` outright would silently break 41 published articles;
 *   the fix is a host allow-list, not a blanket ban.
 *
 * ══ TWO PROFILES, ONE MODULE ════════════════════════════════════════════════
 * `rich` — Article.content, LocalFaq.answer_html, Faq.answer_html,
 * Promotion.html_content, every MasterclassCourse/MasterclassBatch HTML
 * field, CareerPath.description_html. Images, tables, a host-restricted
 * iframe.
 *
 * `basic` — Banner.slide_text, license_options[].info_popup.html_content.
 * Inline marks and links only — no image, no table, no iframe, no div.
 *
 * Both share one `sanitizeHtml` config (`buildConfig`, below) parameterised
 * by tag list; the attribute/style/scheme rules are identical between them
 * because a `basic`-profile tag that also exists in `rich` (p, span, a, …)
 * behaves identically in both — narrowing only ever removes a TAG, never
 * loosens a rule the other profile enforces.
 *
 * ══ WHY THIS IS A NEW MODULE, NOT sanitizeTopicHtml GENERALISED ════════════
 * `docs/audit/unsanitized-html-render-sites.md` §1.4 measured this rather
 * than assuming it: `sanitizeTopicHtml`'s allow-list
 * (`ALLOWED_TOPIC_TAGS`/`TOPIC_STYLES`/`ALLOWED_TOPIC_SCHEMES`) is a
 * module-level constant closed over by the function, not a parameter, and
 * every call unconditionally runs `clampDepth` — a bullet-list-nesting
 * post-process that means nothing outside an `<li>`. Widening its tags to
 * cover images/tables/headings while keeping `clampDepth` wired in would
 * either no-op uselessly on this shape or, untested, mangle a table nested
 * inside a blockquote; making `clampDepth` conditional would turn an
 * enforced invariant (bullets in the section-7 accordion stay flat, argued
 * at length in that module's own header) into something merely optional,
 * which is exactly how that constraint regresses silently later. So
 * `sanitizeTopicHtml` is untouched by this round — zero diff — and this is
 * a sibling, not a refactor of it.
 *
 * What IS deliberately mirrored rather than shared by import — so the two
 * do not silently disagree on the same class of input without a change
 * showing up as a diff in both files:
 *   · the URL-scheme allow-list SHAPE (`allowedSchemes` +
 *     `allowedSchemesByTag`, never the bare `sanitize-html` default, which
 *     admits `ftp`/`tel` where topic wants http/https/mailto only — this
 *     module's own scheme lists are stated explicitly below for the same
 *     reason);
 *   · the style-value GRAMMAR (hex / rgb() / rgba() anchored patterns for
 *     colour, `\d+(unit)` anchored patterns for a length) — the actual
 *     regexes differ (this module also accepts named colours and a
 *     `text-align` keyword set that topic bullets have no use for), but the
 *     anchoring discipline — whole-value match, so `color:
 *     red;position:fixed` cannot smuggle a second declaration past a
 *     partial match — is the same discipline, independently applied;
 *   · the FAIL-CLOSED posture: any parse throw returns `''`, never the
 *     input untouched. An admin who cannot see the field's own error is
 *     safer than one shown broken formatting who is not shown a stored
 *     `<script>` because the sanitiser gave up and passed it through.
 *
 * ══ UNWRAP vs SUBTREE-DROP — THE DISTINCTION THAT MATTERS MOST HERE ════════
 * `sanitize-html`'s default for a disallowed tag is UNWRAP: drop the tag,
 * keep its children as text. That is right for `<header>`, `<section>`,
 * `<font>`, `<title>` and anything else not on either allow-list — none of
 * those are dangerous, they're just not offered by either editor, and a
 * promotion body that has `<meta name="…">Actual copy</meta>`-shaped debris
 * from a pasted email template should keep "Actual copy", not lose it.
 *
 * `nonTextTags` (below) is the opposite: SUBTREE-DROP, tag and content both
 * gone. That has to be deliberate and short, because getting it wrong in
 * the other direction — unwrapping `<script>` — would emit the script's own
 * text node as escaped-but-still-rendered content, harmless, or as raw text
 * an admin then has to explain why it appeared; getting it wrong by
 * OVER-including (subtree-dropping something that should unwrap) silently
 * deletes real authored copy. `SUBTREE_DROP_TAGS` is exactly:
 * script, style, object, embed, applet, form, input, button, select,
 * textarea, link, meta, base, noscript, svg, math — every tag that either
 * executes, submits, or nothing sane comes from keeping its text (a
 * `<button>`'s label duplicating surrounding copy, an `<input>`'s value
 * attribute, `<meta>`'s content attribute — none of that is prose to keep).
 *
 * ══ NEVER REWRITES STORED DATA ══════════════════════════════════════════════
 * Both exports are pure functions of one string. Nothing here reads or
 * writes Mongo, MSDB, or any other store — callers decide when to run it
 * (render, save, both); this module has no opinion and no I/O.
 */

/** Subtree-drop: tag AND content both removed. See the header note above. */
const SUBTREE_DROP_TAGS = Object.freeze([
  'script', 'style', 'object', 'embed', 'applet', 'form', 'input', 'button',
  'select', 'textarea', 'link', 'meta', 'base', 'noscript', 'svg', 'math',
]);

/**
 * Colour: hex (3/4/6/8 digit), rgb()/rgba() (comma-separated, the only
 * syntax either editor's colour picker or a pasted MSDB body has ever been
 * measured to emit), or a bare alphabetic token for a CSS named colour.
 * The named-colour pattern is intentionally permissive about WHICH word —
 * `sanitize-html` only substitutes this value into a `property: value;`
 * declaration it re-serialises itself, so an unrecognised word is inert CSS
 * (ignored by the browser), not an injection vector; the anchoring is what
 * carries the actual safety property; see the header note above.
 */
const COLOR_VALUE = [
  /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i,
  /^[a-z]+$/i,
];

/** A plain length or percentage — no `calc()`, no `var()`, no `url()`. */
const LENGTH_VALUE = [/^\d{1,4}(?:\.\d+)?(?:px|pt|em|rem|%)$/];

/** The only five keywords `text-align` may legitimately hold. */
const TEXT_ALIGN_VALUE = [/^(?:left|right|center|justify|start|end)$/i];

/**
 * One property set, applied via the `'*'` selector so every element the
 * per-tag `allowedAttributes` map below lets carry a `style` attribute
 * (span/div/p/th/td) is bound by the identical rule — narrower per-tag
 * style rules were not asked for and would just be a second place for the
 * two to drift apart.
 */
const ALLOWED_STYLE_PROPERTIES = {
  color: COLOR_VALUE,
  'background-color': COLOR_VALUE,
  'text-align': TEXT_ALIGN_VALUE,
  'font-size': LENGTH_VALUE,
  width: LENGTH_VALUE,
};

/** `href` (`<a>`) and `src` (`<img>`, `<iframe>`) get different scheme lists. */
const HREF_SCHEMES = Object.freeze(['http', 'https', 'mailto', 'tel']);
const SRC_SCHEMES = Object.freeze(['http', 'https']);

/**
 * Only these hosts may sit behind an `<iframe src>`. Exact match, matching
 * `sanitizePageHtml`'s posture (`lib/customPages/sanitizePageHtml.js`) —
 * `allowedIframeHostnames` does the check, `allowIframeRelativeUrls: false`
 * closes the one bypass a relative `src` would otherwise open, and
 * `exclusiveFilter` drops the tag entirely rather than emitting an empty
 * `<iframe></iframe>` when the host check rejects it (§1.2: all 41 stored
 * article iframes are `www.youtube-nocookie.com` — measured, not assumed —
 * so this allow-list must not strip a single one; a test pins that).
 */
const ALLOWED_IFRAME_HOSTS = Object.freeze([
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtube.com',
  'www.youtube.com',
]);

const RICH_TAGS = Object.freeze([
  'p', 'br', 'hr', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote',
  'strong', 'em', 'u', 's', 'sup', 'sub', 'code', 'pre', 'span', 'div', 'a',
  'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr',
  'th', 'td', 'iframe',
]);

const BASIC_TAGS = Object.freeze([
  'p', 'br', 'strong', 'em', 'u', 's', 'span', 'a', 'ul', 'ol', 'li',
]);

/**
 * The full attribute map. Written once and filtered per profile by
 * intersecting with that profile's tag list (`buildConfig`, below) rather
 * than duplicated, so `basic` cannot end up with an `img`/`table`/`iframe`
 * entry surviving a future edit to this map by accident — the intersection
 * is structural, not something a second copy could drift out of sync with.
 */
const ALLOWED_ATTRIBUTES_BY_TAG = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  th: ['colspan', 'rowspan', 'style'],
  td: ['colspan', 'rowspan', 'style'],
  iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'title', 'frameborder'],
  span: ['style'],
  div: ['style'],
  p: ['style'],
};

function buildConfig(allowedTags) {
  const tagSet = new Set(allowedTags);
  const allowedAttributes = {};
  for (const [tag, attrs] of Object.entries(ALLOWED_ATTRIBUTES_BY_TAG)) {
    if (tagSet.has(tag)) allowedAttributes[tag] = attrs;
  }

  return {
    allowedTags,
    allowedAttributes,
    allowedStyles: { '*': ALLOWED_STYLE_PROPERTIES },
    allowedSchemes: [...new Set([...HREF_SCHEMES, ...SRC_SCHEMES])],
    allowedSchemesByTag: {
      a: HREF_SCHEMES,
      img: SRC_SCHEMES,
      iframe: SRC_SCHEMES,
    },
    // Default `true` in sanitize-html admits `//host/path` under whichever
    // scheme the page happens to be loaded over — dropped explicitly rather
    // than left to the default, per the approved allow-list.
    allowProtocolRelative: false,
    allowedIframeHostnames: ALLOWED_IFRAME_HOSTS,
    allowIframeRelativeUrls: false,
    // A host-rejected iframe would otherwise survive as a bare, useless
    // `<iframe></iframe>` (sanitize-html strips the src, not the tag) —
    // dropped entirely instead, matching sanitizePageHtml's posture.
    exclusiveFilter: (frame) => frame.tag === 'iframe' && !frame.attribs.src,
    nonTextTags: SUBTREE_DROP_TAGS,
    transformTags: {
      // `target="_blank"` without `rel="noopener noreferrer"` lets the
      // opened page's JS reach back via `window.opener` — closed
      // unconditionally rather than only when the admin remembers to set
      // it, since nothing upstream of this module can be trusted to.
      a: (tagName, attribs) => {
        const next = { ...attribs };
        if (next.target === '_blank') next.rel = 'noopener noreferrer';
        return { tagName, attribs: next };
      },
    },
  };
}

const RICH_CONFIG = buildConfig(RICH_TAGS);
const BASIC_CONFIG = buildConfig(BASIC_TAGS);

/** Shared by both profiles: never emit unsanitised input on a parse throw. */
function runSanitizer(html, config) {
  if (!html) return '';
  try {
    return sanitizeHtml(String(html), config);
  } catch {
    return '';
  }
}

/**
 * The `rich` profile — Article.content, LocalFaq.answer_html, Faq.answer_html,
 * Promotion.html_content, MasterclassCourse/MasterclassBatch HTML fields,
 * CareerPath.description_html. See the module header for the full allow-list
 * and why each rule is shaped the way it is.
 */
export function sanitizeRichHtml(html) {
  return runSanitizer(html, RICH_CONFIG);
}

/**
 * The `basic` profile — Banner.slide_text,
 * license_options[].info_popup.html_content. Inline marks and links only;
 * no image, no table, no iframe, no div.
 */
export function sanitizeBasicHtml(html) {
  return runSanitizer(html, BASIC_CONFIG);
}
