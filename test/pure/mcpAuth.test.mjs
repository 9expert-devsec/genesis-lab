import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MCP_AUTH_NOT_CONFIGURED,
  MCP_AUTH_OK,
  MCP_AUTH_UNAUTHORIZED,
  MCP_KEY_HEADER,
  mcpAuthErrorBody,
  mcpAuthStatus,
} from '../../src/lib/mcp/auth.js';

/**
 * The MCP key gate. Every key in this file is obviously fake.
 *
 * ── THE BRANCH THAT MATTERS IS THE UNSET ONE ───────────────────────────────
 * A gate written as `if (expected && presented !== expected)` looks correct,
 * passes a wrong-key test, and lets EVERYTHING through the moment the env var
 * is missing — which is the state every fresh environment starts in. That is
 * the failure this file exists to pin, which is why "unset" is tested before
 * "wrong" and why it asserts a DIFFERENT status rather than merely "not 200".
 *
 * `expected` is a parameter, never `process.env`: the runner shares one process
 * across 799 files and a stray env write here is visible to all of them.
 */

const GOOD = 'fake-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('MCP_API_KEY unset → 503, whatever is presented', () => {
  assert.equal(mcpAuthStatus(GOOD, undefined), MCP_AUTH_NOT_CONFIGURED);
  assert.equal(mcpAuthStatus(GOOD, null), MCP_AUTH_NOT_CONFIGURED);
  assert.equal(mcpAuthStatus(GOOD, ''), MCP_AUTH_NOT_CONFIGURED);
  // Whitespace is not a key. A variable set to a stray space must fail closed
  // exactly like an unset one, not become a secret anyone can guess.
  assert.equal(mcpAuthStatus(GOOD, '   '), MCP_AUTH_NOT_CONFIGURED);
});

test('an unset key never authorises, even when the presented key is also empty', () => {
  // The degenerate case the naive `presented === expected` gate gets wrong:
  // '' === '' is true and would authorise an anonymous caller.
  assert.equal(mcpAuthStatus('', ''), MCP_AUTH_NOT_CONFIGURED);
  assert.notEqual(mcpAuthStatus('', ''), MCP_AUTH_OK);
});

test('missing header → 401', () => {
  assert.equal(mcpAuthStatus(undefined, GOOD), MCP_AUTH_UNAUTHORIZED);
  assert.equal(mcpAuthStatus(null, GOOD), MCP_AUTH_UNAUTHORIZED);
  assert.equal(mcpAuthStatus('', GOOD), MCP_AUTH_UNAUTHORIZED);
});

test('wrong key of the SAME length → 401', () => {
  const wrong = `${'fake-key-b'}${GOOD.slice(10)}`;
  assert.equal(wrong.length, GOOD.length, 'the fixture must be same-length or it tests the other branch');
  assert.equal(mcpAuthStatus(wrong, GOOD), MCP_AUTH_UNAUTHORIZED);
});

test('wrong key of a DIFFERENT length → 401, and does not throw', () => {
  // timingSafeEqual throws on unequal-length buffers. A gate that forgot the
  // length check would 500 here instead of 401 — a crash, not a refusal.
  assert.equal(mcpAuthStatus('short', GOOD), MCP_AUTH_UNAUTHORIZED);
  assert.equal(mcpAuthStatus(`${GOOD}extra`, GOOD), MCP_AUTH_UNAUTHORIZED);
});

test('a correct key → 200', () => {
  assert.equal(mcpAuthStatus(GOOD, GOOD), MCP_AUTH_OK);
});

test('a key is compared byte-for-byte, not by prefix', () => {
  // Guards against a `startsWith` / truncating comparison.
  assert.equal(mcpAuthStatus(GOOD.slice(0, -1), GOOD), MCP_AUTH_UNAUTHORIZED);
});

test('the error body says which fault it is, and echoes nothing', () => {
  assert.deepEqual(mcpAuthErrorBody(MCP_AUTH_NOT_CONFIGURED), { error: 'mcp_not_configured' });
  assert.deepEqual(mcpAuthErrorBody(MCP_AUTH_UNAUTHORIZED), { error: 'unauthorized' });
  const text = JSON.stringify(mcpAuthErrorBody(MCP_AUTH_UNAUTHORIZED));
  assert.ok(!text.includes(GOOD), 'the refusal must never contain a key');
});

test('the header name is the lower-case x-api-key', () => {
  assert.equal(MCP_KEY_HEADER, 'x-api-key');
});
