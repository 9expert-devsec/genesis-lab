// Stub for `@/models/CoursePromoLink`. Default export only (see test/fakeDb.mjs).
//
// Nothing in the Early Bird tests touches this collection — it is here because
// `@/lib/actions/course-promos` imports the model at module scope, and a REAL
// mongoose model would buffer its first query against a connection that does
// not exist and hang the suite.
//
// Its own private store, for the same reason the EarlyBirdConfig stub has one.
import { makeModel, makeStore } from './fakeDb.mjs';

export default makeModel('CoursePromoLink', { store: makeStore() });
