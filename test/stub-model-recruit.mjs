// Stub for `@/models/Recruit`. Default export only (see test/fakeDb.mjs).
//
// The real module builds a mongoose Schema at import time, and any action that
// touches it then queries against a connection that does not exist — which,
// since the runner lost its force-exit, is a HANG rather than a failure.
//
// The MODEL is stubbed rather than the action module, deliberately: the write
// path is the subject under test here, so createRecruit/updateRecruit and the
// headcount normalisation inside them all still run for real.
//
// ── AND THAT MEANS THE SCHEMA'S CASTING DOES NOT RUN ────────────────────────
// Worth stating, because it changes what the write-path tests prove. Real
// Mongoose would cast a stray '3.7' on a Number path before it reached the
// database; this fake stores whatever the action hands it. That makes the fake
// STRICTER than production for this feature's purpose: a test asserting the
// stored value is a number is asserting the ACTION normalised it, not that
// Mongoose rescued it afterwards. Which is exactly the claim — the brief's
// rule is that the server must not trust the payload, and leaning on schema
// casting would be trusting it one layer down.
import { makeModel } from './fakeDb.mjs';

export default makeModel('Recruit');
