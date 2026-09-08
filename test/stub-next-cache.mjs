// Test stub for `next/cache`. The real module only resolves/functions inside a
// Next request context; outside it, Node can't even resolve the export. These
// no-ops let handler code run under the verification loader so we can assert
// WHICH tags/paths it revalidates. Calls are recorded for optional inspection.
export const _calls = [];
export function revalidatePath(path, type) { _calls.push({ kind: 'path', path, type }); }
export function revalidateTag(tag) { _calls.push({ kind: 'tag', tag }); }

/**
 * `unstable_cache(fn, keyParts, opts)` — CALL-THROUGH, deliberately.
 *
 * There is no Next data cache under the loader, so the only honest stub is one
 * that runs the function every time. That is not a weaker fake: a stub that
 * memoised would make a test's SECOND call return a first call's result, and
 * every fixture in this suite that changes the fake DB between reads would then
 * assert against stale data for a reason nobody would look for.
 *
 * What it DOES record is the registration, so a test can assert which tags a
 * cached reader was declared with — that is the part of `unstable_cache` this
 * codebase relies on (`bustCaches` revalidates `page-builder`, and a reader
 * tagged with anything else would never be invalidated by it).
 */
export function unstable_cache(fn, keyParts, opts) {
  _calls.push({ kind: 'cache', keyParts, tags: opts?.tags ?? [] });
  return async (...args) => fn(...args);
}
