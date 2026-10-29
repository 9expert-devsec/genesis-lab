/**
 * /about-us community gallery: which atmosphere photos fill which tiles. Pure.
 *
 * Six or more photos → the bento: the first six in admin order, row 1 wide +
 * narrow + narrow, row 2 narrow + narrow + wide (mirrored). Fewer than six →
 * every photo in an even grid. Each item carries the alt text the tile and the
 * lightbox caption use: the photo's caption, else a numbered fallback.
 */

export const BENTO_PATTERN = Object.freeze(['wide', 'narrow', 'narrow', 'narrow', 'narrow', 'wide']);

export function galleryLayout(photos = []) {
  const usable = (Array.isArray(photos) ? photos : []).filter((p) => p?.image_url);
  const items = usable.map((p, i) => ({
    id: String(p._id ?? i),
    src: p.image_url,
    alt: String(p.caption_th ?? '').trim() || `ภาพบรรยากาศการอบรม ${i + 1}`,
  }));
  if (items.length >= BENTO_PATTERN.length) {
    return {
      layout: 'bento',
      items: items.slice(0, BENTO_PATTERN.length).map((it, i) => ({ ...it, size: BENTO_PATTERN[i] })),
    };
  }
  return { layout: 'grid', items: items.map((it) => ({ ...it, size: 'narrow' })) };
}
