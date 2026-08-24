// Stub for `@/lib/auth/options`. The real module CALLS NextAuth() at import
// time, which reaches next-auth → next/headers and cannot resolve outside a
// Next request context — the same reason `@/lib/actions/auth` is stubbed.
// It is pulled in transitively by the page action modules an admin client
// imports, so rendering any admin list needs this.
//
// Export set matches the real module exactly (stubExportParity rejects extras).
// The session comes from test/fakeDb.mjs, so a render test and an action test
// see one actor.
import { currentSession } from './fakeDb.mjs';

export const handlers = {};

export async function auth() {
  return currentSession();
}

export async function signIn() {
  throw new Error('signIn is not callable under test');
}

export async function signOut() {
  throw new Error('signOut is not callable under test');
}
