import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  RESERVED_PATHS,
  RESERVED_SOURCE,
  reservedBySource,
  reservedPathOwner,
} from '@/lib/courses/reservedPaths';

/**
 * The reserved list is hand-written; this derives every source that CAN be
 * derived and asserts parity, so a new page, redirect or public/ directory
 * reddens at the commit that adds it.
 *
 * ── WHY THE CHECK READS A LIST AND THE TEST DOES THE DERIVING ───────────────
 * The app-router tree is a STRICT SUBSET of the space an alias can collide
 * with: redirects fire before routing, public/ is served at the root, and
 * middleware matches paths in code. A guard that walked only the tree would be
 * complete-looking and incomplete. So the list is the check — it can hold the
 * entries no tree-walk produces — and derivation is the drift detector.
 *
 * ── WHAT THIS FILE CANNOT DO ───────────────────────────────────────────────
 * Verify the `manual` entries. They come from src/middleware.js, which matches
 * paths in JavaScript, and from framework internals. Nothing derives them
 * without pattern-matching code. The last test asserts only that they are
 * MARKED as such — it cannot assert they are correct or complete, and saying so
 * out loud is the point.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Routable child segments of an app-router directory. */
function routeSegments(dir) {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // (group) is not in the URL; [dynamic] is the catch-all this guard protects;
    // _private is never routable.
    .filter((n) => !n.startsWith('(') && !n.startsWith('[') && !n.startsWith('_'))
    .sort();
}

// ── tree ────────────────────────────────────────────────────────────────────

test('the tree-sourced entries match the app-router tree exactly', async () => {
  const derived = [
    ...routeSegments('src/app/(public)'),
    ...routeSegments('src/app'),
  ].sort();
  const listed = [...reservedBySource(RESERVED_SOURCE.TREE)].sort();

  const missing = derived.filter((s) => !listed.includes(s));
  const stale = listed.filter((s) => !derived.includes(s));

  assert.deepEqual(
    missing, [],
    `a route exists that the reserved list does not know: ${missing.join(', ')} — `
    + 'an alias could claim it and silently never resolve'
  );
  assert.deepEqual(
    stale, [],
    `the reserved list holds ${stale.join(', ')}, which is no longer a route — `
    + 'aliases are being refused for a page that does not exist'
  );
});

test('CONTROL: the tree walk actually finds routes, and excludes the non-routable', async () => {
  // Without this, a walk that returned [] would make the parity test vacuous.
  const pub = routeSegments('src/app/(public)');
  assert.ok(pub.length >= 15, `only ${pub.length} public routes found — has the tree moved?`);
  assert.ok(pub.includes('schedule'), 'a known route is missing from the walk');
  assert.ok(!pub.some((s) => s.startsWith('[')), 'a dynamic segment leaked in');
  assert.ok(!pub.some((s) => s.startsWith('_')), 'a private folder leaked in');
  assert.ok(!routeSegments('src/app').includes('(public)'), 'a route group leaked in');
});

// ── redirects ───────────────────────────────────────────────────────────────

test('the redirect-sourced entries match next.config.mjs redirects()', async () => {
  const cfg = (await import(pathToFileURL(path.join(ROOT, 'next.config.mjs')).href)).default;
  const rules = await cfg.redirects();
  assert.ok(rules.length > 0, 'no redirects returned — the config changed shape');

  // Top segment of each source, minus path params: '/online-course/:path*' and
  // '/online-course' are one reserved segment, not two.
  const derived = [...new Set(
    rules
      .map((r) => String(r.source ?? '').split('/').find(Boolean))
      .filter(Boolean)
      .filter((s) => !s.startsWith(':'))
  )].sort();
  const listed = [...reservedBySource(RESERVED_SOURCE.REDIRECT)].sort();

  assert.deepEqual(
    derived.filter((s) => !listed.includes(s)), [],
    'a redirect source is not in the reserved list — an alias there never reaches the router'
  );
  assert.deepEqual(
    listed.filter((s) => !derived.includes(s)), [],
    'the reserved list holds a redirect that no longer exists'
  );
});

// ── public/ ─────────────────────────────────────────────────────────────────

test('the static-sourced entries match the public/ directory', async () => {
  const derived = readdirSync(path.join(ROOT, 'public'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const listed = [...reservedBySource(RESERVED_SOURCE.STATIC)].sort();
  assert.deepEqual(listed, derived, 'public/ and the reserved list disagree');
});

// ── manual: marked, not verified ───────────────────────────────────────────

test('every manual entry is MARKED as hand-maintained, because nothing checks it', () => {
  /**
   * This asserts the LABEL, not the content, and the distinction is the point.
   * The manual entries come from src/middleware.js and framework internals;
   * deriving them would mean pattern-matching JavaScript. If middleware starts
   * matching a new prefix, nothing here goes red.
   *
   * So the guarantee is only: anything not derivable is visibly flagged as
   * unverified, rather than sitting in the list looking as checked as its
   * neighbours.
   */
  const manual = RESERVED_PATHS.filter((r) => r.source === RESERVED_SOURCE.MANUAL);
  assert.ok(manual.length > 0, 'the manual entries vanished — middleware prefixes are now unguarded');
  for (const entry of manual) {
    assert.ok(entry.note, `${entry.segment} is manual but carries no note saying why`);
  }
});

test('every entry carries a known source — none is unlabelled', () => {
  const known = new Set(Object.values(RESERVED_SOURCE));
  for (const r of RESERVED_PATHS) {
    assert.ok(r.segment, 'an entry has no segment');
    assert.ok(known.has(r.source), `${r.segment} has source "${r.source}", which is not a known kind`);
  }
});

test('the list has no duplicate segments', () => {
  const seen = RESERVED_PATHS.map((r) => r.segment.toLowerCase());
  assert.equal(new Set(seen).size, seen.length, 'a segment is listed twice');
});

// ── the lookup ──────────────────────────────────────────────────────────────

test('reservedPathOwner matches the first segment, case-insensitively', () => {
  assert.equal(reservedPathOwner('/schedule')?.segment, 'schedule');
  assert.equal(reservedPathOwner('schedule')?.segment, 'schedule');
  assert.equal(reservedPathOwner('/SCHEDULE')?.segment, 'schedule');
  assert.equal(reservedPathOwner('/schedule/anything')?.segment, 'schedule');
  assert.equal(reservedPathOwner('//schedule')?.segment, 'schedule');
  assert.equal(reservedPathOwner('/admin')?.source, 'tree');
  assert.equal(reservedPathOwner('/promotion')?.source, 'redirect');
  assert.equal(reservedPathOwner('/brand')?.source, 'static');
  assert.equal(reservedPathOwner('/_next')?.source, 'manual');
});

test('CONTROL: an ordinary alias is not reserved, and a near-miss does not match', () => {
  for (const free of [
    '/excel-for-accountants',
    '/scheduler',              // longer than 'schedule'
    '/my-schedule',            // prefixed
    '/promotions-2026',        // longer than 'promotions'
    '', null, undefined, '/',
  ]) {
    assert.equal(reservedPathOwner(free), null, `${JSON.stringify(free)} was treated as reserved`);
  }
});
