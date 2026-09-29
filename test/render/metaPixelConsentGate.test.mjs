import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ROOT } from '../sourceScan.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE PIXEL IS NOT REQUESTED UNTIL MARKETING CONSENT EXISTS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the one claim in the round that a source scan cannot make. "Renders
 * nothing" can be read off the code; "requests nothing" cannot — an element
 * that is rendered and then removed, a stub that injects its own <script>, a
 * library prefetched by a stray import would all leave the source looking
 * innocent while the browser had already told connect.facebook.net who the
 * visitor is. Only a mounted component in a real document can answer it, so
 * that is what the drive does.
 *
 * ── WHY EACH SCENARIO IS ITS OWN PROCESS ──────────────────────────────────
 * metaPixel.js holds module state — `initialised` is a once-per-document fact
 * because a pixel is a once-per-document thing. A second scenario in the same
 * process would inherit an already-loaded pixel and "renders nothing when
 * consent is absent" would be measuring nothing at all. See the drive's
 * header; the alternative was a reset export existing solely for this file.
 *
 * ── THE CONTROLS ARE IN THE MATRIX, NOT BOLTED ON ─────────────────────────
 * Every negative claim here has its positive twin driven through the SAME
 * harness. "requests nothing when declined" is falsifiable precisely because
 * "requests it when granted" is measured by the same probe, in the same way,
 * two tests down — if the probe could not see a script element, the granted
 * case would fail and the whole file would go red rather than passing
 * vacuously. The two explicit CONTROL tests at the bottom cover the one thing
 * the matrix cannot: that the drive is running at all and its output is being
 * read rather than defaulted.
 */

const CASE = path.join(ROOT, 'test', 'metaPixelConsentGate.case.mjs');

/**
 * NODE_ENV IS NAMED RATHER THAN INHERITED, for the reason
 * test/render/canvasFrameLateAttach spells out at length: under `npm test` the
 * environment carries NODE_ENV=production, and `act` throws outright in
 * React's production build. Naming it makes this file's result independent of
 * how it was invoked.
 */
function drive(scenario) {
  const r = spawnSync(process.execPath, [CASE, scenario], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  assert.equal(
    r.status, 0,
    `the drive failed for "${scenario}":\n${r.stderr}`,
  );
  return JSON.parse(r.stdout);
}

const FBEVENTS = 'https://connect.facebook.net/en_US/fbevents.js';
/** Flatten the queue to `command:event` strings for readable assertions. */
const commands = (snapshot) => snapshot.fbq.map((args) => args.slice(0, 2).join(':'));

// ── NO CONSENT ──────────────────────────────────────────────────────────────

test('NO COOKIE: nothing is rendered and NOTHING is requested', () => {
  const { after } = drive('absent');
  assert.deepEqual(after.scripts, [], 'a script element exists with no consent');
  assert.equal(
    after.fbqExists, false,
    'the fbq stub was installed with no consent — even the stub is a decision',
  );
});

test('MARKETING DECLINED: nothing is rendered and NOTHING is requested', () => {
  // The distinct case from "no cookie": here the visitor HAS answered, and the
  // answer was no. A component that only checked for the cookie's presence
  // rather than its content would pass the test above and fail this one.
  const { after } = drive('declined');
  assert.deepEqual(after.scripts, [], 'a declined visitor got a pixel request');
  assert.equal(after.fbqExists, false);
});

// ── CONSENT ─────────────────────────────────────────────────────────────────

test('MARKETING GRANTED IN THE COOKIE: the library is requested, once', () => {
  const { after } = drive('granted');
  assert.deepEqual(after.scripts, [FBEVENTS]);
});

test('the queued commands are init, then consent grant, IN THAT ORDER', () => {
  // Order is the claim, not presence. fbevents.js drains this queue on arrival
  // and processes it in sequence, so a grant queued before its init is a grant
  // for a pixel that does not exist yet.
  const { after } = drive('granted');
  assert.deepEqual(commands(after).slice(0, 2), ['init:1256361497884237', 'consent:grant']);
});

test('EXACTLY ONE PageView on first load — the base code’s is suppressed', () => {
  // The defect this pins: Meta's copy-paste snippet ends with
  // fbq('track','PageView'), and the route tracker fires on its first pathname
  // like any other effect. Keeping both counts every session's first page
  // twice, for every visitor, with nothing in Ads Manager to show why.
  const { after } = drive('granted');
  const pageViews = commands(after).filter((c) => c === 'track:PageView');
  assert.equal(pageViews.length, 1, `expected 1 PageView, got ${pageViews.length}`);
});

// ── THE BROADCAST ───────────────────────────────────────────────────────────

test('A GRANT BROADCAST LOADS THE PIXEL WITHOUT A RELOAD', () => {
  // The banner publishes on decision; this is the subscriber acting on it in
  // the same page view. Without it, a visitor who accepts is not tracked until
  // their next full page load — "consent works, if you refresh".
  const { before, after } = drive('broadcastGrant');
  assert.deepEqual(before.scripts, [], 'loaded before any consent was given');
  assert.equal(before.fbqExists, false);
  assert.deepEqual(after.scripts, [FBEVENTS], 'the grant broadcast was ignored');
  assert.deepEqual(commands(after).slice(0, 2), ['init:1256361497884237', 'consent:grant']);
});

test('a mid-session grant counts the page the visitor is ALREADY on', () => {
  // The route tracker keys on pathname, which did not change. It fires anyway,
  // because it subscribes to the pixel's ready signal — see
  // onMetaPixelReady. Without that, this visitor's first PageView would be
  // whatever page they happened to navigate to next.
  const { after } = drive('broadcastGrant');
  assert.equal(commands(after).filter((c) => c === 'track:PageView').length, 1);
});

test('A REVOKE BROADCAST SENDS consent:revoke to the loaded pixel', () => {
  const { before, after } = drive('broadcastRevoke');
  assert.deepEqual(before.scripts, [FBEVENTS], 'the drive never loaded the pixel');
  assert.equal(
    commands(after).at(-1), 'consent:revoke',
    'withdrawal did not reach the pixel',
  );
});

test('REVOKE IS NOT AN UNLOAD, and the drive shows exactly that', () => {
  /*
   * The <script> element goes away with the component, and it changes nothing:
   * `fbq` is still installed, still holds its queue, and the library — had it
   * arrived — would still be running. There is no way to take back code that
   * has executed.
   *
   * This asserts the LIMIT rather than a feature, because the limit is the
   * entire reason the load gate above exists. A reader who believes revoke
   * undoes a load will eventually conclude the gate is redundant.
   */
  const { after } = drive('broadcastRevoke');
  assert.deepEqual(after.scripts, [], 'the element outlives the component');
  assert.equal(
    after.fbqExists, true,
    'if this is ever false, the library really can be unloaded and the '
    + 'load-gate note in metaPixel.js should be revisited',
  );
});

test('no PageView is sent after a revoke', () => {
  const { after } = drive('broadcastRevoke');
  assert.equal(
    commands(after).filter((c) => c === 'track:PageView').length, 1,
    'a PageView was sent after consent was withdrawn',
  );
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the drive really runs, and an unknown scenario proves nothing', () => {
  // If the harness silently produced an empty snapshot for everything, every
  // negative assertion above would pass vacuously. An unknown scenario takes
  // the no-cookie path, so it must look EXACTLY like 'absent' — and 'granted'
  // must not. The two together show the probe discriminates.
  const unknown = drive('no-such-scenario');
  assert.deepEqual(unknown.after.scripts, []);
  assert.equal(unknown.after.fbqExists, false);
  const granted = drive('granted');
  assert.notDeepEqual(
    granted.after.scripts, unknown.after.scripts,
    'the probe returns the same thing regardless of consent — it measures nothing',
  );
});

test('CONTROL: the command flattener would SEE a second PageView', () => {
  // The PageView count above is only a guard if double counting is visible to
  // it. Driven against a hand-built queue shaped like the base code's.
  const doubled = {
    fbq: [['init', 'X'], ['consent', 'grant'], ['track', 'PageView'], ['track', 'PageView']],
  };
  assert.equal(commands(doubled).filter((c) => c === 'track:PageView').length, 2);
});
