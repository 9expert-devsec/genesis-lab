/**
 * Stub for `@/lib/actions/course-rename` in the render tier.
 *
 * RenameExecutePanel imports the rename and the state inspector for its click
 * handler. The real module is `'use server'` and its chain reaches next-auth →
 * next/headers, which does not resolve outside a Next runtime — the same
 * reasoning as the course, article, registration and program-order stubs
 * already in the loader.
 *
 * BOTH THROW. The render tier asserts the panel's FIRST render — that the
 * button starts disabled, that both confirmations exist, that the alias is a
 * step. Nothing there clicks anything, so nothing should reach either of these.
 * A stub returning `{ ok: true }` would let a test that accidentally invoked
 * the rename pass while writing nothing, which is the "stub that agrees with
 * everything" false-green named in test/fs/stubExportParity's own header — and
 * on THIS module that stub would be agreeing that a twelve-store migration
 * succeeded.
 *
 * Export set must match the real module exactly — see test/fs/stubExportParity.
 */

export async function renameCourseCode() {
  throw new Error('stub-course-rename-actions: renameCourseCode must not be called in a render test');
}

export async function inspectRenameState() {
  throw new Error('stub-course-rename-actions: inspectRenameState must not be called in a render test');
}
