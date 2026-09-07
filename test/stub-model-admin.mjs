// Stub for `@/models/Admin`. Default export only (see test/fakeDb.mjs).
//
// The real module builds a mongoose Schema at import time, which needs a live
// mongoose and — through any action that touches it — a connection. The avatar
// action is the first thing in this suite to CALL a server action that reads
// and writes an admin record, so it is the first to need this.
import { makeModel } from './fakeDb.mjs';

export default makeModel('Admin');
