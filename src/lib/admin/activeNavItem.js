/**
 * Which sidebar item is highlighted for a given pathname — LONGEST MATCH WINS.
 *
 * ══ THE DEFECT THIS REPLACES, WHICH SHIPPED ═════════════════════════════════
 * AdminSidebar's `SidebarItem` decided highlighting per item, in isolation:
 *
 *     const isActive = item.exact
 *       ? currentPath === item.href
 *       : currentPath === item.href
 *         || (item.href !== '/admin' && currentPath.startsWith(item.href));
 *
 * Nothing in that expression can see the other 37 items, so on
 * `/admin/masterclass/registrations` BOTH `Masterclass` (`/admin/masterclass`)
 * and `MC — ผู้ลงทะเบียน` (`/admin/masterclass/registrations`) lit up at once:
 * each item's own test was true and neither could know the other's was too.
 * Two highlighted rows is not a cosmetic wobble — the highlight is the only
 * thing on the page that says where you are.
 *
 * The tempting fix is `exact: true` on the parent. It is wrong twice over: it
 * would break `/admin/masterclass/68f…/edit`, which MUST still highlight
 * `Masterclass`, and it fixes only the pair someone noticed — the next nested
 * href pair reintroduces the bug with no test to catch it. The rule has to be
 * a property of the LIST, so selection happens ONCE for the whole list.
 *
 * ── SAME SEMANTICS AS resolvePageKey, DELIBERATELY ──────────────────────────
 * `resolvePageKey` in src/lib/rbac/access.js → src/lib/rbac/pages.js already
 * answers the same question ("which registry row owns this path?") for the
 * ACCESS guard, using longest-href-wins over the same hrefs. If the highlight
 * used a different rule from the guard, the menu could highlight one row while
 * the guard authorised another — so this reimplements that rule rather than
 * inventing a second one. It is a separate module and not a call into
 * resolvePageKey because the inputs differ: that one reads ADMIN_PAGES and
 * returns a page KEY; this one reads whatever list the sidebar is actually
 * RENDERING (already filtered by canAccess) and returns an HREF. Feeding the
 * registry's rows to the sidebar would highlight rows that are not on screen.
 *
 * Pure — no React, no next/navigation, no imports at all — so the rule is
 * testable as a table of paths (see test/pure/activeNavItem.test.mjs).
 */

/** Strip a single trailing slash (but keep the root '/'). Mirrors pages.js. */
function normalizePath(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return '';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Does `path` fall under `item`?
 *
 * `exact: true` → the href and nothing below it. Two items rely on this and
 * both would be wrong without it:
 *   · `/admin` — every admin route starts with it, so as a prefix it would
 *     match all 38 and (being the shortest) lose every tie, but it would still
 *     be the answer for any path no other item claims. Dashboard would light up
 *     on unrelated pages.
 *   · `/admin/promotions` — its own edit routes live under it, but so does
 *     `/admin/promotions/banner`, a SEPARATE menu row.
 *
 * Otherwise: the href itself, or a path strictly beneath it. The `/` in the
 * prefix test is load-bearing — a bare startsWith would make
 * `/admin/coursesX` match `/admin/courses`.
 */
function matches(path, item) {
  if (!item || typeof item.href !== 'string' || item.href === '') return false;
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(`${item.href}/`);
}

/**
 * Select the ONE active nav href for a pathname.
 *
 * @param {string} pathname          the current path (usePathname())
 * @param {Array<{href: string, exact?: boolean}>} items  flat list of nav items
 * @returns {string|null} the winning href, or null when nothing matches
 *
 * Ties: the longest href wins, so a child row beats its parent. Equal-length
 * hrefs cannot both match a path unless they are identical, and duplicate hrefs
 * in NAV_GROUPS are themselves a tested-against defect (test/fs/adminNavShape),
 * so first-wins on a tie is unreachable rather than arbitrary.
 */
export function activeNavHref(pathname, items) {
  const path = normalizePath(pathname);
  if (!path || !Array.isArray(items)) return null;

  let best = null;
  for (const item of items) {
    if (!matches(path, item)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best ? best.href : null;
}
