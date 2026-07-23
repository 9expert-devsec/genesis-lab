/**
 * Open Graph image helpers.
 *
 * Social crawlers (Facebook, Twitter/X, LINE) reject relative `og:image`
 * URLs and lay cards out best when given a 1.91:1 (1200×630) asset. This
 * module is the single source of truth for:
 *   - the site-wide default OG card (a dedicated 1200×630 file, NOT the
 *     square favicon/apple-touch asset), and
 *   - resolving a per-course OG image with an absolute-URL guarantee.
 *
 * Kept separate from `/logo/9exp-stand.png`, which stays square for the
 * favicon / apple-touch-icon roles. One asset can't serve both a square
 * icon slot and a 1.91:1 social slot without cropping.
 */

/**
 * Site-wide default social card. 1200×630, lives at
 * `public/brand/og-9expert-1200x630.png`. `url` is a root-relative path;
 * callers that emit it into `og:image` must run it through
 * {@link toAbsoluteUrl} first.
 */
export const OG_DEFAULT_IMAGE = {
  url: '/brand/og-9expert-1200x630.png',
  width: 1200,
  height: 630,
  alt: '9Expert Training — Knowledge Provider',
};

/**
 * Return an absolute URL, or `null` when there's nothing usable to emit.
 *
 * - Already-absolute (`http://`, `https://`) values pass through unchanged
 *   (Cloudinary `secure_url`s land here).
 * - Protocol-relative (`//host/…`) values are upgraded to `https:`.
 * - Everything else is treated as a site-relative path and joined onto
 *   `baseUrl`.
 *
 * Returns `null` for empty / non-string input so callers can fall back
 * rather than emit a broken tag.
 */
export function toAbsoluteUrl(url, baseUrl) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

/**
 * Pick the raw (possibly relative) image URL for a masterclass course,
 * following the fallback chain:
 *   1. `course.cover_image_url`
 *   2. first `gallery` entry with `type === 'image'` and a non-empty `url`
 *   3. `null` — caller supplies the site-wide default
 *
 * NOTE: the live schema (`src/models/MasterclassCourse.js`) names the
 * field `gallery` with image entries shaped `{ type, url }` — NOT
 * `media_gallery` / `image_url`. This walks the real shape.
 *
 * Returns `null` (never an empty string) when the course has no image, so
 * the "no image" case is distinguishable from "found one".
 */
export function pickCourseImageUrl(course) {
  if (!course) return null;
  const cover =
    typeof course.cover_image_url === 'string' ? course.cover_image_url.trim() : '';
  if (cover) return cover;
  const gallery = Array.isArray(course.gallery) ? course.gallery : [];
  const firstImage = gallery.find(
    (g) => g?.type === 'image' && typeof g.url === 'string' && g.url.trim() !== ''
  );
  return firstImage ? firstImage.url.trim() : null;
}

/**
 * Resolve a course's OG image to an ABSOLUTE URL, falling back to the
 * site-wide default. The return value is guaranteed absolute (or the
 * absolute default) — never relative, never empty.
 */
export function resolveCourseOgImage(course, baseUrl) {
  const picked = pickCourseImageUrl(course);
  return (
    toAbsoluteUrl(picked, baseUrl) ??
    toAbsoluteUrl(OG_DEFAULT_IMAGE.url, baseUrl)
  );
}
