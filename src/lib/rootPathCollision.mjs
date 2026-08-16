/**
 * IF A FILE WERE PUBLISHED AT /<filename>, WHAT REAL THING WOULD IT COLLIDE
 * WITH?
 *
 * ══ IT REPORTS. IT DOES NOT DECIDE. ═════════════════════════════════════════
 *
 * Every return value is a list of things that already answer to that path, each
 * with a KIND and the thing itself, so a caller can say WHICH path is in the
 * way. Whether a given collision should refuse an upload, warn, or be ignored
 * is policy, and policy is not here — a module that returned `{allowed:false}`
 * would be making a ruling nobody had written down.
 *
 * ══ THE TRAP, AND WHY THE CATCH-ALL IS EXCLUDED ═════════════════════════════
 *
 * Measured (phase 1 M5): `/[...slug]` is a real entry in `dynamicRoutes` with
 * regex `^/(.+?)(?:/)?$`. That matches EVERY non-empty path. A checker that
 * regex-tests the input against all 30 dynamic routes therefore reports a
 * collision for every filename ever passed to it — always "true", always
 * useless, and worse than nothing because it looks like a check.
 *
 * So DYNAMIC ROUTES ARE NOT REGEX-MATCHED AT ALL. The catch-all does not
 * *reserve* a path; it *resolves* one, by asking the database. A filename
 * collides with the catch-all only if some stored slug equals it — which is a
 * DATA question, not a routing one, and is answered by the injected lookup
 * below. `dynamicRoutes` is read only to prove the catch-all is still there and
 * still shaped the way this reasoning depends on (see `catchAllIsPresent`).
 *
 * ══ THE FOUR SURFACES, ALL MEASURED IN M5 ══════════════════════════════════
 *
 *   STATIC_ROUTE   78 staticRoutes, of which 19 are single-segment roots
 *   PUBLIC_FILE    6 top-level entries in public/ — Next serves these directly
 *   REWRITE        55 afterFiles rules; their `source` claims the path first
 *   DB_SLUG        what the catch-all resolves, restricted to slugs that END IN
 *                  A DOCUMENT EXTENSION — the only stored slug a
 *                  document-extension rule could ever steal
 *
 * ══ CASE ═══════════════════════════════════════════════════════════════════
 *
 * `routes-manifest.json` carries `caseSensitive: false` (read, not assumed —
 * printed in M5). So `/About-Us` and `/about-us` are the same route to Next,
 * and comparison here is case-insensitive for the ROUTING surfaces to match
 * that. The comparison is reported per collision as `matchedCaseInsensitively`
 * so a caller can tell an exact clash from a casing clash — they read
 * differently to an operator even when they mean the same refusal.
 *
 * DB slugs are compared case-insensitively too, but for a different reason and
 * it is NOT established that Mongo agrees: a slug lookup's collation is a
 * property of the query and the index, not of this module. Reported in the
 * result rather than claimed — see the note on `DB_SLUG`.
 *
 * ══ PURE ════════════════════════════════════════════════════════════════════
 *
 * No fs, no manifest read, no database. The manifest is passed IN — the caller
 * reads `.next/routes-manifest.json` at RUNTIME so this cannot drift from what
 * was actually built — and the slug lookup is an injected function.
 */

/** What kind of thing is in the way. */
export const COLLISION = Object.freeze({
  /** A built page or route handler answers this exact path. */
  STATIC_ROUTE: 'static-route',
  /** A file or directory in public/ — Next serves it before any route runs. */
  PUBLIC_FILE: 'public-file',
  /** An existing rewrite already claims this source. */
  REWRITE: 'rewrite',
  /** A stored slug the root catch-all resolves. */
  DB_SLUG: 'db-slug',
});

const clean = (v) => String(v ?? '').trim();
const lower = (v) => clean(v).toLowerCase();

/** `foo.pdf` → `/foo`. Accepts either form; never returns a trailing slash. */
export function rootPathFor(filename) {
  const name = clean(filename).replace(/^\/+/, '');
  return name ? `/${name}` : '';
}

/**
 * Is the root catch-all still present and still shaped as this module assumes?
 *
 * Exported so a caller can FAIL LOUDLY rather than silently under-reporting. If
 * `/[...slug]` were ever removed, an unmatched root path would 404 instead of
 * reaching the database, and the DB_SLUG surface would stop being a collision
 * surface at all — the checker would go on returning fewer collisions and look
 * like it was working.
 */
export function catchAllIsPresent(manifest) {
  const dynamic = manifest?.dynamicRoutes ?? [];
  return dynamic.some((r) => r?.page === '/[...slug]');
}

/** Single-segment static routes — the only ones a root filename can hit. */
export function rootStaticRoutes(manifest) {
  return (manifest?.staticRoutes ?? [])
    .map((r) => clean(r?.page))
    .filter((p) => p && p !== '/' && !p.slice(1).includes('/'));
}

/** Every `source` an afterFiles rewrite already claims, single-segment only. */
export function rootRewriteSources(manifest) {
  const rw = manifest?.rewrites;
  const after = Array.isArray(rw) ? rw : (rw?.afterFiles ?? []);
  return after
    .map((r) => clean(r?.source))
    .filter((s) => s && !s.slice(1).includes('/'));
}

/**
 * What would be in the way at `/<filename>`.
 *
 * @param {string} filename e.g. `9expert-company-profile.pdf`
 * @param {object} input
 * @param {object} input.manifest        parsed `.next/routes-manifest.json`
 * @param {string[]} [input.publicEntries] top-level names in `public/`
 * @param {string[]} [input.dbSlugs]     stored slugs the catch-all resolves.
 *        The CALLER restricts these to slugs ending in a document extension —
 *        it owns the query; this module owns the comparison.
 * @returns {{path: string, collisions: object[], clean: boolean,
 *            catchAllPresent: boolean}}
 */
export function findRootPathCollisions(filename, {
  manifest = null,
  publicEntries = [],
  dbSlugs = [],
} = {}) {
  const path = rootPathFor(filename);
  const name = clean(filename).replace(/^\/+/, '');
  const collisions = [];

  if (!path) {
    return { path: '', collisions: [], clean: false, catchAllPresent: catchAllIsPresent(manifest) };
  }

  const add = (kind, what, exact) => collisions.push({
    kind,
    what,
    matchedCaseInsensitively: !exact,
  });

  // ── 1. static routes, EXACT path match ────────────────────────────────────
  for (const route of rootStaticRoutes(manifest)) {
    if (route === path) add(COLLISION.STATIC_ROUTE, route, true);
    else if (lower(route) === lower(path)) add(COLLISION.STATIC_ROUTE, route, false);
  }

  // ── 2. public/ entries, EXACT name match ──────────────────────────────────
  // Compared as NAMES, not paths: a public/ entry is a filesystem name and
  // Next serves it at `/<name>`.
  for (const entry of publicEntries) {
    const e = clean(entry);
    if (!e) continue;
    if (e === name) add(COLLISION.PUBLIC_FILE, `/${e}`, true);
    else if (lower(e) === lower(name)) add(COLLISION.PUBLIC_FILE, `/${e}`, false);
  }

  // ── 3. rewrite sources ────────────────────────────────────────────────────
  // The three webroot documents live here, so replacing one of them reports a
  // REWRITE collision — correctly. "This path is already claimed" is the true
  // statement; that the claimant is the file being replaced is the caller's to
  // interpret, and is exactly the policy this module refuses to encode.
  for (const source of rootRewriteSources(manifest)) {
    if (source === path) add(COLLISION.REWRITE, source, true);
    else if (lower(source) === lower(path)) add(COLLISION.REWRITE, source, false);
  }

  // ── 4. stored slugs the catch-all resolves ────────────────────────────────
  for (const slug of dbSlugs) {
    const s = clean(slug).replace(/^\/+/, '');
    if (!s) continue;
    if (s === name) add(COLLISION.DB_SLUG, `/${s}`, true);
    else if (lower(s) === lower(name)) add(COLLISION.DB_SLUG, `/${s}`, false);
  }

  return {
    path,
    collisions,
    clean: collisions.length === 0,
    catchAllPresent: catchAllIsPresent(manifest),
  };
}
