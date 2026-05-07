/**
 * Parse a YouTube URL into its video ID. Accepts the three forms
 * the admin paste box advertises:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *
 * Returns the 11-char video ID, or null if the input doesn't match.
 */
export function parseYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // youtu.be/<id>
  let m = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];

  // youtube.com/embed/<id>
  m = trimmed.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];

  // youtube.com/watch?v=<id>
  m = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];

  return null;
}

export function toEmbedUrl(url) {
  const id = parseYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
