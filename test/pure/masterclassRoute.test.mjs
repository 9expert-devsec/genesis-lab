import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMasterclassRoute, parentMasterclassPath } from '@/lib/masterclass/routeAccess';

// This deployment runs masterclass-only: the middleware redirects every path
// isMasterclassRoute() rejects to the main domain. That makes this predicate a
// load-bearing SEO gate — a single missing entry silently 307s Googlebot away.
// The regression that motivated this file: /sitemap.xml and /robots.txt were
// NOT whitelisted, so the crawler could never fetch them and the masterclass
// pages fell out of the index. These assertions pin the whole allow-list so the
// next edit can't quietly drop one.

// ── MUST be served from this deployment (true) ───────────────────────────────
const ALLOWED = [
  // SEO/discovery files — the whole point of this fix.
  '/sitemap.xml',
  '/robots.txt',
  // Course pages + registration flow.
  '/masterclass/mas-claude-ai-for-data-analyst',
  '/masterclass/any-slug-here',
  '/masterclass/any-slug-here/register',
  '/masterclass/any-slug-here/register/step-2',
  // Payment return pages.
  '/masterclass/payment/complete',
  // API + admin surfaces (admin gate itself is enforced downstream).
  '/api/registration/public',
  '/api/anything',
  '/admin/9x-portal',
  '/admin/anything/nested',
];

for (const path of ALLOWED) {
  test(`isMasterclassRoute allows ${path}`, () => {
    assert.equal(isMasterclassRoute(path), true, `${path} must be served from this host`);
  });
}

// ── MUST redirect to the main domain (false) ─────────────────────────────────
// Representative non-masterclass page routes. If any of these flip to true, the
// masterclass-only redirect has sprung a leak and main-site pages would render
// on the masterclass host.
const REDIRECTED = [
  '/schedule',
  '/promotions',
  '/articles',
  '/about-us',
  // Bare hub + deep subpaths are intentionally NOT allowed: the hub is
  // main-site-only, and deep subpaths are recovered to the parent course page
  // by parentMasterclassPath (asserted below), not served here.
  '/masterclass',
  '/masterclass/some-slug/marketing-analyst',
];

for (const path of REDIRECTED) {
  test(`isMasterclassRoute rejects ${path}`, () => {
    assert.equal(isMasterclassRoute(path), false, `${path} must redirect to the main domain`);
  });
}

// ── Deep-subpath recovery ────────────────────────────────────────────────────
// A rejected /masterclass/<slug>/… path is redirected to its parent course
// page on the same domain rather than bounced to the other domain's homepage.
test('parentMasterclassPath recovers the course page from a deep subpath', () => {
  assert.equal(
    parentMasterclassPath('/masterclass/mas-claude-ai/marketing-analyst'),
    '/masterclass/mas-claude-ai',
  );
});
test('parentMasterclassPath returns null for non-masterclass paths', () => {
  assert.equal(parentMasterclassPath('/about-us'), null);
  assert.equal(parentMasterclassPath('/masterclass/only-one-segment'), null);
});
