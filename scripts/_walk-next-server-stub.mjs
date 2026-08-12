/**
 * `next/server` for the scratch walkthrough ONLY — the suite's stub plus the
 * two names next-auth's env module imports.
 *
 * Local to this script for the same reason as the next/headers stub: the shared
 * loader is used by 252 test files and widening it to satisfy one walkthrough
 * would change what the render tier can import.
 */
export * from '../test/stub-next-server.mjs';
export class NextRequest {}
export class NextResponse {
  static json(body, init) { return { body, init }; }
  static next() { return {}; }
  static redirect(url) { return { url }; }
}
