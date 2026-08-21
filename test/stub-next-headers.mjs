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

export async function headers() {
  throw new Error('stub-next-headers: headers() is not stubbed — add it deliberately if needed');
}

export async function draftMode() {
  throw new Error('stub-next-headers: draftMode() is not stubbed — add it deliberately if needed');
}
