// Stub for `@/lib/auth/assertActiveAdmin`. The real module reads Mongo on every
// guard call, and the suite drives real guards with fake ids such as 'u-none'.
// Whether an admin is active is not what those tests are about, so here every
// session is. test/pure/activeAdminGuard tests the real module by relative path.
//
// Export set matches the real module exactly (stubExportParity rejects extras).
import { currentSession } from './fakeDb.mjs';

export const SESSION_ENDED_PATH = '/api/admin/session-ended';

export async function isActiveSession() {
  return true;
}

export async function assertActiveAdmin() {}

export async function getActiveSession() {
  const session = currentSession();
  return session?.user ? session : null;
}
