// Stub for `@/lib/actions/auth`. The real module reaches next-auth (and through
// it the mongodb adapter) at import time, which is why it cannot be loaded in a
// test. requireAdmin returns the session test/fakeDb.mjs is currently holding,
// so a test can switch actor tier with setSessionUser().
//
// Export set matches the real module exactly — stubExportParity rejects extras.
import { currentSession } from './fakeDb.mjs';

export async function requireAdmin(_pageKey) {
  return currentSession();
}

export async function adminLogin(_prevState, _formData) {
  throw new Error('adminLogin is not callable under test');
}

export async function logoutAction() {
  throw new Error('logoutAction is not callable under test');
}
