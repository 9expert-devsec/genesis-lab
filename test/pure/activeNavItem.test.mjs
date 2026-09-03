import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeNavHref } from '@/lib/admin/activeNavItem';
import { ADMIN_PAGES } from '@/lib/rbac/pages';

/**
 * The sidebar highlight, as a table of paths.
 *
 * ══ THE DEFECT ══════════════════════════════════════════════════════════════
 * On `/admin/masterclass/registrations` the sidebar highlighted TWO rows.
 * `SidebarItem` decided `isActive` per item with `currentPath.startsWith(
 * item.href)`, and both `/admin/masterclass` and
 * `/admin/masterclass/registrations` are prefixes of that path. Each item's own
 * test was true; neither could see the other's. See the header of
 * src/lib/admin/activeNavItem.js for why `exact: true` is the wrong fix.
 *
 * ── WHAT THIS TABLE ACTUALLY ASSERTS ────────────────────────────────────────
 * Not "the right href wins" alone — that would still pass under a rule that
 * lights three rows including the right one. It asserts the COUNT: how many
 * items the sidebar would render active is exactly one (or zero, for a path no
 * item claims). That is the property the defect violated, so that is the
 * property written down.
 *
 * ── WHERE THE ITEM LIST COMES FROM ──────────────────────────────────────────
 * The hrefs are the real ones, read from ADMIN_PAGES — a plain data module with
 * no React in its import graph, so a pure-tier test can have it. It is not the
 * literal NAV_GROUPS array (importing AdminSidebar.jsx here would drag
 * lucide-react and next/navigation into pure/ to read one list), and the two are
 * held to the same href set by test/fs/rbacNavParity + test/fs/adminNavShape.
 * The same table is re-run against the REAL extracted NAV_GROUPS, exact flags
 * and all, in test/fs/adminNavShape.test.mjs — this tier owns the rule, that
 * tier owns the data.
 */

/**
 * The two hrefs the sidebar marks `exact: true`, mirrored here.
 *
 * ADMIN_PAGES marks only `/admin` as `match: 'exact'`; NAV_GROUPS additionally
 * marks `/admin/promotions`, because its own `[id]/config` child is not a menu
 * row and the neighbouring `/admin/promotions/banner` IS. That divergence is
 * real and deliberate, so it is written down rather than derived — and
 * test/fs/adminNavShape asserts the sidebar's exact-flagged set still equals
 * this one, so the two cannot drift apart in silence.
 */
const EXACT_HREFS = new Set(['/admin', '/admin/promotions']);

const ITEMS = ADMIN_PAGES.flatMap((g) => g.pages).map((p) => ({
  href: p.href,
  exact: EXACT_HREFS.has(p.href),
}));

/** How many rows the sidebar would render highlighted for `path`. */
function activeCount(path, items = ITEMS) {
  const winner = activeNavHref(path, items);
  return items.filter((i) => i.href === winner).length;
}

// The extraction is asserted before anything is concluded from it: a table run
// over an empty item list would report "exactly zero active" everywhere and
// look like a considered result.
test('activeNavItem: the item list under test is the real, populated one', () => {
  assert.ok(ITEMS.length >= 30, `only ${ITEMS.length} items — the table below would be vacuous`);
  for (const href of EXACT_HREFS) {
    assert.ok(ITEMS.some((i) => i.href === href && i.exact),
      `${href} is named in EXACT_HREFS but is not in the item list`);
  }
});

const TABLE = [
  // path                                        expected winning href
  ['/admin',                                     '/admin'],
  ['/admin/masterclass',                         '/admin/masterclass'],
  // the defect, by name: the child row wins, the parent does not also light up
  ['/admin/masterclass/registrations',           '/admin/masterclass/registrations'],
  ['/admin/masterclass/registrations/68f0a1b2',  '/admin/masterclass/registrations'],
  // and the other direction: a deep child of the parent still lights the parent
  ['/admin/masterclass/68f0a1b2c3d4e5f607182930/edit', '/admin/masterclass'],
  ['/admin/promotions',                          '/admin/promotions'],
  ['/admin/promotions/banner',                   '/admin/promotions/banner'],
  ['/admin/courses/new',                         '/admin/courses'],
  ['/admin/courses/abc123/edit',                 '/admin/courses'],
  ['/admin/faqs',                                '/admin/faqs'],
  // NOT a child of /admin/faqs, and a bare substring test would not care
  ['/admin/local-faqs',                          '/admin/local-faqs'],
  ['/admin/local-faqs/program/68f0',             '/admin/local-faqs'],
  ['/admin/registrations',                       '/admin/registrations'],
  ['/admin/career-path-registrations',           '/admin/career-path-registrations'],
  // matches nothing: /admin is exact so it does not swallow the orphan
  ['/admin/no-such-page',                        null],
];

for (const [path, expected] of TABLE) {
  test(`activeNavItem: ${path} → ${expected ?? 'nothing'}`, () => {
    assert.equal(activeNavHref(path, ITEMS), expected);
    assert.equal(activeCount(path), expected === null ? 0 : 1,
      `${path} highlights ${activeCount(path)} rows; exactly ${expected === null ? 0 : 1} is correct`);
  });
}

test('activeNavItem: a trailing slash resolves the same as without', () => {
  assert.equal(activeNavHref('/admin/masterclass/registrations/', ITEMS), '/admin/masterclass/registrations');
  assert.equal(activeNavHref('/admin/', ITEMS), '/admin');
});

test('activeNavItem: a sibling sharing a prefix is not swallowed', () => {
  // /admin/coursesX is not under /admin/courses — the '/' in the prefix test.
  const items = [{ href: '/admin/courses' }, { href: '/admin/coursesX' }];
  assert.equal(activeNavHref('/admin/coursesX/deep', items), '/admin/coursesX');
  assert.equal(activeNavHref('/admin/courses-archive', items), null);
});

test('activeNavItem: degenerate inputs return null rather than throwing', () => {
  assert.equal(activeNavHref('', ITEMS), null);
  assert.equal(activeNavHref(null, ITEMS), null);
  assert.equal(activeNavHref(undefined, ITEMS), null);
  assert.equal(activeNavHref('/admin', null), null);
  assert.equal(activeNavHref('/admin', []), null);
  assert.equal(activeNavHref('/admin', [{}, { href: '' }, null]), null);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
// The rule this module replaced, reimplemented here over the same item list, so
// the table above is shown to DISCRIMINATE rather than merely to pass. It owns
// its own implementation and never reads the real module, so it stays green
// while the assertions above go red — the point made in test/run.mjs's header
// about controls that fail whenever their subject fails.

/** The shipped per-item rule from SidebarItem, verbatim in behaviour. */
function oldRuleActiveCount(path, items) {
  return items.filter((item) => (item.exact
    ? path === item.href
    : path === item.href || (item.href !== '/admin' && path.startsWith(item.href)))).length;
}

test('CONTROL: the old per-item rule lights TWO rows on the masterclass path', () => {
  assert.equal(oldRuleActiveCount('/admin/masterclass/registrations', ITEMS), 2);
  assert.equal(activeCount('/admin/masterclass/registrations'), 1);
});

test('CONTROL: first-match-wins (no longest-match tie-break) picks the parent', () => {
  // What A4 degenerates to if the tie-break is dropped: iteration order decides
  // the answer. The fixture is parent-first ON PURPOSE and does not read the
  // registry — an earlier version of this control took ITEMS in registry order,
  // and the round-A regroup (which moved mc_registrations into its own group,
  // ABOVE masterclass) flipped first-match-wins into accidentally agreeing.
  // A control whose verdict depends on the order of an unrelated list is not
  // measuring the rule.
  const parentFirst = [{ href: '/admin/masterclass' }, { href: '/admin/masterclass/registrations' }];
  const target = '/admin/masterclass/registrations';
  const firstWins = parentFirst.find((item) => target === item.href || target.startsWith(`${item.href}/`));
  assert.equal(firstWins.href, '/admin/masterclass', 'first match is the parent');
  assert.equal(activeNavHref(target, parentFirst), target, 'longest match is the child');
});
