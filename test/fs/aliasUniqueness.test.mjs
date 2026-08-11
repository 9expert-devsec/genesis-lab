import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * urlAlias uniqueness — the index, the app-level check, and the fact that
 * NEITHER is meant to stand alone.
 *
 * Two courses on one alias means getCourseExtensionByAlias (findOne, no sort)
 * returns whichever the index hands back, so the admin edits one row while the
 * public page renders the other and every SEO/gallery/Omise change silently
 * does nothing. That is worse than a 404 because a 404 is visible. It happened:
 * POWER-APPS and Power-Apps shared /power-apps-for-business-training-course.
 *
 * The behaviour that CAN be tested without a database — which message a
 * duplicate-key error produces — is in test/pure/duplicateKeyMessage. This file
 * pins the wiring around it.
 */

const MODEL = readSource('src/models/CourseExtension.js');
const ACTIONS = readSource('src/lib/actions/course-extensions.js');

// ── D2: the declaration ─────────────────────────────────────────────────────

test('urlAlias is declared unique AND sparse', () => {
  assert.match(
    MODEL.code,
    /urlAlias:\s*\{[^}]*\bunique:\s*true/,
    'urlAlias is not unique — two courses can share one URL again'
  );
  assert.match(
    MODEL.code,
    /urlAlias:\s*\{[^}]*\bsparse:\s*true/,
    'sparse dropped — every course without a custom URL would collide on null'
  );
});

test('courseId stays unique — the alias index is an addition, not a swap', () => {
  assert.match(MODEL.code, /courseId:\s*\{[\s\S]*?\bunique:\s*true/);
});

// ── D4: the app-level check, and that it did NOT replace the index ─────────

test('the save action checks for a clashing alias before writing', () => {
  assert.match(ACTIONS.code, /urlAlias:\s*cleanAlias/, 'nothing looks the alias up');
  assert.match(
    ACTIONS.code,
    /courseId:\s*\{\s*\$ne:\s*courseId\s*\}/,
    'the check is not scoped to OTHER courses — re-saving a course\'s own alias would fail'
  );
});

test('the pre-check runs BEFORE the write, or it is not a pre-check', () => {
  const check = ACTIONS.code.indexOf('$ne: courseId');
  const write = ACTIONS.code.indexOf('findOneAndUpdate');
  assert.notEqual(check, -1, 'the alias pre-check is gone');
  assert.notEqual(write, -1, 'the upsert is gone');
  assert.ok(check < write, 'the alias check now runs after the write');
});

test('CONTROL: the check does not replace the index — both must be present', () => {
  // The failure mode this guards: someone reads the app check as sufficient and
  // drops `unique: true`. It is not sufficient. Between the read and the write
  // there is a window where two concurrent saves both pass, and only the index
  // closes it.
  assert.match(MODEL.code, /urlAlias:\s*\{[^}]*\bunique:\s*true/, 'index dropped in favour of the app check');
  assert.match(ACTIONS.code, /\$ne:\s*courseId/, 'app check dropped in favour of the index');
});

// ── D3: the catch no longer guesses ────────────────────────────────────────

test('the duplicate-key catch reads the failing index instead of assuming', () => {
  assert.match(
    ACTIONS.withImports,
    /import \{ duplicateKeyMessage \} from '@\/lib\/db\/duplicateKeyMessage'/,
    'the disambiguator is not imported'
  );
  assert.match(ACTIONS.code, /duplicateKeyMessage\(err\)/);
});

test('the hardcoded alias message is gone from the catch', () => {
  /**
   * The old branch returned the ALIAS message for ANY 11000 — and while
   * urlAlias had no unique index, a courseId collision was the only error it
   * could receive. Now that both indexes are unique, that assumption would
   * mislabel a real, reachable case.
   *
   * Anchored on the RETURN, not on the string: the same Thai text is the
   * correct answer inside duplicateKeyMessage's map and in the pre-check, so a
   * bare substring search would match those and fail for the wrong reason.
   */
  assert.ok(
    !/err\?\.code === 11000\)\s*\{\s*return \{ ok: false, error: 'URL Alias/.test(ACTIONS.code),
    'the catch assumes every duplicate key is an alias collision again'
  );
});

test('a non-duplicate error still falls through to its own message', () => {
  // duplicateKeyMessage returns null for anything that is not an E11000, and
  // the caller must keep handling those — not swallow them as duplicates.
  assert.match(ACTIONS.code, /return \{ ok: false, error: err\?\.message \?\? 'บันทึกไม่สำเร็จ' \}/);
});
