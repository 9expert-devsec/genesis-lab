import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * Every way in to the admin checks that the admin still exists and is active.
 *
 * Found through imports, not names. The session has one source, `auth` from
 * lib/auth/options, so any file importing it is a place a session can be read
 * without the check. Each must be listed below with its reason. A NEW file that
 * reads the session fails here until someone decides what it is.
 *
 * test/pure/activeAdminGuard runs the guards themselves; this proves they are
 * the only doors.
 */

const HELPER = 'src/lib/auth/assertActiveAdmin.js';
const GUARD = 'src/lib/rbac/guard.js';
const ACTIONS = 'src/lib/actions/auth.js';
const LAYOUT = 'src/app/admin/layout.jsx';
const ROUTE = 'src/app/api/admin/session-ended/route.js';
const MIDDLEWARE = 'src/middleware.js';

/** Files allowed to read `auth` directly. */
const AUTH_READERS = {
  [HELPER]: 'the source: everything else goes through it',
  [GUARD]: 'requirePage reads it to tell "no session" from "ended session"',
  [ACTIONS]: 'logoutAction only: signing out must work for anyone',
  [LAYOUT]: 'pairs it with assertActiveAdmin',
  'src/lib/actions/customPages.js': 'currentUserStamp labels a write; its callers passed requireAdmin',
  'src/components/audit/RecordHistory.jsx': 'renders only inside a page that passed requirePage',
};

/** /api/admin routes with no session, each for a stated reason. */
const NO_SESSION_ROUTES = {
  'src/app/api/admin/2fa/status/route.js': 'pre-login: asked before a session exists',
  'src/app/api/admin/2fa/verify/route.js': 'pre-login: the credential check itself',
  'src/app/api/admin/instructors/route.js': 'public read',
  'src/app/api/admin/instructors/all/route.js': 'public read',
  [ROUTE]: 'the rejection itself: the guards send people here',
};

/** Admin pages with no page guard. The layout's check still covers them. */
const UNGUARDED_PAGES = [
  'src/app/admin/9x-portal/page.jsx',
  'src/app/admin/door/page.jsx',
  'src/app/admin/403/page.jsx',
];

const importsAuth = ({ withImports }) =>
  /import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*['"]@\/lib\/auth\/options['"]/.test(withImports);

const body = (code, name) => {
  const from = code.indexOf(`function ${name}(`);
  assert.ok(from >= 0, `${name} not found`);
  const next = code.indexOf('\nexport ', from + 1);
  return code.slice(from, next === -1 ? undefined : next);
};

const sources = walkSources('src');

test('the scan found real code', () => {
  assert.ok(sources.length > 500, `walked ${sources.length} files`);
  assert.ok(sources.filter(importsAuth).length >= 2, 'the import matcher found nothing');
});

test('every file reading the session directly is accounted for', () => {
  const found = sources.filter(importsAuth).map((s) => s.rel).sort();
  assert.deepEqual(found, Object.keys(AUTH_READERS).sort());
});

test('getServerSession, getToken and raw session cookies are not a second way in', () => {
  const offenders = sources
    .filter((s) => /\bgetServerSession\b|\bgetToken\(|from ['"]next-auth\/jwt['"]/.test(s.withImports))
    .map((s) => s.rel);
  assert.deepEqual(offenders, []);
});

test('requirePage checks the admin before it checks the page', () => {
  const fn = body(readSource(GUARD).code, 'requirePage');
  const check = fn.indexOf('assertActiveAdmin(session)');
  assert.ok(check > 0, 'requirePage does not call assertActiveAdmin');
  assert.ok(check < fn.indexOf('canAccess('), 'the check comes after the permission decision');
});

test('requirePageAction gets its session from getActiveSession', () => {
  const fn = body(readSource(GUARD).code, 'requirePageAction');
  assert.match(fn, /await getActiveSession\(\)/);
  assert.doesNotMatch(fn, /\bauth\(\)/);
});

test('requireAdmin gets its session from getActiveSession', () => {
  const fn = body(readSource(ACTIONS).code, 'requireAdmin');
  assert.match(fn, /await getActiveSession\(\)/);
  assert.doesNotMatch(fn, /\bauth\(\)/);
});

test('in lib/actions/auth, only logoutAction calls auth() directly', () => {
  const { code } = readSource(ACTIONS);
  assert.equal(code.match(/\bauth\(\)/g)?.length, 1);
  assert.match(body(code, 'logoutAction'), /\bauth\(\)/);
});

test('the layout checks the session it reads', () => {
  assert.match(readSource(LAYOUT).code, /assertActiveAdmin\(session\)/);
});

test('every /api/admin route goes through a guard, or says why not', () => {
  const routes = sources.filter((s) => /^src\/app\/api\/admin\/.*route\.js$/.test(s.rel));
  assert.ok(routes.length >= 15, `found ${routes.length} routes`);
  const unguarded = routes
    .filter((s) => !/\b(getActiveSession|requireAdmin|requirePageAction)\b/.test(s.code))
    .map((s) => s.rel)
    .sort();
  assert.deepEqual(unguarded, Object.keys(NO_SESSION_ROUTES).sort());
});

test('every admin page has a page guard, or is covered by the layout alone', () => {
  const pages = sources.filter((s) => /^src\/app\/admin\/.*page\.jsx$/.test(s.rel));
  assert.ok(pages.length >= 70, `found ${pages.length} pages`);
  const unguarded = pages.filter((s) => !/\brequirePage\(/.test(s.code)).map((s) => s.rel).sort();
  assert.deepEqual(unguarded, [...UNGUARDED_PAGES].sort());
});

test('the middleware cannot reach the helper: Edge must never load Mongoose', () => {
  const byRel = new Map(sources.map((s) => [s.rel, s]));
  const resolve = (spec) =>
    [`src/${spec.slice(2)}`, `src/${spec.slice(2)}.js`, `src/${spec.slice(2)}.jsx`, `src/${spec.slice(2)}/index.js`]
      .find((rel) => byRel.has(rel));

  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    // `from '…'`, a bare `import '…'`, and `import('…')` all load the module.
    for (const m of byRel.get(rel).withImports.matchAll(/\b(?:from|import)\s*\(?\s*['"](@\/[^'"]+)['"]/g)) {
      const next = resolve(m[1]);
      if (next) walk(next);
    }
  };
  walk(MIDDLEWARE);
  assert.ok(seen.has('src/lib/auth/loginRedirectTarget.js'), 'the walk did not follow imports');
  assert.equal(seen.has(HELPER), false, 'the middleware imports assertActiveAdmin');
  assert.equal(seen.has(GUARD), false, 'the middleware imports the guards');
});

test('session-ended is outside the middleware and calls no guard', () => {
  assert.match(readSource(MIDDLEWARE).code, /matcher: \['\/admin\/:path\*'\]/);
  const { code, withImports } = readSource(ROUTE);
  assert.doesNotMatch(code, /\b(auth|getActiveSession|assertActiveAdmin|requireAdmin|requirePage|requirePageAction)\(/);
  assert.doesNotMatch(withImports, /assertActiveAdmin|rbac\/guard|actions\/auth|auth\/options/);
});
