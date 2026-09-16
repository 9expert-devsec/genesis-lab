/**
 * Stub for `next/headers`.
 *
 * `cookies()` reads Next's per-request async context and THROWS outside a
 * request, so a server component that calls it cannot be driven by this runner
 * at all without a stand-in. Round 36 needed one: /preview/[slug] is a public
 * route whose whole correctness argument is about what it renders in each
 * state, and a source scan cannot tell a gate that runs from a gate that is
 * merely present.
 *
 * The jar is MODULE-LEVEL and settable, in the same shape test/fakeDb.mjs uses
 * for its session. Tests set it, drive the route, and reset it.
 *
 * DELIBERATELY MINIMAL. Only `cookies()` and only `.get()` — the surface the
 * code under test actually uses. Anything else throws by name rather than
 * answering emptily, so a route that starts reading headers() or setting a
 * cookie fails loudly here instead of silently taking a different branch.
 */

let jar = new Map();

/** Replace the whole jar. `{ name: value }` or a Map. */
export function setCookies(entries) {
  jar = entries instanceof Map ? new Map(entries) : new Map(Object.entries(entries ?? {}));
}

export function clearCookies() {
  jar = new Map();
}

export async function cookies() {
  return {
    get(name) {
      return jar.has(name) ? { name, value: jar.get(name) } : undefined;
    },
    getAll() {
      return [...jar].map(([name, value]) => ({ name, value }));
    },
    has(name) {
      return jar.has(name);
    },
    set() {
      throw new Error('stub-next-headers: cookies().set is not supported under test');
    },
    delete() {
      throw new Error('stub-next-headers: cookies().delete is not supported under test');
    },
  };
}

/**
 * `headers()` — added deliberately, for the /api/chat/feedback route tests.
 *
 * Same shape as the cookie jar: MODULE-LEVEL and settable, `.get()` only. The
 * route reads `x-forwarded-for` / `x-real-ip` to key its rate limiter and
 * nothing else; a test that needs a different header sets it, and one that
 * sets nothing gets an empty bag (every `.get` → null, as the real API answers
 * for an absent header). Reset between tests with clearHeaders().
 */
let bag = new Map();

/** Replace the whole header bag. `{ name: value }` or a Map. Names are lower-cased, as the real API does. */
export function setHeaders(entries) {
  const pairs = entries instanceof Map ? [...entries] : Object.entries(entries ?? {});
  bag = new Map(pairs.map(([k, v]) => [String(k).toLowerCase(), String(v)]));
}

export function clearHeaders() {
  bag = new Map();
}

export async function headers() {
  return {
    get(name) {
      return bag.get(String(name).toLowerCase()) ?? null;
    },
    has(name) {
      return bag.has(String(name).toLowerCase());
    },
  };
}

export async function draftMode() {
  throw new Error('stub-next-headers: draftMode() is not stubbed — add it deliberately if needed');
}
