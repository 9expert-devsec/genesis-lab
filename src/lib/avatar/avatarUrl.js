/**
 * The ONE place an admin avatar URL is built.
 *
 * Every render site calls this — the 36px sidebar footer, the 128px profile
 * block — and nothing anywhere hand-builds a Cloudinary URL or puts a raw
 * `imagePublicId` into an `src`. That is the whole reason the field stores a
 * public_id rather than a URL (see src/models/Admin.js): one image is rendered
 * at several sizes, and a stored URL cannot be transformed at read time.
 *
 * ── WHY THE SIZE IS AN ALLOWLIST AND NOT A NUMBER ───────────────────────────
 * The size is interpolated into a delivery URL. An allowlist of four values
 * means the set of URLs this function can ever emit is finite and enumerable,
 * so there is no arbitrary-number path into the transform string at all. It
 * also keeps the CDN cache to four objects per avatar instead of one per
 * caller's guess at a pixel size.
 *
 * A disallowed size THROWS rather than falling back. Every call site passes a
 * literal, so a bad size is a programmer error that cannot depend on runtime
 * data — and a silent fallback would render a plausible-looking wrong-sized
 * image that nobody would ever notice.
 *
 * ── RENDER WITH A PLAIN <img>, NOT next/image ───────────────────────────────
 * Stated here because this is where the reasoning lives, and repeated once at
 * the first render site: this function already returns an asset at exactly the
 * requested pixel size with `f_auto,q_auto`, so next/image would run a second
 * optimiser pass over an already-optimised URL, and its srcset would have
 * nothing to choose between when the sizes are allowlisted to four values.
 *
 * PURE: no imports, no I/O, no React, no env mutation. It reads one env var
 * (below) and nothing else.
 */

/**
 * The cloud name, with the SAME hardcoded fallback the legacy-file delivery
 * route already uses (src/app/legacy-file/[...path]/route.js:61).
 *
 * Not a test affordance dressed up as production code — it is load-bearing in
 * both directions. In a deployed environment with the env var missing, the
 * fallback is the real cloud, so avatars keep resolving instead of every `src`
 * becoming `res.cloudinary.com/undefined/...`. In the test runner, which loads
 * no .env file, it makes this module deterministic WITHOUT any test writing to
 * `process.env` — a shared global in a single-process, concurrent runner (see
 * the header of test/fs/envMutationGuard for what that costs).
 */
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? 'ddva7xvdt';

/** The four sizes an avatar may be requested at. */
export const AVATAR_SIZES = Object.freeze([36, 72, 128, 256]);

/**
 * The bundled default, per size.
 *
 * TWO FILES, NOT ONE, and that is a deliberate deviation from "keep one path":
 * the shipped assets are a 128px PNG (30 KB) and a 512px PNG (269 KB). Serving
 * the 512 into the 36px sidebar slot would push 269 KB at every admin without a
 * photo on every admin page load — nine times the bytes for a picture rendered
 * at seven percent of its width. One lookup, still one function, still no
 * <picture> element and no srcset.
 *
 * `public/avatar/avatar-default-512.webp` also exists on disk and is
 * DELIBERATELY UNREFERENCED: reaching it would need a <picture> element or
 * content negotiation, and neither is worth it for an image most admins see
 * once. It is left in place rather than deleted because it is the user's asset.
 *
 * These paths are asserted to exist on disk by test/fs/avatarDefaultAsset — a
 * missing default would otherwise show up only as a broken image in a browser.
 */
const DEFAULT_BY_SIZE = Object.freeze({
  36: '/avatar/avatar-default-128.png',
  72: '/avatar/avatar-default-128.png',
  128: '/avatar/avatar-default-512.png',
  256: '/avatar/avatar-default-512.png',
});

/**
 * A public_id safe to interpolate into a delivery URL.
 *
 * Cloudinary public_ids are slash-separated segments of word characters, dots
 * and dashes. This refuses everything else — a scheme (`https:`), a comma
 * (which would be read as a transform separator), a space, a query string.
 *
 * THE LOOKAHEAD IS NOT DECORATION. Dots are legal INSIDE a segment
 * (`avatar.v2`), so a plain `[\w.-]+` class accepts `..` as a whole segment and
 * `../../../secret` sails through as three valid segments. The first version of
 * this regex did exactly that, and the test below caught it: it emitted
 * `…/image/upload/c_fill,…/../../../secret`. Each segment must therefore
 * contain something that is not a dot.
 *
 * THIS IS THE SECOND GATE, NOT THE FIRST. The write action validates the shape
 * before anything reaches the database (see the avatar action), and that is
 * where a bad value is refused with an error a human sees. This one is the
 * belt: it assumes the row may already be wrong — written by an older build, by
 * hand, or by a bug — and refuses to turn a wrong row into a URL. Failing to
 * the bundled default is the right failure here: a default avatar is a correct
 * thing to show, and an injected transform is not.
 */
const SAFE_PUBLIC_ID = /^(?!\.+(?:\/|$))[\w.-]+(?:\/(?!\.+(?:\/|$))[\w.-]+)*$/;

/**
 * Build the delivery URL for an admin avatar, or the bundled default.
 *
 * @param {string|null|undefined} imagePublicId  Admin.imagePublicId
 * @param {36|72|128|256} size                   required, allowlisted
 * @returns {string} an absolute Cloudinary URL, or a local `/avatar/…` path
 * @throws {RangeError} if `size` is not one of AVATAR_SIZES
 */
export function avatarUrl(imagePublicId, size) {
  // `typeof` first: DEFAULT_BY_SIZE is an object, so its keys are strings and a
  // bare lookup would happily accept '128'. The allowlist has to reject the
  // string form, or a value read from a form field or a URL param could reach
  // the transform.
  if (typeof size !== 'number' || !AVATAR_SIZES.includes(size)) {
    throw new RangeError(
      `avatarUrl: size must be one of ${AVATAR_SIZES.join(', ')} (got ${JSON.stringify(size)})`
    );
  }

  const fallback = DEFAULT_BY_SIZE[size];
  const id = typeof imagePublicId === 'string' ? imagePublicId.trim() : '';
  if (!id || !SAFE_PUBLIC_ID.test(id)) return fallback;

  // c_fill + g_face: fill the square, and when the image contains a face, keep
  // it. f_auto/q_auto let Cloudinary pick the format and quality per browser.
  //
  // NO ROUNDING OR RADIUS IN THE URL. The circle is CSS, so this same asset
  // serves a square context — an email, a table cell — without a second
  // derivative being generated and cached.
  const transform = `c_fill,f_auto,g_face,h_${size},q_auto,w_${size}`;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${id}`;
}

/**
 * The bundled default for a size, without consulting a public_id.
 *
 * Exported for the fs guard that asserts these files exist on disk; render
 * sites call `avatarUrl` and let it decide.
 */
export function defaultAvatarPath(size) {
  if (typeof size !== 'number' || !AVATAR_SIZES.includes(size)) {
    throw new RangeError(
      `defaultAvatarPath: size must be one of ${AVATAR_SIZES.join(', ')} (got ${JSON.stringify(size)})`
    );
  }
  return DEFAULT_BY_SIZE[size];
}
