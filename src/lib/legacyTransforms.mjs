/**
 * THE ONLY PLACE A CLOUDINARY TRANSFORMATION STRING IS WRITTEN.
 *
 * ══ WHY THIS FILE EXISTS AT ALL ═════════════════════════════════════════════
 *
 * Drupal stored `styles/large_cover/public/…` INSIDE its image URLs. The
 * rendering decision — this image, at this size, in this format — was baked
 * into the stored reference. That is why 7 of the 12 covers on /articles page 1
 * point at a derivative path that no longer exists anywhere we control, and it
 * is a large part of why ~2000 references have to be rewritten at all.
 *
 * Phase 2 writes path-shaped references into those ~2000 documents. If a width
 * or a format reaches those strings we will have rebuilt the same trap, and the
 * next person will be writing the migration that undoes it.
 *
 * So: a stored reference is a PATH AND NOTHING ELSE.
 *
 *     stored      /sites/default/files/articles/cover/foo.png
 *     delivered   .../image/upload/f_webp,q_80,w_1600,c_limit/<prefix>/…/foo.png
 *
 * The transformation is chosen at DELIVERY time, here, and can be changed for
 * the whole site by editing one line in this file. Nothing needs migrating.
 *
 * ── WHY .mjs ────────────────────────────────────────────────────────────────
 * package.json has no `"type": "module"`, so a `.js` file under src/lib is
 * CommonJS to plain Node and next.config.mjs could not import it. `.mjs` is
 * unambiguously ESM everywhere, so the config, the route handlers and the
 * tests all read these constants from the same module instead of restating
 * them. That single-definition property is the entire point — see the resolver
 * at src/app/legacy-file/[...path]/route.js, which used to hardcode its own
 * copy of `f_auto,q_auto` and drifted from the rewrite the moment the rewrite
 * changed.
 *
 * ── WHY THESE PARTICULAR PARAMETERS ─────────────────────────────────────────
 * Measured on this cloud, four files, four fetches each through a preview:
 *
 *   f_auto,q_auto                private, Vary: Accept,User-Agent,Save-Data
 *                                → x-vercel-cache MISS MISS MISS MISS
 *   f_webp,q_80,w_1600,c_limit   public, no Vary
 *                                → x-vercel-cache MISS HIT HIT HIT
 *
 * Cloudinary marks a response `private` when and only when it emits a `Vary`,
 * i.e. when the transformation is content-negotiated. `private` defeats
 * Vercel's edge cache outright, and a `Cache-Control: public` override on our
 * side does NOT recover it — measured, that override changed only what the
 * browser was told. So every negotiated parameter (`f_auto`, bare `q_auto`,
 * `dpr_auto`, `w_auto`) re-bills Cloudinary egress on every single request,
 * against a plan where bandwidth is 67.8% of spend.
 *
 * The fixed string is also simply smaller: 12.1% of untransformed bytes in
 * aggregate over a 48-image random sample, against 24.9% for f_auto,q_auto.
 *
 *   c_limit  MANDATORY. Bare `w_1600` UPSCALES anything narrower — greensunny
 *            went 19,637 B → 69,110 B. `c_limit` never enlarges.
 *   f_webp   preserves alpha exactly (21.0% / 56.4% transparent pixels on
 *            greensunny.jpg and hungrynerd.jpg, identical to f_auto) and
 *            preserves GIF animation (all 30 frames of Graph.gif, 2.6×
 *            smaller). f_avif was rejected: it degrades alpha and collapses
 *            animation to a single frame.
 *
 * THE COST, stated plainly: a fixed format abandons content negotiation, so a
 * client that cannot decode webp gets a webp it cannot render rather than a
 * JPEG fallback. That is IE11, Safari ≤13 and iOS ≤13 — roughly 3% globally.
 * Fixing it properly means <picture> or next/image at the component, which is
 * out of scope here and deliberately not done.
 */

/**
 * Delivery variants. The KEY is what appears in a URL; the VALUE is the only
 * copy of that transformation anywhere in the codebase.
 *
 * `default` serves every legacy image path as stored. The named variants exist
 * so a COMPONENT can ask for a different width without the stored reference
 * changing — the article listing paints into a ~384 px slot and wants `w800`,
 * while the article detail hero is full-bleed and wants the default. That
 * difference belongs to the component, not to the database.
 */
export const DELIVERY_VARIANTS = {
  default: 'f_webp,q_80,w_1600,c_limit',
  w800: 'f_webp,q_80,w_800,c_limit',
};

/**
 * URL prefix under which a non-default variant is requested.
 *
 *   /_img/w800/sites/default/files/articles/cover/foo.png
 *
 * Chosen over a query string because Vercel's edge cache keys on the full URL
 * and a path is unambiguous to every layer in between. Chosen over encoding the
 * width in the stored path for the reason in this file's header.
 */
export const VARIANT_PREFIX = '/_img';

/**
 * The empty transformation: deliver the stored asset as it is.
 *
 * Not a placeholder and not a missing value — a deliberate, measured choice for
 * the extensions in UNTRANSFORMED_EXTENSIONS below.
 */
export const UNTRANSFORMED_TRANSFORM = '';

/**
 * Extensions delivered UNTRANSFORMED. Both entries are measurements, not
 * caution, and they fail in opposite directions — which is why the set exists
 * rather than one special case for SVG.
 *
 *   svg  f_auto RASTERISES an SVG at its intrinsic size: copy.svg (479 B,
 *        infinitely scalable) came back a 24×24 PNG of 187 B, Manus-ai.svg
 *        60×60, PEAK.svg 168×45. Any CSS size above the intrinsic one then
 *        renders blurred, and on a retina display every one of them does.
 *        Untransformed it arrives byte-identical. 16 migrated files.
 *
 *   gif  A LARGE ANIMATED GIF CANNOT BE TRANSFORMED AT ALL. Cloudinary caps a
 *        transformation at 50 megapixels summed over every frame, and refuses
 *        the whole request past it — measured on the deployed site:
 *
 *          /images/line/logoexcel2.gif  1920×1080 × 119 frames = 246.8 Mpx
 *          /images/line/logoexcel1.gif  1920×1080 ×  54 frames = 112.0 Mpx
 *            → HTTP 400, x-cld-error "Maximum total number of pixels in all
 *              frames/pages is 50 Megapixels"
 *
 *        The assets are FINE — untransformed delivery returns 200 byte-equal to
 *        source. It is only the transform that is refused, and our layer applied
 *        it to every image, so both URLs 400'd. Frame count is not in the path,
 *        so no rewrite could single these two out; excluding the whole extension
 *        is the only rule a pattern can express.
 *
 *        THE COST, stated plainly: the other 27 migrated GIFs now ship their
 *        original bytes rather than a smaller webp. Measured on the largest,
 *        find-my-mouse-in-powertoys.gif — 2.71 MB source against 824,726 B as
 *        animated webp, so this gives back ~1.9 MB on that one file. That is a
 *        real bandwidth cost on a plan where bandwidth is 67.8% of spend, and it
 *        buys two URLs that return 200 instead of 400. A per-file rule keyed on
 *        frame count would be strictly better and is not expressible here.
 */
export const UNTRANSFORMED_EXTENSIONS = Object.freeze(['svg', 'gif']);

/** True when this extension must be delivered without a transformation. */
export function isUntransformedExtension(ext) {
  return UNTRANSFORMED_EXTENSIONS.includes(String(ext).toLowerCase());
}

/**
 * Resolve the transformation for one legacy path's extension.
 *
 * The single place both delivery ends answer "transform or not", so the static
 * rewrite and the resolver route cannot disagree — which is exactly what
 * happened when the resolver carried its own copy of `f_auto,q_auto`.
 */
export function transformForExtension(ext, variant = 'default') {
  return isUntransformedExtension(ext) ? UNTRANSFORMED_TRANSFORM : transformFor(variant);
}

/** Cloudinary folder every migrated legacy file lives under. */
export const LEGACY_PREFIX = '9exp-genesis/legacy';

/**
 * Legacy roots that actually hold migrated files. Anything outside these is
 * left alone so a delivery rule can never shadow a real application route.
 */
export const LEGACY_ROOTS = ['sites/default/files', 'images', 'files', 'download'];

/** Extensions uploaded as Cloudinary `raw` — no transformations, no format suffix. */
export const RAW_EXTENSION_LIST = [
  'pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'txt', 'csv', 'rtf', 'pbix',
];

/**
 * Documents held OUT of the edge cache, because Vercel answers a Range request
 * with 200 instead of 206 on a cache HIT and a streaming client then treats a
 * partial body as the whole file.
 *
 * A STRICT SUBSET of RAW_EXTENSION_LIST, and the difference is deliberate:
 * `txt`, `csv` and `rtf` are small and nothing range-requests them, so paying
 * a Cloudinary fetch per request to protect a seek they never perform is pure
 * bandwidth loss on a plan where bandwidth is 67.8% of spend. Everything here
 * is a binary container a viewer legitimately seeks inside — a browser's PDF
 * viewer reads the header, jumps to the xref table at the tail, and pulls page
 * 1 before downloading the rest.
 *
 * Widening this to RAW_EXTENSION_LIST looks like a tidy-up and is a
 * regression. Narrowing it corrupts large-document delivery silently.
 */
export const NO_STORE_DOCUMENT_EXTENSIONS = [
  'pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'pbix',
  // ── mp3 IS HERE AND DELIBERATELY NOT IN RAW_EXTENSION_LIST ────────────────
  // An audio element seeks constantly: it reads the header, then range-requests
  // whatever the listener scrubs to. That is the same 206-on-Range requirement a
  // PDF viewer has, and the same reason the cache must not answer 200 with a
  // partial body — a player that trusts the status treats a 30 MB podcast as
  // fully buffered and stops.
  //
  // It is NOT in RAW_EXTENSION_LIST because that list means "Cloudinary serves
  // this as a raw asset", and these five MP3s are not on Cloudinary at all —
  // they exceed its 10 MB raw ceiling and live on Vercel Blob, reached by an
  // explicit rewrite from src/lib/legacyBlobFiles.mjs. Adding mp3 there would
  // emit a Cloudinary raw rule that shadows nothing today and would silently
  // claim these paths the moment rule order changed.
  //
  // These headers apply by REQUEST PATH, so they are correct regardless of which
  // storage answers.
  'mp3',
];

/**
 * Resolve a variant name to its transformation string.
 *
 * Unknown names fall back to `default` rather than throwing: this runs in a
 * request path, and a typo in a component prop should render a slightly wrong
 * size, not a 500.
 */
export function transformFor(variant) {
  return DELIVERY_VARIANTS[variant] ?? DELIVERY_VARIANTS.default;
}

// ── DRUPAL DERIVATIVE PATHS ─────────────────────────────────────────────────
//
// A legacy reference can point at a Drupal image-style derivative rather than
// the source file:
//
//   /sites/default/files/styles/large_cover/public/articles/cover/foo.png.webp?itok=8PbWFEFd
//
// Drupal generated that lazily from the source, cached it under styles/, and
// stored the derivative URL. Only the SOURCE was migrated, so the derivative
// path 404s — measured: 7 of the 12 covers on /articles page 1.
//
// Recovering the source is two mechanical strips: drop `styles/<style>/public/`
// and drop the format extension Drupal appended. These sets are the vocabulary
// of that second strip.
//
// THEY LIVE HERE, not in scripts/lib/legacy-source-manifest.mjs which also
// performs this derivation, because next.config.mjs needs them to build its
// rewrite pattern and the production build must not depend on scripts/. The
// manifest imports them from this module, so there is exactly one definition.

/**
 * Formats Drupal converts TO, and therefore may append. `png`/`jpg` appear
 * here as well as below because a style can convert between them.
 */
export const APPENDED_FORMATS = new Set(['webp', 'avif', 'jpg', 'jpeg', 'png']);

/** Extensions a SOURCE image can legitimately carry. */
export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'avif', 'ico',
]);

/** Drupal's public files directory — where a de-styled path lands. */
export const FILES_DIR = '/sites/default/files';

/** Regex alternation source for a set, longest-first so `jpeg` beats `jpg`. */
const alt = (set) => [...set].sort((a, b) => b.length - a.length).join('|');

/**
 * The `:rest` pattern matching a derivative whose format extension WAS
 * appended — `foo.png.webp` captures `foo.png`.
 *
 * Deliberately narrow, matching resolveDerivative(): strip only when the last
 * extension is a format Drupal converts to AND the extension underneath is
 * itself an image extension. `report.2024.webp` is left alone, because `2024`
 * is not an image extension and a dotted filename is far likelier than a
 * conversion. Greedy `.*` plus a required suffix backtracks correctly:
 * `foo.png.webp.webp` yields `foo.png.webp`, stripping one layer only.
 */
export const DERIVATIVE_SOURCE_PATTERN = `.*\\.(?:${alt(IMAGE_EXTENSIONS)})`;

/** The appended-format alternation, as a rewrite parameter pattern. */
export const DERIVATIVE_APPENDED_PATTERN = alt(APPENDED_FORMATS);

/**
 * Build a Cloudinary delivery URL for an already-encoded legacy public id.
 *
 * `transform` empty means untransformed delivery — which is a real, deliberate
 * case (SVG), not a missing argument.
 */
export function deliveryUrl(base, transform, encodedId) {
  return `${base}/image/upload/${transform ? `${transform}/` : ''}${encodedId}`;
}
