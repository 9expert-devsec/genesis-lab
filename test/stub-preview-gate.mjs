/**
 * Stub for the preview route's PreviewGate.
 *
 * TWO independent reasons it cannot load under this runner, both measured:
 *   · it calls `useActionState`, which React 19 exports and the installed React
 *     18.3.1 does not — the import itself throws SyntaxError.
 *   · it imports `@/lib/actions/previewAccess`, whose module graph reaches the
 *     db layer, the same chain several other stubs in test/loader.mjs exist for.
 *
 * WHAT THIS COSTS, said plainly: the tests that drive the route assert WHICH
 * state the route hands the gate, not how the gate renders it. That is the
 * claim worth making here — the route deciding 'locked' versus 'unpublished' is
 * route logic — but it does mean no test in this file proves the real component
 * has a branch for a given state. test/fs/previewPublishedMode source-scans the
 * real file for exactly that, which is why the stub is safe rather than merely
 * convenient.
 *
 * The export NAME matters: the route tests find this element by component name,
 * so a rename here silently stops them finding it.
 */
export function PreviewGate() {
  return null;
}
