/**
 * Top-level URL segments a course alias must not claim.
 *
 * ── WHY A HARDCODED LIST AND NOT A DERIVED ONE ──────────────────────────────
 * The app-router tree IS derivable — a readdir of src/app/(public) and src/app
 * gives every routable segment — and deriving would normally win. It loses here
 * for one reason: the tree is a STRICT SUBSET of the space an alias can collide
 * with. Three other things reserve URLs and none of them is a directory:
 *
 *   · `redirects()` in next.config.mjs — a redirect fires BEFORE routing, so an
 *     alias equal to one never reaches [...slug] at all.
 *   · `public/` — served at the root by the framework.
 *   · src/middleware.js — runs before everything and matches paths in code.
 *
 * A guard that walked only the tree would be complete-LOOKING and incomplete,
 * which is worse than an explicit list: a stale list at least looks like
 * something a human owns. So the list below is what the check reads, and
 * test/fs/reservedPaths DERIVES each verifiable source and asserts parity — a
 * new page, a new redirect or a new public/ directory reddens the suite at the
 * commit that adds it.
 *
 * ── `source` IS NOT DECORATION ──────────────────────────────────────────────
 * It says HOW each entry is kept honest, and one value means "it is not":
 *
 *   tree      derived from the app-router tree        — parity asserted
 *   redirect  from next.config.mjs redirects()        — parity asserted
 *   static    a directory in public/                  — parity asserted
 *   manual    HAND-MAINTAINED AND UNVERIFIABLE        — nothing checks these
 *
 * The `manual` entries come from src/middleware.js and from framework
 * internals. Nothing can derive them without pattern-matching JavaScript, so
 * they are marked rather than quietly implied to be covered. If middleware
 * starts matching a new prefix, THIS FILE WILL NOT NOTICE — that is the known
 * hole, named here rather than only in a commit message.
 *
 * ── TOP SEGMENT ONLY ────────────────────────────────────────────────────────
 * `/articles` is checked; `/articles/foo` colliding with articles/[slug] is
 * not. Aliases are conventionally single-segment, and walking the whole tree
 * with its dynamic segments is a much larger job for a case nobody has hit.
 *
 * PURE and import-free on purpose: aliasAvailability imports THIS, so anything
 * imported back would be a cycle.
 */

export const RESERVED_SOURCE = Object.freeze({
  TREE: 'tree',
  REDIRECT: 'redirect',
  STATIC: 'static',
  MANUAL: 'manual',
});

export const RESERVED_PATHS = Object.freeze([
  // ── app-router tree: src/app/(public) ────────────────────────────────────
  { segment: 'about-us', source: 'tree' },
  { segment: 'articles', source: 'tree' },
  { segment: 'career-path-project', source: 'tree' },
  { segment: 'career-path-register', source: 'tree' },
  { segment: 'contact-us', source: 'tree' },
  { segment: 'cookie-policy', source: 'tree' },
  { segment: 'faq', source: 'tree' },
  { segment: 'join-us', source: 'tree' },
  { segment: 'masterclass', source: 'tree' },
  { segment: 'policies', source: 'tree' },
  { segment: 'portfolio', source: 'tree' },
  { segment: 'preview', source: 'tree' },
  { segment: 'privacy-policy', source: 'tree' },
  { segment: 'program', source: 'tree' },
  { segment: 'promotions', source: 'tree' },
  { segment: 'refund-policy', source: 'tree' },
  { segment: 'registration', source: 'tree' },
  { segment: 'restaurant-and-hotel-nearby-9expert-training', source: 'tree' },
  { segment: 'schedule', source: 'tree' },
  { segment: 'search', source: 'tree' },
  { segment: 'skill', source: 'tree' },
  { segment: 'social', source: 'tree' },
  { segment: 'terms', source: 'tree' },
  { segment: 'training-course', source: 'tree' },

  // ── app-router tree: src/app (outside the (public) group) ────────────────
  { segment: 'admin', source: 'tree' },
  { segment: 'api', source: 'tree' },
  { segment: 'legacy-file', source: 'tree' },
  // The root-file registry's delivery route. Reserved for the same reason
  // legacy-file is: it is a real app-router segment, so a course alias claiming
  // it would resolve to a file-delivery handler instead of a course page and
  // silently never render.
  { segment: 'root-file', source: 'tree' },

  // ── next.config.mjs redirects() ──────────────────────────────────────────
  // These never reach the router, so an alias here is unreachable in a way no
  // amount of correct routing can fix.
  { segment: 'cancellation-refund-policy', source: 'redirect' },
  { segment: 'online-course', source: 'redirect' },
  { segment: 'promotion', source: 'redirect' },
  { segment: 'rpa-all-courses', source: 'redirect' },

  // ── public/ — served at the root ─────────────────────────────────────────
  { segment: 'assets', source: 'static' },
  // The bundled default profile avatar (src/lib/avatar/avatarUrl.js). Listed on
  // the same conservative basis as every other entry in this block rather than
  // because the framework strictly forces it: `public/avatar/` makes Next serve
  // /avatar/avatar-default-512.png, but it does not claim the bare URL /avatar,
  // so a course alias of /avatar would probably still resolve today. "Probably"
  // is the problem — this list refuses the whole first segment for all eight of
  // its neighbours, and an alias that loses to a static file loses SILENTLY,
  // with no error and no symptom. The cost is named: no course can use /avatar.
  { segment: 'avatar', source: 'static' },
  { segment: 'brand', source: 'static' },
  // The Home hero artwork. Same `-img` convention as policies-img below.
  { segment: 'hero-img', source: 'static' },
  { segment: 'logo', source: 'static' },
  { segment: 'mock-article', source: 'static' },
  { segment: 'people', source: 'static' },
  // The legal centre's hero artwork. NOT `policies` — that is the /policies
  // route, and a public/ directory of the same name would shadow it in a way
  // that is very hard to see. The `-img` suffix is deliberate.
  { segment: 'policies-img', source: 'static' },
  { segment: 'port', source: 'static' },
  // The /masterclass landing page's artwork. Same shadowing concern as
  // policies-img above — not `masterclass`, which is the route itself.
  { segment: 'masterclass-element', source: 'static' },

  // ── HAND-MAINTAINED. NOTHING VERIFIES THESE. ─────────────────────────────
  // From src/middleware.js's pass-through prefixes and framework internals.
  // Middleware matches paths in code, so no test can derive this set; if a new
  // prefix is added there, nothing here will go red. Keep in step by hand.
  { segment: '_next', source: 'manual', note: 'framework internals' },
  { segment: 'favicon', source: 'manual', note: 'middleware pass-through prefix' },
  { segment: 'favicon.ico', source: 'manual', note: 'served from src/app' },
  { segment: 'fonts', source: 'manual', note: 'middleware pass-through; no public/fonts today' },
  { segment: 'icons', source: 'manual', note: 'middleware pass-through; no public/icons today' },
  { segment: 'robots.txt', source: 'manual', note: 'src/app/robots.js' },
  { segment: 'sitemap.xml', source: 'manual', note: 'src/app/sitemap.js' },
]);

/** Every entry contributed by a source the test can derive. */
export function reservedBySource(source) {
  return RESERVED_PATHS.filter((r) => r.source === source).map((r) => r.segment);
}

/**
 * The reserved entry an alias would collide with, or null.
 *
 * Compares the FIRST path segment, case-insensitively — a URL's first segment
 * is what decides which route handles it, and the framework's own matching does
 * not care about the case an admin typed.
 *
 * @param {string} alias e.g. '/schedule' or 'schedule'
 * @returns {{ segment: string, source: string }|null}
 */
export function reservedPathOwner(alias) {
  const raw = String(alias ?? '').trim();
  if (!raw) return null;
  // First non-empty segment: '/a/b' → 'a', 'a' → 'a', '//a' → 'a'.
  const first = raw.split('/').find(Boolean);
  if (!first) return null;
  const wanted = first.toLowerCase();
  const hit = RESERVED_PATHS.find((r) => r.segment.toLowerCase() === wanted);
  return hit ? { segment: hit.segment, source: hit.source } : null;
}
