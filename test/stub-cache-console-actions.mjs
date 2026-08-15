/**
 * Stub for `@/lib/actions/cache-console` in the render tier.
 *
 * Same reason as stub-course-actions.mjs and its siblings: MirrorResetClient
 * imports these for its click handlers, the real module is `'use server'` and
 * reaches next-auth → next/headers at import time, which does not resolve
 * outside a Next runtime.
 *
 * THROWING RATHER THAN RETURNING A BENIGN RESULT MATTERS MORE HERE THAN
 * ANYWHERE ELSE THIS PATTERN IS USED. `applyMirrorReset` deletes rows. A stub
 * that answered `{ ok: true, removedCount: 0 }` would let a render test that
 * accidentally fires the apply handler pass quietly, and the next person would
 * read that green run as evidence the destructive path is exercised in tests.
 * It is not, and must not be: the destructive path is driven only through the
 * injected fakes in test/pure/applyReset.
 *
 * Export set must match the real module — see test/fs/stubExportParity.
 */
export async function previewMirrorReset() {
  throw new Error('stub-cache-console-actions: previewMirrorReset must not be called in a render test');
}
export async function applyMirrorReset() {
  throw new Error('stub-cache-console-actions: applyMirrorReset must not be called in a render test — it DELETES');
}
export async function listMirrorResetKeys() {
  throw new Error('stub-cache-console-actions: listMirrorResetKeys must not be called in a render test');
}

/** Round 4's override pair — parity with the real module. */
export async function previewSnapshotOverride() {
  throw new Error('stub-cache-console-actions: previewSnapshotOverride must not be called in a render test');
}
export async function applySnapshotOverride() {
  throw new Error('stub-cache-console-actions: applySnapshotOverride must not be called in a render test — it WRITES the snapshot');
}
