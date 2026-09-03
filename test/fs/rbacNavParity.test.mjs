import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_PAGES } from '@/lib/rbac/pages';
import { readSource } from '../sourceScan.mjs';

/**
 * ADMIN_PAGES <-> NAV_GROUPS parity.
 *
 * ══ THE DEFECT THIS EXISTS FOR, WHICH SHIPPED ═══════════════════════════════
 *
 * Two hardcoded lists have to agree and nothing made them:
 *
 *   src/lib/rbac/pages.js              ADMIN_PAGES — grants the permission key,
 *                                      MENU_ENUM membership, and the checkbox
 *                                      in the roles UI
 *   src/components/layout/            NAV_GROUPS — grants the sidebar LINK, and
 *   AdminSidebar.jsx                   nothing else. It does not import
 *                                      ADMIN_PAGES.
 *
 * `media` and `audit_log` were registered in ADMIN_PAGES and absent from
 * NAV_GROUPS. Both were fully permissioned and fully guarded; neither had a
 * menu entry, so the only way to reach /admin/media was to type the URL. The
 * comments in pages.js asserted the opposite — that registering a page there
 * made it "appear in the sidebar, because both render from ADMIN_PAGES" — and
 * a comment claiming parity is exactly how the gap survived: every reader who
 * checked the registry found the entry present and stopped looking.
 *
 * NOTHING FAILS WHEN THESE DIVERGE. There is no import between the files, no
 * type, no runtime error. A page missing from NAV_GROUPS is invisible; a
 * NAV_GROUPS link whose pageKey is not registered is worse — canAccess() gets
 * an unknown key, which narrows to "no access" for everyone, so the item is
 * silently invisible to every role including the owner. Both failure modes look
 * like a working system.
 *
 * ── WHAT IS COMPARED, AND WHY href IS THE JOIN KEY ──────────────────────────
 * The href is the thing a user actually navigates to and the thing
 * resolvePageKey() resolves against, so two entries agreeing on href but
 * disagreeing on pageKey is a REAL defect (the menu would grant visibility from
 * one permission while the page guard enforces another). Joining on pageKey
 * instead would make that case unrepresentable and the check would not see it.
 *
 * ── READING THE SIDEBAR AS TEXT ─────────────────────────────────────────────
 * AdminSidebar.jsx is a 'use client' component that imports lucide-react and
 * next/navigation; importing it here would drag a React runtime into an fs-tier
 * test to read one array. It is scanned as source instead, through
 * sourceScan.readSource().code so comments cannot satisfy the matcher (defects
 * 1-5 in that module's header) and CRLF is already normalised (defect 4).
 *
 * The scan is the weak point of this guard — a regex that silently matched
 * nothing would make the "no unregistered links" assertion pass vacuously — so
 * EXTRACTION IS ASSERTED FIRST, before anything is concluded from it.
 */

const SIDEBAR_REL = 'src/components/layout/AdminSidebar.jsx';
const SIDEBAR = readSource(SIDEBAR_REL);

/**
 * Registered pages that deliberately have NO sidebar link.
 *
 * The set exists so that a deliberate omission is written down WITH ITS REASON
 * instead of being indistinguishable from the bug above.
 *
 *   ['some_key', 'why it has no link — e.g. reached only from a parent row'],
 *
 * Exactly one entry, and the same one named in NO_NAV_ITEM in
 * test/fs/adminNavShape.test.mjs — the two guards approach the same fact from
 * opposite directions (this one asks "is every registered page linked?", that
 * one asserts set equality both ways) and both have to be told about it.
 */
const NO_SIDEBAR_LINK = new Map([
  ['profile', 'reached from the signed-in identity card in the sidebar footer '
    + '(AdminSidebar.jsx), not from a nav row — it is still registered here for '
    + 'the permission key, MENU_ENUM membership and the /admin/roles checkbox'],
]);

/** Every `{ … href: '…' … pageKey: '…' … }` object literal in the source. */
function extractNavEntries(code) {
  // Bounded on the object literal's own braces, NOT on a lookahead that could
  // run past the end of one entry into the next.
  const re = /\{[^{}]*href:\s*'([^']+)'[^{}]*pageKey:\s*'([^']+)'[^{}]*\}/g;
  return [...code.matchAll(re)].map((m) => ({ href: m[1], pageKey: m[2] }));
}

const FLAT_PAGES = ADMIN_PAGES.flatMap((g) =>
  g.pages.map((p) => ({ ...p, group: g.group })));

/**
 * The whole comparison, as a pure function of two lists — so the controls below
 * can feed it a deliberately broken list and watch it complain, without editing
 * any real file.
 */
function parityGaps(pages, nav, exceptions = new Map()) {
  const navByHref = new Map(nav.map((n) => [n.href, n.pageKey]));
  const pageHrefs = new Set(pages.map((p) => p.href));
  const gaps = [];

  for (const page of pages) {
    if (!page.href) continue;
    if (!navByHref.has(page.href)) {
      if (exceptions.has(page.key)) continue;
      gaps.push({
        kind: 'missing-from-nav',
        detail: `${page.key} (${page.href}) is registered in ADMIN_PAGES but has no NAV_GROUPS entry`,
      });
      continue;
    }
    if (navByHref.get(page.href) !== page.key) {
      gaps.push({
        kind: 'pagekey-mismatch',
        detail: `${page.href} is pageKey '${navByHref.get(page.href)}' in NAV_GROUPS but key '${page.key}' in ADMIN_PAGES`,
      });
    }
  }

  for (const item of nav) {
    if (!pageHrefs.has(item.href)) {
      gaps.push({
        kind: 'nav-not-registered',
        detail: `NAV_GROUPS links ${item.href} (pageKey '${item.pageKey}') which is not registered in ADMIN_PAGES — canAccess() would hide it from every role`,
      });
    }
  }
  return gaps;
}

const NAV_ENTRIES = extractNavEntries(SIDEBAR.code);

// ── the scanner must have found something, asserted BEFORE it is trusted ─────
test('rbac parity: the NAV_GROUPS scan actually extracted entries', () => {
  assert.ok(
    NAV_ENTRIES.length >= 30,
    `extracted only ${NAV_ENTRIES.length} NAV_GROUPS entries from ${SIDEBAR_REL} — `
    + 'the matcher is broken, and every assertion below would pass vacuously',
  );
  const dupes = NAV_ENTRIES.map((n) => n.href)
    .filter((h, i, a) => a.indexOf(h) !== i);
  assert.deepEqual(dupes, [], 'the same href appears twice in NAV_GROUPS');
});

// ── the real assertions ──────────────────────────────────────────────────────
test('rbac parity: every registered page has a sidebar link', () => {
  const missing = parityGaps(FLAT_PAGES, NAV_ENTRIES, NO_SIDEBAR_LINK)
    .filter((g) => g.kind === 'missing-from-nav');
  assert.deepEqual(
    missing.map((g) => g.detail), [],
    'add the entry to NAV_GROUPS in AdminSidebar.jsx, or add the key to '
    + 'NO_SIDEBAR_LINK in this file with the reason it has no link',
  );
});

test('rbac parity: an href means the same pageKey in both lists', () => {
  const mismatched = parityGaps(FLAT_PAGES, NAV_ENTRIES, NO_SIDEBAR_LINK)
    .filter((g) => g.kind === 'pagekey-mismatch');
  assert.deepEqual(mismatched.map((g) => g.detail), []);
});

test('rbac parity: every sidebar link is a registered page', () => {
  const unregistered = parityGaps(FLAT_PAGES, NAV_ENTRIES, NO_SIDEBAR_LINK)
    .filter((g) => g.kind === 'nav-not-registered');
  assert.deepEqual(unregistered.map((g) => g.detail), []);
});

test('rbac parity: every NO_SIDEBAR_LINK exception is real and explained', () => {
  const keys = new Set(FLAT_PAGES.map((p) => p.key));
  for (const [key, reason] of NO_SIDEBAR_LINK) {
    assert.ok(keys.has(key), `NO_SIDEBAR_LINK names '${key}', which is not a registered page — stale exception`);
    assert.ok(
      typeof reason === 'string' && reason.trim().length >= 10,
      `NO_SIDEBAR_LINK['${key}'] needs a written reason, not '${reason}'`,
    );
  }
});

// ── CONTROLS — each breaks one input and asserts the checker goes red ────────
//
// MEASURED, and the reason these use a synthetic fixture instead of the real
// arrays: the first version derived its fixtures from NAV_ENTRIES by filtering
// out the real `media` entry. Deleting that entry from AdminSidebar.jsx — the
// exact scenario this guard exists to catch — then broke the CONTROLS too,
// because there was no longer an entry for them to remove. `npm test` went red
// three times over, only one of which was the finding, and a reader would have
// had to work out which. A control that fails whenever its subject fails is
// measuring the subject, not itself.
//
// So the controls below own their data. They stay green while the real
// assertions above go red, which is what makes the red line legible.

const FIXTURE_PAGES = [
  { key: 'alpha', href: '/admin/alpha' },
  { key: 'beta', href: '/admin/beta' },
];
const FIXTURE_NAV = [
  { href: '/admin/alpha', pageKey: 'alpha' },
  { href: '/admin/beta', pageKey: 'beta' },
];

test('CONTROL: the fixture pair is itself clean (baseline)', () => {
  assert.deepEqual(parityGaps(FIXTURE_PAGES, FIXTURE_NAV), []);
});

test('CONTROL: a page missing from NAV_GROUPS is detected', () => {
  const gaps = parityGaps(FIXTURE_PAGES, [FIXTURE_NAV[0]]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].kind, 'missing-from-nav');
  assert.match(gaps[0].detail, /^beta \(\/admin\/beta\) is registered/);
});

test('CONTROL: an exception silences the gap — and only for its own key', () => {
  const excused = parityGaps(FIXTURE_PAGES, [FIXTURE_NAV[0]], new Map([['beta', 'deliberately unlinked']]));
  assert.deepEqual(excused, []);

  const wrongKey = parityGaps(FIXTURE_PAGES, [FIXTURE_NAV[0]], new Map([['alpha', 'not the missing one']]));
  assert.equal(wrongKey.length, 1);
  assert.equal(wrongKey[0].kind, 'missing-from-nav');
});

test('CONTROL: an href pointing at the wrong pageKey is detected', () => {
  const typo = [FIXTURE_NAV[0], { href: '/admin/beta', pageKey: 'btea' }];
  const gaps = parityGaps(FIXTURE_PAGES, typo);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].kind, 'pagekey-mismatch');
});

test('CONTROL: a sidebar link with no registered page is detected', () => {
  const invented = [...FIXTURE_NAV, { href: '/admin/not-registered', pageKey: 'ghost' }];
  const gaps = parityGaps(FIXTURE_PAGES, invented);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].kind, 'nav-not-registered');
  assert.match(gaps[0].detail, /ghost/);
});
