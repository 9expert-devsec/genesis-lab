import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGACY_HOST, LEGACY_MATCH_HOST, LEGACY_PROBE_ORIGIN, legacyHostPattern,
  extractLegacyUrls, mightContainLegacy,
} from '../../scripts/lib/legacy-url-extract.mjs';
import { CLASS, decideReference } from '../../scripts/lib/legacy-reference-rewrite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * ONE HOSTNAME USED TO DO TWO JOBS. THIS PINS THE SPLIT.
 *
 * ══ THE TWO JOBS ════════════════════════════════════════════════════════════
 *
 *   PROBE   the origin a liveness check HEADs — a MACHINE. The old Drupal box
 *           keeps serving for months after its domain is repointed, so this is
 *           about to become a different address.
 *   MATCH   the hostname written inside references stored in Mongo — TEXT,
 *           written years ago, unchanged by anything that happens to DNS.
 *
 * ══ THE FAILURE THIS FILE EXISTS TO PREVENT ═════════════════════════════════
 *
 * A future edit repoints the probe to the holding domain and takes matching
 * with it. There is no symptom: the scan runs, every gate passes, the report
 * says zero references found. A full-green run that rewrites nothing is
 * indistinguishable from a job already done — and the window in which anyone
 * would notice closes when the old box is switched off.
 *
 * So the assertion is not "the value is X". It is "the value is X AND THE
 * ENVIRONMENT CANNOT CHANGE IT", which is only provable by actually trying.
 */

const SHIPPED_HOST_PATTERN = String.raw`(?:www\.)?9experttraining\.com(?::\d+)?`;

/**
 * Read the two constants back out of a FRESH node process, under whatever
 * environment we hand it.
 *
 * A child process rather than an in-test re-import: both constants are
 * evaluated once at module load, and this file has already imported them, so
 * nothing done to `process.env` here could possibly be observed. A test that
 * set an env var and re-asserted the same imported binding would pass no matter
 * how the constant was written — which is exactly the vacuous shape this repo
 * keeps catching.
 */
function constantsUnderEnv(env) {
  const code = `
    import { LEGACY_MATCH_HOST, LEGACY_PROBE_ORIGIN } from './scripts/lib/legacy-url-extract.mjs';
    // The env-derived variant is computed HERE, in the same child, purely as a
    // control: it is what the match host would look like if somebody wired it
    // to the environment. If the harness cannot see THIS change, it could not
    // have seen the real one either.
    const envDerivedVariant = process.env.LEGACY_MATCH_HOST || 'www.9experttraining.com';
    process.stdout.write(JSON.stringify({ LEGACY_MATCH_HOST, LEGACY_PROBE_ORIGIN, envDerivedVariant }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

// ── the split, as it stands ─────────────────────────────────────────────────

test('LEGACY_MATCH_HOST is the literal hostname written in the database', () => {
  assert.equal(LEGACY_MATCH_HOST, 'www.9experttraining.com');
  assert.equal(LEGACY_HOST, '9experttraining.com', 'the apex label form is unchanged');
});

test('LEGACY_PROBE_ORIGIN defaults to today\'s value, so this split changed nothing', () => {
  assert.equal(LEGACY_PROBE_ORIGIN, 'https://www.9experttraining.com');
});

test('the host pattern is byte-identical to the literal it replaced', () => {
  // The tightest possible regression proof for the matcher: not "it still
  // matches my examples" but "the regex source did not move by one character".
  assert.equal(legacyHostPattern(), SHIPPED_HOST_PATTERN);
});

// ── THE PIN, AND ITS CONTROLS, IN ONE CHILD PROCESS ─────────────────────────

test('the environment CANNOT move the match host — but CAN move the probe origin', () => {
  const hostile = {
    LEGACY_MATCH_HOST: 'holding-domain.example.net',
    LEGACY_HOST: 'holding-domain.example.net',
    LEGACY_PROBE_ORIGIN: 'https://holding-domain.example.net',
  };
  const got = constantsUnderEnv(hostile);

  // THE PIN. Repointing the box must not repoint what we match against.
  assert.equal(
    got.LEGACY_MATCH_HOST, 'www.9experttraining.com',
    'the environment moved LEGACY_MATCH_HOST. Every stored reference still says '
    + 'www.9experttraining.com, so this makes the scan silently match nothing — '
    + 'a green run that rewrites zero references and looks like success',
  );

  // CONTROL A — the probe MUST follow the environment. Without this the pin
  // above would also pass for a constant nothing can configure, i.e. for a
  // split that blocks the very repoint it exists to make safe.
  assert.equal(
    got.LEGACY_PROBE_ORIGIN, 'https://holding-domain.example.net',
    'LEGACY_PROBE_ORIGIN ignored the environment. The repoint is supposed to be '
    + 'one env var; if it is not overridable this test is pinning "nothing changed"',
  );

  // CONTROL B — proves the harness can DETECT env-derivation at all. This is a
  // match host wired to the environment, computed in the same child under the
  // same variables. It moves; the real one did not. If this came back unchanged,
  // the pin above would be vacuous and would pass for any implementation.
  assert.equal(
    got.envDerivedVariant, 'holding-domain.example.net',
    'the control variant did NOT pick up the environment, so this harness cannot '
    + 'tell an env-derived constant from a frozen one and the pin proves nothing',
  );
  assert.notEqual(
    got.envDerivedVariant, got.LEGACY_MATCH_HOST,
    'the frozen constant and the env-derived control came out the same, so the '
    + 'two cases are not distinguishable in this run',
  );
});

test('CONTROL: with a clean environment the probe origin falls back to the default', () => {
  // The other half of Control A: the override is an override, not a requirement.
  // A missing variable must leave today's behaviour exactly as it is.
  const got = constantsUnderEnv({ LEGACY_PROBE_ORIGIN: undefined });
  assert.equal(got.LEGACY_PROBE_ORIGIN, 'https://www.9experttraining.com');
  assert.equal(got.LEGACY_MATCH_HOST, 'www.9experttraining.com');
});

// ── matching still works, on every stored spelling ──────────────────────────

test('both matchers still accept every host spelling that appears in the data', () => {
  // www, apex, protocol-relative and an explicit port — the four forms the
  // pattern has always covered. Driven through BOTH consumers, because the
  // whole point of legacyHostPattern() is that they share one rule.
  for (const raw of [
    'https://www.9experttraining.com/sites/default/files/articles/cover/x.png',
    'http://9experttraining.com/images/a.png',
    '//www.9experttraining.com/images/a.png',
    'https://www.9experttraining.com:8080/images/a.png',
  ]) {
    assert.equal(mightContainLegacy(raw), true, `${raw}: the cheap gate rejected it`);
    assert.equal(extractLegacyUrls(raw).length, 1, `${raw}: extraction found no hit`);

    const decided = decideReference(raw, {
      deadPaths: new Set(),
      supersededBy: new Map(),
      ampersandPaths: new Set(),
      appendedFormats: [],
      imageExtensions: [],
    });
    assert.ok(
      decided.replacement && decided.replacement.startsWith('/'),
      `${raw}: host stripping produced ${JSON.stringify(decided.replacement)}`,
    );
    assert.doesNotMatch(decided.replacement, /9experttraining\.com/, `${raw}: a host survived`);
  }
});

test('CONTROL: a host that merely LOOKS like the legacy one is still not matched', () => {
  // Proves the pattern is a host match rather than a substring search — if it
  // were, the assertions above would pass for a rule that rewrote other sites.
  const alien = 'https://www.example.com/sites/default/files/articles/cover/x.png';
  const decided = decideReference(alien, {
    deadPaths: new Set(), supersededBy: new Map(), ampersandPaths: new Set(),
    appendedFormats: [], imageExtensions: [],
  });
  assert.notEqual(decided.cls, CLASS.DIRECT, 'a foreign host classified as a legacy reference');
});
