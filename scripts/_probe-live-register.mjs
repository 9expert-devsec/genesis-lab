/**
 * A module loader for LIVE probes — `@/` aliases and JSX, and NO data stubs.
 *
 * ── WHY THIS EXISTS BESIDE _probe-panel-register.mjs ───────────────────────
 * That one registers test/loader.mjs, which is right for probes that only need
 * the alias. It is WRONG for a probe that measures data, because it stubs
 * `@/lib/db/connect` with a no-op. Both course stores catch their own failures
 * and fail open:
 *
 *   loadHiddenCourseIds → `catch { return new Set() }`  ("nothing is hidden")
 *   loadCourseOrder     → `catch { return null }`       ("order nothing")
 *
 * With the connect stub in place, `CourseExtension.find()` buffers against a
 * connection that was never opened, times out after mongoose's 10 seconds, and
 * the catch turns that into "0 courses are hidden". A probe that then reported
 * "79 of 79 are public" would be reporting the fail-open path as a measurement.
 * Round 46 needed that number to be real, so this loader exists.
 *
 * ── WHAT IT STILL BRIDGES, AND WHY NONE OF IT TOUCHES THE DATA ─────────────
 * Three framework modules that do not resolve outside a Next runtime, stubbed
 * with the verification suite's own faithful stand-ins so a probe can RENDER a
 * section component:
 *
 *   next/link, next/image        plain <a> / <img>
 *   next/navigation              useRouter / useSearchParams during SSR
 *
 * None of them reads or writes course data; they decide markup, not numbers.
 * Everything else — the upstream adapter, both course stores, @/lib/db/connect,
 * every model — resolves to the real file and runs for real.
 *
 * Run a probe with:
 *   node --env-file=.env.local --import ./scripts/_probe-live-register.mjs <script>
 */
import { register } from 'node:module';

register(new URL('./_probe-live-hooks.mjs', import.meta.url));
