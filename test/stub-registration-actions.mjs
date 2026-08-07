// Inert stand-in for @/lib/actions/registrations in the render tier.
//
// Same rationale as test/stub-article-actions.mjs and
// test/stub-nav-course-preview.mjs: the real module is a 'use server' file
// whose import chain reaches @/lib/actions/auth → next-auth → next/headers,
// which does not resolve outside a Next runtime. Merely importing
// RegistrationDetailClient — a client component that imports these actions for
// its save/delete handlers — throws before a single assertion runs.
//
// Every export here is called from an onClick/useTransition handler, never
// during the server render the render tier exercises. `{ ok: false }` rather
// than `{ ok: true }` for the same reason as the article stub: a save that
// quietly "succeeded" against a stub would be a false green, a refusal is
// visible.
//
// This list must MIRROR the real module's exports — a stub that keeps offering
// a retired action is a fixture that lies. Pinned by
// test/fs/branchLegacyReadOnly.test.mjs.
export async function listRegistrations()            { return { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 }; }
export async function getRegistrationById()          { return null; }
export async function updateRegistrationStatus()     { return { ok: false, error: 'stubbed' }; }
export async function updateRegistration()           { return { ok: false, error: 'stubbed' }; }
export async function deleteRegistration()           { return { ok: false, error: 'stubbed' }; }
export async function getRegistrationStatusCounts()  { return { total: 0, range: 'all', source: 'public' }; }
