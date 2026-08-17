import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEBROOT_DOCUMENTS, WEBROOT_BLOB_PREFIX, webrootRewrites, isWebrootDocument,
} from '@/lib/webrootDocuments.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * The three site-root documents: one list, and both consumers provably on it.
 *
 * ══ WHAT DIVERGENCE WOULD HAVE LOOKED LIKE ══════════════════════════════════
 *
 * The filenames were written twice — literal rewrite rules in next.config.mjs,
 * a hardcoded array in scripts/verify-legacy-delivery.mjs. Nothing forced them
 * to agree, and the failure would have been quiet in the worst direction: the
 * delivery harness reporting PASS over a list the rewrite had stopped using, so
 * a document that no longer served would still be checked and still be green.
 *
 * ── THIS EXECUTES THE CONFIG, IT DOES NOT READ IT ───────────────────────────
 * next.config.mjs is imported and `rewrites()` is CALLED, so the assertion is
 * against the rules Next actually emits rather than against text that looks
 * like them. A source scan would pass on a config that built the right-looking
 * strings and then filtered them away.
 *
 * BLOB_PUBLIC_BASE is set before the import because the config reads it at call
 * time and the inert branch (no store → no rules) is the correct behaviour
 * without it — asserting three rules against an unset var would be asserting
 * the wrong thing.
 *
 * ── THE CONTROLS OWN THEIR FIXTURES ─────────────────────────────────────────
 * MEASURED, on 2026-08-09, in the ADMIN_PAGES/NAV_GROUPS guard: controls built
 * by filtering the REAL list broke the moment the real list was broken, so
 * deleting one entry went red three times over and only one of them was the
 * finding. Every control below carries its own two-element fixture and stays
 * green while the real assertions go red.
 */

process.env.BLOB_PUBLIC_BASE = process.env.BLOB_PUBLIC_BASE
  || 'https://parity-test.public.blob.vercel-storage.com';
const BASE = process.env.BLOB_PUBLIC_BASE.replace(/\/$/, '');

const nextConfig = (await import('../../next.config.mjs')).default;

/** Every rewrite the config emits, flattened across its groups. */
async function emittedRewrites() {
  const r = await nextConfig.rewrites();
  if (Array.isArray(r)) return r;
  return [...(r.beforeFiles ?? []), ...(r.afterFiles ?? []), ...(r.fallback ?? [])];
}

const webrootRules = (await emittedRewrites())
  .filter((rule) => String(rule?.destination ?? '').includes(`/${WEBROOT_BLOB_PREFIX}/`));

// ── the scan/import found something, asserted before anything rests on it ────
test('the config was executed and DID emit webroot rules', () => {
  assert.ok(WEBROOT_DOCUMENTS.length > 0, 'the shared list is empty');
  assert.equal(
    webrootRules.length, WEBROOT_DOCUMENTS.length,
    `next.config emitted ${webrootRules.length} webroot rules for ${WEBROOT_DOCUMENTS.length} `
    + 'documents — if this is 0 the assertions below would pass vacuously',
  );
});

// ── consumer 1: the rewrite rules Next actually emits ───────────────────────
test('next.config emits exactly one rule per shared document, to the right place', () => {
  const bySource = new Map(webrootRules.map((r) => [r.source, r.destination]));
  for (const file of WEBROOT_DOCUMENTS) {
    const source = `/${file}`;
    assert.ok(bySource.has(source), `no rewrite emitted for ${source}`);
    assert.equal(
      bySource.get(source), `${BASE}/${WEBROOT_BLOB_PREFIX}/${file}`,
      'the destination must be built from the shared prefix, not a local literal',
    );
  }
  assert.equal(bySource.size, WEBROOT_DOCUMENTS.length, 'a rule exists for a file not in the list');
});

test('next.config no longer spells the filenames itself', () => {
  const src = readSource('next.config.mjs');
  for (const file of WEBROOT_DOCUMENTS) {
    assert.equal(
      src.code.includes(file), false,
      `next.config.mjs still contains the literal "${file}" — the list is single-sourced now`,
    );
  }
});

// ── consumer 2: the delivery harness ────────────────────────────────────────
test('verify-legacy-delivery consumes the shared list and hardcodes nothing', () => {
  const src = readSource('scripts/verify-legacy-delivery.mjs');
  assert.ok(
    /WEBROOT_DOCUMENTS/.test(src.withImports),
    'the harness must import the shared list',
  );
  assert.ok(
    /for\s*\(\s*const\s+file\s+of\s+WEBROOT_DOCUMENTS\s*\)/.test(src.code),
    'the harness must ITERATE the shared list, not merely import it',
  );
  for (const file of WEBROOT_DOCUMENTS) {
    assert.equal(
      src.code.includes(file), false,
      `verify-legacy-delivery.mjs still contains the literal "${file}"`,
    );
  }
});

// ── the two consumers see the same set ──────────────────────────────────────
test('both consumers resolve to the IDENTICAL set of documents', () => {
  const fromConfig = webrootRules.map((r) => r.source.replace(/^\//, '')).sort();
  const fromModule = [...WEBROOT_DOCUMENTS].sort();
  assert.deepEqual(fromConfig, fromModule);
});

test('the replace-only guard recognises exactly these three', () => {
  for (const file of WEBROOT_DOCUMENTS) assert.equal(isWebrootDocument(file), true);
  for (const bad of ['other.pdf', '', null, undefined, '../etc/passwd', 'webroot-documents/x.pdf']) {
    assert.equal(isWebrootDocument(bad), false, `expected "${bad}" to be refused`);
  }
});

test('no store configured means NO rules — inert, not broken', () => {
  assert.deepEqual(webrootRewrites(''), []);
  assert.deepEqual(webrootRewrites(undefined), []);
  assert.deepEqual(webrootRewrites(null), []);
});

test('a trailing slash on the base does not produce a double slash', () => {
  const [rule] = webrootRewrites('https://x.example.com/');
  assert.equal(rule.destination.includes('//webroot-documents'), false);
  assert.equal(rule.destination, `https://x.example.com/${WEBROOT_BLOB_PREFIX}/${WEBROOT_DOCUMENTS[0]}`);
});

// ── CONTROLS — own fixtures, independent of the real list ───────────────────

/** Two documents that exist nowhere in the repo. Divergence is expressible here. */
const FIXTURE_A = ['alpha-fixture.pdf', 'beta-fixture.pdf'];
const FIXTURE_B = ['alpha-fixture.pdf', 'gamma-fixture.pdf'];

/** The same comparison the real assertion makes, over arbitrary inputs. */
const sameSet = (a, b) => {
  try { assert.deepEqual([...a].sort(), [...b].sort()); return true; } catch { return false; }
};

test('CONTROL: the set comparison is real — it accepts equal and rejects divergent', () => {
  assert.equal(sameSet(FIXTURE_A, [...FIXTURE_A].reverse()), true, 'order must not matter');
  assert.equal(sameSet(FIXTURE_A, FIXTURE_B), false,
    'one differing filename must be detected, or the parity assertion proves nothing');
  assert.equal(sameSet(FIXTURE_A, FIXTURE_A.slice(0, 1)), false, 'a dropped entry must be detected');
  assert.equal(sameSet(FIXTURE_A, [...FIXTURE_A, 'delta-fixture.pdf']), false, 'an added entry must be detected');
});

test('CONTROL: the rule builder can produce a mismatching destination', () => {
  // Proves the destination assertion has teeth: a builder using a different
  // prefix yields a destination the real check would reject.
  const wrong = FIXTURE_A.map((file) => ({
    source: `/${file}`, destination: `${BASE}/some-other-prefix/${file}`,
  }));
  assert.equal(wrong[0].destination.includes(`/${WEBROOT_BLOB_PREFIX}/`), false,
    'the destination probe would not notice a changed prefix');
});

test('CONTROL: the literal-filename probe fires on a file that still hardcodes one', () => {
  const hardcoded = "for (const file of ['alpha-fixture.pdf', 'beta-fixture.pdf']) {";
  for (const file of FIXTURE_A) {
    assert.equal(hardcoded.includes(file), true,
      'the probe cannot see a hardcoded filename — it would pass a reverted consumer');
  }
});
