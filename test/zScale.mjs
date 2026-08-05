// Shared Tailwind z-index resolution for the stacking guards.
//
// Extracted from test/pure/zIndexStack.test.mjs when test/pure/floatingDockStack
// needed the same thing. Copying it would have given two definitions of "does
// this z token actually generate" that must agree — the class of duplication
// this repo has now been bitten by several times (five schedule-status maps,
// one horizon constant written three ways, one rate-limit window released in two
// places). A guard about drift should not itself be a drift risk.
//
// The point it encodes: a bare `z-N` only produces CSS if N is in Tailwind's
// default scale OR in theme.extend.zIndex. `z-90` compiles to NOTHING and the
// element silently falls back to `z-index: auto` — no build error, no warning.
// Arbitrary `z-[N]` always generates.

/** Tailwind 3 default z-index scale (bare utilities that generate unconfigured). */
export const NATIVE_Z = new Set([0, 10, 20, 30, 40, 50]);

/** Parse the extra values tailwind.config.js adds under theme.extend.zIndex. */
export function configZScale(cfg) {
  const block = cfg.match(/zIndex\s*:\s*\{([^}]*)\}/s);
  const extra = new Set();
  if (block) for (const m of block[1].matchAll(/(\d+)\s*:/g)) extra.add(Number(m[1]));
  return extra;
}

/** Resolve a z token to a number, or null if it would NOT generate. */
export function resolveZ(token, extraScale) {
  const arb = token.match(/^z-\[(\d+)\]$/);
  if (arb) return Number(arb[1]);
  const bare = token.match(/^z-(\d+)$/);
  if (bare) {
    const n = Number(bare[1]);
    return NATIVE_Z.has(n) || extraScale.has(n) ? n : null;
  }
  return null;
}

/** First z token in a class string, bare or arbitrary. */
export const firstZ = (cls) => (cls.match(/z-\[?\d+\]?/) || [null])[0];

/**
 * Pull a className out of source, THROWING a named error when the anchor is gone.
 *
 * The reason this exists rather than `src.match(re)[0]`: two of the three
 * extraction points that read ScrollToTopButton.jsx were unguarded index access.
 * When the dock took over positioning and that file stopped containing a
 * template-literal className beginning with `fixed`, `match()` returned null and
 * `[0]` threw `TypeError: Cannot read properties of null` — the suite died with
 * a stack trace instead of a readable failure naming what moved. Same discipline
 * as classOf() in test/render/stickyBarButtonCoordination.
 */
export function classLiteral(src, { label, re, file }) {
  const m = src.match(re);
  if (!m) {
    throw new Error(
      `[z-scale] could not locate the className for "${label}" in ${file}. It was ` +
      'renamed, deleted, or its class order changed — this guard is now BLIND to ' +
      'that element. Re-anchor the selector; do NOT drop the entry, and do not ' +
      'let it degrade into an index error on null.'
    );
  }
  return m[0];
}
