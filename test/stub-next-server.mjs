// Test stub for `next/server`.
//
// NextResponse.json is needed by the webhook route under test; it maps onto the
// global Response so `res.status` reads back exactly as the real one would.
//
// `after` is needed because src/lib/audit/recordAdminAction.js imports it at
// module scope for recordAdminActionAfter(), and the pure writer tests import
// that module. Without it the import resolves to `undefined` and every test in
// that file dies on load rather than on the assertion it was written for.
//
// The real `after` defers its callback until the response has been sent and
// THROWS when called outside a request scope. This stub runs the callback
// immediately instead, which is the faithful part (the work happens) minus the
// part no test can observe (when). Tests that need the throwing behaviour inject
// their own via the `deps` seam rather than relying on this — see
// test/pure/adminAuditLog.test.mjs.
export function after(callback) {
  if (typeof callback === 'function') callback();
}
export class NextResponse extends Response {
  static json(body, init = {}) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
  }
}
