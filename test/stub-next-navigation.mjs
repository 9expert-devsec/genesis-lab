// Faithful-enough next/navigation for the render tier: components that call
// these hooks during SSR need them to exist and return inert values.
export const useRouter = () => ({
  push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {},
});
export const usePathname = () => '/';
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
export function redirect(url) { const e = new Error(`NEXT_REDIRECT:${url}`); e.digest = 'NEXT_REDIRECT'; throw e; }
export const permanentRedirect = redirect;
export function notFound() { const e = new Error('NEXT_NOT_FOUND'); e.digest = 'NEXT_NOT_FOUND'; throw e; }
export const RedirectType = { push: 'push', replace: 'replace' };
