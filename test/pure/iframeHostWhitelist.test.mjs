import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IFRAME_HOST_WHITELIST } from '@/lib/customPages/sanitizePageHtml';

/**
 * Every entry of the iframe host whitelist is a BARE HOSTNAME.
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 * sanitize-html compares `allowedIframeHostnames` against the parsed host of
 * the iframe's `src`. An entry that is not a bare hostname — 'https://x.com',
 * 'x.com/embed', 'x.com:443', 'App.PowerBI.com' — does not throw, does not
 * warn, and is not reported anywhere. It just never matches. The embed then
 * disappears completely, because `exclusiveFilter` drops an iframe left without
 * a src, which is indistinguishable on the page from the host never having been
 * added at all. That is exactly how the Power BI embed on /dashboard presented:
 * as though the author had forgotten to paste it.
 *
 * So a malformed entry is a silent no-op with a plausible-looking diff. Review
 * is not a control for it; this is.
 *
 * ── IT WALKS THE REAL ARRAY ─────────────────────────────────────────────────
 * The list is imported, never retyped. A copy here would keep passing while the
 * shipped array rotted, which is the one failure mode a guard like this must
 * not have.
 */

/**
 * Everything a bare hostname may not contain, each with the shape of entry it
 * catches. Checked as separate named rules rather than one opaque regex so a
 * failure says WHICH property was violated.
 */
const FORBIDDEN = [
  ['a scheme',      /:\/\//,      'https://app.powerbi.com'],
  ['a colon',       /:/,          'app.powerbi.com:443'],
  ['a slash',       /\//,         'app.powerbi.com/view'],
  ['whitespace',    /\s/,         'app.powerbi.com '],
  ['a bracket',     /[[\]]/,      '[::1]'],
  ['an uppercase',  /[A-Z]/,      'App.PowerBI.com'],
];

/** @returns {string[]} the names of the rules `host` violates, in order. */
function violations(host) {
  return FORBIDDEN.filter(([, re]) => re.test(host)).map(([name]) => name);
}

test('every whitelisted iframe host is a bare hostname', () => {
  assert.ok(
    Array.isArray(IFRAME_HOST_WHITELIST) && IFRAME_HOST_WHITELIST.length > 0,
    'the whitelist is missing or empty — the walk below would assert nothing'
  );
  for (const host of IFRAME_HOST_WHITELIST) {
    assert.equal(
      typeof host, 'string',
      `whitelist entry is not a string: ${JSON.stringify(host)}`
    );
    assert.deepEqual(
      violations(host), [],
      `"${host}" is not a bare hostname — sanitize-html will never match it, and `
        + 'the embed it was added for will vanish with no error anywhere'
    );
  }
});

test('CONTROL: the checker really does reject each malformed shape', () => {
  /*
   * Without this, the walk above passes for two indistinguishable reasons: the
   * list is clean, or `violations()` cannot see a defect. Each FORBIDDEN rule
   * carries the entry it is meant to catch, and every one must be caught by the
   * rule that owns it — a regex that silently stopped matching is the failure
   * this detects.
   */
  for (const [name, , badEntry] of FORBIDDEN) {
    assert.ok(
      violations(badEntry).includes(name),
      `the "${name}" rule no longer fires on ${JSON.stringify(badEntry)}`
    );
  }
  // And a real entry from the shipped list must be accepted, or the checker is
  // simply rejecting everything and the walk above proves nothing either.
  assert.deepEqual(violations('app.powerbi.com'), []);
});

test('the host the Power BI embed needs is on the list', () => {
  /*
   * Bound to the exact string, not to a substring or a `.some()` over a regex:
   * 'app.powerbi.com.evil.test' contains it and is a different origin. This is
   * the entry /dashboard's report embed resolves through.
   */
  assert.ok(
    IFRAME_HOST_WHITELIST.includes('app.powerbi.com'),
    'app.powerbi.com left the whitelist — the /dashboard Power BI embed is dead again'
  );
});

test('the list holds no duplicates', () => {
  /*
   * A duplicate is harmless to sanitize-html and is a reliable sign that two
   * people added the same host without seeing each other's entry — which means
   * the grouping has stopped being read. Exact set, not a count.
   */
  assert.deepEqual(
    [...IFRAME_HOST_WHITELIST].sort(),
    [...new Set(IFRAME_HOST_WHITELIST)].sort(),
    'the whitelist contains a duplicate host'
  );
});
