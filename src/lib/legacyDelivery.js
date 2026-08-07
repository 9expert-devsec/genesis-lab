/**
 * Streaming proxy for legacy files that the static rewrite cannot serve.
 *
 * ══ THIS IS THE SLOW PATH. ALMOST NOTHING SHOULD REACH IT. ══════════════════
 *
 * 1610 of the 1616 migrated files are served by a static rewrite in
 * next.config.mjs: Vercel's edge proxies them straight to Cloudinary, no
 * function of ours runs, and repeat requests are served from the edge cache
 * without touching Cloudinary at all. That is the whole design, and it is what
 * keeps a 25-credit Cloudinary quota — 73.5% of which is bandwidth — from
 * being the thing that takes the site down.
 *
 * Code in this module runs only where that path cannot work:
 *
 *   · DOCUMENTS, if and only if the edge cache breaks HTTP Range. Vercel
 *     returns status 200 (with a correct Content-Range and a correct partial
 *     body) on a cache HIT, and a client that checks for 206 will treat a
 *     1.2 MB PDF as complete.
 *   · THE 6 AMPERSAND FILES, whose public_id is not their path.
 *
 * Every byte through here is a function invocation and a Cloudinary fetch that
 * the edge would otherwise have absorbed. Widening what reaches it is a
 * bandwidth decision, not a routing tidy-up.
 *
 * ── WHAT IT HAS TO GET RIGHT ────────────────────────────────────────────────
 * STREAM, never buffer. `new Response(upstream.body)` hands the stream
 * through; `.arrayBuffer()` first would pull whole files into function memory.
 *
 * FORWARD Range and propagate 206 + Content-Range. This is the entire reason
 * the document path exists — see above.
 *
 * `Content-Disposition: inline`. Sales hand customers plain URLs that must open
 * a document in a browser tab, never a Save-As dialog.
 */

/** Cloudinary delivery host for this project's cloud. */
export const CLOUDINARY_BASE = (cloud) => `https://res.cloudinary.com/${cloud}`;

/** Upstream ceiling. Vercel kills the function before this on Hobby. */
export const UPSTREAM_TIMEOUT_MS = 25_000;

/** Headers that describe the BYTES and must survive the hop unchanged. */
const PASS_THROUGH = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
];

/** Extensions served as Cloudinary `raw` — must match the migration. */
export const RAW_EXTENSIONS = new Set([
  'pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'txt', 'csv', 'rtf', 'pbix',
]);

/** Content types Cloudinary does not always label correctly for `raw`. */
const CONTENT_TYPE_BY_EXT = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  rtf: 'application/rtf',
  pbix: 'application/octet-stream',
};

export function extensionOf(p) {
  const last = String(p).slice(String(p).lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot + 1).toLowerCase();
}

/** Per-segment encoding — separators must survive. */
export const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

/**
 * `Content-Disposition: inline` with a filename that survives HTTP.
 *
 * A raw Thai filename is not transmissible in a header, so RFC 5987
 * `filename*` carries the real name and a stripped ASCII `filename` is the
 * fallback for clients that ignore it.
 */
export function inlineDisposition(fileName) {
  const ascii = String(fileName).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Fetch `upstreamUrl` and return a Response that streams it back.
 *
 * `request` supplies Range / If-None-Match. `fileName` names the download.
 * `forceContentType` overrides Cloudinary's guess for raw documents, where it
 * frequently answers `application/octet-stream` and a browser then downloads a
 * PDF instead of rendering it.
 */
export async function proxyFromCloudinary(request, upstreamUrl, {
  fileName,
  forceContentType = null,
  method = 'GET',
  cacheControl = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
  tag = '',
} = {}) {
  const forwarded = new Headers();
  const range = request.headers.get('range');
  if (range) forwarded.set('range', range);
  const inm = request.headers.get('if-none-match');
  if (inm) forwarded.set('if-none-match', inm);

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: forwarded,
      redirect: 'follow',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    return new Response(
      `legacy delivery: upstream fetch failed — ${err?.name === 'TimeoutError' ? 'timeout' : err?.message}`,
      { status: 502, headers: { 'x-legacy-delivery': tag || 'error' } },
    );
  }

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    return new Response(`legacy delivery: upstream ${upstream.status}`, {
      status: upstream.status,
      headers: { 'x-legacy-delivery': tag || 'upstream-error' },
    });
  }

  const out = new Headers();
  for (const h of PASS_THROUGH) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (forceContentType) out.set('content-type', forceContentType);
  if (fileName) out.set('content-disposition', inlineDisposition(fileName));
  // Advertise Range even when this request had none, or a PDF viewer will not
  // attempt a ranged fetch in the first place.
  if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
  out.set('cache-control', cacheControl);
  if (tag) out.set('x-legacy-delivery', tag);

  if (method === 'HEAD' || upstream.status === 304) {
    return new Response(null, { status: upstream.status, headers: out });
  }
  // Status propagates verbatim, which is the point: a 206 stays a 206.
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/** Content-Type for a raw document, by extension. */
export function documentContentType(ext) {
  return CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}
