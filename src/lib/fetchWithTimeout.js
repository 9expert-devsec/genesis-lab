/**
 * `fetch` wrapper that aborts after `timeoutMs`.
 *
 * Plain `fetch()` has no built-in timeout — a stalled upstream can hang
 * the request for tens of seconds before Node's default kills it,
 * which kills home-page rendering. This helper kicks in well before
 * that and lets the caller decide what to do with the AbortError.
 *
 * @param {string|URL}   url
 * @param {RequestInit}  [options]
 * @param {number}       [timeoutMs=10000]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
