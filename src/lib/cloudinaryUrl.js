/**
 * Cloudinary delivery transforms, applied to a URL the site already has.
 *
 * Roadmaps (and most other upstream images) arrive as raw delivery URLs —
 * `https://res.cloudinary.com/ddva7xvdt/image/upload/v1758…/skills/roadmaps/x.png`
 * — and the pages render them `unoptimized`, so every visit downloaded the
 * original 1–2.3 MB PNG to show it at 560px. Cloudinary resizes and re-encodes
 * on its own edge when a transformation segment sits right after
 * `/image/upload/`, which is what this inserts. The images stay `unoptimized`
 * in next/image: the transformed URL IS the optimised asset, and routing it
 * through the Vercel optimiser too would be a second, billed pass.
 *
 * Deliberately narrow:
 *  - ONLY this account's `res.cloudinary.com/ddva7xvdt/image/upload/` URLs.
 *    Anything else — another cloud, a `/files/` rewrite, a relative path,
 *    null, '' — comes back exactly as it went in.
 *  - NEVER a second transform. A URL whose first segment after `upload/` is
 *    already a transformation (`w_64,h_64,c_fill,…`) is returned unchanged
 *    rather than stacked into a chained transformation nobody asked for.
 *
 * Older call sites still splice `'/upload/'` by hand (see the SK-RM-1 report);
 * they are left alone until someone touches them for another reason.
 */
const CLOUDINARY_UPLOAD = 'https://res.cloudinary.com/ddva7xvdt/image/upload/';

/** `w_960`, `c_limit`, `f_auto`, `dpr_2.0`, `e_sharpen:80` … joined by commas. */
const TRANSFORM_SEGMENT = /^[a-z]{1,4}_[^/,]+(,[a-z]{1,4}_[^/,]+)*$/;

/**
 * @param {string|null|undefined} src
 * @param {string} transform  e.g. `'w_960,c_limit,f_auto,q_auto'`
 * @returns {string|null|undefined} the transformed URL, or `src` unchanged
 */
export function withCloudinaryTransform(src, transform) {
  if (typeof src !== 'string' || !transform || !src.startsWith(CLOUDINARY_UPLOAD)) return src;
  const rest = src.slice(CLOUDINARY_UPLOAD.length);
  const firstSegment = rest.split(/[/?#]/, 1)[0];
  if (TRANSFORM_SEGMENT.test(firstSegment)) return src;
  return `${CLOUDINARY_UPLOAD}${transform}/${rest}`;
}
