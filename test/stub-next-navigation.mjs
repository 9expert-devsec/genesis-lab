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
export const useSearchParams = () => new URLSearchParams(search);
export const useParams = () => ({});
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
export function redirect(url) { const e = new Error(`NEXT_REDIRECT:${url}`); e.digest = 'NEXT_REDIRECT'; throw e; }
export const permanentRedirect = redirect;
export function notFound() { const e = new Error('NEXT_NOT_FOUND'); e.digest = 'NEXT_NOT_FOUND'; throw e; }
export const RedirectType = { push: 'push', replace: 'replace' };
