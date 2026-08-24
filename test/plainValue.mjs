/**
 * The boundary walk — now a re-export, not a copy.
 *
 * Round 66 wrote this walk here, because at that point the only consumer was a
 * test asking about RETURN values. Round 67 found the boundary that actually
 * fails is the ARGUMENTS side, which needs the same check at RUNTIME inside the
 * Server Action — so the implementation moved to `src/lib/plainValue.js` and
 * this file forwards to it.
 *
 * It forwards rather than being deleted for one reason: round 66's tests and
 * probes import `../plainValue.mjs`, and a guard about drift should not require
 * a flag-day rename to keep working. Everything below is the SAME function
 * object the production code calls, so a test can never pass against a walk the
 * action does not use.
 */
export {
  nonPlainValues,
  isBoundarySafe,
  describeNonPlain,
  isTemporaryReference,
  unserialisableArguments,
  unserialisableMessage,
  toPlainJson,
} from '@/lib/plainValue';
