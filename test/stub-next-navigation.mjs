// Faithful-enough next/navigation for the render tier: components that call
// these hooks during SSR need them to exist and return inert values.
export const useRouter = () => ({
  push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {},
});
// The pathname is SETTABLE because at least one component under test branches
// on it: AdminContentWrapper decides whether a route manages its own full
// height. A guard on that has to drive the real matcher with real paths rather
// than re-implement the pattern in the test, which would assert nothing.
let pathname = '/';
export function __setPathname(next) { pathname = next ?? '/'; }
export const usePathname = () => pathname;
/**
 * The query string is SETTABLE, for the same reason the pathname is: a component
 * that derives what it renders from the URL can only be tested by driving the
 * real URL through it. CourseListClient filters its catalogue on `?skill=`, so
 * a stub hard-wired to an empty query could only ever assert the unfiltered
 * case — which is the one that was never broken.
 *
 * A STRING in, a fresh URLSearchParams out on every call. Returning one shared
 * instance would let a component that mutates the object leak into the next
 * test, and the runner shares one process across all files.
 */
let search = '';
export function __setSearchParams(next) {
  search = typeof next === 'string' ? next : new URLSearchParams(next ?? {}).toString();
}

/**
 * Make `useSearchParams` UNAVAILABLE, to model the render path where Next
 * refuses to serve it.
 *
 * ── WHAT THIS MODELS, AND WHAT IT IS NOT ────────────────────────────────────
 * In a real static render the hook does not throw: Next bails the client
 * subtree out to CSR up to the nearest Suspense boundary, and the server flushes
 * the fallback instead of the subtree. That machinery does not exist in this
 * runner and cannot be reproduced by a stub.
 *
 * What CAN be reproduced is the precondition — "this render path cannot supply
 * the URL" — and the only honest way to assert a component survives it is to
 * make reading it fail loudly. So this is a MODEL of the bailout's cause, not a
 * reproduction of its behaviour, and a test using it may claim exactly one
 * thing: that the component's server output does not depend on the hook. See
 * test/render/articlesGridServerRender.
 *
 * Off by default and restored by the test that turns it on — the runner shares
 * one process across every file, so a leaked `true` here would break every
 * other render test that has a component legitimately reading the URL.
 */
let failing = false;
export function __failSearchParams(on = true) { failing = !!on; }
export const useSearchParams = () => {
  if (failing) {
    throw new Error(
      'useSearchParams() is not available on this render path — '
      + 'a client subtree reading it here would bail out to CSR'
    );
  }
  return new URLSearchParams(search);
};
export const useParams = () => ({});
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
/**
 * ── redirect() AND permanentRedirect() ARE DIFFERENT FUNCTIONS ──────────────
 * They used to be one here: `export const permanentRedirect = redirect`. That
 * made the two INDISTINGUISHABLE to every test in this suite, and three call
 * sites already depend on the difference — the promotion-mode 308, the
 * historical-slug 308, and notFoundBoundary's permanent/temporary branch. A
 * test could assert that something redirected; it could not assert WHICH
 * status, so a permanent redirect published by mistake would have looked
 * exactly like a temporary one.
 *
 * The digest is the REAL one Next throws, verified against the installed
 * next/navigation.js outside a request context:
 *
 *     redirect('/t')          → NEXT_REDIRECT;replace;/t;307;
 *     permanentRedirect('/t') → NEXT_REDIRECT;replace;/t;308;
 *
 * so a test can read the status out of the digest exactly as the framework
 * encodes it, rather than trusting a stand-in shape invented here. `message`
 * is 'NEXT_REDIRECT' to match; nothing in the suite matched the old
 * `NEXT_REDIRECT:${url}` message — the one guard that greps for NEXT_REDIRECT
 * reads the page SOURCE, not a thrown error.
 */
function throwRedirect(url, status) {
  const e = new Error('NEXT_REDIRECT');
  e.digest = `NEXT_REDIRECT;replace;${url};${status};`;
  throw e;
}
export function redirect(url) { throwRedirect(url, 307); }
export function permanentRedirect(url) { throwRedirect(url, 308); }
export function notFound() { const e = new Error('NEXT_NOT_FOUND'); e.digest = 'NEXT_NOT_FOUND'; throw e; }
export const RedirectType = { push: 'push', replace: 'replace' };
