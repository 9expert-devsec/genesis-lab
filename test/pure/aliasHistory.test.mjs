import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFormerAliases, FORMER_ALIAS_CAP } from '@/lib/courses/aliasHistory';
import { aliasConflict } from '@/lib/courses/aliasAvailability';

/**
 * THE ALIAS HISTORY — the write-path rule, and the loop hiding inside it.
 *
 * `planFormerAliases` is pure so the whole rule can be run rather than read.
 * The half that matters most is the REVERT CLEANUP: an alias changed back to a
 * value it previously had must leave the history at the same moment it becomes
 * current, or the row says "the current alias is also a former alias" and every
 * downstream lookup is then one guard away from redirecting a URL to itself.
 */

const plan = planFormerAliases;

// ── the ordinary change ────────────────────────────────────────────────────
test('changing an alias records the one it replaced', () => {
  assert.deepEqual(plan({ storedAlias: '/a', storedFormerAliases: [], nextAlias: '/b' }), ['/a']);
});

test('a second change appends — most recent LAST, like formerCodes', () => {
  assert.deepEqual(
    plan({ storedAlias: '/b', storedFormerAliases: ['/a'], nextAlias: '/c' }),
    ['/a', '/b'],
  );
});

test('saving without changing the alias records nothing', () => {
  // The overwhelmingly common save. If this appended, every save of a meta
  // description would push another copy of the current alias into the history.
  assert.deepEqual(
    plan({ storedAlias: '/a', storedFormerAliases: ['/old'], nextAlias: '/a' }),
    ['/old'],
  );
});

test('a course that had NO alias records nothing when it gains one', () => {
  assert.deepEqual(plan({ storedAlias: null, storedFormerAliases: [], nextAlias: '/new' }), []);
});

test('REMOVING an alias records it — the old URL keeps redirecting', () => {
  // To the derived code path, since that becomes the canonical once there is no
  // alias. Losing the history here would be the one case where clearing a field
  // silently kills a working URL.
  assert.deepEqual(plan({ storedAlias: '/a', storedFormerAliases: [], nextAlias: null }), ['/a']);
});

// ── normalisation, so a row cannot carry a shape nothing else expects ──────
test('entries are normalised and de-duplicated on the way in', () => {
  assert.deepEqual(
    plan({ storedAlias: '/B', storedFormerAliases: ['/A', '//A/', 'a', ''], nextAlias: '/c' }),
    ['/a', '/b'],
  );
});

// ── 8. THE REVERT LOOP ─────────────────────────────────────────────────────
test('an alias reverted to a former value LEAVES the former list', () => {
  // A → B → A. Without this the row would claim /a as both current and former,
  // and a resolver consulting the history would find a course whose canonical
  // path is the URL that was just requested.
  const afterB = plan({ storedAlias: '/a', storedFormerAliases: [], nextAlias: '/b' });
  assert.deepEqual(afterB, ['/a']);

  const backToA = plan({ storedAlias: '/b', storedFormerAliases: afterB, nextAlias: '/a' });
  assert.deepEqual(backToA, ['/b']);
  assert.ok(!backToA.includes('/a'), 'the alias that became current is still in the history');
});

test('…and the revert works from deeper in the history too', () => {
  // A → B → C → A. /a is three entries back, not the most recent.
  const history = ['/a', '/b'];
  const backToA = plan({ storedAlias: '/c', storedFormerAliases: history, nextAlias: '/a' });
  assert.deepEqual(backToA, ['/b', '/c']);
  assert.ok(!backToA.includes('/a'));
});

test('the cleanup is case-insensitive, because the stored form is lower-cased', () => {
  const backToA = plan({ storedAlias: '/b', storedFormerAliases: ['/a'], nextAlias: '/A' });
  assert.deepEqual(backToA, ['/b']);
});

test('the order of operations is append-then-remove, not the reverse', () => {
  // On a no-op save (next === stored) the reverse order would remove the alias
  // from the history and then re-append it, turning "nothing changed" into a
  // write. Stated as its own test because the bug it prevents is invisible in
  // the happy path.
  assert.deepEqual(
    plan({ storedAlias: '/a', storedFormerAliases: ['/a', '/z'], nextAlias: '/a' }),
    ['/z'],
    'a stored row that already contradicted itself is repaired, not preserved',
  );
});

// ── the cap ────────────────────────────────────────────────────────────────
test('the history is capped, and the OLDEST entries fall off', () => {
  assert.equal(FORMER_ALIAS_CAP, 10);
  const long = Array.from({ length: FORMER_ALIAS_CAP }, (_, i) => `/old-${i}`);
  const out = plan({ storedAlias: '/current', storedFormerAliases: long, nextAlias: '/next' });

  assert.equal(out.length, FORMER_ALIAS_CAP);
  // The newest survives…
  assert.equal(out.at(-1), '/current');
  // …and /old-0, the oldest, is the one that fell off. That URL stops
  // redirecting from this moment: it 404s, exactly as an unknown URL does.
  assert.ok(!out.includes('/old-0'), 'the cap trimmed from the wrong end');
  assert.ok(out.includes('/old-1'));
});

test('a cap of zero keeps nothing — the trim is not off-by-one', () => {
  assert.deepEqual(plan({ storedAlias: '/a', storedFormerAliases: [], nextAlias: '/b', cap: 0 }), []);
});

// ── 5 / CLAIM CONFLICTS ────────────────────────────────────────────────────
test('a former alias of another course is REFUSED, naming that course', () => {
  const refusal = aliasConflict({ alias: '/x', formerOwnerCourseId: 'OTHER-L1' });
  assert.ok(refusal, 'a former alias of another course was allowed through');
  assert.equal(refusal.field, 'urlAlias');
  assert.match(refusal.error, /OTHER-L1/,
    'the refusal must name the course, because "already used" with no owner '
    + 'leaves the admin guessing at 80 courses');
});

test('a free alias is still free — the new refusal is not always-on', () => {
  assert.equal(aliasConflict({ alias: '/genuinely-free' }), null);
});

test('the CURRENT-owner refusal still wins over the former-owner one', () => {
  // Both can be true at once only if the caller passes both; the current
  // claim is the stronger statement and is the one an admin can act on.
  const refusal = aliasConflict({
    alias: '/x',
    existingCourseId: 'CURRENT-L1',
    formerOwnerCourseId: 'FORMER-L1',
  });
  assert.match(refusal.error, /CURRENT-L1/);
  assert.doesNotMatch(refusal.error, /FORMER-L1/);
});
