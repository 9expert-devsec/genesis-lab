// Stub for `@/lib/db/connect`. The real module opens a mongoose connection from
// MONGODB_URI; the fake models need none, so this is a no-op that keeps the
// actions' `await dbConnect()` call sites honest.
export async function dbConnect() { /* fake models need no connection */ }
