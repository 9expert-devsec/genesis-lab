// Stub for `@/models/CustomPage`. Default export only (see test/fakeDb.mjs).
// Reached through slugGuard on every create/duplicate; a REAL model here would
// buffer its query against a connection that does not exist and hang the suite,
// which since round 0 removed the runner's force-exit is a hang, not a kill.
import { makeModel } from './fakeDb.mjs';

export default makeModel('CustomPage');
