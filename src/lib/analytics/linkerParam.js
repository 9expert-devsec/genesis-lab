/**
 * The Google linker parameter, and how to take it back out of a URL.
 *
 * consentMode.js sets `url_passthrough: true`. While consent is denied — the
 * state every first-time visitor is in — gtag cannot keep the client/session
 * id in a cookie, so it carries it in the URL instead: it decorates each link
 * click with `?_gl=1*…`, and on the next document load the tag reads it back.
 * That continuity is the point and is KEPT. What is not wanted is the
 * parameter sitting in the address bar afterwards, where it gets copied,
 * shared and bookmarked.
 *
 * So this removes `_gl` and ONLY `_gl`. It is string surgery rather than
 * URLSearchParams on purpose: URLSearchParams re-serialises every OTHER pair
 * (spaces become `+`, Thai text is re-encoded, `a` becomes `a=`), and "never
 * touch any other parameter" means byte-for-byte, not semantically equal.
 *
 * When nothing is removed the INPUT STRING is returned — callers compare with
 * `===` to decide whether to touch history at all.
 *
 * WHEN it is safe to call this on the live address bar is not this module's
 * business; see src/components/analytics/LinkerParamCleaner.jsx.
 */
export const LINKER_PARAM = '_gl';

/**
 * @param {string} url  absolute or relative — anything with an optional `?query` and `#hash`
 * @returns {string}    the same URL without `_gl`; the input itself when it had none
 */
export function stripLinkerParam(url) {
  if (typeof url !== 'string') return url;
  const hashAt = url.indexOf('#');
  const head = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const queryAt = head.indexOf('?');
  if (queryAt === -1) return url;

  const pairs = head.slice(queryAt + 1).split('&');
  const kept = pairs.filter((pair) => pair.split('=', 1)[0] !== LINKER_PARAM);
  if (kept.length === pairs.length) return url;

  const query = kept.join('&');
  return head.slice(0, queryAt) + (query ? `?${query}` : '') + hash;
}
