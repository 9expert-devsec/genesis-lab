import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIRROR_TARGETS, MIRROR_KEYS, mirrorTarget } from '@/lib/cache-console/resetTargets';
import { readSource } from '../sourceScan.mjs';

/**
 * THE IDENTITY FIELD, PINNED AGAINST THE SYNC THAT OWNS IT.
 *
 * ── WHY THIS IS THE MOST DANGEROUS VALUE IN THE ROUND ───────────────────────
 * The purge computes "local rows whose id is not in the upstream set". If
 * `idField` names a field the sync does not actually upsert on, every local row
 * fails to match, every row looks deleted-upstream, and the whole collection is
 * doomed.
 *
 * The collapse guard catches that — it is precisely the shape it exists for —
 * but a guard is the second line. This is the first: the registry's claim about
 * each collection's identity is checked against the `shapeUpsert` filter in the
 * sync that writes it, so a rename in either place fails here rather than
 * arriving as a near-miss purge that someone has to decide about under a
 * confirmation dialog.
 *
 * Read through sourceScan's `code` view so a field named only in a comment
 * cannot satisfy the matcher.
 */

const SYNC_FOR = {
  career_paths: 'src/lib/career-paths/syncCareerPaths.js',
  faqs:         'src/lib/faqs/syncFaqs.js',
  instructors:  'src/lib/instructors/syncInstructors.js',
  promotions:   'src/lib/promotions/syncPromotions.js',
};

test('the registry covers exactly the four mirror collections', () => {
  // Not five, not three. A fifth mirror added without an entry here is a
  // collection with no purge path — fine — but a key here with no sync is an
  // action pointed at nothing.
  assert.deepEqual([...MIRROR_KEYS].sort(), ['career_paths', 'faqs', 'instructors', 'promotions']);
  assert.equal(MIRROR_TARGETS.length, 4);
});

test("each target's idField is the field its sync upserts on", () => {
  for (const target of MIRROR_TARGETS) {
    const rel = SYNC_FOR[target.key];
    assert.ok(rel, `${target.key} has no sync mapped in this test`);
    const { code } = readSource(rel);
    assert.match(
      code,
      new RegExp(`filter:\\s*\\{\\s*${target.idField}\\s*\\}`),
      `${target.key}: registry says "${target.idField}" but ${rel} does not upsert on it`
    );
  }
});

test('CONTROL: the filter matcher fires on the real text and not on a near-miss', () => {
  // Without this, "the filter matches" could be true of a regex that matches
  // nothing — and every assertion above would pass for every possible idField.
  const { code } = readSource(SYNC_FOR.faqs);
  assert.match(code, /filter:\s*\{\s*faq_id\s*\}/, 'the real one is found');
  assert.ok(
    !new RegExp('filter:\\s*\\{\\s*promotion_id\\s*\\}').test(code),
    'and a field from a DIFFERENT sync is not'
  );
});

test('every sync derives its id from the upstream item _id', () => {
  /**
   * The other half of the join, and the half the registry actually depends on:
   * `fetchUpstream` maps `item._id`, so the local id field must be populated
   * from that same value or the two sides compare different things.
   */
  const FROM_ID = {
    career_paths: /const career_path_id = toString\(item\?\._id\)/,
    faqs:         /const faq_id = toString\(item\?\._id\)/,
    instructors:  /const instructor_id = toStr\(item\?\._id\)/,
    promotions:   /const promotion_id = toString\(item\?\._id\)/,
  };
  for (const [key, pattern] of Object.entries(FROM_ID)) {
    assert.match(readSource(SYNC_FOR[key]).code, pattern, key);
  }
});

test('the upstream fetch passes the SAME params as the sync it mirrors', () => {
  /**
   * ── A MEASURED DEFECT, NOT A HYPOTHETICAL ──────────────────────────────────
   * The registry's first version called `listPromotions()` with its defaults.
   * The sync passes three include-flags, so the collection legitimately holds
   * expired, unpublished and scheduled promotions that the default call cannot
   * see. Live comparison at the time: local 21 · upstream 1 · would remove 20.
   *
   * The collapse guard refused it — correctly, at 95% — but a guard that fires
   * is not the same as a purge set that is right, and an admin who confirmed
   * past it would have deleted 20 rows the sync would immediately re-create.
   *
   * This is the same class as the idField check above: the registry must see
   * exactly what the sync sees, or the two disagree about what exists.
   */
  const registry = readSource('src/lib/cache-console/resetTargets.js').code;

  for (const flag of ['includeExpired', 'includeUnpublished', 'includeScheduled']) {
    assert.match(
      registry,
      new RegExp(`${flag}:\\s*true`),
      `resetTargets must pass ${flag} — syncPromotions does`
    );
    assert.match(
      readSource(SYNC_FOR.promotions).code,
      new RegExp(`${flag}:\\s*true`),
      `the premise moved: syncPromotions no longer passes ${flag}`
    );
  }

  // career_paths: the sync scopes to status 'all' with a raised limit, and a
  // default call would miss unpublished paths the same way.
  assert.match(registry, /status:\s*'all'/, 'career paths fetched with status all');
  assert.match(registry, /limit:\s*100/, 'and the same raised limit');
  assert.match(readSource(SYNC_FOR.career_paths).code, /\{ status: 'all', limit: 100 \}/);
});

test('CONTROL: the param matcher would NOT pass on a default call', () => {
  // Otherwise "the flags are present" could be satisfied by a regex that
  // matches anything, and the defect above would reappear unnoticed.
  const naive = "const resp = await listPromotions();";
  assert.ok(!/includeExpired:\s*true/.test(naive));
});

test('every target names a revalidate path and a human label', () => {
  for (const t of MIRROR_TARGETS) {
    assert.ok(t.label && t.label.length > 1, `${t.key} has no label`);
    assert.ok(Array.isArray(t.revalidate) && t.revalidate.length > 0, `${t.key} revalidates nothing`);
    assert.equal(typeof t.model, 'function', `${t.key} must load its model lazily`);
    assert.equal(typeof t.fetchUpstream, 'function');
  }
});

test('the registry imports no model at module scope', () => {
  // Lazy loaders, so this file is readable by a test with no MONGODB_URI —
  // db/connect throws at module load without one, and a registry that cannot be
  // read without a database cannot be checked by the assertions above.
  const { withImports } = readSource('src/lib/cache-console/resetTargets.js');
  assert.ok(!/^import .*@\/models\//m.test(withImports), 'no top-level model import');
  assert.ok(!/^import .*db\/connect/m.test(withImports), 'no top-level db import');
});

test('mirrorTarget returns null for an unknown key rather than undefined-ing', () => {
  assert.equal(mirrorTarget('nope'), null);
  assert.equal(mirrorTarget('faqs').idField, 'faq_id');
});
