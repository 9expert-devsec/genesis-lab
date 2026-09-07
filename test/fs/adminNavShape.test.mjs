import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ADMIN_PAGES, ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { activeNavHref } from '@/lib/admin/activeNavItem';
import { readSource, ROOT } from '../sourceScan.mjs';

/**
 * The SHAPE of the admin sidebar's NAV_GROUPS, and its agreement with the
 * ADMIN_PAGES registry.
 *
 * ══ WHAT THIS ADDS OVER test/fs/rbacNavParity ═══════════════════════════════
 * rbacNavParity joins the two lists on `href` and asks three questions: is
 * every registered page linked, does an href mean the same pageKey in both,
 * is every link registered. Those are the ROW-level questions and they stay
 * there.
 *
 * This file asks the questions the round-A regroup created, which are about the
 * SHAPE rather than the rows:
 *
 *   · are the six group labels, and their ORDER, the same in both files?
 *     PAGE_KEYS_BY_GROUP is keyed on ADMIN_PAGES' `group`, and /admin/roles
 *     renders its checkbox sections from it. Regroup one file and not the other
 *     and the roles screen starts describing a menu that has not existed for
 *     months — an admin hunting "จัดการคอนเทนต์ → รีวิวแนะนำ" finds a heading
 *     the sidebar dropped. Nothing else would notice: no import, no type, no
 *     runtime error.
 *   · is the KEY SET identical, minus one explicitly named absence?
 *     Asserted with deepEqual on sorted arrays, deliberately, and not with a
 *     length or a `>=`. `profile` leaving the nav in this round is exactly the
 *     shape of change that a floor-style check waves through, and the next key
 *     to go quiet would go quiet the same way.
 *   · are the group `id`s — the localStorage keys for per-group collapse —
 *     unique and ascii? They are stored per browser, so a duplicate id silently
 *     yokes two groups together and a Thai id would key persistence to display
 *     copy that has already been reworded once.
 *   · do the hrefs point at real route files?
 *
 * ── READING THE SIDEBAR ─────────────────────────────────────────────────────
 * AdminSidebar.jsx is a 'use client' component importing lucide-react and
 * next/navigation; importing it into an fs-tier test to read one array would
 * drag a React runtime in. It is read as SOURCE, through sourceScan.readSource()
 * so comments cannot satisfy a matcher and CRLF is already normalised.
 *
 * The array literal is then EVALUATED rather than regex-scraped. NAV_GROUPS is
 * pure data — strings, booleans, arrays, objects, no identifiers — so
 * `Function('return ' + literal)()` yields the real structure including group
 * order, ids, and per-item `exact` flags, none of which a flat
 * `href … pageKey` regex can see. Scraping is the weak point of a source guard
 * (a matcher that silently matched nothing makes every assertion pass
 * vacuously), so THE EXTRACTION IS ASSERTED FIRST, before anything is concluded
 * from it.
 */

const SIDEBAR_REL = 'src/components/layout/AdminSidebar.jsx';
const SIDEBAR = readSource(SIDEBAR_REL);

/**
 * Registered page keys that deliberately have NO nav row.
 *
 * NAMED, not counted. The set difference between the two lists is asserted
 * against exactly this allowlist, so a key that quietly stops being linked in
 * some future edit FAILS here instead of shrinking a number nobody reads.
 *
 * Exported so the reason travels with the name and a reader grepping for
 * 'profile' lands on it.
 */
export const NO_NAV_ITEM = Object.freeze([
  // Reached from the signed-in identity card in the sidebar FOOTER, which links
  // to /admin/profile when canAccess(user, 'profile') — not from a nav row. It
  // stays in ADMIN_PAGES because the permission key, MENU_ENUM membership (so
  // profile edits are auditable) and the /admin/roles checkbox all come from
  // there; deleting it would revoke the page from every non-superadmin role.
  'profile',

  // ── THE TWO DASHBOARD SCOPES — UNLINKED FOR A DIFFERENT REASON ────────────
  // `profile` has a route and no nav row. These have NO ROUTE AT ALL: they are
  // permissions over SECTIONS of /admin, which `dashboard` already links. Their
  // registry rows carry `href: null`, so there is nothing a nav item could point
  // at, and giving them one would offer the menu a 404.
  //
  // They are named here anyway, rather than left to fall out of the href-less
  // case, because the assertion below is a SET EQUALITY: an unlisted registry
  // key with no nav row fails it whatever the reason. Writing the reason down is
  // the price of the exception, and that is the property this allowlist exists
  // to keep — see the header note about a floor-style check waving `profile`
  // through.
  'dashboard_registrations',
  'dashboard_system',
]);

/** The NAV_GROUPS array literal, evaluated. Pure data, no identifiers. */
function extractNavGroups(code) {
  const start = code.indexOf('const NAV_GROUPS = [');
  assert.notEqual(start, -1, `NAV_GROUPS declaration not found in ${SIDEBAR_REL}`);
  const open = code.indexOf('[', start);

  // Walk the brackets rather than regexing to the first '];' — an item label
  // containing ']' would end the literal early and silently truncate the list.
  let depth = 0;
  let end = -1;
  for (let i = open; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  assert.notEqual(end, -1, 'NAV_GROUPS literal is unbalanced');
  // eslint-disable-next-line no-new-func -- data-only literal, read from our own source
  return Function(`return ${code.slice(open, end + 1)};`)();
}

const NAV_GROUPS = extractNavGroups(SIDEBAR.code);
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items ?? []);
const REGISTRY_GROUPS = ADMIN_PAGES.map((g) => g.group);
const REGISTRY_KEYS = ADMIN_PAGES.flatMap((g) => g.pages.map((p) => p.key));

const sorted = (a) => [...a].sort();

// ── the extraction is asserted BEFORE it is trusted ─────────────────────────
test('nav shape: the NAV_GROUPS literal was extracted, populated and well-formed', () => {
  assert.ok(Array.isArray(NAV_GROUPS), 'NAV_GROUPS did not evaluate to an array');
  assert.equal(NAV_GROUPS.length, 6, `expected 6 groups, extracted ${NAV_GROUPS.length}`);
  assert.equal(NAV_ITEMS.length, 38, `expected 38 nav items, extracted ${NAV_ITEMS.length}`);
  for (const group of NAV_GROUPS) {
    assert.equal(typeof group.id, 'string', `a group has no id: ${JSON.stringify(group.label)}`);
    assert.equal(typeof group.label, 'string', `group '${group.id}' has no label`);
    assert.ok(Array.isArray(group.items), `group '${group.id}' has no items array`);
  }
  for (const item of NAV_ITEMS) {
    assert.equal(typeof item.href, 'string', `an item has no href: ${JSON.stringify(item)}`);
    assert.equal(typeof item.pageKey, 'string', `${item.href} has no pageKey`);
    assert.equal(typeof item.label, 'string', `${item.href} has no label`);
  }
});

// ── A5.1 ────────────────────────────────────────────────────────────────────
test('nav shape: every NAV_GROUPS pageKey exists in ALL_PAGE_KEYS', () => {
  const registry = new Set(ALL_PAGE_KEYS);
  const unknown = NAV_ITEMS.map((i) => i.pageKey).filter((k) => !registry.has(k));
  assert.deepEqual(
    unknown, [],
    'canAccess() narrows an unregistered key to "no access" for EVERY role including '
    + 'the owner, so the row would be silently invisible rather than error',
  );
});

// ── A5.2 ────────────────────────────────────────────────────────────────────
test('nav shape: the key SETS match, minus the named NO_NAV_ITEM allowlist', () => {
  const expected = REGISTRY_KEYS.filter((k) => !NO_NAV_ITEM.includes(k));
  assert.deepEqual(
    sorted(NAV_ITEMS.map((i) => i.pageKey)),
    sorted(expected),
    'a registered page lost its nav row, or a nav row names a key the registry '
    + 'does not have. If the omission is deliberate, add the key to NO_NAV_ITEM '
    + 'in this file WITH its reason — do not relax this assertion',
  );
});

test('nav shape: every NO_NAV_ITEM entry is a real registered key', () => {
  for (const key of NO_NAV_ITEM) {
    assert.ok(
      REGISTRY_KEYS.includes(key),
      `NO_NAV_ITEM names '${key}', which is not in ADMIN_PAGES — a stale exception `
      + 'weakens the set-equality assertion above by excusing a key that cannot appear',
    );
  }
});

// ── A5.3 ────────────────────────────────────────────────────────────────────
test('nav shape: group labels and group ORDER match between the two lists', () => {
  assert.deepEqual(
    NAV_GROUPS.map((g) => g.label),
    REGISTRY_GROUPS,
    'ADMIN_PAGES groups feed PAGE_KEYS_BY_GROUP, which is what /admin/roles renders '
    + 'its checkbox sections from — regrouping one file and not the other makes the '
    + 'roles screen describe a menu that no longer exists',
  );
});

test('nav shape: item ORDER within each group matches too', () => {
  for (const [i, group] of NAV_GROUPS.entries()) {
    const registryKeys = ADMIN_PAGES[i].pages
      .map((p) => p.key)
      .filter((k) => !NO_NAV_ITEM.includes(k));
    assert.deepEqual(
      group.items.map((it) => it.pageKey),
      registryKeys,
      `group '${group.label}' lists its rows in a different order in the two files — `
      + 'the roles checkboxes and the menu should read top-to-bottom the same way',
    );
  }
});

// ── A5.4 ────────────────────────────────────────────────────────────────────
test('nav shape: no duplicate href and no duplicate pageKey', () => {
  const dupes = (xs) => sorted(xs.filter((x, i, a) => a.indexOf(x) !== i));
  assert.deepEqual(dupes(NAV_ITEMS.map((i) => i.href)), [],
    'two rows linking the same href would both highlight, and React would warn on the key');
  assert.deepEqual(dupes(NAV_ITEMS.map((i) => i.pageKey)), [],
    'one permission granting two rows hides the second failure mode: revoke it and both vanish');
});

// ── A5.5 ────────────────────────────────────────────────────────────────────
test('nav shape: group ids are unique, ascii slugs — they are persistence keys', () => {
  const ids = NAV_GROUPS.map((g) => g.id);
  assert.deepEqual(sorted(ids.filter((x, i, a) => a.indexOf(x) !== i)), [],
    'duplicate ids share one entry in the admin-sidebar-groups map, so collapsing '
    + 'one group would silently collapse the other');
  for (const id of ids) {
    assert.match(
      id, /^[a-z][a-z0-9-]*$/,
      `group id '${id}' is not an ascii slug. Ids key the localStorage collapse map; `
      + 'a Thai id would tie a stored preference to display copy, and these labels have '
      + 'already been reworded once (จัดการหลักสูตร → หลักสูตร & ตาราง)',
    );
  }
});

test('nav shape: the ids are what the collapse map is actually keyed on', () => {
  // Without this the assertions above are true and irrelevant: the ids could
  // stay unique and ascii while the component stored preferences under
  // `group.label`, and every stored preference would reset the next time a
  // label is reworded — which this round did to three of the six.
  assert.match(
    SIDEBAR.code, /parseGroupCollapse\(localStorage\.getItem\(GROUPS_KEY\), GROUP_IDS\)/,
    'the collapse map must be validated against the group IDS',
  );
  assert.match(SIDEBAR.code, /const GROUP_IDS = NAV_GROUPS\.map\(\(g\) => g\.id\)/);
});

// ── A5.6, re-run against the REAL extracted nav ─────────────────────────────
// test/pure/activeNavItem.test.mjs owns the RULE, over the registry's hrefs.
// This runs the same table over the array the sidebar actually renders, exact
// flags and all — the pure tier cannot see those, and they change the answer.
const ACTIVE_TABLE = [
  ['/admin',                                           '/admin'],
  ['/admin/masterclass',                               '/admin/masterclass'],
  ['/admin/masterclass/registrations',                 '/admin/masterclass/registrations'],
  ['/admin/masterclass/68f0a1b2c3d4e5f607182930/edit', '/admin/masterclass'],
  ['/admin/promotions',                                '/admin/promotions'],
  ['/admin/promotions/banner',                         '/admin/promotions/banner'],
  ['/admin/courses/new',                               '/admin/courses'],
  ['/admin/faqs',                                      '/admin/faqs'],
  ['/admin/local-faqs',                                '/admin/local-faqs'],
  ['/admin/no-such-page',                              null],
];

for (const [path_, expected] of ACTIVE_TABLE) {
  test(`nav shape: exactly one row is active on ${path_}`, () => {
    const winner = activeNavHref(path_, NAV_ITEMS);
    assert.equal(winner, expected);
    assert.equal(
      NAV_ITEMS.filter((i) => i.href === winner).length,
      expected === null ? 0 : 1,
    );
  });
}

test('nav shape: the exact-flagged hrefs are the two the rule depends on', () => {
  // Mirrored in EXACT_HREFS in test/pure/activeNavItem.test.mjs, which cannot
  // read them (ADMIN_PAGES marks only /admin). If a flag legitimately changes,
  // change it in BOTH places — this assertion exists so that is not optional.
  assert.deepEqual(
    sorted(NAV_ITEMS.filter((i) => i.exact).map((i) => i.href)),
    ['/admin', '/admin/promotions'],
  );
});

// ── A5.7 ────────────────────────────────────────────────────────────────────
const ROUTE_EXTS = ['jsx', 'js', 'tsx', 'ts'];

test('nav shape: every href resolves to a real route file under src/app/admin/', () => {
  const missing = [];
  for (const item of NAV_ITEMS) {
    const rel = item.href.replace(/^\//, '').split('/').join(path.sep);
    const dir = path.join(ROOT, 'src', 'app', rel);
    if (!ROUTE_EXTS.some((ext) => existsSync(path.join(dir, `page.${ext}`)))) {
      missing.push(`${item.pageKey} → ${item.href} (no page.* under src/app/${item.href.slice(1)}/)`);
    }
  }
  assert.deepEqual(
    missing, [],
    'a nav row pointing at a route that does not exist is a 404 the menu offers you',
  );
});

test('CONTROL: the route-file check can fail', () => {
  // The assertion above is a loop that reports [] both when every href resolves
  // and when NAV_ITEMS is empty. This proves the resolver actually says no.
  const dir = path.join(ROOT, 'src', 'app', 'admin', 'definitely-not-a-route');
  assert.equal(ROUTE_EXTS.some((ext) => existsSync(path.join(dir, `page.${ext}`))), false);
  const real = path.join(ROOT, 'src', 'app', 'admin');
  assert.equal(existsSync(path.join(real, 'page.jsx')), true);
});
