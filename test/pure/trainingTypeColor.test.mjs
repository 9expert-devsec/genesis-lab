import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAINING_TYPE_COLOR,
  trainingTypeColor,
  trainingTypeTint,
} from '@/lib/schedule/trainingTypeColor';

/**
 * THE training-type palette.
 *
 * Four copies of this map existed and two of them disagreed — the course card
 * drew classroom `#005eff` and hybrid `#a854f7` while /schedule drew `#00CCFF`
 * and `#8B5CF6`, so the same round was a different colour depending on which
 * page you found it on, and the course-detail legend described a third pair
 * again (`bg-9e-action` / `bg-purple-500`).
 *
 * They drifted because three surfaces needed three FORMS of one value and no
 * single source offered more than one. So the tint is tested as carefully as
 * the hex: a module that only answers half the question is one that gets copied.
 */

// ── The palette ─────────────────────────────────────────────────────────────

test('the three known types have their /schedule values', () => {
  assert.equal(trainingTypeColor('classroom'), '#00CCFF');
  assert.equal(trainingTypeColor('hybrid'), '#8B5CF6');
  assert.equal(trainingTypeColor('online'), '#22C55E');
});

test('the exported map is exactly those three', () => {
  assert.deepEqual(TRAINING_TYPE_COLOR, {
    classroom: '#00CCFF',
    hybrid: '#8B5CF6',
    online: '#22C55E',
  });
  assert.deepEqual(Object.keys(TRAINING_TYPE_COLOR).sort(), ['classroom', 'hybrid', 'online']);
});

test('the two colours that MOVED are pinned by their old values', () => {
  /**
   * The point of the consolidation, stated as the thing that changed. If either
   * of these ever reads as its old course-card value again, the card and
   * /schedule have gone back to disagreeing.
   */
  assert.notEqual(trainingTypeColor('classroom'), '#005eff', 'the old course-card classroom');
  assert.notEqual(trainingTypeColor('hybrid'), '#a854f7', 'the old course-card hybrid');
  // …and the one that never disagreed is unchanged.
  assert.equal(trainingTypeColor('online'), '#22C55E');
});

// ── The fallback ────────────────────────────────────────────────────────────

test('an unknown type falls back to CLASSROOM, not to a neutral', () => {
  /**
   * Classroom, because every surface already did `?? TYPE_COLOR.classroom`
   * inline: an absent `type` on a round is a classroom round with a missing
   * field, not a fourth kind of training. Centralising the `??` is what stops a
   * consumer needing a local map.
   */
  for (const unknown of ['workshop', 'ONLINE', 'Classroom', '', 'null']) {
    assert.equal(trainingTypeColor(unknown), '#00CCFF', `unknown type: ${JSON.stringify(unknown)}`);
  }
});

test('an absent type falls back too', () => {
  assert.equal(trainingTypeColor(undefined), '#00CCFF');
  assert.equal(trainingTypeColor(null), '#00CCFF');
  assert.equal(trainingTypeColor(), '#00CCFF');
});

test('the lookup is case-SENSITIVE, and that is the upstream contract', () => {
  // MSDB sends lowercase. A case-insensitive lookup would quietly accept a
  // shape upstream does not send and hide a real feed change.
  assert.notEqual(trainingTypeColor('Hybrid'), trainingTypeColor('hybrid'));
  assert.equal(trainingTypeColor('Hybrid'), '#00CCFF', 'wrong case falls back');
});

// ── The tint ────────────────────────────────────────────────────────────────

test('the rgba is EXACT for all three colours', () => {
  // #00CCFF = 0, 204, 255 · #8B5CF6 = 139, 92, 246 · #22C55E = 34, 197, 94
  assert.equal(trainingTypeTint('classroom', 0.1), 'rgba(0, 204, 255, 0.1)');
  assert.equal(trainingTypeTint('hybrid', 0.1), 'rgba(139, 92, 246, 0.1)');
  assert.equal(trainingTypeTint('online', 0.1), 'rgba(34, 197, 94, 0.1)');
});

test('BOTH alphas this codebase uses are exact, and they are DIFFERENT numbers', () => {
  /**
   * 0.12 is the carousel's permanent type pill; 0.10 is the /schedule cell's
   * transient hover. THEY ARE NOT THE SAME NUMBER AND MUST NOT BE UNIFIED — the
   * pill sits on white permanently, where 10% nearly vanishes; the hover was
   * specified at 10% directly. If they are ever made equal, that equality is a
   * coincidence and needs a comment saying so.
   *
   * Same trap as the four `4`s in adminScheduleHorizon, where a "cleanup" that
   * unified numbers equal by accident broke a working surface.
   */
  assert.equal(trainingTypeTint('classroom', 0.12), 'rgba(0, 204, 255, 0.12)');
  assert.equal(trainingTypeTint('classroom', 0.1), 'rgba(0, 204, 255, 0.1)');
  assert.notEqual(
    trainingTypeTint('classroom', 0.12),
    trainingTypeTint('classroom', 0.1),
    'the pill tint and the hover tint must stay distinguishable',
  );
});

test('alpha 0 and 1 pass straight through — no special-casing', () => {
  /**
   * `0` must not become `transparent` and `1` must not become the bare hex. A
   * caller asking for an alpha gets an alpha, so a computed alpha (an animation,
   * a theme value) cannot hit a branch it did not expect.
   */
  assert.equal(trainingTypeTint('hybrid', 0), 'rgba(139, 92, 246, 0)');
  assert.equal(trainingTypeTint('hybrid', 1), 'rgba(139, 92, 246, 1)');
});

test('the tint falls back to classroom for an unknown type, like the hex', () => {
  assert.equal(trainingTypeTint('workshop', 0.12), 'rgba(0, 204, 255, 0.12)');
  assert.equal(trainingTypeTint(undefined, 0.12), 'rgba(0, 204, 255, 0.12)');
});

test('the tint is derived FROM the hex, so the two can never disagree', () => {
  /**
   * The property that matters more than any individual value: change the
   * palette and the tint follows. Asserted by re-deriving every channel from the
   * exported map rather than from a second table of literals.
   */
  for (const [type, hex] of Object.entries(TRAINING_TYPE_COLOR)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    assert.equal(trainingTypeTint(type, 0.5), `rgba(${r}, ${g}, ${b}, 0.5)`, type);
  }
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the rgba assertions DO discriminate between the three colours', () => {
  /**
   * Every tint assertion is an equality against a string this file wrote. If the
   * conversion were broken in a way that returned the same string for every
   * type, the assertions would still all be individually satisfiable by a
   * matching typo. So: the three must differ from each other.
   */
  const tints = ['classroom', 'hybrid', 'online'].map((t) => trainingTypeTint(t, 0.12));
  assert.equal(new Set(tints).size, 3, 'the three tints must be three different strings');
  for (const t of tints) {
    assert.match(t, /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [\d.]+\)$/, `malformed: ${t}`);
  }
});

test('CONTROL: the OLD course-card values really were different strings', () => {
  /**
   * The `notEqual` assertions above prove the palette is not the old one. They
   * would also pass if the old values had never differed. They did:
   */
  assert.notEqual('#005eff', '#00CCFF');
  assert.notEqual('#a854f7', '#8B5CF6');
  // …and the conversion would have produced visibly different tints too.
  assert.notEqual('rgba(0, 94, 255, 0.12)', trainingTypeTint('classroom', 0.12));
});

test('CONTROL: the fallback probe DOES tell a hit from a miss', () => {
  // Every fallback assertion expects '#00CCFF', which is also classroom's real
  // value — so a lookup that returned classroom for EVERYTHING would pass them
  // all. It does not.
  assert.notEqual(trainingTypeColor('hybrid'), trainingTypeColor('workshop'));
  assert.equal(trainingTypeColor('workshop'), trainingTypeColor('classroom'));
});
