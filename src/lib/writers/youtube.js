/**
 * YouTube links on a writer profile — parsing, the thumbnail, and the title
 * lookup the admin save runs.
 *
 * Pure apart from `fetchYouTubeTitle`, which takes its `fetch` as an argument,
 * so the whole module runs in the test tier with no network. The public page
 * never calls YouTube: the title is stored at save time, and the thumbnail is a
 * plain i.ytimg.com URL built from the id.
 */

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** youtube.com and its www/m hosts. Nothing that only ends in "youtube.com". */
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

/** The path forms that put the id in the next segment. */
const PATH_FORMS = new Set(['shorts', 'embed', 'live']);

export const YOUTUBE_MESSAGES = Object.freeze({
  badVideoUrl: 'ลิงก์วิดีโอ YouTube ไม่ถูกต้อง — ใช้ลิงก์ youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/… หรือ /live/…',
  badChannelUrl: 'ลิงก์ช่องต้องเป็นลิงก์ youtube.com',
  missingUrl: 'กรุณาใส่ลิงก์วิดีโอ',
  titleUnavailable: 'ดึงชื่อวิดีโอจาก YouTube ไม่สำเร็จ — กรุณากรอกชื่อวิดีโอเอง',
});

function parseHttpUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * The 11-character id of a YouTube video link, or null.
 *
 * Accepts youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
 * /embed/ID and /live/ID. Anything else, including a channel, a playlist or an
 * id of the wrong shape, is null.
 */
export function parseYouTubeVideoId(value) {
  const url = parseHttpUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  let id = null;
  if (SHORT_HOSTS.has(host)) {
    id = segments.length === 1 ? segments[0] : null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === 'watch') id = url.searchParams.get('v');
    else if (segments.length === 2 && PATH_FORMS.has(segments[0])) id = segments[1];
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

/** Is this a link on youtube.com (a channel, a handle, anything on the site)? */
export function isYouTubeChannelUrl(value) {
  const url = parseHttpUrl(value);
  return Boolean(url) && YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
}

/** The medium (320×180, 16:9) thumbnail. Served straight from i.ytimg.com. */
export function youtubeThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export const YOUTUBE_OEMBED_TIMEOUT_MS = 5000;

/**
 * The video's title from YouTube oEmbed, or '' when it cannot be had (a
 * timeout, a private or deleted video, a network error). Never throws.
 *
 * @param {string} url  the video link as the admin entered it
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetch]
 * @param {number} [deps.timeoutMs]
 */
export async function fetchYouTubeTitle(url, { fetch: fetchImpl = globalThis.fetch, timeoutMs = YOUTUBE_OEMBED_TIMEOUT_MS } = {}) {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  try {
    const res = await fetchImpl(endpoint, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!res?.ok) return '';
    const body = await res.json();
    return typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : '';
  } catch {
    return '';
  }
}

/**
 * Fill in each empty title from oEmbed. A video whose title is still empty
 * afterwards is an error: the card has no other text for it.
 *
 * @param {{ videoId: string, url: string, title: string }[]} videos  parsed rows
 * @returns {Promise<{ ok: true, videos: object[] } | { ok: false, error: string }>}
 */
export async function fillYouTubeTitles(videos, deps) {
  const filled = await Promise.all((videos ?? []).map(async (video) => (
    video.title ? video : { ...video, title: await fetchYouTubeTitle(video.url, deps) }
  )));
  if (filled.some((video) => !video.title)) return { ok: false, error: YOUTUBE_MESSAGES.titleUnavailable };
  return { ok: true, videos: filled };
}
