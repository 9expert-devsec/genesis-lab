// Stub for `@/models/EarlyBirdConfig`. Default export only (see test/fakeDb.mjs).
//
// `unique: ['course_id']` mirrors the real schema, and it is load-bearing
// rather than decorative: saveEarlyBird's refusal for a course another
// promotion holds arrives as E11000 from that index. Without it here the
// refusal's catch block is unreachable and would ship unproven.
//
// Its own PRIVATE store, so this collection is immune to `resetFakeDb()` —
// the suite runs one process with concurrency:true and a neighbour's reset
// would otherwise clear these rows mid-await. Tests clear it with
// `EarlyBirdConfig.deleteMany({})` instead.
import { makeModel, makeStore } from './fakeDb.mjs';

export default makeModel('EarlyBirdConfig', {
  unique: ['course_id'],
  store: makeStore(),
});
