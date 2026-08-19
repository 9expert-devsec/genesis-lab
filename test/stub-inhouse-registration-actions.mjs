// Inert stand-in for @/lib/actions/inhouse-registrations in the render tier.
//
// Same rationale as test/stub-registration-actions.mjs: the real module is a
// 'use server' file whose import chain reaches @/lib/actions/auth → next-auth →
// next/headers, which does not resolve outside a Next runtime. Merely importing
// InhouseDetailClient — a client component that imports these actions for its
// status/notes/delete handlers — throws before a single assertion runs. That is
// exactly how it failed first: ERR_MODULE_NOT_FOUND for next/headers, and the
// whole file contributed zero tests.
//
// Every export here is called from an onClick/useTransition handler, never
// during the server render this tier exercises. `{ ok: false }` rather than
// `{ ok: true }` for the same reason as the sibling stubs: a save that quietly
// "succeeded" against a stub would be a false green, a refusal is visible.
//
// This list must MIRROR the real module's exports — a stub that keeps offering
// a retired action is a fixture that lies. Pinned by
// test/fs/stubExportParity.test.mjs, which asserts set EQUALITY in both
// directions.
export async function getInhouseRegistrationById() { return null; }
export async function updateInhouseStatus()        { return { ok: false, error: 'stubbed' }; }
// `updateInhouseAdminNotes` IS GONE — in-house notes moved to the shared
// `addInternalNote` in @/lib/actions/registrations. Removed here in the same
// commit, because a stub offering a retired action is a fixture that lies and
// stubExportParity asserts set EQUALITY in both directions.
export async function deleteInhouseRegistration()  { return { ok: false, error: 'stubbed' }; }
