// Test stub for `next/cache`. The real module only resolves/functions inside a
// Next request context; outside it, Node can't even resolve the export. These
// no-ops let handler code run under the verification loader so we can assert
// WHICH tags/paths it revalidates. Calls are recorded for optional inspection.
export const _calls = [];
export function revalidatePath(path, type) { _calls.push({ kind: 'path', path, type }); }
export function revalidateTag(tag) { _calls.push({ kind: 'tag', tag }); }
