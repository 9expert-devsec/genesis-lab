// Test stub for `next/server`. Only NextResponse.json is needed by the webhook
// route under test; it maps onto the global Response so `res.status` reads back
// exactly as the real one would.
export class NextResponse extends Response {
  static json(body, init = {}) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
  }
}
