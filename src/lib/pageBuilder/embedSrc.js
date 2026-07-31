/**
 * Build a safe player URL from a youtube / vimeo watch-or-share URL, or null.
 *
 * ONE definition, shared by the `embed` component (which renders the iframe) and
 * sectionRendersEmpty (which marks an embed that would render nothing) — so the
 * "renders empty" marker mirrors the component's fail-closed guard exactly
 * instead of re-deriving it.
 *
 * The output host is always a fixed template (`www.youtube.com/embed/<id>` /
 * `player.vimeo.com/video/<id>`) with an id captured from a tight character
 * class, so nothing from the input reaches the src except the id itself. Both
 * hosts are on the shared sanitizer's iframe whitelist, keeping this consistent
 * with the `iframe` provider path (which routes raw markup through that
 * sanitizer). Returns null for the `iframe` provider — its emptiness is decided
 * by its `html`, not a url.
 */
const YT_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;

export function embedSrc(provider, url) {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u) return null;
  if (provider === 'youtube') {
    const m = YT_ID.exec(u);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
  }
  if (provider === 'vimeo') {
    const m = VIMEO_ID.exec(u);
    return m ? `https://player.vimeo.com/video/${m[1]}` : null;
  }
  return null;
}
