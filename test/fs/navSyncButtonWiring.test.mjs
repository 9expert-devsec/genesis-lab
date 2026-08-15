import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, countCallSites } from '../sourceScan.mjs';
import { isValidPair, AUDIT_CONTRACT } from '@/lib/audit/auditContract';

/**
 * The nav-menu sync button, its endpoint, and the trail the endpoint leaves.
 *
 * ── WHY THIS FILE, WHEN THERE IS ALREADY AN AUDIT SWEEP ────────────────────
 * test/fs/auditCoverage walks src/lib/actions and nothing else — it reads
 * `export async function` bodies out of the action modules and pairs each
 * recorded menu against the requireAdmin literal in the same body. The write
 * this file guards lives in a ROUTE HANDLER, which that sweep never opens. So
 * the invariants it enforces for every server action have to be asserted here
 * by hand, or this endpoint is the one write in the admin with no coverage at
 * all — which is very nearly the state it shipped in: it existed for months
 * with zero callers, no page-key check and no audit row.
 */

/**
 * The single argument passed to `recordAdminActionAfter(` in a scrubbed source,
 * brace-matched. Asserting against the whole file instead is the vacuity this
 * exists to avoid: delete the call and leave the literal behind and every
 * pattern still matches something.
 */
function auditEntryArg(code) {
  const call = code.indexOf('recordAdminActionAfter(');
  assert.notEqual(call, -1, 'the route records no audit row at all');
  const open = code.indexOf('{', call);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  assert.fail('unbalanced braces in the audit entry');
}

const ROUTE = 'src/app/api/admin/navmenu/sync/route.js';
const BUTTON = 'src/app/admin/cache/_components/NavMenuSyncButton.jsx';
const PANEL = 'src/app/admin/cache/_components/SnapshotPanel.jsx';

// ── the endpoint ────────────────────────────────────────────────────────────

test('the route authorises on a PAGE KEY, not merely on having a session', () => {
  const { code } = readSource(ROUTE);

  assert.match(
    code,
    /requireAdmin\('landing_cache'\)/,
    'the route must call requireAdmin with the Cache Console page key'
  );

  // The gap this replaced, stated as the thing that must not come back. `auth()`
  // + `session?.user` authenticates and does not authorise: it let any signed-in
  // admin rebuild the mega menu for every public page, including one whose role
  // does not hold this console.
  assert.ok(
    !/const\s+session\s*=\s*await\s+auth\(\)/.test(code),
    'a bare auth() session check is authentication without authorisation'
  );
});

test('the route maps 403 apart from 401', () => {
  // requireAdmin throws a plain Error with `.status` specifically so a route can
  // map it. Collapsing both to 401 would tell an admin who lacks the page that
  // they are signed out, and they would go and sign in again.
  const { code } = readSource(ROUTE);
  assert.match(code, /403/, 'FORBIDDEN must surface as 403');
  assert.match(code, /401/, 'UNAUTHENTICATED must surface as 401');
});

test('the route records an audit row, with menu and entity as LITERALS', () => {
  const { code } = readSource(ROUTE);

  assert.match(code, /recordAdminActionAfter\(/, 'the press must leave a row');
  assert.match(code, /menu:\s*'landing_cache'/, 'menu must be a literal at the call site');
  assert.match(code, /entity:\s*'nav_menu_sync'/, 'entity must be a literal at the call site');
  assert.match(code, /action:\s*'sync'/);

  // The invariant auditCoverage enforces for every action and cannot reach
  // here: the recorded menu IS the key the guard checked. A row filed under a
  // menu the caller never guarded on is a row that misattributes the event.
  const menu = code.match(/menu:\s*'([a-z_]+)'/)?.[1];
  const guard = code.match(/requireAdmin\('([a-z_]+)'\)/)?.[1];
  assert.equal(menu, guard, 'the recorded menu must match the requireAdmin key');
});

test('the recorded pair is registered, so buildAuditRow does not fail closed', () => {
  // An unregistered (menu, entity) does not throw — the policy silently drops to
  // act_only and every payload is discarded with a console.warn. The row would
  // land looking fine and carrying nothing.
  assert.ok(
    isValidPair('landing_cache', 'nav_menu_sync'),
    "('landing_cache', 'nav_menu_sync') is not in the audit contract"
  );
});

test('the outcome travels in meta, because the pair is count_only', () => {
  const policy = AUDIT_CONTRACT.landing_cache?.entities?.nav_menu_sync?.diff;
  assert.equal(policy, 'count_only', 'a sync outcome IS a count');

  // Scoped to the ARGUMENT of the audit call, not to the file. Read from the
  // whole source, every assertion below passes vacuously the moment the audit
  // call is deleted — the object literal is still sitting there, bound to
  // nothing, matching every pattern. Proved: reddens when the call is renamed.
  const entry = auditEntryArg(readSource(ROUTE).code);

  // The trap, and it is silent: reducePayload NULLS both before and after under
  // count_only. An outcome passed as `after` is discarded by the writer, and the
  // row records that a sync happened and nothing whatsoever about it.
  assert.match(entry, /meta:\s*\{/, 'the counts must be passed as meta');
  assert.ok(
    !/\bafter:\s*\{/.test(entry),
    'an `after` payload under count_only is silently thrown away — use meta'
  );

  // A refusal returns no counts at all, so they must be reported as absent
  // rather than as zero. "Synced, found 0 programs" and "refused, wrote
  // nothing" are different events and the trail must not confuse them.
  assert.match(entry, /refused:\s*Boolean\(/, 'the refusal flag must be recorded');
  assert.match(entry, /programCount:\s*result\?\.programCount \?\? null/, 'absent, not zero');
});

test('the row belongs to the button press, not to the sync function', () => {
  // The cron calls syncNavMenuData too. A row written inside the sync would file
  // eight system runs a day as admin actions and bury the human presses this
  // trail exists to show.
  const { code } = readSource('src/lib/navmenu/syncNavMenuData.js');
  assert.ok(
    !/recordAdminAction/.test(code),
    'the audit row must stay at the button-press call site, not move into the sync'
  );
});

// ── the button ──────────────────────────────────────────────────────────────

test('the button posts to the nav endpoint, once', () => {
  const { code } = readSource(BUTTON);
  assert.match(code, /'\/api\/admin\/navmenu\/sync'/);
  assert.match(code, /method:\s*'POST'/);
  assert.equal(countCallSites(code, 'fetch'), 1, 'exactly one request');
});

test('the button handles a REFUSAL, which is not an HTTP failure', () => {
  /**
   * The one place it deviates from LandingSyncButton, and the reason is
   * mechanical: the nav downgrade guard returns `{ok:false, refused:true}` on
   * HTTP 200 with the snapshot untouched. `res.ok` is TRUE for that, so the
   * ported shape would render a refusal as a success with some JSON beneath it
   * — the outcome an admin most needs to read, styled as the one they can
   * ignore.
   */
  const { code } = readSource(BUTTON);
  assert.match(code, /result\?\.refused/, 'a refusal must be detected');
  assert.match(code, /result\?\.reason/, 'and its reason shown, not just a flag');
});

test('the button follows the landing precedent everywhere else', () => {
  // Two sync controls three inches apart that behave differently under failure
  // is worse than any improvement either could make alone.
  const nav = readSource(BUTTON).code;
  const landing = readSource('src/app/admin/cache/_components/LandingSyncButton.jsx').code;
  for (const shape of [/setLoading\(true\)/, /router\.refresh\(\)/, /if \(!res\.ok\)/, /JSON\.stringify\(result, null, 2\)/]) {
    assert.match(landing, shape, `precedent lost its own ${shape}`);
    assert.match(nav, shape, `the nav button must keep ${shape}`);
  }
});

// ── the mount, and the caveat it must not restate ───────────────────────────

test('the button is mounted in the nav_menu_cache half of the snapshot panel', () => {
  const { code } = readSource(PANEL);
  assert.match(code, /<NavMenuSyncButton \/>/, 'mounted');

  // Beside the nav snapshot, not the landing one. Both halves live in this file
  // and a button in the wrong half is invisible in a diff and obvious only to
  // whoever presses it.
  // Anchored on the <h3> HEADING, not on the first mention of the string —
  // `nav_menu_cache` also appears in the Panel subtitle above BOTH halves, and
  // slicing there makes "the landing button is not in the nav half" pass
  // vacuously by including the landing half in it.
  const navHalf = code.slice(code.indexOf('nav_menu_cache{'));
  assert.match(navHalf, /<NavMenuSyncButton \/>/, 'in the nav half');
  assert.ok(
    !navHalf.includes('<LandingSyncButton />'),
    'the landing button must not have drifted into the nav half'
  );
});

test('the button states no freshness claim of its own — it reuses SyncedAtCaveat', () => {
  /**
   * §E's binding rule: an INFERRED value carries its limitation in the UI text.
   * `syncedAt` says a write happened, never that a visitor's page reflects it,
   * and after this button is pressed that gap is exactly when someone will
   * assume otherwise.
   *
   * The wording is NOT restated here. SyncedAtCaveat already renders beside the
   * button and is the single source for that sentence; a second copy in
   * slightly different words is how the two drift until one of them is wrong.
   */
  const panel = readSource(PANEL).code;
  const navHalf = panel.slice(panel.indexOf('nav_menu_cache'));
  const caveatAt = navHalf.indexOf('<SyncedAtCaveat />');
  const buttonAt = navHalf.indexOf('<NavMenuSyncButton />');
  assert.ok(caveatAt !== -1, 'the nav half must render the shared caveat');
  assert.ok(buttonAt !== -1);

  // Raw, not `code`: a claim rendered to an admin IS a string, and blanked
  // string bodies would hide the very thing being forbidden.
  const { raw } = readSource(BUTTON);
  for (const claim of [/\bpage is (fresh|stale)\b/i, /\bcache hit\b/i, /\bserving from cache\b/i]) {
    assert.ok(!claim.test(raw), `the button claims ${claim}`);
  }
  assert.ok(
    !/เวลานี้บอกว่า/.test(raw),
    'the caveat sentence must not be copied into the button — reuse the component'
  );
});
