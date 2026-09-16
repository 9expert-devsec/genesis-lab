/**
 * A COOPERATIVE stub for `globalThis.fetch`, for tests that drive code which
 * calls the global directly (a route handler, the chat client).
 *
 * ── WHY NOT `saved = fetch; fetch = stub; …; fetch = saved` ────────────────
 * The runner is `isolation: 'none'` with `concurrency: true`: every file runs
 * in ONE process and files INTERLEAVE. Two files each doing save/replace/
 * restore on the same global race each other — measured, not supposed:
 *
 *   file A installs stubA        (saved = real)
 *   file B installs stubB        (saved = stubA)
 *   file A's test ends, restores → fetch = real
 *   file B's code under test now hits the REAL network         → B fails
 *   file B's test ends, "restores" → fetch = stubA              → LEAKED
 *
 * That is exactly what happened to test/pure/chatClient and
 * test/pure/chatFeedbackRoute on their first full run: green alone, red
 * together, and a stub left behind for whatever ran next.
 *
 * ── THE SHAPE ──────────────────────────────────────────────────────────────
 * ONE dispatcher is installed the first time anyone needs it and captures the
 * real fetch once. Callers register a HANDLER for the URLs they own (a
 * predicate over the URL string) for the duration of one `withFetch(…)`; the
 * dispatcher tries the handlers newest-first and falls through to the real
 * fetch when none claims the URL. Two files stubbing different URLs at the
 * same time cannot evict each other, because neither touches the global —
 * only the registry. When the last handler leaves, the dispatcher restores the
 * real fetch — and only if the global is still the dispatcher, so a file that
 * replaced fetch by hand is left alone rather than clobbered.
 *
 * Handlers are named so a CONTROL can assert that a file left nothing behind.
 */

let real = null;
const handlers = []; // { name, match, handle }

async function dispatcher(input, init) {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const h = handlers[i];
    if (h.match(url)) return h.handle(input, init);
  }
  return real(input, init);
}

function install() {
  if (globalThis.fetch === dispatcher) return;
  real = globalThis.fetch;
  globalThis.fetch = dispatcher;
}

function uninstallIfIdle() {
  if (handlers.length === 0 && globalThis.fetch === dispatcher) {
    globalThis.fetch = real;
    real = null;
  }
}

/**
 * Run `fn` with `handle` answering every fetch whose URL satisfies `match`.
 * `calls` (passed to `fn`) records `{ url, init, body }` for each such fetch,
 * with `body` parsed as JSON when the init carried a string body.
 *
 * @param {object}   o
 * @param {string}   o.name    a label for the CONTROL below (e.g. the test file)
 * @param {(url: string) => boolean} o.match
 * @param {(input, init, calls) => Response | Promise<Response>} o.handle
 * @param {(calls: object[]) => any} fn
 */
export async function withFetch({ name, match, handle }, fn) {
  const calls = [];
  const entry = {
    name,
    match,
    handle: async (input, init) => {
      let body = null;
      try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch { body = init?.body ?? null; }
      const url = typeof input === 'string' ? input : (input?.url ?? String(input));
      calls.push({ url, init, body });
      return handle(input, init, calls);
    },
  };
  install();
  handlers.push(entry);
  try {
    return await fn(calls);
  } finally {
    const at = handlers.indexOf(entry);
    if (at !== -1) handlers.splice(at, 1);
    uninstallIfIdle();
  }
}

/** A JSON Response, for handlers. */
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** For CONTROLs: the names of the handlers currently registered, and whether the dispatcher is installed. */
export function fetchStubState() {
  return { installed: globalThis.fetch === dispatcher, names: handlers.map((h) => h.name) };
}
